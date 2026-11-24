// SPDX-License-Identifier: LicenseRef-Bitcoin-Arena-1.0
// Copyright (c) 2026 The Bitcoin Arena authors. See LICENSE.
// bitcoin-arena kanban #3611 (feedback #444): the 12:45 window showed $60,175.01 - the 12:30 window's price to beat - until about 12:46. The
// beat of a new window comes from a Coinbase 1-min candle, which arrives up to a minute late; until then the card showed the old window's beat
// (and the delta against it). Now the card shows the beat only for the window it was read for, and "reading…" (no delta) until then.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const at = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const UNDER = process.env.UD_CLIENT ? at(process.env.UD_CLIENT) : at('client/index-v26.html');
const PERIOD_MS = 15 * 60000;
const usd = (c) => (c === null || c === undefined ? '…' : '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const hhmm = (ms) => new Date(ms).toISOString().slice(11, 16);
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

// draw()'s card, as the built page has it
const cardOf = (current, live, now) => {
  const a = UNDER.indexOf('    if (current) {\n      const start = current.entryCloseMs - PERIOD_MS;'), b = UNDER.indexOf('    } else card = ', a);
  assert.ok(a > 0 && b > a, 'draw()\'s card is not found');
  const f = new Function('current', 'live', 'now', 'PERIOD_MS', 'usd', 'hhmm', 'mmss', `let card;\n${UNDER.slice(a, b)}    }\n    return card;`);
  return f(current, live, now, PERIOD_MS, usd, hhmm, mmss);
};

test('#3611 a new window never shows the previous window\'s price to beat', () => {
  const start = Date.UTC(2026, 10, 24, 12, 45), cur = { id: 'w1245', free: false, entryCloseMs: start + PERIOD_MS };
  const old = { now: 6052040, beat: 6017501, beatFor: 'w1230' };   // the 12:30 window's beat, not yet replaced
  const stale = cardOf(cur, old, start + 30000);
  console.log('#3611 MEASURED 12:45:30 before the new candle:', JSON.stringify({ beat: stale.beat, delta: stale.delta.text }));
  assert.notEqual(stale.beat, '$60,175.01', 'the old window\'s beat is shown');
  assert.equal(stale.beat, 'reading…');
  assert.equal(stale.delta.text, '–', 'a delta against the old beat is shown');
  const fresh = cardOf(cur, { now: 6052040, beat: 6052040 - 100, beatFor: 'w1245' }, start + 70000);
  assert.equal(fresh.beat, '$60,519.40');
  assert.equal(fresh.delta.text, '▲ $1.00');
  assert.equal(cardOf(cur, old, start - 60000).beat, 'at 12:45', 'before the window opens it says when');
});
