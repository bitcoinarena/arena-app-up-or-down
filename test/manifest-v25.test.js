// SPDX-License-Identifier: LicenseRef-Bitcoin-Arena-1.0
// Copyright (c) 2026 The Bitcoin Arena authors. See LICENSE.
// VERSION 25 (bitcoin-arena kanban #2836, feedback #084): version 24 in every term, with the new client index-v25.html beside version 24's;
// the signed manifest stands on version 24. The client's quote: test/client-v25-quote.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { MANIFEST_V24, GAME_ID_V24 } from '../plugin/btc-updown-v24.js';
import { MANIFEST_V25, GAME } from '../plugin/btc-updown-v25.js';
import { manifestStands } from 'arena-sdk/manifest';
import { verifyEd25519 } from 'arena-sdk/ed25519';
import { toHex } from 'arena-sdk/hash';

const V25 = readFileSync(new URL('../client/index-v25.html', import.meta.url));

test('the signed manifest stands on version 22 and adds only index-v25.html to its clients', () => {
  assert.equal(toHex(GAME.gameId), '96bb21b374ffe44bc8bc873aaf4fa09e228fb6d94fcc2200fe19943650c8c59c');
  const stands = manifestStands(MANIFEST_V25, { verify: verifyEd25519, parentOf: (id) => (toHex(id) === toHex(GAME_ID_V24) ? MANIFEST_V24 : null) });
  assert.ok(stands.ok, stands.why);
  const v25 = createHash('sha256').update(V25).digest('hex');
  assert.deepEqual(MANIFEST_V25.clients.map(toHex).sort(), [...MANIFEST_V24.clients.map(toHex), v25].sort());
  const { clients: a, version: va, parentManifestId: pa, signature: sa, ...rest25 } = MANIFEST_V25;
  const { clients: b, version: vb, parentManifestId: pb, signature: sb, ...rest24 } = MANIFEST_V24;
  void a; void va; void pa; void sa; void b; void vb; void pb; void sb;
  assert.deepEqual(rest25, rest24, 'every other term is version 24\'s');
});

