// Which static data directories does the APPLICATION actually serve?
//
// THE NINTH INSTANCE, and this one had a live consequence. `predeploy-gate.ts` validated
// `commentaries` and `bible` — a hand-typed pair — while `web/src/lib/original.ts` also serves
// `concordance/`, `lexicon/` and `original/`. All three were ABSENT from the deploying machine on
// 2026-08-01 (lost in the 2026-07-28 machine migration), the gate said nothing, and a deploy would
// have shipped a site whose word-study page and word panel throw. The gate was not wrong about what
// it checked; it was wrong about what there was to check, and nothing could tell it.
//
// So the expected set is DERIVED from the client, the same discipline as `sourceStatusCohorts()`
// reading 023's CHECK constraint and `backfillSqlFromMigration()` reading 024's UPDATE.
//
// THE DISCRIMINATOR. `web/src` contains many root-absolute paths, and most are Next ROUTES
// (`/library/…`, `/read/…`, `/auth/…`) with no directory under `web/public`. What distinguishes a
// static data directory is that the client fetches a **.json** out of it. That rule yields exactly
// the six real ones and no routes — including `devotional`, which no hand-maintained list mentioned
// either.
//
// HONEST LIMIT, and the guard for it: this is a source scan over string literals. A path assembled
// from a variable (`fetch(`/${dir}/x.json`)`) is invisible to it. `assertServedAssetsScannable`
// exists so that becoming true is loud rather than silent — a scan that quietly finds nothing is
// the failure mode this whole file is here to prevent.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const WEB_SRC = path.join(ROOT, 'web/src');
export const WEB_PUBLIC = path.join(ROOT, 'web/public');

/** A directory the client fetches a `.json` from — i.e. static data that must ship. */
const SERVED_JSON = /[`'"]\/([a-z][a-z0-9-]*)\/[^`'"]*\.json/g;

/** A root-absolute path assembled from a variable — invisible to the scan above. */
const DYNAMIC_ROOT_PATH = /fetch\(\s*`\/\$\{/g;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|mts)$/.test(name)) out.push(p);
  }
  return out;
}

/**
 * The static data directories the application serves, derived from its own source.
 * @param {string} srcDir defaults to web/src
 * @returns {string[]} sorted directory names, e.g. ['bible','commentaries',…]
 */
export function servedAssetDirs(srcDir = WEB_SRC) {
  const dirs = new Set();
  for (const file of walk(srcDir)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(SERVED_JSON)) dirs.add(m[1]);
  }
  return [...dirs].sort();
}

/**
 * Would a served directory escape the scan? Counts root-absolute fetches whose first segment is a
 * variable. Any hit means `servedAssetDirs` is under-reading and must not be trusted as complete.
 */
export function assertServedAssetsScannable(srcDir = WEB_SRC) {
  const offenders = [];
  for (const file of walk(srcDir)) {
    const src = readFileSync(file, 'utf8');
    if (DYNAMIC_ROOT_PATH.test(src)) offenders.push(path.relative(ROOT, file));
    DYNAMIC_ROOT_PATH.lastIndex = 0;
  }
  return { ok: offenders.length === 0, offenders };
}

/**
 * Which served directories are missing from `web/public`?
 * @returns {{ ok: boolean, served: string[], missing: string[] }}
 */
export function missingServedAssetDirs(publicDir = WEB_PUBLIC, srcDir = WEB_SRC) {
  const served = servedAssetDirs(srcDir);
  const missing = served.filter((d) => {
    try {
      return !statSync(path.join(publicDir, d)).isDirectory();
    } catch {
      return true;
    }
  });
  return { ok: missing.length === 0, served, missing };
}
