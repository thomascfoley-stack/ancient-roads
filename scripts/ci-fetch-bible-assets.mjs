// CI corpus assets — fetch web/public/bible (ALL translations) from the public corpus blob store.
// Order: docs/pm/orders/2026-08-22-ci-corpus-assets.md (ADR-119 family 3, smallest slice).
//
// WHY. Four DB-backed suites plus the drain's ADR-100 translation detection need
// web/public/bible, gitignored (.gitignore:22) and therefore absent from every CI checkout.
// The first (kjv-only) slice woke a FIFTH suite — translation-detect — which asserts the real
// shipped translation set (`expected [ 'kjv' ] to include 'bsb'`, run 32559751268): detection
// in CI must derive from the same corpus prod serves, so the scope is the whole bible/ prefix.
// `commentaries/` (~850MB) stays out per the order.
//
// CONTRACT (the order's constraints, mechanically):
//   * Manifest-driven: the file list comes from the COMMITTED CDN manifest
//     (docs/evidence/corpus-cdn/sync-manifest.json), never hand-listed. --print-cache-key
//     emits a digest over the kjv entries' per-file sha256 set (content-addressed), for
//     actions/cache; every downloaded file is verified against its manifest sha256.
//   * NEVER a partial tree: downloads land in a temp dir and move into place only when every
//     file arrived. A half-tree with jhn.json present would turn honest skips into false runs.
//   * FAIL OPEN to the honest skip: on any failure the target is left as it was (absent, or the
//     intact cached copy) and the script exits 0 with a ::warning — the suites then announceSkip
//     kind `artifact` exactly as before. A flaky fetch must not become a red that means nothing.
//   * Idempotent: if the target already holds every manifest file (cache hit), exit fast.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'docs/evidence/corpus-cdn/sync-manifest.json');
const TARGET = path.join(ROOT, 'web/public/bible');
const PREFIX = 'bible/';
const CONCURRENCY = 16; // 48 tripped the public store's rate limit from CI egress (HTTP 403
// at 11,702/22,590, run 32560946966); 16 + backoff below stays under it. Cold cost rises to
// ~3-4 min, paid only on a manifest change and only until one successful fetch seeds the cache
// (the workflow saves the cache immediately after a complete fetch, not post-job).

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
// manifest.files is an OBJECT: path -> { sha256, size }. The per-file sha256 makes the cache
// key content-addressed and lets every download be VERIFIED before it is installed.
const entryMap = manifest.files;
const files = Object.keys(entryMap).filter((p) => p.startsWith(PREFIX)).sort();

// --check: complete-or-not, NO network — the workflow's cache-save guard. Exit 0 only when
// every manifest file is present at its manifest size, so a failed fetch can never seed a cache.
if (process.argv.includes('--check')) {
  const ok = files.length > 0 && files.every((p) => {
    const local = path.join(TARGET, p.slice(PREFIX.length));
    try { return statSync(local).size === (entryMap[p]?.size ?? -1); } catch { return false; }
  });
  process.stdout.write(ok ? 'complete\n' : 'incomplete\n');
  process.exit(ok ? 0 : 1);
}

if (process.argv.includes('--print-cache-key')) {
  const digest = createHash('sha256')
    .update(files.map((p) => `${p}:${entryMap[p]?.sha256 ?? ''}`).join('\n'))
    .digest('hex')
    .slice(0, 16);
  process.stdout.write(`bible-assets-${digest}\n`);
  process.exit(0);
}

if (files.length === 0) {
  console.log(`::warning title=bible assets fetch::manifest lists no ${PREFIX} entries — nothing fetched, suites will skip honestly`);
  process.exit(0);
}

const present = (p) => {
  const local = path.join(TARGET, p.slice(PREFIX.length));
  try { return statSync(local).size === (entryMap[p]?.size ?? -1); } catch { return false; }
};
if (existsSync(TARGET) && files.every(present)) {
  console.log(`bible assets already complete: ${files.length} files (cache hit or operator tree)`);
  process.exit(0);
}

const started = Date.now();
const tmp = path.join(ROOT, `web/public/.bible-fetch-tmp-${process.pid}`);
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const base = String(manifest.baseUrl || '').replace(/\/$/, '');
let failed = null;
let done = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOne(rel) {
  const url = `${base}/${rel}`;
  // 5 attempts with exponential backoff + jitter: the store answers a rate limit as 403/429,
  // and an immediate retry just re-trips it. Genuine 404s stop retrying after attempt 2.
  const ATTEMPTS = 5;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const throttled = res.status === 403 || res.status === 429 || res.status >= 500;
        if (throttled && attempt < ATTEMPTS) {
          await sleep(500 * 2 ** attempt + Math.floor(Math.random() * 400));
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const bytes = Buffer.from(await res.arrayBuffer());
      const want = entryMap[rel]?.sha256;
      const got = createHash('sha256').update(bytes).digest('hex');
      if (!want || got !== want) throw new Error(`sha256 mismatch (want ${String(want).slice(0, 12)}, got ${got.slice(0, 12)})`);
      const out = path.join(tmp, rel.slice(PREFIX.length));
      mkdirSync(path.dirname(out), { recursive: true });
      writeFileSync(out, bytes);
      done++;
      return;
    } catch (e) {
      if (attempt === ATTEMPTS) throw new Error(`${rel}: ${e.message}`);
      await sleep(250 * attempt);
    }
  }
}

const queue = [...files];
const workers = Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length > 0 && !failed) {
    const rel = queue.shift();
    try { await fetchOne(rel); } catch (e) { failed = e; }
  }
});
await Promise.all(workers);

if (failed) {
  rmSync(tmp, { recursive: true, force: true });
  console.log(`::warning title=bible assets fetch FAILED (suites will skip honestly)::${failed.message} — ${done}/${files.length} fetched, nothing installed`);
  process.exit(0);
}

rmSync(TARGET, { recursive: true, force: true });
mkdirSync(path.dirname(TARGET), { recursive: true });
renameSync(tmp, TARGET);
console.log(`bible assets installed: ${files.length} files in ${((Date.now() - started) / 1000).toFixed(1)}s from ${base}`);
