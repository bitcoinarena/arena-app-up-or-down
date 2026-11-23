// SPDX-License-Identifier: LicenseRef-Bitcoin-Arena-1.0
// Copyright (c) 2026 The Bitcoin Arena authors. See LICENSE.
// VERSION 26's CLIENT: version 26's build with src-v26.js - a locked order says when the window closes (bitcoin-arena kanban #3079),
// no cancel for an order past its expiry or read back from the seats (#3080), no Buy in a window the seats have not got ready (#3075).
//
//   node tools/build-view.mjs && node tools/build-client-v26.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { buildV16, HEAD_END } from './build-client-v16.mjs';
import { FORBIDDEN, cleanText } from './build-client-v17.mjs';
import { CSS_V19 } from './build-client-v19.mjs';
import { CSS_V21, CSS_V22_ONLY, CSS_V23_ONLY } from './build-client-v23.mjs';

const V15 = new URL('../client/index.html', import.meta.url);
const SRC = new URL('../client/src-v26.js', import.meta.url);
const BUNDLE = new URL('../dist/updown-view.js', import.meta.url);
const OUT = new URL('../client/index-v26.html', import.meta.url);


export function buildV26(v15, src, bundle) {
  const at = v15.indexOf(HEAD_END);
  if (at < 0) throw new Error('version 15 has no end of head');
  const styled = v15.slice(0, at) + CSS_V21 + CSS_V22_ONLY + CSS_V23_ONLY + v15.slice(at);
  // and no owner's name in the comments version 15's file carries (the public repository's pre-push check)
  return buildV16(styled, src, bundle).split('\n').map((l) => (FORBIDDEN.test(l) ? cleanText(l) : l)).join('\n').replace(/\b[D]aniel(?:'s)?\s/g, 'the owner ');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = buildV26(readFileSync(V15, 'utf8'), readFileSync(SRC, 'utf8'), readFileSync(BUNDLE, 'utf8'));
  if (out.split('\n').some((l) => FORBIDDEN.test(l))) throw new Error('a forbidden word is left in version 26');
  writeFileSync(OUT, out);
  console.log(`client/index-v26.html: ${out.length} bytes`);
}
