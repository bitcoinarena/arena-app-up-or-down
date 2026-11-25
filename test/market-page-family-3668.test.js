// SPDX-License-Identifier: LicenseRef-Bitcoin-Arena-1.0
// Copyright (c) 2026 The Bitcoin Arena authors. See LICENSE.
// bitcoin-arena kanban #3668 (found in feedback #456): round ed43c013 ran on Up/Down v24 while the page showed v26. The orders read back from the
// seats (restoreOrdersFromSeats: after a reload, a new tab or another device) were read only in rounds of the shown version's game id, so the
// v24 order was not restored during the version change. Now a round of any version of the shown game counts (the page's ARENA_GAME_FAMILY: its
// tile's versions, same developer key and name), and only the shown id when the page names no family. page/market-page.js runs here as the page
// loads it; before #3668 it has no ofShownGame and the restore's own rule (the shown id only) is measured.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SCRIPT = readFileSync(new URL('../page/market-page.js', import.meta.url), 'utf8');
const V26 = 'f8df58ed' + '0'.repeat(56), V24 = '8e47d27f' + '0'.repeat(56), RPS = '5a1e' + '0'.repeat(60);

function page(family) {
  const store = new Map();
  const ctx = { sessionStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    ARENACLIENT: { fromHex: (x) => x, toHex: (x) => x }, console, setInterval: () => 0, setTimeout: () => 0,
    document: { getElementById: () => ({ insertAdjacentHTML() {} }) }, ARENA_GAME: { game: { id: V26 } } };
  if (family) ctx.ARENA_GAME_FAMILY = family;
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SCRIPT, ctx);
  // the build under test: its ofShownGame, or (before #3668) the shown id only, as the restore compared it
  return typeof ctx.ofShownGame === 'function' ? (gid) => ctx.ofShownGame(gid) : (gid) => gid === String(ctx.ARENA_GAME.game.id);
}

test('#3668 a round of the previous version of the shown game is read back from the seats', () => {
  const of = page([V26, '30d66419' + '0'.repeat(56), V24]);
  const got = { v26: of(V26), v24: of(V24), rps: of(RPS) };
  console.log('#3668 MEASURED rounds the restore reads while v26 is shown:', JSON.stringify(got));
  assert.deepEqual(got, { v26: true, v24: true, rps: false }, 'the v24 round is not read back');
  assert.equal(of(V24.toUpperCase()), true, 'an id in capitals is the same id');
});

test('#3668 a page that names no family reads the shown version only, as before', () => {
  const of = page(null);
  assert.equal(of(V26), true);
  assert.equal(of(V24), false);
});

// bitcoin-arena kanban #3674 (feedback #461): the Arena page names no ARENA_GAME_FAMILY; it names the versions its lobby reads as
// ARENA_GAME_IDS (index.html everyVersion, Up/Down included since #3674). A v24 order under the v26 tile is read back from those.
test('#3674 a page that names the tile versions as ARENA_GAME_IDS reads back the v24 round', () => {
  const store = new Map();
  const ctx = { sessionStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    ARENACLIENT: { fromHex: (x) => x, toHex: (x) => x }, console, setInterval: () => 0, setTimeout: () => 0,
    document: { getElementById: () => ({ insertAdjacentHTML() {} }) }, ARENA_GAME: { game: { id: V26 } }, ARENA_GAME_IDS: [V26, V24] };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SCRIPT, ctx);
  assert.equal(ctx.ofShownGame(V24), true, 'the v24 round is not read back');
  assert.equal(ctx.ofShownGame(RPS), false);
});
