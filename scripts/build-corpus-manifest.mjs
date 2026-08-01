#!/usr/bin/env node
// Write a committed corpus manifest — the identity of the content about to ship.
//
//   node scripts/build-corpus-manifest.mjs
//
// Writes docs/evidence/corpus-manifest-<sha>-<ts>.json. The sha names the CODE this corpus
// was inventoried alongside; the corpus itself is gitignored, so this file is the only
// record in git of what the working directory actually held.
//
// Plain node, no transpiler: the pre-deploy gate imports the same core, and a gate that
// stands between the operator and `vercel --prod` must not need a build step of its own.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCorpusManifest } from './lib/corpus-manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS_DIR = path.join(ROOT, 'web/public/commentaries');
const OUT_DIR = path.join(ROOT, 'docs/evidence');

const sha = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'nogit';
  }
})();

const manifest = buildCorpusManifest(CORPUS_DIR, { sha });
if (manifest.fileCount === 0) {
  console.error(`✗ no corpus at ${CORPUS_DIR} — refusing to write a manifest that records an empty corpus as the baseline.`);
  process.exit(1);
}

const stamp = manifest.ts.replace(/[:.]/g, '-');
const out = path.join(OUT_DIR, `corpus-manifest-${sha}-${stamp}.json`);
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);

// A second copy ships INSIDE the deployed artifact, next to the corpus it describes, so
// GET /api/health can report the identity of the content it is actually serving. Only the
// summary travels: the per-work table is evidence for the repo, not payload for a request.
// It is gitignored (see web/.gitignore) — the committed record is the docs/evidence copy.
const shipped = path.join(ROOT, 'web/public/corpus-manifest.json');
writeFileSync(
  shipped,
  `${JSON.stringify(
    {
      sha: manifest.sha,
      ts: manifest.ts,
      corpusHash: manifest.corpusHash,
      workCount: manifest.workCount,
      fileCount: manifest.fileCount,
    },
    null,
    2,
  )}\n`,
);

console.log(`corpus manifest written: ${path.relative(ROOT, out)}`);
console.log(`  shipped copy: ${path.relative(ROOT, shipped)} (served by GET /api/health)`);
console.log(`  sha        ${manifest.sha}`);
console.log(`  works      ${manifest.workCount}`);
console.log(`  files      ${manifest.fileCount}`);
console.log(`  corpusHash ${manifest.corpusHash}`);
console.log('\nCommit it. The pre-deploy ratchet compares the next deploy against this file.');
