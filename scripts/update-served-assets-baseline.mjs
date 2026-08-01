#!/usr/bin/env node
// Deliberately re-record docs/evidence/served-assets-baseline.json from a live count of
// web/public. NEVER run automatically - the count ratchet refusing on a decrease is only worth
// anything if lowering the bar takes a human typing --yes and committing the result (the same
// contract as build-corpus-manifest.mjs and update-forbidden-provenance-baseline.mjs).
//
// The directory set is DERIVED from the client (servedAssetDirs), not copied from the old
// baseline, so a newly served directory is picked up and a no-longer-served one drops out.
// Refuses if any served directory is absent: a baseline recorded over a hole would bless it.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  SERVED_ASSETS_BASELINE,
  assertServedAssetsScannable,
  servedAssetDirs,
  servedAssetFileCounts,
} from './lib/served-assets.mjs';

const scan = assertServedAssetsScannable();
if (!scan.ok) {
  console.error(`Refusing: ${scan.offenders.join(', ')} build a root-absolute path from a variable, so the served set cannot be derived completely.`);
  process.exit(1);
}

const served = servedAssetDirs();
const { counts, absent } = servedAssetFileCounts(served);

if (absent.length > 0) {
  console.error(
    `Refusing: served directories absent from web/public: ${absent.join(', ')}.\n` +
    `Restore them first (docs/RECOVERY.md §3a) - a baseline recorded over a hole would bless the hole.`,
  );
  process.exit(1);
}

let previous = null;
try {
  previous = JSON.parse(readFileSync(SERVED_ASSETS_BASELINE, 'utf8')).counts ?? null;
} catch {
  /* first recording, or a garbled baseline - both are exactly what a deliberate re-record replaces */
}

for (const dir of served) {
  console.log(`  ${dir}: ${previous?.[dir] ?? '(none)'} → ${counts[dir]}`);
}

if (!process.argv.includes('--yes')) {
  console.error('\nDry run - nothing written. Re-run with --yes to record these counts.');
  process.exit(1);
}

const next = {
  comment:
    'Per-directory FILE COUNTS for the served static asset directories under web/public. ' +
    'The predeploy gate refuses ANY decrease against these counts; increases pass and are reported. ' +
    'Recorded by scripts/update-served-assets-baseline.mjs from a live count; the original 2026-08-01 ' +
    'figures are per docs/evidence/post-a1-2026-08-01/concordance-census.md. ' +
    'Update deliberately, never automatically: node scripts/update-served-assets-baseline.mjs --yes',
  recordedAt: new Date().toISOString().slice(0, 10),
  counts,
};
writeFileSync(SERVED_ASSETS_BASELINE, `${JSON.stringify(next, null, 2)}\n`);
console.log(`\nRecorded. Commit ${path.relative(process.cwd(), SERVED_ASSETS_BASELINE)} to make it the ratchet.`);
