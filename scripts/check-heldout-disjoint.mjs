#!/usr/bin/env node
// Mechanically verify the DISJOINTNESS claim for the held-out eval sets.
//
// WHY: docs/HELDOUT_EVAL_DESIGN.md asserts v4 is "disjoint from pilot/v2/v3". That claim was
// never checkable from the repo — the ADR-024 label anchor-check script was never committed, so
// "disjoint" and "200/200 anchor checks" were both assertions with no artifact behind them.
// Held-out discipline (THE_LOOP rule 5) is the whole reason v4 exists; an unverifiable
// disjointness claim is exactly the circularity the freeze is supposed to prevent.
//
// SCOPE, stated honestly: this verifies DISJOINTNESS of the query sets ONLY. It does NOT verify
// the label anchors — that is `web/src/scripts/check-heldout-v4-anchors.mts` (committed
// 2026-08-22 under W-ADRV4RERUN, closing the reproducibility gap this comment used to record).
//
// Exit 0 = disjoint (prints the counts). Exit 1 = overlap found (prints the offending queries).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = {
  v4: 'web/src/scripts/heldout-v4-queries.mts',
  v3: 'web/src/scripts/heldout-v3-queries.mts',
  'pilot+v2': 'web/src/scripts/heldout-queries.mts',
};

/** Pull every `query: '...'` literal out of a set file. */
function queries(rel) {
  const src = readFileSync(join(ROOT, rel), 'utf8');
  const out = [];
  const re = /query:\s*'((?:[^'\\]|\\.)*)'|query:\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(src)) !== null) out.push((m[1] ?? m[2]).trim());
  return out;
}

const norm = (q) => q.toLowerCase().replace(/\s+/g, ' ').trim();

const sets = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, queries(f)]));
for (const [k, v] of Object.entries(sets)) {
  if (v.length === 0) {
    console.error(`✗ parsed ZERO queries from ${FILES[k]} — the checker would pass vacuously; fix the parser.`);
    process.exit(1);
  }
  console.log(`  ${k.padEnd(9)} ${v.length} queries  (${FILES[k]})`);
}

let overlaps = 0;
const pairs = [['v4', 'v3'], ['v4', 'pilot+v2'], ['v3', 'pilot+v2']];
for (const [a, b] of pairs) {
  const setB = new Set(sets[b].map(norm));
  const shared = sets[a].filter((q) => setB.has(norm(q)));
  if (shared.length) {
    overlaps += shared.length;
    console.error(`✗ ${a} ∩ ${b} = ${shared.length} shared quer${shared.length === 1 ? 'y' : 'ies'}:`);
    for (const q of shared.slice(0, 10)) console.error(`    "${q}"`);
  } else {
    console.log(`✓ ${a} ∩ ${b} = 0 (disjoint)`);
  }
}

if (overlaps) {
  console.error(`\n✗ DISJOINTNESS VIOLATED (${overlaps} overlapping queries). The held-out freeze is compromised.`);
  process.exit(1);
}
console.log('\n✓ all held-out sets are pairwise disjoint by query text.');

// QUERY-disjoint is NOT the same as LABEL-disjoint. Two sets can share zero query strings while
// pointing at the same ground-truth chapters — in which case a fix tuned on v3 can still lift v4,
// and "disjoint" oversells the independence. Measure and REPORT it rather than leaving the word
// "disjoint" to imply more than was checked. This is reported, not enforced: some label reuse is
// expected in a 66-book corpus, and the honest move is to state the number.
function expectedLabels(rel) {
  const src = readFileSync(join(ROOT, rel), 'utf8');
  const out = new Set();
  const re = /expected:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    for (const lit of m[1].matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)) out.add(norm(lit[1] ?? lit[2]));
  }
  return out;
}
const l4 = expectedLabels(FILES.v4);
const l3 = expectedLabels(FILES.v3);
const sharedLabels = [...l4].filter((x) => l3.has(x));
const pct = l4.size ? Math.round((100 * sharedLabels.length) / l4.size) : 0;
console.log(`\n  LABEL overlap (reported, not enforced): v4 has ${l4.size} distinct expected labels, v3 has ${l3.size};`);
console.log(`  ${sharedLabels.length} appear in BOTH (${pct}% of v4's labels).`);
console.log('  So "disjoint" is true of the QUERIES and only partly true of the GROUND TRUTH — a fix tuned');
console.log('  on v3 can still lift v4 wherever the labels coincide. State it that way, not as full independence.');
console.log('  NOTE: this does NOT verify label anchors — that check is');
console.log('  web/src/scripts/check-heldout-v4-anchors.mts (committed 2026-08-22). Run both.');
