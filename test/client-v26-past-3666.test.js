// SPDX-License-Identifier: LicenseRef-Bitcoin-Arena-1.0
// Copyright (c) 2026 The Bitcoin Arena authors. See LICENSE.
// bitcoin-arena kanban #3666 (feedback #451): Past orders read "3 closed · won +0 · lost -60 · net -60 · 1 pending" and a refunded order of
// 20 Nov still said "pending" four days later. A kept order was final only by `final === true` or a `finalAtMs` passed, and its summary is
// refreshed only while the order is in the live list: a refund kept with final false and no finalAtMs stayed "pending" for good, and the
// summary counted every past row as closed, the pending one too.
// Now a refund or void whose stake is back is final, a kept row out of the live list an hour after its window closed is final, and the summary
// counts the final rows as closed and the pending ones apart. The checks run as the built page has it (UD_CLIENT names another build).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const at = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const UNDER = process.env.UD_CLIENT ? at(process.env.UD_CLIENT) : at('client/index-v26.html');
const HOUR = 3600000, DAY = 24 * HOUR;

const block = (from, to) => { const a = UNDER.indexOf(from), b = UNDER.indexOf(to, a); return a < 0 || b < a ? null : UNDER.slice(a, b + to.length); };
const HISTORY = new Function(`${block('const HISTORY = (() => {', '// </history>')}\nreturn HISTORY;`)();
const pastBlock = block('// <past-3666>', '// </past-3666>');
// the build under test: its PAST block, or (before #3666) the history's own rule and every past row counted as closed
const PAST = pastBlock ? new Function('HISTORY', `${pastBlock}\nreturn PAST;`)(HISTORY)
  : { isFinal: HISTORY.isFinal, statusLine: HISTORY.statusLine, mark: (past) => past, counts: (past, now) => ({ closed: past.length, pend: past.filter((p) => !HISTORY.isFinal(p, now)).length }) };

// the reporter's list: two lost orders (final), and the 20 Nov refund kept with final false and no finalAtMs, no longer in the live list
const close20 = Date.UTC(2026, 10, 20, 18, 0), now = close20 + 4 * DAY;
const kept = [
  { entry: 'aa', closeMs: close20 + DAY, side: 0, stakeMsat: 30000, limit: 50, state: 'lost', pnlMsat: -30000, final: true, finalAtMs: close20 + DAY + 600000 },
  { entry: 'bb', closeMs: close20 + DAY, side: 1, stakeMsat: 30000, limit: 50, state: 'lost', pnlMsat: -30000, final: true, finalAtMs: close20 + DAY + 600000 },
  { entry: '1fe68a', closeMs: close20, side: 1, stakeMsat: 20000, limit: 50, state: 'refunded', pnlMsat: 0, final: false, finalAtMs: null },
];

test('#3666 a refunded order kept out of the live list is final, and the summary counts only final rows as closed', () => {
  const past = HISTORY.merge(kept, [], now);
  const marked = PAST.mark(past, []);
  const refund = marked.find((p) => p.entry === '1fe68a');
  const c = PAST.counts(marked, now);
  console.log('#3666 MEASURED 4 days after the refund:', JSON.stringify({ status: PAST.statusLine(refund, now), closed: c.closed, pend: c.pend }));
  assert.equal(PAST.statusLine(refund, now), 'final', 'the refund still says pending');
  assert.equal(PAST.isFinal(refund, now), true);
  assert.deepEqual(c, { closed: 3, pend: 0 });
});

test('#3666 a pending row is never counted as closed', () => {
  const close = now - 5 * 60000;   // closed 5 minutes ago, its outcome attested, the objection window running
  const live = [{ o: { entry: 'cc', entryCloseMs: close, pick: 0, stakeMsat: 10000, limitPrice: 50000 }, l: { state: 'won', gainMsat: 9000, final: false, finalAtMs: now + 300000 } }];
  const marked = PAST.mark(HISTORY.merge(kept, live, now), live);
  const row = marked.find((p) => p.entry === 'cc');
  assert.equal(PAST.isFinal(row, now), false);
  assert.equal(PAST.statusLine(row, now), 'pending · final in 5:00');
  assert.deepEqual(PAST.counts(marked, now), { closed: 3, pend: 1 }, '"3 closed · 1 pending", not "4 closed · 1 pending"');
});

test('#3666 a refund still in transit stays pending while it is in the live list; one in its objection window counts down', () => {
  const close = now - 20 * 60000;
  const transit = [{ o: { entry: 'dd', entryCloseMs: close, pick: 1, stakeMsat: 10000, limitPrice: 50000 }, l: { state: 'refunded', inTransit: true, final: false, finalAtMs: null } }];
  const m1 = PAST.mark(HISTORY.merge([], transit, now), transit);
  assert.equal(PAST.isFinal(m1[0], now), false, 'a refund on its way back is not final yet');
  const attested = [{ o: { entry: 'ee', entryCloseMs: close, pick: 1, stakeMsat: 10000, limitPrice: 50000 }, l: { state: 'void', final: false, finalAtMs: now + 60000 } }];
  const m2 = PAST.mark(HISTORY.merge([], attested, now), attested);
  assert.equal(PAST.statusLine(m2[0], now), 'pending · final in 1:00');
  // and once out of the live list an hour after its window, a row is final whatever it was kept as
  const m3 = PAST.mark(m1, []);
  assert.equal(PAST.isFinal(m3[0], close + HOUR - 1), false);
  assert.equal(PAST.isFinal(m3[0], close + HOUR), true);
});
