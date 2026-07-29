#!/usr/bin/env node
/**
 * CI ratchet (ADR-035): fail when db-invariants skips more suites than the recorded ceiling.
 * Usage: vitest ... --reporter=json --outputFile=/tmp/vitest.json && node scripts/ci-skip-ceiling.mjs /tmp/vitest.json
 */
import { readFileSync } from 'node:fs';

const reportPath = process.argv[2];
const ceiling = Number(process.env.DB_INVARIANTS_SKIP_CEILING ?? '2');
if (!reportPath) {
  console.error('usage: node scripts/ci-skip-ceiling.mjs <vitest-json-report>');
  process.exit(2);
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const files = report.testResults ?? [];
const skippedFiles = files.filter((f) => {
  const pending = f.assertionResults?.filter((a) => a.status === 'skipped').length ?? 0;
  const total = f.assertionResults?.length ?? 0;
  return total > 0 && pending === total;
});
const skippedCount = skippedFiles.length;

console.log(`db-invariants skip ceiling: ${ceiling}; observed fully-skipped files: ${skippedCount}`);
for (const f of skippedFiles) console.log(`  skipped: ${f.name}`);

if (skippedCount > ceiling) {
  console.error(
    `\nREFUSING green: ${skippedCount} suite(s) fully skipped, ceiling is ${ceiling}. `
    + 'Raise DB_INVARIANTS_SKIP_CEILING only with owner approval (ADR-035).',
  );
  process.exit(1);
}

console.log('skip ceiling OK');
