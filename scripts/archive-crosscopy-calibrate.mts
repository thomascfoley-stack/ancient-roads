#!/usr/bin/env tsx
/**
 * CROSS-COPY CALIBRATION POC (ADR-110, FORK A) — the fresh-work text-match proof,
 * measured BEFORE anything is built on it.
 *
 *   npx tsx scripts/archive-crosscopy-calibrate.mts
 *
 * Question: does 3-gram shingle-hash containment over the repo's OCR-tolerant
 * normalization DISCRIMINATE "two independent scans of the same edition" from
 * "two different works" — and at what threshold? The design doc's POC answered
 * NO for byte-offset windowed comparison (same-edition scored 5.0%, BELOW the
 * 6.9–9.5% different-work floor). The doc's own lesson: align comparable
 * SECTIONS, never byte offsets. This measures:
 *
 *   M1  whole-text containment (alignment-free) — the cheap metric
 *   M2  section-aligned containment — Ryle's `MATTHEW I. 1—17` passage headers
 *       pair sections across scans; per-section containment, median reported
 *
 * Pairs:
 *   SAME      expositorythough01ryle (1857) vs expositorythoug01rylegoog (1878)
 *             — vol 1 Matthew, two independent scans
 *   DIFFERENT expositorythough01ryle vs TheGreatCommentaryOfCorneliusALapideV5
 *
 * The title-page guard (extractGospelVolume) runs first — a number is not
 * evidence until the guard confirms the inputs are even the same work.
 *
 * READ-ONLY against the cached scans in data/raw/archive/ (CHECKSUMS.sha256
 * committed). Emits a verdict line and the numbers a threshold can be set from.
 */
import { readFileSync } from 'node:fs';
import {
  shingleHashSetOcr,
  containment,
  extractGospelVolume,
  titleGuardAgrees,
} from '../src/ingest/resource-textmatch.js';

const DIR = 'data/raw/archive';
const RYLE_A = `${DIR}/expositorythough01ryle_djvu.txt`;
const RYLE_B = `${DIR}/expositorythoug04rylegoog_djvu.txt`;
const LAPIDE = `${DIR}/TheGreatCommentaryOfCorneliusALapideV5_djvu.txt`;

/** Split a Ryle scan into passage sections keyed "chapter:verseStart". Lines
 *  matching the header shape open a section; a header followed by <200 chars
 *  of body is a TOC entry and is skipped (the TOC lists the same headers). */
function ryleSections(text: string): Map<string, string> {
  const lines = text.split(/\r?\n/);
  const header = /^\s*MATTHEW\s+([IVXL]{1,5})\.?\s+(\d{1,2})\s*[-—.]\s*(\d{1,2})\.?\s*$/;
  const sections = new Map<string, string>();
  let key: string | null = null;
  let body: string[] = [];
  const flush = () => {
    if (key !== null && body.join(' ').length >= 200 && !sections.has(key)) {
      sections.set(key, body.join(' '));
    }
  };
  for (const line of lines) {
    const m = line.match(header);
    if (m) {
      flush();
      key = `${m[1]}:${m[2]}`;
      body = [];
    } else if (key !== null) {
      body.push(line);
    }
  }
  flush();
  return sections;
}

const a = readFileSync(RYLE_A, 'utf8');
const b = readFileSync(RYLE_B, 'utf8');
const lap = readFileSync(LAPIDE, 'utf8');

console.log('── title-page guard ──');
const guard = titleGuardAgrees(a, b);
console.log(`ryle-01 vs ryle-01-goog: ${JSON.stringify(guard)}`);
console.log(`lapide extract: ${JSON.stringify(extractGospelVolume(lap))}`);
if (!guard.ok) {
  console.error('STOP: the two Ryle scans do not title-guard as the same work. No number below is evidence.');
  process.exit(1);
}

console.log('\n── M1: whole-text 3-gram containment ──');
for (const [label, x, y] of [['SAME  ryle01 ⊂ ryle01-goog', a, b], ['SAME  ryle01-goog ⊂ ryle01', b, a], ['DIFF   ryle01 ⊂ lapide', a, lap], ['DIFF   lapide ⊂ ryle01', lap, a]] as const) {
  const c = containment(shingleHashSetOcr(x), shingleHashSetOcr(y));
  console.log(`${label}: ${(100 * c).toFixed(1)}%`);
}

console.log('\n── M2: section-aligned 3-gram containment (min of both directions) ──');
const secA = ryleSections(a);
const secB = ryleSections(b);
console.log(`sections: ryle01=${secA.size}, ryle01-goog=${secB.size}`);
const shared = [...secA.keys()].filter((k) => secB.has(k));
console.log(`paired sections (same chapter:verseStart in both): ${shared.length}`);
const scores: number[] = [];
for (const k of shared) {
  const x = shingleHashSetOcr(secA.get(k)!);
  const y = shingleHashSetOcr(secB.get(k)!);
  scores.push(Math.min(containment(x, y), containment(y, x)));
}
scores.sort((p, q) => p - q);
const median = scores[Math.floor(scores.length / 2)]!;
const p10 = scores[Math.floor(scores.length * 0.1)]!;
const p90 = scores[Math.floor(scores.length * 0.9)]!;
console.log(`SAME median: ${(100 * median).toFixed(1)}%  (p10 ${(100 * p10).toFixed(1)} / p90 ${(100 * p90).toFixed(1)})`);

// Different-work control at section granularity: a Lapide has no Ryle section
// keys, so the honest section-level control is each Ryle section against the
// WHOLE a Lapide — the strongest false-positive shape a matcher can face.
const lapShingles = shingleHashSetOcr(lap);
const diffScores = shared.map((k) => containment(shingleHashSetOcr(secA.get(k)!), lapShingles)).sort((p, q) => p - q);
const dMedian = diffScores[Math.floor(diffScores.length / 2)]!;
const dMax = diffScores[diffScores.length - 1]!;
console.log(`DIFF median: ${(100 * dMedian).toFixed(1)}%  (max ${(100 * dMax).toFixed(1)})`);

console.log('\n── verdict ──');
const separates = p10 > dMax;
console.log(`separation: SAME p10 ${(100 * p10).toFixed(1)}% ${separates ? '>' : '≯'} DIFF max ${(100 * dMax).toFixed(1)}%  → ${separates ? 'DISCRIMINATES with a clean gap' : 'NO CLEAN GAP — do not ship a threshold from this'}`);
if (separates) {
  const threshold = (p10 + dMax) / 2;
  console.log(`calibrated section-containment threshold: ${(100 * threshold).toFixed(1)}% (midpoint of the gap)`);
}
