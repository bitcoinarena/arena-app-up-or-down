// SPDX-License-Identifier: LicenseRef-Bitcoin-Arena-1.0
// Copyright (c) 2026 The Bitcoin Arena authors. See LICENSE.
// THE MARKET PAGE'S OUTCOME READ (bitcoin-arena kanban #2922, feedback #224 and #239): page/market-page.js run here with a stand-in page
// and seats. One seat with an unverifiable answer must not hold the result back while another seat holds a verifiable one, and one
// seat's empty position must not make an order "unfilled" for good.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SCRIPT = readFileSync(new URL('../page/market-page.js', import.meta.url), 'utf8');
const ROUND = 'ab'.repeat(32), ENTRY = 'cd'.repeat(32);

// seats: { 'http://sN': { outcome, book } }
function page(seats, pick) {
  const store = new Map([['arena.market.picks', JSON.stringify([pick])]]);
  const sessionStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const json = (x) => ({ ok: x !== undefined && x !== null, json: async () => x });
  const fetch = async (url) => {
    const u = new URL(url), s = seats[u.origin];
    if (!s) throw new Error('down');
    if (u.pathname === '/outcome') return json(s.outcome);
    if (u.pathname === '/book') return json(s.book);
    return json(null);
  };
  const ARENACLIENT = {
    fromHex: (x) => x, toHex: (x) => x,
    marketForRound: () => ({ name: 'updown' }),
    // the attestation 'good' verifies, any other does not - as checkMarketOutcome answers: never a throw
    checkMarketOutcome: async ({ outcome }) => (outcome.attestation === 'good' ? { verified: true, outcome: 0 } : { verified: false, why: 'not one of the round\'s attestors' }),
  };
  const ctx = { sessionStorage, fetch, ARENACLIENT, console, setInterval: () => 0, setTimeout: () => 0, AbortSignal: { timeout: () => undefined },
    document: { getElementById: () => ({ insertAdjacentHTML() {} }) } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SCRIPT, ctx);
  return { ctx, picks: () => JSON.parse(store.get('arena.market.picks')) };
}

const row = { entryId: ENTRY, won: true };
const answer = (attestation, rows = [row]) => ({ state: 'ATTESTED', final: true, attestation, outcome: 0, table: { rows, refunded: false } });
const pickOf = (nodes) => ({ roundIdHex: ROUND, entryIdHex: ENTRY, gameId: 'ef'.repeat(32), entryCloseMs: Date.now() - 60000, nodes, stakeMsat: '100000' });

test('#224 a seat with an unverifiable answer does not hold back another seat\'s verifiable one', async () => {
  const P = page({ 'http://s1': { outcome: answer('stale') }, 'http://s2': { outcome: answer('good') } }, pickOf(['http://s1', 'http://s2']));
  for (let i = 0; i < 3; i++) await P.ctx.readMarketOutcomes();
  const got = P.ctx.ARENA_MARKET_OUTCOMES.get(ROUND);
  assert.ok(got && got.check && got.check.verified, `the kept answer is ${got && got.attestation} (verified: ${got && got.check && got.check.verified})`);
  assert.equal(got.attestation, 'good');
});

test('#224 with no verifiable answer the first is shown unverified, and a verified one is never replaced by it', async () => {
  const seats = { 'http://s1': { outcome: answer('stale') }, 'http://s2': { outcome: answer('bad') } };
  const P = page(seats, pickOf(['http://s1', 'http://s2']));
  await P.ctx.readMarketOutcomes();
  assert.equal(P.ctx.ARENA_MARKET_OUTCOMES.get(ROUND).check.verified, false);
  seats['http://s2'].outcome = answer('good');
  await P.ctx.readMarketOutcomes();
  assert.equal(P.ctx.ARENA_MARKET_OUTCOMES.get(ROUND).attestation, 'good');
});

const pos = (p) => ({ positions: [{ entry: ENTRY, shares: ['0', '0'], cost: '0', sellDebt: '0', ...p }] });

test('#239 one seat\'s empty position does not make the order unfilled; two seats\' do', async () => {
  const empty = answer('good', []);
  const seats = { 'http://s1': { outcome: empty, book: pos({}) }, 'http://s2': { outcome: empty, book: pos({ shares: ['5000', '0'], cost: '2000' }) } };
  const P = page(seats, pickOf(['http://s1', 'http://s2']));
  await P.ctx.readMarketOutcomes();
  assert.ok(!P.picks()[0].unfilled, 'one seat\'s empty position made the order unfilled');
  seats['http://s2'].book = pos({});
  await P.ctx.readMarketOutcomes();
  assert.equal(P.picks()[0].unfilled, true);
});

test('#239 an unfilled verdict is read again: a row that shows up later takes it back', async () => {
  const seats = { 'http://s1': { outcome: answer('good', []), book: pos({}) }, 'http://s2': { outcome: answer('good', []), book: pos({}) } };
  const P = page(seats, pickOf(['http://s1', 'http://s2']));
  await P.ctx.readMarketOutcomes();
  assert.equal(P.picks()[0].unfilled, true);
  seats['http://s1'].outcome = answer('good');
  await P.ctx.readMarketOutcomes();
  assert.ok(!P.picks()[0].unfilled, 'the order stayed unfilled though a seat\'s table holds its row');
});

test('#3019 one seat\'s table without the losers\' rows is not kept over the table three seats serve byte for byte', async () => {
  const loser = { entryId: 'ee'.repeat(32), won: false };
  const honest = () => answer('good', [row, loser]);
  const seats = { 'http://s1': { outcome: answer('good', [row]) }, 'http://s2': { outcome: honest() }, 'http://s3': { outcome: honest() }, 'http://s4': { outcome: honest() } };
  const P = page(seats, pickOf(Object.keys(seats)));
  await P.ctx.readMarketOutcomes();
  const got = P.ctx.ARENA_MARKET_OUTCOMES.get(ROUND);
  assert.equal(got.table.rows.length, 2, 'the kept table is the one the most seats agree on, the losers\' row in it');
  assert.equal(got.agreedBy, 3);
  // and one lying seat alone, read later, does not replace it
  seats['http://s2'].outcome = seats['http://s3'].outcome = seats['http://s4'].outcome = undefined;
  await P.ctx.readMarketOutcomes();
  assert.equal(P.ctx.ARENA_MARKET_OUTCOMES.get(ROUND).table.rows.length, 2);
});
