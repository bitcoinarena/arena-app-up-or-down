// SPDX-License-Identifier: LicenseRef-Bitcoin-Arena-1.0
// Copyright (c) 2026 The Bitcoin Arena authors. See LICENSE.
// VERSION 25's QUOTE (bitcoin-arena kanban #2836, feedback #084, UI 673): with "No asks" in the book - only bids, at 9¢ and 2¢ - version 23 quoted
// "Buy Up 2¢" and "To win 4,950 sats" for a 100 sat market buy, the last match's price, a payout no seller in the book could fill; before the
// book was read it showed 50% / 50¢ as a price, and the totals said "lost −0 sats". The client's own script, run here with a stand-in page
// (window.parent.ARENA_GAME) and view: what it hands the view to draw.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const clientScript = (file) => {
  const t = readFileSync(new URL(`../client/${file}`, import.meta.url), 'utf8');
  return [...t.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('window.parent && window.parent.ARENA_GAME'));
};

async function drawn(file, book) {
  const draws = [];
  const el = () => ({ onclick: null, style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, setAttribute() {}, addEventListener() {} });
  const round = { id: 'ab'.repeat(32), entryCloseMs: Date.now() + 10 * 60000, joinable: true, free: false };
  const A = { game: { id: 'cd'.repeat(32), outcomes: ['Up', 'Down'], fees: null }, clientHash: '', back() {}, state: () => ({ picks: [] }),
    rows: () => [round], allRows: () => [round],
    market: { orders: () => [], book: async () => book, order() {}, sell() {}, cancel() {}, exchange() {} } };
  const store = new Map();
  const window = { parent: { ARENA_GAME: A }, UpDownView: { mount: () => ({ kind() {}, draw: (m) => draws.push(m) }) },
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
  const ctx = vm.createContext({ window, document: { getElementById: el, body: el(), createElement: el }, localStorage: window.localStorage,
    fetch: async () => { throw new Error('offline'); }, setInterval: () => 0, setTimeout: () => 0, clearTimeout() {}, console, Date, Math, JSON, Number, String,
    Array, Map, Set, Object, Promise, Error, URL, Intl, isFinite });
  vm.runInContext(clientScript(file), ctx);
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  return draws;
}

// "No asks": two bids for Up, at 9¢ and 2¢, and the last match at 2¢
const NO_ASKS = { batches: [{ k: 1, price: 2000 }], levels: { buys: [{ outcome: 0, price: 9000 }, { outcome: 0, price: 2000 }], sells: [] }, positions: [] };

test('#084 with no ask in the book the market buy promises no payout; with an ask it is quoted at the ask', async () => {
  const last = (d) => d.filter((m) => m && m.mwin !== undefined).at(-1);
  const v23 = last(await drawn('index-v23.html', NO_ASKS));
  assert.equal(v23.mwin, '4,950 sats', 'version 23 is the report: To win 4,950 sats at the last match');
  const v25 = last(await drawn('index-v25.html', NO_ASKS));
  assert.equal(v25.mwin, '–', `with no ask the quote promised ${v25.mwin}`);
  assert.match(v25.mprice, /no seller yet/);
  // an ask at 40¢ for Up (a Down buy at 60¢): quoted at the ask, not the last match
  const withAsk = last(await drawn('index-v25.html', { ...NO_ASKS, levels: { buys: [{ outcome: 1, price: 60000, netMsat: '1000000' }, { outcome: 0, price: 9000 }], sells: [] } }));
  assert.equal(withAsk.mprice, 'at 40¢');
  assert.equal(withAsk.mwin, '247 sats');
});

test('#084 before the book is read the price shows as loading, not as 50%', async () => {
  const first = (d) => d.find((m) => m && m.chance !== undefined);
  const v25 = first(await drawn('index-v25.html', null));
  assert.equal(v25.chance, '…');
  assert.equal(JSON.stringify(v25.prices), JSON.stringify(['…', '…']));
});
