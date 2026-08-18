// Corpus → Vercel Blob sync (docs/CORPUS_CDN_DESIGN.md A1; plan 2026-08-13).
//
// Pushes the static corpus (web/public/{bible,commentaries,original} — GITIGNORED, the local
// disk is the only copy outside deployments) to the public Blob store at identical paths, so
// production serves it from the CDN instead of the deploy bundle.
//
// SAFETY SHAPE (the house ops-script rules):
//   - DRY-RUN IS THE DEFAULT and it is not a lookalike: the same plan that --execute uploads is
//     printed, computed by the same function (`planSync`, exported for the unit suite).
//   - DELETIONS PROPAGATE. Quarantine unserves content by MOVING files out of the serving root;
//     a file present in the manifest but gone from disk is DELETED from the Blob store — an
//     orphaned CDN copy would keep serving quarantined text (licensing fails open). This is the
//     script's most important behavior and has its own unit cases.
//   - The manifest (docs/evidence/corpus-cdn/sync-manifest.json) is written ONLY after a fully
//     successful run: path → sha256 → size, plus the store base URL. It is the parity artifact
//     (scripts/corpus-cdn-parity.mjs), the hash-skip baseline, and the deploy-freshness input.
//     A partial run keeps the old manifest — the next run simply re-uploads the difference.
//   - Cache TTLs are a LICENSING decision (design §4.1): bible/original are stable PD text
//     (30 days); commentaries can be quarantined (1 hour — the backstop if a sync is missed).
//
// USAGE (token via env, never printed):
//   BLOB_READ_WRITE_TOKEN=… node scripts/corpus-blob-sync.mjs                  # dry-run, all roots
//   BLOB_READ_WRITE_TOKEN=… node scripts/corpus-blob-sync.mjs --execute
//   … --prefix commentaries/<file.json>   # only paths under a prefix (the quarantine weld)
//   … --base <dir> --manifest <file>      # parameterized for the unit/fixture red-proofs
//
// The @vercel/blob SDK is resolved from web/'s installed dependencies (createRequire) — no new
// root dependency, no hand-rolled REST that could drift from the API.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

export const DEFAULT_ROOTS = ['bible', 'commentaries', 'original'];
/** Per-root cache TTL, seconds. Commentaries stay SHORT: quarantine's backstop (design §4.1). */
export const CACHE_SECONDS = { bible: 2_592_000, original: 2_592_000, commentaries: 3_600 };

/** Pure planning core, unit-tested: disk state + previous manifest → the exact action set. */
export function planSync(diskFiles, manifestFiles, prefix = '') {
  const uploads = [];
  let unchanged = 0;
  for (const [rel, meta] of diskFiles) {
    if (prefix && !rel.startsWith(prefix)) continue;
    const prev = manifestFiles[rel];
    if (prev && prev.sha256 === meta.sha256) unchanged++;
    else uploads.push(rel);
  }
  const deletes = [];
  for (const rel of Object.keys(manifestFiles)) {
    if (prefix && !rel.startsWith(prefix)) continue;
    if (!diskFiles.has(rel)) deletes.push(rel);
  }
  uploads.sort();
  deletes.sort();
  return { uploads, deletes, unchanged };
}

export function walkDisk(baseDir, roots) {
  const files = new Map();
  for (const root of roots) {
    const dir = path.join(baseDir, root);
    if (!existsSync(dir)) continue;
    const stack = [dir];
    while (stack.length > 0) {
      const cur = stack.pop();
      for (const entry of readdirSync(cur)) {
        const full = path.join(cur, entry);
        const st = statSync(full);
        if (st.isDirectory()) { stack.push(full); continue; }
        const rel = path.relative(baseDir, full).split(path.sep).join('/');
        const body = readFileSync(full);
        files.set(rel, { sha256: createHash('sha256').update(body).digest('hex'), size: st.size, full });
      }
    }
  }
  return files;
}

