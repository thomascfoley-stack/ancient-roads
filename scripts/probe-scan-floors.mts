// SCAN_RE false-floor measurement (W-SCANRE, 2026-08-22). READ-ONLY, no DB.
//
// Runs every case in evals/cases/reference_floors.yaml through resolveIntent
// (tier-level, per ADR-115: the hijack lives in the {inject, floor} output,
// not in whether a string parses) and checks the floor tier against the
// case's expectation:
//   floor_empty — idiomatic non-citation; PASS = floor stays empty (no hijack)
//   floor_fires — genuine citation;      PASS = floor fires (recall kept)
// Pre-registered: docs/evidence/swarm-2026-08-22/w-scanre/PRE-REG.md.
//   npx tsx scripts/probe-scan-floors.mts

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { resolveIntent } from '../src/bible/pericopes';

interface FloorCase {
  id: string;
  suite: string;
  prompt: string;
  expect: string[];
}

const CASES = path.resolve(import.meta.dirname, '../evals/cases/reference_floors.yaml');
const cases = (parse(readFileSync(CASES, 'utf8')) as FloorCase[]).filter(
  (c) => c.suite === 'reference_floors',
);

const fmt = (rs: { start: number; end: number }[]) =>
  rs.length === 0
    ? '—'
    : rs.map((r) => `${Math.floor(r.start / 1e6)}:${Math.floor((r.start % 1e6) / 1000)}`).join(', ');

let pass = 0;
const failures: string[] = [];
for (const c of cases) {
  const want = c.expect[0];
  if (want !== 'floor_empty' && want !== 'floor_fires') {
    console.log(`  ✗ ${c.id} unknown expect: ${String(want)}`);
    failures.push(c.id);
    continue;
  }
  const { floor } = resolveIntent(c.prompt);
  const ok = want === 'floor_empty' ? floor.length === 0 : floor.length > 0;
  if (ok) pass++;
  else failures.push(c.id);
  console.log(`  ${ok ? '✓' : '✗'} ${c.id} ${want.padEnd(11)} floor=${fmt(floor).padEnd(12)} ${c.prompt}`);
}

console.log(`\n${pass}/${cases.length} pass`);
if (failures.length) {
  console.log(`FAIL: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('PASS');
