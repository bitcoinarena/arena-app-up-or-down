// SPDX-License-Identifier: LicenseRef-Bitcoin-Arena-1.0
// Copyright (c) 2026 The Bitcoin Arena authors. See LICENSE.
// bitcoin-arena kanban #3710 (feedback #471, #472): a 6-sat limit order with expiry "in 1 min" (~04:37:50Z) was still in My orders as open at
// 04:39 and 04:40 and left only at the close (04:45) as refunded, with no expiry on its row; a market order's Cancel went after a minute with no
// word. orderExpiryMs was used only for the cancel. Now a row past its expiry says it expired and when its stake comes back, a row with an expiry
// to come counts it down, and the market note says the 60 s up front. The checks run as the built page has it (UD_CLIENT names another build).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const at = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const UNDER = process.env.UD_CLIENT ? at(process.env.UD_CLIENT) : at('client/index-v26.html');
const hhmm = (ms) => new Date(ms).toISOString().slice(11, 16);
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const block = (from, to) => { const a = UNDER.indexOf(from), b = UNDER.indexOf(to, a); return a < 0 || b < a ? null : UNDER.slice(a, b + to.length); };
const HISTORY = new Function(`${block('const HISTORY = (() => {', '// </history>')}\nreturn HISTORY;`)();
const src = block('// <expiry-3710>', '// </expiry-3710>');
// before #3710: the row's chip was HISTORY.resultOf, whatever the order's expiry
const EXPIRY = src ? new Function('HISTORY', 'hhmm', 'mmss', `${src}\nreturn EXPIRY;`)(HISTORY, hhmm, mmss)
  : { chip: (o, l, now) => HISTORY.resultOf(o, l, now) };

const close = Date.UTC(2026, 10, 25, 4, 45), placed = Date.UTC(2026, 10, 25, 4, 37, 50);
const order = { entry: 'e1', round: 'r0430', pick: 0, stakeMsat: 6000, limitPrice: 50000, entryCloseMs: close, orderExpiryMs: placed + 60000 };

test('#3710 an unfilled order past its expiry is not shown as open', () => {
  const now = Date.UTC(2026, 10, 25, 4, 40);
  const chip = EXPIRY.chip(order, { state: 'open' }, now, false);
  console.log('#3710 MEASURED 04:40Z, expiry 04:38:50Z, no shares:', JSON.stringify(chip.slice(0, 2)));
  assert.notEqual(chip[0], 'open', 'the expired order is still an open row');
  assert.equal(chip[1], 'expired unfilled · stake back when the window settles (~04:55 UTC)');
});

test('#3710 an order with its expiry to come counts it down; a filled one past it says the rest left the book', () => {
  const now = placed + 15000;
  const chip = EXPIRY.chip(order, null, now, false);
  console.log('#3710 MEASURED 04:38:05Z, expiry 04:38:50Z:', JSON.stringify(chip.slice(0, 2)));
  assert.deepEqual(chip.slice(0, 2), ['open', 'closes in 6:55 · expires in 0:45']);
  const later = Date.UTC(2026, 10, 25, 4, 40);
  assert.deepEqual(EXPIRY.chip(order, null, later, true).slice(0, 2), ['open', 'closes in 5:00 · the unfilled rest left the book']);
  // no expiry (a resting limit order): as before
  assert.deepEqual(EXPIRY.chip({ ...order, orderExpiryMs: 0 }, null, later, false), HISTORY.resultOf({ ...order, orderExpiryMs: 0 }, null, later));
  // a result is said as before, expiry or not
  assert.deepEqual(EXPIRY.chip(order, { state: 'refunded' }, close + 600000, false), HISTORY.resultOf(order, { state: 'refunded' }, close + 600000));
});

test('#3710 My orders draws the chip through EXPIRY, and the market note says the 60 s', () => {
  assert.match(UNDER, /chip: EXPIRY\.chip\(o, l, now, filledOf\(o\)\)/);
  assert.match(UNDER, /'; what does not fill in 60 s leaves the book'/);
});
