// SPDX-License-Identifier: LicenseRef-Bitcoin-Arena-1.0
// Copyright (c) 2026 The Bitcoin Arena authors. See LICENSE.
// bitcoin-arena kanban #2908 (feedback #162): the amount stepper's '−' took the step of v - 1 whole - 101 -> 1, 150 -> 50, 1,001 -> 1,
// 10,001 -> 1. It now goes down to the step grid. The step is run as version 25's built client page has it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../client/index-v25.html', import.meta.url), 'utf8');
const stepAtSrc = html.match(/const stepAt = \(v\) => [^\n]+;/)[0];
const body = html.slice(html.indexOf('step: (dir) => {'), html.indexOf('add: (n) =>'));
const stepFn = new Function('form', 'MIN_SAT', 'MAX_SAT', `const keepAmount = () => {}, draw = () => {}; ${stepAtSrc} const o = { ${body} }; return o.step;`);
const press = (amt, dir) => { const form = { amt: String(amt) }; stepFn(form, 1, 1000000)(dir); return Number(form.amt); };

test("#2908 '−' goes down to the step grid, never to 1 from just above a tier", () => {
  for (const [from, to] of [[101, 100], [150, 100], [1001, 1000], [10001, 10000], [1999, 1000], [55, 50]]) assert.equal(press(from, -1), to, `${from} −`);
});

test("#2908 '−' on the grid takes one step of the tier below, as the comment promises; '+' unchanged", () => {
  for (const [from, to] of [[100, 90], [1000, 900], [10000, 9000], [200, 100], [90, 80], [10, 1], [1, 1]]) assert.equal(press(from, -1), to, `${from} −`);
  for (const [from, to] of [[90, 100], [100, 200], [1000, 2000], [10000, 20000]]) assert.equal(press(from, 1), to, `${from} +`);
});
