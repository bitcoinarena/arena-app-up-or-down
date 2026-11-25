// SPDX-License-Identifier: LicenseRef-Bitcoin-Arena-1.0
// Copyright (c) 2026 The Bitcoin Arena authors. See LICENSE.
// VERSION 26'S CLIENT, run as its built page has it:
// - bitcoin-arena kanban #3079 (feedback #358): after a buy the line said "the window starts in 9:02" while the window ran - a market's
//   round start is its entry close; it now says the window closes in that time;
// - #3080 (feedback #359): after a reload, cancelled or expired orders read back from the seats showed a cancel button - none for an order
//   past its own expiry (it left the book then);
// - #3075 (feedback #351): Buy was enabled in a window the seats had not got ready, and the order was refused "not open yet".
// UD_CLIENT=client/index-v25.html runs the same checks on version 25 (they fail there).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildV26 } from '../tools/build-client-v26.mjs';
import { FORBIDDEN } from '../tools/build-client-v17.mjs';

const at = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const V26 = at('client/index-v26.html');
const UNDER = process.env.UD_CLIENT ? at(process.env.UD_CLIENT) : V26;

test('the file is what the tool writes', () => {
  assert.equal(buildV26(at('client/index.html'), at('client/src-v26.js'), at('dist/updown-view.js')), V26, 'client/index-v26.html is out of date: run tools/build-client-v26.mjs');
});
test('no forbidden word is left in the file', () => { assert.deepEqual(V26.split('\n').filter((l) => FORBIDDEN.test(l)).map((l) => l.trim().slice(0, 60)), []); });

test('#3079: a locked order says when the window closes, not when it starts', () => {
  const a = UNDER.indexOf('  function joinStatus() {'), b = UNDER.indexOf('\n  }\n', a);
  const joinStatus = new Function('A', 'placing', `${UNDER.slice(a, b + 4)}\nreturn joinStatus();`);
  const got = joinStatus({ state: () => ({ join: { round: 'r', state: 'joining', stage: 'round starts in 9:02' } }) }, { round: 'r', doneAt: 0 });
  assert.equal(got.line, '✓ Order locked · the window closes in 9:02');
});

const canCancelOf = (() => {
  const line = UNDER.slice(UNDER.indexOf('      const canCancel = '), UNDER.indexOf(';\n', UNDER.indexOf('      const canCancel = ')) + 1);
  return (o, l = null) => new Function('o', 'l', `${line}\nreturn canCancel;`)(o, l);
})();
test('#3080: no cancel for an order past its expiry', () => {
  const now = Date.now(), live = { entryCloseMs: now + 300000, orderExpiryMs: now + 60000 };
  assert.equal(canCancelOf(live), true, 'an open order of this tab can be cancelled');
  assert.equal(canCancelOf({ ...live, orderExpiryMs: now - 1000 }), false, 'an expired order shows a cancel button');
  assert.equal(canCancelOf({ ...live, orderExpiryMs: 0 }), true, 'an order with no expiry rests until the close');
});

test('#3075: no Buy in a window the seats have not got ready', () => {
  const a = UNDER.indexOf("      go: sellGo ? "), b = UNDER.indexOf('\n', UNDER.indexOf("text: 'Buy ' + outcomes[pick] }", a));
  // #3709: the not-ready button comes from the OPENING block (client-v26-opening-3709 checks its words); here only that Buy is off
  const OPENING = { button: (c) => (c && c.joinable === false ? { disabled: true, text: 'Opening…' } : null) }, now = Date.now();
  const goOf = new Function('sellGo', 'current', 'a', 'selling', 'js', 'outcomes', 'pick', 'OPENING', 'now', `return { ${UNDER.slice(a, b).trim().replace(/,$/, '')} }.go;`);
  const notReady = goOf(false, { joinable: false, free: false }, {}, false, null, ['Up', 'Down'], 0, OPENING, now);
  assert.equal(notReady.disabled, true, 'Buy is enabled in a window that is not open yet');
  const ready = goOf(false, { joinable: true, free: false }, {}, false, null, ['Up', 'Down'], 0, OPENING, now);
  assert.deepEqual(ready, { disabled: false, text: 'Buy Up' });
});

// bitcoin-arena kanban #3601 (feedback #429, #432): an order showed 'placing…' in My orders and then vanished, no word - the row lived only
// while the page's join named its round, and a refusal was shown 20 s, then dropped. An order attempt now always ends visibly.
const flightOf = (join, placing) => {
  const a = UNDER.indexOf('  function joinStatus() {'), b = UNDER.indexOf('\n  }\n', a);
  const state = { join };
  const run = new Function('A', 'P', `let placing = P;\n${UNDER.slice(a, b + 4)}\nreturn () => joinStatus();`)({ state: () => state }, placing);
  return { run, state };
};
test('#3601: a refused order stays said, also after 20 s', () => {
  const placing = { round: 'r', doneAt: 0 };
  const f = flightOf({ round: 'r', state: 'refused', why: 'this round is not open yet - nothing was paid' }, placing);
  assert.equal(f.run().line, 'Order not placed: this round is not open yet - nothing was paid');
  placing.doneAt = Date.now() - 120000;
  const later = f.run();
  assert.ok(later && later.cls === 'bad', 'the refusal was dropped after its 20 s');
  assert.equal(later.line, 'Order not placed: this round is not open yet - nothing was paid');
  f.state.join = null;
  assert.equal((f.run() || {}).line, 'Order not placed: this round is not open yet - nothing was paid', 'the refusal went when the page cleared its join');
});
test('#3601: a join replaced by another round\'s ends the order with "not placed" and a reason', () => {
  const f = flightOf({ round: 'r', state: 'joining', stage: 'finding the round in the lobby' }, { round: 'r', doneAt: 0 });
  assert.equal(f.run().cls, '');
  f.state.join = { round: 'other', state: 'joining', stage: '' };
  const got = f.run();
  assert.ok(got, 'the order in flight was dropped without a word');
  assert.equal(got.cls, 'bad');
  assert.match(got.line, /^Order not placed: .{10,}/);
  f.state.join = null;
  assert.equal((f.run() || {}).line, got.line, 'the line went when the page cleared its join');
});
test('#3601: a placed order still clears from the flight once its line has been shown', () => {
  const placing = { round: 'r', doneAt: 0 };
  const f = flightOf({ round: 'r', state: 'joined' }, placing);
  assert.equal(f.run().line, '✓ Order placed');
  placing.doneAt = Date.now() - 60000;
  assert.equal(f.run(), null);
});