function contentTypeFor(rel) {
  if (rel.endsWith('.json')) return 'application/json; charset=utf-8';
  if (rel.endsWith('.txt')) return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

function cacheSecondsFor(rel) {
  const root = rel.split('/')[0];
  return CACHE_SECONDS[root] ?? 3_600; // unknown roots get the SHORT ttl — fail safe, not stale
}

async function pool(items, limit, worker) {
  const failures = [];
  let i = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      let lastErr;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await worker(item); lastErr = null; break; }
        catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 500 * (attempt + 1))); }
      }
      if (lastErr) failures.push({ item, error: String(lastErr?.message ?? lastErr) });
    }
  });
  await Promise.all(lanes);
  return failures;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const at = args.indexOf(name);
    return at >= 0 ? (args[at + 1] ?? '') : '';
  };
  const execute = args.includes('--execute');
  const prefix = flag('--prefix');
  const baseDir = path.resolve(REPO, flag('--base') || 'web/public');
  const manifestPath = path.resolve(REPO, flag('--manifest') || 'docs/evidence/corpus-cdn/sync-manifest.json');
  const roots = flag('--roots') ? flag('--roots').split(',') : DEFAULT_ROOTS;

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('BLOB_READ_WRITE_TOKEN is required (env only; it is never printed or written).');
    process.exit(1);
  }

  const requireWeb = createRequire(path.join(REPO, 'web', 'package.json'));
  const { put, del } = requireWeb('@vercel/blob');

  const manifest = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, 'utf8'))
    : { baseUrl: null, files: {} };

  console.log(`scanning ${roots.join(', ')} under ${path.relative(REPO, baseDir)}…`);
  const disk = walkDisk(baseDir, roots);
  const plan = planSync(disk, manifest.files, prefix);
  console.log(
    `plan: ${plan.uploads.length} upload(s), ${plan.deletes.length} delete(s), ${plan.unchanged} unchanged` +
      (prefix ? ` (prefix: ${prefix})` : ''),
  );
  for (const rel of plan.uploads.slice(0, 10)) console.log(`  ↑ ${rel}`);
  if (plan.uploads.length > 10) console.log(`  … and ${plan.uploads.length - 10} more uploads`);
  for (const rel of plan.deletes) console.log(`  ✕ ${rel} (gone from disk — will be removed from the CDN)`);

  if (!execute) {
    console.log('\nDRY-RUN (default): nothing uploaded, nothing deleted. Re-run with --execute.');
    process.exit(0);
  }

  let baseUrl = manifest.baseUrl;

  // WRONG-STORE REFUSAL, BEFORE THE FIRST BYTE MOVES. The old drift guard compared store origins
  // from `put()`'s RESULT — i.e. after an upload had already landed, with up to 16 in flight. On
  // 2026-08-18 that was nearly exercised for real: the tree's local BLOB_READ_WRITE_TOKEN binds
  // the PRIVATE user-corpus store (Lane B), and running --execute with it would have poured
  // corpus files into that store before the late guard threw. Caught only because the operator
  // compared the token's embedded store id by hand first.
  //
  // A Vercel blob token is `vercel_blob_rw_<storeId>_<secret>`, and a public store's base URL is
  // `https://<storeid-lowercased>.public.blob.vercel-storage.com` — so the manifest's own baseUrl
  // names the store the token must bind, and the comparison needs no network and leaks no secret.
  // Only enforceable when a manifest exists; a first-ever sync (baseUrl null) proceeds and the
  // late in-flight guard below remains as the backstop for that case.
  if (baseUrl) {
    const tokenStore = (process.env.BLOB_READ_WRITE_TOKEN.split('_')[3] ?? '').toLowerCase();
    const manifestStore = new URL(baseUrl).hostname.split('.')[0];
    if (!tokenStore || tokenStore !== manifestStore) {
      console.error(
        `STOP: the supplied token binds store "${tokenStore || '(unparseable)'}" but the manifest's ` +
        `store is "${manifestStore}". Refusing before any upload — the wrong token here is how ` +
        `corpus files end up in the private user-corpus store (or worse, how a sync targets a ` +
        `store the app is not reading from). Supply the ${manifestStore} store's token.`,
      );
      process.exit(1);
    }
  }

  let done = 0;
  const started = Date.now();
  const uploadFailures = await pool(plan.uploads, 16, async (rel) => {
    const meta = disk.get(rel);
    const result = await put(rel, readFileSync(meta.full), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: contentTypeFor(rel),
      cacheControlMaxAge: cacheSecondsFor(rel),
    });
    const origin = new URL(result.url);
    const derivedBase = `${origin.origin}`;
    if (baseUrl && baseUrl !== derivedBase) throw new Error(`store base drifted: ${baseUrl} vs ${derivedBase}`);
    baseUrl = derivedBase;
    done++;
    if (done % 1000 === 0) console.log(`  …${done}/${plan.uploads.length} uploaded (${Math.round((Date.now() - started) / 1000)}s)`);
  });

  const deleteFailures = baseUrl
    ? await pool(plan.deletes, 16, async (rel) => { await del(`${baseUrl}/${rel}`); })
    : [];

  const failures = [...uploadFailures, ...deleteFailures];
  if (failures.length > 0) {
    console.error(`\n✗ ${failures.length} operation(s) failed — the manifest is NOT updated; re-run to retry the difference:`);
    for (const f of failures.slice(0, 10)) console.error(`  ${f.item}: ${f.error}`);
    process.exit(1);
  }

  // Full success only: rewrite the manifest to the exact disk state (prefix runs merge into it).
  const nextFiles = prefix ? { ...manifest.files } : {};
  if (prefix) for (const rel of plan.deletes) delete nextFiles[rel];
  for (const [rel, meta] of disk) {
    if (prefix && !rel.startsWith(prefix)) continue;
    nextFiles[rel] = { sha256: meta.sha256, size: meta.size };
  }
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  const tmp = `${manifestPath}.tmp`;
  writeFileSync(tmp, JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl, files: nextFiles }));
  renameSync(tmp, manifestPath);
  console.log(
    `\n✓ synced: ${plan.uploads.length} uploaded, ${plan.deletes.length} deleted, ${plan.unchanged} unchanged in ${Math.round((Date.now() - started) / 1000)}s` +
      `\n  manifest: ${path.relative(REPO, manifestPath)} (baseUrl ${baseUrl ?? 'unchanged'})`,
  );
}
