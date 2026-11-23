// SPDX-License-Identifier: LicenseRef-Bitcoin-Arena-1.0
// Copyright (c) 2026 The Bitcoin Arena authors. See LICENSE.
// THE MARKET PAGE'S READ OF THE SEATS' RECENT ROUNDS (bitcoin-arena kanban #3368): page/market-page.js run here with stand-in seats. One seat's
// GET /market-rounds answer of thousands of made-up ids must not make the page fetch each from every seat, must not grow the page's memory
// without bound, and must not keep the rounds the other seats list from being read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SCRIPT = readFileSync(new URL('../page/market-page.js', import.meta.url), 'utf8');
const hex = (i) => i.toString(16).padStart(64, '0');

// seats: { 'http://sN': { rounds: [{ round, lastOrderMs }], contracts: Set of ids it holds } }
function page(seats) {
  const store = new Map();
  const sessionStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const asked = { round: 0, ids: new Set(), signals: 0 };
  const fetch = async (url, opts) => {
    const u = new URL(url), s = seats[u.origin];
    if (!s) throw new Error('down');
    if (u.pathname === '/market-rounds') return { ok: true, status: 200, json: async () => ({ rounds: s.rounds }) };
    if (u.pathname === '/round') {
      asked.round++; asked.ids.add(u.searchParams.get('id'));
      if (opts && opts.signal) asked.signals++;
      return s.contracts && s.contracts.has(u.searchParams.get('id')) ? { ok: true, status: 200, id: u.searchParams.get('id') } : { ok: false, status: 404 };
    }
    return { ok: false, status: 404, json: async () => null };
  };
  // as arena-client's fetchRound: every node in turn until one hands the round, through the fetcher it is given
  const fetchRound = async (id, nodes, { fetcher = fetch } = {}) => {
    for (const n of nodes) {
      try { const r = await fetcher(n + '/round?id=' + id, { signal: 'read' }); if (r.ok) return { contract: { id: r.id } }; } catch { /* the next */ }
    }
    throw new Error('no node holds the round');
  };
  const ARENACLIENT = { fromHex: (x) => x, toHex: (x) => x, marketForRound: () => null, fetchRound };
  const ctx = { sessionStorage, fetch, ARENACLIENT, console, setInterval: () => 0, setTimeout: () => 0, AbortSignal: { timeout: () => 'short' },
    document: { getElementById: () => ({ insertAdjacentHTML() {} }) } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SCRIPT, ctx);
  const pass = async () => { vm.runInContext('marketRoundsAt = 0', ctx); await ctx.recentMarketRounds(Object.keys(seats)); };
  const size = (name) => vm.runInContext(name + '.size', ctx);
  const has = (id) => vm.runInContext('MARKET_ROUNDS.has(' + JSON.stringify(id) + ')', ctx);
  return { ctx, asked, pass, size, has };
}

test('one seat\'s 3,000 made-up ids: a pass asks the seats for at most 24 rounds, never all 3,000 from every seat', async () => {
  const junk = Array.from({ length: 3000 }, (_, i) => ({ round: hex(i + 1), lastOrderMs: Date.now() }));
  const P = page({ 'http://liar': { rounds: junk }, 'http://s2': { rounds: [] }, 'http://s3': { rounds: [] }, 'http://s4': { rounds: [] } });
  await P.pass();
  assert.ok(P.asked.ids.size <= 24, `asked for ${P.asked.ids.size} rounds`);
  assert.ok(P.asked.round <= 24 * 4, `${P.asked.round} GET /round requests`);
  assert.equal(P.asked.signals, P.asked.round, 'every /round read carries the page\'s own short timeout');
  assert.equal(P.size('MARKET_ROUNDS'), 0, 'no made-up id is kept as a round');
});

test('the rounds the honest seats list are read first, whatever one seat lists before them', async () => {
  const real = [hex(900001), hex(900002), hex(900003)];
  const junk = Array.from({ length: 3000 }, (_, i) => ({ round: hex(i + 1), lastOrderMs: Date.now() }));
  const honest = { rounds: real.map((round) => ({ round, lastOrderMs: Date.now() })), contracts: new Set(real) };
  const P = page({ 'http://liar': { rounds: junk }, 'http://s2': honest, 'http://s3': honest, 'http://s4': { rounds: [] } });
  await P.pass();
  for (const id of real) assert.ok(P.has(id), `round ${id.slice(-6)} read on the first pass`);
});

