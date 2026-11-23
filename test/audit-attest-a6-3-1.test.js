// kanban #3368: the card's test (audit attest a6-3-1)
// AUDIT attest r3 (find, never fix): one seat of the Up/Down side answers GET /market-rounds with thousands of made-up round ids.
// page/market-page.js recentMarketRounds takes every id of every answer (no cap; an honest seat answers at most 200) and, one id
// after the other, asks every seat of the side GET /round?id= for it (fetchRound, each node in turn, 30 s timeout each). One seat's
// answer so makes the page send ids x seats requests - and, while that loop runs, restoreOrdersFromSeats waits on it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fetchRound } from '../../arena-client/src/join.js';

const SCRIPT = readFileSync(new URL('../page/market-page.js', import.meta.url), 'utf8');

function page(seats) {
  const store = new Map();
  const sessionStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const asked = { round: 0, ids: new Set() };
  const fetch = async (url) => {
    const u = new URL(url), s = seats[u.origin];
    if (!s) throw new Error('down');
    if (u.pathname === '/market-rounds') return { ok: true, status: 200, json: async () => ({ rounds: s.rounds }) };
    if (u.pathname === '/round') { asked.round++; asked.ids.add(u.searchParams.get('id')); return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }; }
    return { ok: false, status: 404, json: async () => null };
  };
  const ARENACLIENT = { fromHex: (x) => x, toHex: (x) => x, marketForRound: () => null,
    fetchRound: (id, nodes) => fetchRound(id, nodes, { fetcher: fetch }) };
  const ctx = { sessionStorage, fetch, ARENACLIENT, console, setInterval: () => 0, setTimeout: () => 0, AbortSignal: { timeout: () => undefined },
    document: { getElementById: () => ({ insertAdjacentHTML() {} }) } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SCRIPT, ctx);
  return { ctx, asked };
}

const hex = (i) => i.toString(16).padStart(64, '0');

test('one seat\'s /market-rounds answer of 3,000 made-up ids does not make the page fetch thousands of rounds from every seat', async () => {
  const junk = Array.from({ length: 3000 }, (_, i) => ({ round: hex(i + 1), lastOrderMs: Date.now() }));
  const seats = { 'http://liar': { rounds: junk }, 'http://s2': { rounds: [] }, 'http://s3': { rounds: [] }, 'http://s4': { rounds: [] } };
  const P = page(seats);
  await P.ctx.recentMarketRounds(Object.keys(seats));
  const kept = vm.runInContext('MARKET_ROUNDS.size', P.ctx);
  console.log(`made-up ids taken: ${kept}, distinct rounds asked: ${P.asked.ids.size}, GET /round requests sent: ${P.asked.round}`);
  // the honest door answers at most 200 rounds (order-batch.js recentRounds LIMIT 200): one seat's answer is read up to that
  assert.ok(P.asked.ids.size <= 200, `the page asked the seats for ${P.asked.ids.size} rounds one seat made up (${P.asked.round} GET /round requests)`);
});
