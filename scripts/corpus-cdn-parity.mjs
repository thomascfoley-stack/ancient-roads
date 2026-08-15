// Corpus CDN parity check (docs/CORPUS_CDN_DESIGN.md A2): what the CDN serves must be
// byte-identical to what the local corpus (the copy every licensing gate certifies) contains.
//
// Two properties, one pass:
//   1. FRESHNESS — every sampled disk file appears in the manifest with the same hash. A
//      mismatch means the corpus changed after the last sync (an unsynced quarantine is the
//      dangerous case) — the deploy gate treats that as a refusal.
//   2. INTEGRITY — the bytes FETCHED from the Blob store hash to the same value. A mismatch
//      means the store drifted from what was certified.
//
// Read-only against the store; exits nonzero on any mismatch. Sampling is deterministic-ish by
// sorting and striding (no Math.random — reproducible failures only).
//
//   node scripts/corpus-cdn-parity.mjs [--sample 200] [--base web/public] [--manifest <path>]

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { walkDisk, DEFAULT_ROOTS } from './corpus-blob-sync.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const at = args.indexOf(name);
  return at >= 0 ? (args[at + 1] ?? dflt) : dflt;
};
const sampleSize = Number(flag('--sample', '200'));
const baseDir = path.resolve(REPO, flag('--base', 'web/public'));
const manifestPath = path.resolve(REPO, flag('--manifest', 'docs/evidence/corpus-cdn/sync-manifest.json'));

if (!existsSync(manifestPath)) {
  console.error(`✗ no manifest at ${path.relative(REPO, manifestPath)} — run corpus-blob-sync first.`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (!manifest.baseUrl) {
  console.error('✗ manifest has no baseUrl — it predates a successful --execute run.');
  process.exit(1);
}

const disk = walkDisk(baseDir, DEFAULT_ROOTS);
const diskPaths = [...disk.keys()].sort();

// 1. FRESHNESS over the WHOLE set (cheap: hashes are already computed by the walk).
let stale = 0;
for (const rel of diskPaths) {
  const m = manifest.files[rel];
  if (!m || m.sha256 !== disk.get(rel).sha256) {
    if (stale < 10) console.error(`  stale: ${rel} ${m ? '(hash differs)' : '(not in manifest)'}`);
    stale++;
  }
}
let orphaned = 0;
for (const rel of Object.keys(manifest.files)) {
  if (!disk.has(rel)) {
    if (orphaned < 10) console.error(`  orphaned in manifest (gone from disk — quarantine unsynced?): ${rel}`);
    orphaned++;
  }
}

// 2. INTEGRITY on a stride sample of the manifest set.
const manifestPaths = Object.keys(manifest.files).sort();
const stride = Math.max(1, Math.floor(manifestPaths.length / Math.max(1, sampleSize)));
const sample = manifestPaths.filter((_, i) => i % stride === 0).slice(0, sampleSize);
let fetchMismatch = 0;
let fetchFailed = 0;
for (const rel of sample) {
  try {
    const res = await fetch(`${manifest.baseUrl}/${rel}`);
    if (!res.ok) { fetchFailed++; if (fetchFailed <= 5) console.error(`  fetch ${res.status}: ${rel}`); continue; }
    const bytes = Buffer.from(await res.arrayBuffer());
    const sha = createHash('sha256').update(bytes).digest('hex');
    if (sha !== manifest.files[rel].sha256) {
      fetchMismatch++;
      if (fetchMismatch <= 5) console.error(`  INTEGRITY mismatch: ${rel}`);
    }
  } catch (e) {
    fetchFailed++;
    if (fetchFailed <= 5) console.error(`  fetch error: ${rel}: ${String(e?.message ?? e)}`);
  }
}

console.log(
  `parity: disk=${diskPaths.length} manifest=${manifestPaths.length} · stale=${stale} orphaned=${orphaned} · ` +
    `sampled=${sample.length} integrity-mismatch=${fetchMismatch} fetch-failed=${fetchFailed}`,
);
if (stale + orphaned + fetchMismatch + fetchFailed > 0) {
  console.error('✗ PARITY FAILED — do not deploy over this; re-run the sync and re-check.');
  process.exit(1);
}
console.log('✓ parity holds: the CDN serves what the gates certified.');
