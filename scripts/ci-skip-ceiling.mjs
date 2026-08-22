#!/usr/bin/env node
/**
 * CI ratchet (ADR-035): fail when db-invariants skips more SECRET-caused suites than the ceiling.
 * Gitignored-artifact skips (kind=artifact in loud-skip.ts) are NOT RUN — exempt from ceiling.
 * Usage: vitest ... --reporter=json --outputFile=/tmp/vitest.json && node scripts/ci-skip-ceiling.mjs /tmp/vitest.json
 */
import { existsSync, readFileSync } from 'node:fs';

const reportPath = process.argv[2];
const ceiling = Number(process.env.DB_INVARIANTS_SKIP_CEILING ?? '2');
const manifestPath = process.env.LOUD_SKIP_MANIFEST;

if (!reportPath) {
  console.error('usage: node scripts/ci-skip-ceiling.mjs <vitest-json-report>');
  process.exit(2);
}

/** Artifact skips recorded by announceSkip — not a hand-maintained exempt list.
 *
 * NDJSON, one record per line (2026-08-22): the writer appends atomically per record because
 * the old single-JSON read-modify-write LOST records under vitest's parallel workers (run
 * 32560311067 — three declared skips clobbered, counted secret-caused). The object form
 * `{"artifactSkips":[...]}` is still accepted so a stale manifest cannot crash the gate. */
function loadArtifactSkips() {
  if (!manifestPath || !existsSync(manifestPath)) return [];
  const raw = readFileSync(manifestPath, 'utf8').trim();
  if (raw === '') return [];
  if (raw.startsWith('{')) {
    try { return JSON.parse(raw).artifactSkips ?? []; } catch { /* fall through to lines */ }
  }
  const records = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { records.push(JSON.parse(t)); } catch { /* a torn line is dropped, never a crash */ }
  }
  return records;
}

function suiteFileMatches(filePath, suiteFile) {
  const norm = filePath.replace(/\\/g, '/');
  const rel = suiteFile.replace(/\\/g, '/');
  return norm.endsWith(rel) || norm.includes(rel);
}

function isArtifactSkip(fileResult, artifactSkips) {
  const titles = fileResult.assertionResults?.flatMap((a) => a.ancestorTitles ?? []) ?? [];
  return artifactSkips.some((s) => {
    if (!suiteFileMatches(fileResult.name, s.suiteFile)) return false;
    // Cross-check: manifest check name must appear in vitest suite titles — blocks hand-edited exemptions.
    return titles.some((t) => t.includes(s.check) || s.check.includes(t.split('(')[0].trim()));
  });
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const files = report.testResults ?? [];
const artifactSkips = loadArtifactSkips();

const fullySkipped = files.filter((f) => {
  const pending = f.assertionResults?.filter((a) => a.status === 'skipped').length ?? 0;
  const total = f.assertionResults?.length ?? 0;
  return total > 0 && pending === total;
});

const artifactSkipped = fullySkipped.filter((f) => isArtifactSkip(f, artifactSkips));
const secretSkipped = fullySkipped.filter((f) => !isArtifactSkip(f, artifactSkips));
const skippedCount = secretSkipped.length;

console.log(`db-invariants skip ceiling: ${ceiling}; secret-caused fully-skipped files: ${skippedCount}`);
for (const f of secretSkipped) console.log(`  skipped (secret): ${f.name}`);
// Every exempt suite is REPORTED in the run summary, by kind and by what it was missing — the
// owner's 2026-08-22 ruling. An exemption nobody reads is indistinguishable from a suite quietly
// not running, which is the failure this whole ratchet exists to prevent. `withheld` joins
// `artifact`/`provider` here: a credential CI is deliberately not given, by a recorded decision
// (b24bfe3), is accounted for — not counted as an unexplained secret skip. That is the existing
// ruling reaching the counter, NOT a change to the bar; an UNDECLARED missing secret still counts
// and still refuses green below.
console.log(`NOT RUN, accounted for (exempt from ceiling): ${artifactSkipped.length}`);
for (const f of artifactSkipped) {
  const rec = artifactSkips.find((s) => isArtifactSkip(f, [s]));
  const missing = rec?.missing?.join(', ') ?? '(manifest entry missing — treat as secret skip)';
  console.log(`  NOT RUN (${rec?.kind ?? 'unknown-kind'}): ${f.name} — missing ${missing}`);
}

if (skippedCount > ceiling) {
  console.error(
    `\nREFUSING green: ${skippedCount} secret-caused suite(s) fully skipped, ceiling is ${ceiling}. `
    + 'Raise DB_INVARIANTS_SKIP_CEILING only with owner approval (ADR-035). '
    + 'Declared skips — artifact (gitignored corpus), provider (upstream unavailable) and '
    + 'withheld (a credential CI is deliberately not given, by a recorded decision) — are NOT RUN, '
    + 'are listed above, and do not count. What counts is a suite that skipped without saying why.',
  );
  process.exit(1);
}

console.log('skip ceiling OK');
process.exit(0);
