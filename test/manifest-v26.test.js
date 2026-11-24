// SPDX-License-Identifier: LicenseRef-Bitcoin-Arena-1.0
// Copyright (c) 2026 The Bitcoin Arena authors. See LICENSE.
// VERSION 26 (bitcoin-arena kanban #3075, #3079, #3080): version 25 in every term, with the new client index-v26.html beside version 25's;
// the signed manifest stands on version 25. The client's changes: test/client-v26.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { MANIFEST_V25, GAME_ID_V25 } from '../plugin/btc-updown-v25.js';
import { MANIFEST_V26, GAME } from '../plugin/btc-updown-v26.js';
import { manifestStands } from 'arena-sdk/manifest';
import { verifyEd25519 } from 'arena-sdk/ed25519';
import { toHex } from 'arena-sdk/hash';

const V26 = readFileSync(new URL('../client/index-v26.html', import.meta.url));

test('the signed manifest stands on version 25 and adds only index-v26.html to its clients', () => {
  assert.equal(toHex(GAME.gameId), 'f8df58ed305a4f0ef36fcc9d6c8a2956ace5a85520c1ee69872d38e23fb8fc60');
  const stands = manifestStands(MANIFEST_V26, { verify: verifyEd25519, parentOf: (id) => (toHex(id) === toHex(GAME_ID_V25) ? MANIFEST_V25 : null) });
  assert.ok(stands.ok, stands.why);
  const v26 = createHash('sha256').update(V26).digest('hex');
  assert.deepEqual(MANIFEST_V26.clients.map(toHex).sort(), [...MANIFEST_V25.clients.map(toHex), v26].sort());
  const { clients: a, version: va, parentManifestId: pa, signature: sa, ...rest26 } = MANIFEST_V26;
  const { clients: b, version: vb, parentManifestId: pb, signature: sb, ...rest25 } = MANIFEST_V25;
  void a; void va; void pa; void sa; void b; void vb; void pb; void sb;
  assert.equal(va, vb + 1);
  assert.deepEqual(rest26, rest25, 'every other term is version 25\'s');
});