test('a seat answering fresh made-up ids every minute: the page\'s memory stays bounded and the real rounds stay kept', async () => {
  const real = hex(900001);
  const liar = { rounds: [] };
  const honest = { rounds: [{ round: real, lastOrderMs: Date.now() }], contracts: new Set([real]) };
  const P = page({ 'http://liar': liar, 'http://s2': honest, 'http://s3': honest });
  for (let k = 0; k < 120; k++) {
    liar.rounds = Array.from({ length: 3000 }, (_, i) => ({ round: hex(k * 3000 + i + 1), lastOrderMs: Date.now() }));
    await P.pass();
  }
  assert.ok(P.size('MARKET_ROUNDS_UNREAD') <= 2000, `${P.size('MARKET_ROUNDS_UNREAD')} unread ids kept`);
  assert.ok(P.has(real), 'the real round is still kept');
  assert.ok(P.asked.ids.size <= 120 * 24, `asked for ${P.asked.ids.size} rounds in 120 passes`);
});

// ONE SEAT HOLDING ITS GET /round OPEN (#3368, the card's worst case): listed first, it made each made-up id cost the page a 30 s read, and
// the order restore waited for the whole read - 200 ids, 4 at a time, some 25 minutes a pass - so the rounds the lobby lists were never read
// for this wallet's orders. Run on a clock 100 times fast: the page's timeouts and its own waits are a hundredth of what they say.
test('a seat that holds its GET /round open does not hold the order restore behind the read of its made-up rounds', async () => {
  const S = 1 / 100, GAME = 'ee'.repeat(32), LOBBY = 'ff'.repeat(32);
  const junk = Array.from({ length: 3000 }, (_, i) => ({ round: hex(i + 1), lastOrderMs: Date.now() }));
  const seats = { 'http://liar': { rounds: junk }, 'http://s2': { rounds: [] }, 'http://s3': { rounds: [] }, 'http://s4': { rounds: [] } };
  const nodes = Object.keys(seats);
  const store = new Map([['arena.player.seed', 'seed']]);
  const sessionStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const timeout = (ms) => AbortSignal.timeout(Math.max(1, Math.round(ms * S)));
  const held = (signal) => new Promise((_, no) => signal.addEventListener('abort', () => no(new Error('timed out')), { once: true }));
  const fetch = async (url, opts) => {
    const u = new URL(url), s = seats[u.origin];
    if (u.pathname === '/market-rounds') return { ok: true, status: 200, json: async () => ({ rounds: s.rounds }) };
    if (u.pathname === '/round') return u.origin === 'http://liar' ? held(opts.signal) : { ok: false, status: 404 };
    return { ok: false, status: 404, json: async () => null };
  };
  // as arena-client's fetchRound: every node in turn, each read with the fetcher's signal or READ_MS (30 s, reread.js) when it gives none
  const fetchRound = async (id, list, { fetcher = fetch } = {}) => {
    for (const n of list) {
      try { const r = await fetcher(n + '/round?id=' + id, { signal: timeout(30000) }); if (r.ok) return { contract: { id } }; } catch { /* the next */ }
    }
    throw new Error('no node holds the round');
  };
  const locks = [];
  const ARENACLIENT = { fromHex: (x) => x, toHex: (x) => x, fetchRound, marketForRound: () => ({}), roundPays: () => true, tabSeed: () => 'seed',
    myOrdersFromEntries: () => [], playerFor: (round, { order }) => ({ pubkey: 'k' + order }),
    findLock: async ({ roundId }) => { locks.push(roundId); return []; } };
  let loaded = false;
  const ctx = { sessionStorage, fetch, ARENACLIENT, console, setInterval: () => 0, AbortSignal: { timeout },
    setTimeout: (fn, ms) => (loaded ? setTimeout(fn, ms * S) : 0),
    document: { getElementById: () => ({ insertAdjacentHTML() {} }) },
    ARENA_GAME: { market: true, game: { id: GAME } }, ARENA_CURVE: {}, ARENA_ROW_NODES: () => nodes,
    ARENA_LOBBY_ROWS: [{ id: LOBBY, free: false, contract: { gameId: GAME, entryCloseMs: Date.now() + 3600000 } }] };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SCRIPT, ctx);
  loaded = true;
  const alive = setInterval(() => {}, 1000);   // the held reads' timers do not keep the test running
  try {
    const t0 = Date.now();
    await ctx.restoreOrdersFromSeats();
    const waited = (Date.now() - t0) / S;
    assert.ok(locks.includes(LOBBY), 'the lobby\'s round was read for this wallet\'s orders');
    assert.ok(waited <= 20000, `the restore waited ${Math.round(waited / 1000)} s (page time) behind the read of one seat's made-up rounds`);
  } finally { clearInterval(alive); }
});
