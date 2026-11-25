// SPDX-License-Identifier: LicenseRef-Bitcoin-Arena-1.0
// Copyright (c) 2026 The Bitcoin Arena authors. See LICENSE.
// bitcoin-arena kanban #3709 (feedback #470): the 04:15-04:30Z window showed its price to beat, chance 50 % and "closes in 3:58" while Buy read
// "Opening…" (disabled) from ~04:25 to ~04:29Z with nothing said why: the window's committee was seated late. The line under the button now says
// the window is still being opened by its nodes, and once most of the window is gone that it cannot be traded ("Not tradeable").
// The checks run as the built page has it (UD_CLIENT names another build).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const at = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const UNDER = process.env.UD_CLIENT ? at(process.env.UD_CLIENT) : at('client/index-v26.html');
const PERIOD_MS = 15 * 60000;
const hhmm = (ms) => new Date(ms).toISOString().slice(11, 16);
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const block = (from, to) => { const a = UNDER.indexOf(from), b = UNDER.indexOf(to, a); return a < 0 || b < a ? null : UNDER.slice(a, b + to.length); };
const src = block('// <opening-3709>', '// </opening-3709>');
// before #3709: no word under the button, and "Opening…" whatever is left of the window
const OPENING = src ? new Function('PERIOD_MS', 'hhmm', 'mmss', `${src}\nreturn OPENING;`)(PERIOD_MS, hhmm, mmss)
  : { line: () => '', button: (c) => (c && c.joinable === false ? { disabled: true, text: 'Opening…' } : null) };

const close = Date.UTC(2026, 10, 25, 4, 30);
const win = { id: 'r0415', entryCloseMs: close, joinable: false, free: false };

test('#3709 a window its nodes have not got ready says why under the button', () => {
  const early = close - 12 * 60000;
  const line = OPENING.line(win, early);
  console.log('#3709 MEASURED 04:18Z, not joinable:', JSON.stringify({ line, button: OPENING.button(win, early) }));
  assert.equal(line, 'This window is still being opened by its nodes: orders open in a moment.');
  assert.deepEqual(OPENING.button(win, early), { disabled: true, text: 'Opening…' });
});

test('#3709 with most of the window gone it is said as not tradeable, not "Opening…"', () => {
  const late = close - (3 * 60000 + 58000);   // the reporter's "closes in 3:58"
  const line = OPENING.line(win, late);
  console.log('#3709 MEASURED 04:26:02Z, not joinable:', JSON.stringify({ line, button: OPENING.button(win, late) }));
  assert.equal(line, 'This window cannot be traded: its nodes did not get it ready in time (it closes in 3:58). Orders go in the next window, from 04:30 UTC.');
  assert.deepEqual(OPENING.button(win, late), { disabled: true, text: 'Not tradeable' });
});

test('#3709 a joinable window, a free one and no window say nothing, and the draw uses the block', () => {
  assert.equal(OPENING.line({ ...win, joinable: true }, close - 60000), '');
  assert.equal(OPENING.button({ ...win, joinable: true }, close - 60000), null);
  assert.equal(OPENING.line({ ...win, free: true }, close - 60000), '');
  assert.equal(OPENING.line(null, close), '');
  assert.match(UNDER, /err: current && current\.free \? 'Orders need a paid round' : \(!sellGo && OPENING\.line\(current, now\)\) \|\| a\.why \|\| said,/);
  assert.match(UNDER, /: OPENING\.button\(current, now\) \|\|/);
});
