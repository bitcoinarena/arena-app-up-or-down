// SPDX-License-Identifier: LicenseRef-Bitcoin-Arena-1.0
// Copyright (c) 2026 The Bitcoin Arena authors. See LICENSE.
// bitcoin-arena kanban #3721 (feedback #497): Past orders read "+49 · −50 · net −0 sats" for 49,500 msat won and 50,000 msat lost. Won, lost
// and net were each floored from msat on their own, and the sign came from the exact net, so a net under one sat read "−0".
// Now each total is rounded once from the exact msat (net from won - lost, not from the shown numbers), and a net that rounds to 0 reads
// "net 0" with no sign. The checks run as the built page has it (UD_CLIENT names another build).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const at = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const UNDER = process.env.UD_CLIENT ? at(process.env.UD_CLIENT) : at('client/index-v26.html');
const block = (from, to) => { const a = UNDER.indexOf(from), b = UNDER.indexOf(to, a); return a < 0 || b < a ? null : UNDER.slice(a, b + to.length); };
const sats = (n) => Math.floor(n).toLocaleString('en-US') + ' sats';
const totalsBlock = block('// <totals-3721>', '// </totals-3721>');
// the build under test: its TOTALS block, or (before #3721) each total floored on its own
const TOTALS = totalsBlock ? new Function('sats', `${totalsBlock}\nreturn TOTALS;`)(sats) : (won, lost) => {
  const num = (msat) => Math.floor(Math.abs(Number(msat)) / 1000).toLocaleString('en-US');
  return { won: sats(won / 1000), lost: sats(lost / 1000), net: sats(Math.abs(won - lost) / 1000), netMsat: won - lost, wonNum: num(won), lostNum: num(lost), netNum: num(won - lost) };
};
// the view's sign before the net, short and long line, as the built page's bundle has it
const shortSign = (t) => { const m = UNDER.match(/children:\[(l\.netMsat[^,]*),l\.netNum," sats"\]/); return new Function('l', `return ${m[1]};`)(t); };
const longSign = (t) => { const m = UNDER.match(/children:\[(l\.netMsat[^,]*),l\.net\]/); return new Function('l', `return ${m[1]};`)(t); };
const line = (t) => `+${t.wonNum} −${t.lostNum} net ${shortSign(t)}${t.netNum} sats`;

test('#3721 49,500 won and 50,000 lost never read "net −0"', () => {
  const t = TOTALS(49500, 50000);
  assert.equal(t.netNum, '0');
  assert.equal(shortSign(t), '', 'a net that rounds to 0 has no sign');
  assert.equal(longSign(t), '');
  assert.equal(line(t), '+50 −50 net 0 sats');
});

test('#3721 the net is rounded once from the exact msat, its sign the shown one', () => {
  for (const [won, lost, want] of [[49400, 50000, 'net −1 sats'], [50600, 50000, 'net +1 sats'], [100000, 0, 'net +100 sats'], [0, 60000, 'net −60 sats'], [0, 0, 'net 0 sats'], [499, 0, 'net 0 sats'], [0, 499, 'net 0 sats']]) {
    const t = TOTALS(won, lost);
    assert.ok(line(t).endsWith(want), `${won}/${lost}: ${line(t)}`);
    assert.ok(!/[+−±]0 sats/.test(line(t)) && !/^[+−±]0/.test(longSign(t) + t.net), `${won}/${lost}: no signed zero`);
    assert.equal(Object.is(t.netMsat, -0), false);
  }
});
