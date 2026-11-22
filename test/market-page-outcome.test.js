// SPDX-License-Identifier: LicenseRef-Bitcoin-Arena-1.0
// Copyright (c) 2026 The Bitcoin Arena authors. See LICENSE.
// THE MARKET PAGE'S OUTCOME READ (bitcoin-arena kanban #3019): page/market-page.js run here with a stand-in page and seats. One seat's
// table without the losers' rows must not be kept over the table the other seats serve byte for byte. (The fix alone, on the pin
// before the Version 25 work; the harness is the one of the app's main test/market-page-outcome.test.js.)
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

test('#3019 two seats outside the committee serving the same empty table do not outrank the seat that holds the row', async () => {
  const empty = () => ({ state: 'ATTESTED', final: true, attestation: 'good', outcome: 0, table: { rows: [], refunded: true } });
  const seats = { 'http://s1': { outcome: empty() }, 'http://s2': { outcome: empty() }, 'http://s3': { outcome: answer('good') } };
  const P = page(seats, pickOf(Object.keys(seats)));
  await P.ctx.readMarketOutcomes();
  const got = P.ctx.ARENA_MARKET_OUTCOMES.get(ROUND);
  assert.equal(got.table.rows.length, 1, 'the kept table holds the pick\'s row');
  // one seat's table is not kept for good: it is read again
  assert.equal(got.agreedBy, 1);
});
