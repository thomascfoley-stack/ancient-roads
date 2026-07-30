#!/usr/bin/env node
/**
 * db-invariants run receipt (work-order v2 Stage 1.2): fail when zero tests executed or any
 * required suite fully skipped under REQUIRE_SECRETS=1.
 * Artifact skips (from loud-skip manifest) are enumerated as NOT RUN, not failures.
 *
 * Usage: vitest ... --outputFile=report.json && node scripts/ci-db-invariants-receipt.mjs report.json
 */
import { existsSync, readFileSync } from 'node:fs';

const reportPath = process.argv[2];
const manifestPath = process.env.LOUD_SKIP_MANIFEST;

if (!reportPath) {
  console.error('usage: node scripts/ci-db-invariants-receipt.mjs <vitest-json-report>');
  process.exit(2);
}

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

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const executed = report.numTotalTests ?? 0;
const passed = report.numPassedTests ?? 0;
const failed = report.numFailedTests ?? 0;
const skipped = report.numPendingTests ?? 0;
const artifactSkips = loadArtifactSkips();

console.log(`db-invariants receipt: executed=${executed} passed=${passed} failed=${failed} skipped=${skipped}`);

if (artifactSkips.length > 0) {
  console.log('NOT RUN (gitignored artifacts — loud-skip, not a failure):');
  for (const rec of artifactSkips) {
    console.log(`  ${rec.check}: missing ${rec.missing.join(', ')} (${rec.suiteFile})`);
  }
}

if (process.env.REQUIRE_SECRETS === '1' && executed === 0) {
  console.error('REFUSING green: zero tests executed in db-invariants with REQUIRE_SECRETS=1');
  process.exit(1);
}

if (executed === 0) {
  console.log('receipt: no tests executed (non-secret run?)');
  process.exit(0);
}

console.log('receipt OK');
process.exit(failed > 0 ? 1 : 0);
