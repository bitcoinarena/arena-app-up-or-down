// SPDX-License-Identifier: LicenseRef-Bitcoin-Arena-1.0
// Copyright (c) 2026 The Bitcoin Arena authors. See LICENSE.
// VERSION 25's QUOTES AND SELLS AGAINST THE BOOK (bitcoin-arena kanban #2929, feedback #236, #238, #250): the client's own script, run here
// with a stand-in page (window.parent.ARENA_GAME) and view, as client-v25-quote does.
//  #236: the market buy's "To win" priced the whole stake at the best ask, however few shares rest there;
//  #238: the market sell promised proceeds with no buyer in the book (the last match or 50¢), at the full bid rather than its limit;
//  #250: a book that could not be read made every resting sell "sold" and My shares 0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const clientScript = (file) => {
  const t = readFileSync(new URL(`../client/${file}`, import.meta.url), 'utf8');
  return [...t.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('window.parent && window.parent.ARENA_GAME'));
};
const ROUND = 'ab'.repeat(32), ENTRY = 'ef'.repeat(32);
const tick = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

// books: what each read of the book answers in turn (an Error is thrown); orders: the tab's orders
async function client({ books, orders = [] }) {
  const draws = [], intervals = [];
  let reads = 0, on = null;
  const el = () => ({ onclick: null, style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, setAttribute() {}, addEventListener() {} });
  const round = { id: ROUND, entryCloseMs: Date.now() + 10 * 60000, joinable: true, free: false };
  const book = async () => { const b = books[Math.min(reads++, books.length - 1)]; if (b instanceof Error) throw b; return b; };
  const A = { game: { id: 'cd'.repeat(32), outcomes: ['Up', 'Down'], fees: null }, clientHash: '', back() {}, state: () => ({ picks: [] }),
    rows: () => [round], allRows: () => [round],
    market: { orders: () => orders, book, order() {}, sell() {}, cancel() {}, exchange() {} } };
  const store = new Map();
  const window = { parent: { ARENA_GAME: A }, UpDownView: { mount: () => ({ kind() {}, draw: (m, o) => { draws.push(m); on = o; } }) },
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) } };
  const ctx = vm.createContext({ window, document: { getElementById: el, body: el(), createElement: el }, localStorage: window.localStorage,
    fetch: async () => { throw new Error('offline'); }, setInterval: (f) => { intervals.push(f); return 0; }, setTimeout: () => 0, clearTimeout() {}, console, Date, Math, JSON,
    Number, String, Array, Map, Set, Object, Promise, Error, URL, Intl, isFinite });
  vm.runInContext(clientScript(file), ctx);
  await tick();
  return { last: () => draws.at(-1), on: () => on, readBook: async () => { await intervals[2](); await tick(); } };
}
let file = 'index-v25.html';

// one ask for Up: a resting sell of 5 Up shares at 10¢; one more at 30¢ for 20 shares; the last match at 10¢
const THIN = { batches: [{ k: 1, price: 10000 }], positions: [],
  levels: { buys: [], sells: [{ outcome: 0, price: 10000, sharesMsat: '5000' }, { outcome: 0, price: 30000, sharesMsat: '20000' }] } };

test('#236 the market buy quote walks the asks with their sizes and promises no more than they hold', async () => {
  const c = await client({ books: [THIN] });
  const m = c.last();
  // 100 sats, 99 after the fee: 5 shares at 10¢ (0.5 sat), then 20 at 30¢ (6 sats) - 25 shares, the rest has no seller up to the limit 20¢?
  // the limit is the best ask + 10¢ = 20¢, so the 30¢ level is out of reach: 5 shares, the rest not promised
  assert.equal(m.mwin, '5 sats', `the quote promised ${m.mwin} with 5 shares resting at 10¢`);
  assert.match(m.mprice, /^at 10¢; only 5 shares rest up to 20¢ now: the rest may fill dearer or not at all$/);
});

test('#236 a deep enough ask is quoted whole at its price', async () => {
  const deep = { ...THIN, levels: { buys: [], sells: [{ outcome: 0, price: 40000, sharesMsat: '1000000' }] } };
  const m = (await client({ books: [deep] })).last();
  assert.equal(m.mwin, '247 sats');
  assert.equal(m.mprice, 'at 40¢');
});

// this tab holds 10 Up shares in entry ENTRY
const order = (sells = []) => ({ round: ROUND, entry: ENTRY, pick: 0, stakeMsat: '100000', limitPrice: 60000, entryCloseMs: Date.now() + 10 * 60000, placedMs: Date.now() - 60000, canSell: true, sells });
const held = (levels, extra = {}) => ({ batches: [{ k: 1, price: 50000 }], positions: [{ entry: ENTRY, outcome: 0, shares: ['10000', '0'], cost: '5000' }], levels, resting: { buys: [], sells: [] }, ...extra });

test('#238 with no buyer in the book the market sell promises nothing and cannot be pressed', async () => {
  const c = await client({ books: [held({ buys: [], sells: [] })], orders: [order()] });
  c.on().dir('sell'); await tick();
  const m = c.last();
  assert.equal(m.sget, '–', `with no bid the sell promised ${m.sget}`);
  assert.match(m.err, /no buyer/);
  assert.equal(m.go.disabled, true);
});

test('#238 the market sell is quoted at its own limit, 10¢ under the bid', async () => {
  const c = await client({ books: [held({ buys: [{ outcome: 0, price: 60000, netMsat: '100000' }], sells: [] })], orders: [order()] });
  c.on().dir('sell'); await tick();
  const m = c.last();
  // 10 shares at 50¢ less the 1 % fee: 4 sats, not 5 at the 60¢ bid
  assert.equal(m.sget, 'at least 4 sats at 50¢ or better');
  assert.equal(m.go.disabled, false);
});

test('#250 a book that cannot be read does not turn a resting sell into "sold" or the shares into 0', async () => {
  const sell = { id: 'aa'.repeat(32), outcome: 0, price: 70000, sharesMsat: '5000', atMs: Date.now() - 60000 };
  const first = held({ buys: [], sells: [{ outcome: 0, price: 70000, sharesMsat: '5000' }] }, { resting: { buys: [], sells: [sell.id] } });
  const c = await client({ books: [first, new Error('no seat answered'), null], orders: [order([sell])] });
  assert.equal(c.last().sells[0].chip[1], 'offered');
  await c.readBook();
  assert.equal(c.last().sells[0].chip[1], 'offered', 'a failed read made the resting sell ' + c.last().sells[0].chip[1]);
  assert.match(c.last().held, /^10 Up/);
  await c.readBook();
  assert.notEqual(c.last().sells[0].chip[1], 'sold');
  // never read at all: the sell is not "sold" either
  const d = await client({ books: [new Error('no seat answered')], orders: [order([sell])] });
  assert.notEqual(d.last().sells[0].chip[1], 'sold');
});
