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

/** Artifact skips recorded by announceSkip — not a hand-maintained exempt list. */
function loadArtifactSkips() {
  if (!manifestPath || !existsSync(manifestPath)) return [];
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return manifest.artifactSkips ?? [];
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
console.log(`artifact NOT RUN (exempt from ceiling): ${artifactSkipped.length}`);
for (const f of artifactSkipped) {
  const rec = artifactSkips.find((s) => isArtifactSkip(f, [s]));
  const missing = rec?.missing?.join(', ') ?? '(manifest entry missing — treat as secret skip)';
  console.log(`  NOT RUN (artifact): ${f.name} — missing ${missing}`);
}

if (skippedCount > ceiling) {
  console.error(
    `\nREFUSING green: ${skippedCount} secret-caused suite(s) fully skipped, ceiling is ${ceiling}. `
    + 'Raise DB_INVARIANTS_SKIP_CEILING only with owner approval (ADR-035). '
    + 'Artifact skips (gitignored corpus) are NOT RUN and do not count.',
  );
  process.exit(1);
}

console.log('skip ceiling OK');
process.exit(0);
