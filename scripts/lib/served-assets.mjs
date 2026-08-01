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

// ── The COUNT ratchet: PRESENT is not INTACT ─────────────────────────────────
// The presence check above closed the 2026-08-01 absence, and DEPLOY_PREFLIGHT §2 immediately
// named what it left open: "it is a PRESENCE check, not a COUNT check." A directory that survived
// an interrupted rm or a half-finished restore - 300 of 1,213 commentary files, say - passes
// `missingServedAssetDirs`, exits 0, and fails silently in the UI: `fetchJson` returns null on a
// non-ok response, so a partial loss renders as blank panels, never as an error. The committed
// baseline (docs/evidence/served-assets-baseline.json, figures from the 2026-08-01 census) is what
// makes the partial loss loud, at the only point in the pipeline where the artifact is visible.

/** The committed per-directory file-count baseline the count ratchet compares against. */
export const SERVED_ASSETS_BASELINE = path.join(ROOT, 'docs/evidence/served-assets-baseline.json');

function countFilesUnder(dir) {
  let n = 0;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) n += countFilesUnder(p);
    else n += 1;
  }
  return n;
}

/**
 * Recursive file count per served directory. An absent directory is REPORTED, never counted as 0:
 * "no directory" and "zero files" must not collapse into one reading (the corpus-manifest ratchet
 * carries the same distinction, for the same reason - only one of them is what an interrupted rm
 * leaves behind).
 * @param {string[]} dirs directory names under `publicDir`
 * @returns {{ counts: Record<string, number>, absent: string[] }}
 */
export function servedAssetFileCounts(dirs, publicDir = WEB_PUBLIC) {
  const counts = {};
  const absent = [];
  for (const dir of dirs) {
    const p = path.join(publicDir, dir);
    let isDir = false;
    try {
      isDir = statSync(p).isDirectory();
    } catch {
      /* absent */
    }
    if (!isDir) {
      absent.push(dir);
      continue;
    }
    counts[dir] = countFilesUnder(p);
  }
  return { counts, absent };
}

/**
 * Live file counts under `publicDir` against the committed baseline. Any DECREASE refuses; an
 * INCREASE passes and is reported so it can be re-recorded deliberately.
 *
 * A missing, unparseable or empty baseline REFUSES, never skips: a comparison against nothing is
 * vacuously green, and a check that quietly finds nothing to compare is the exact failure mode
 * this file exists to prevent (same clause as `assertServedAssetsScannable`).
 *
 * A baseline directory ABSENT from disk refuses too, reported in `absent` rather than as an
 * undercount - absence is the presence check's finding and carries its own message. Inside the
 * predeploy gate the presence check has already refused it first, so `absent` firing there means
 * the baseline names a directory the client no longer serves: re-record deliberately.
 *
 * @returns {{ ok: boolean, failures: string[], absent: string[], increases: string[],
 *             live: Record<string, number>, baseline: Record<string, number> }}
 */
export function servedAssetCountRatchet(publicDir = WEB_PUBLIC, baselinePath = SERVED_ASSETS_BASELINE) {
  const refuse = (why) => ({ ok: false, failures: [why], absent: [], increases: [], live: {}, baseline: {} });
  const rel = path.relative(ROOT, baselinePath);
  let raw;
  try {
    raw = readFileSync(baselinePath, 'utf8');
  } catch {
    return refuse(`served-assets baseline missing at ${rel} - refusing, not skipping. Regenerate it (node scripts/update-served-assets-baseline.mjs --yes) and commit it.`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return refuse(`served-assets baseline at ${rel} is not parseable JSON - refusing rather than comparing against nothing.`);
  }
  const baseline = parsed?.counts;
  const dirs = baseline && typeof baseline === 'object' && !Array.isArray(baseline) ? Object.keys(baseline).sort() : [];
  if (dirs.length === 0) {
    return refuse(`served-assets baseline at ${rel} names no directories - an empty baseline makes every comparison vacuously green; refusing.`);
  }
  const failures = [];
  const increases = [];
  const { counts: live, absent } = servedAssetFileCounts(dirs, publicDir);
  for (const dir of dirs) {
    const expected = baseline[dir];
    if (!Number.isInteger(expected) || expected < 0) {
      failures.push(`${dir}: baseline count ${JSON.stringify(expected)} is not a non-negative integer - the baseline is garbled; refusing.`);
      continue;
    }
    if (absent.includes(dir)) continue;
    if (live[dir] < expected) {
      failures.push(`${dir}: ${live[dir]} files on disk < ${expected} in baseline (-${expected - live[dir]})`);
    } else if (live[dir] > expected) {
      increases.push(`${dir}: ${live[dir]} files on disk > ${expected} in baseline (+${live[dir] - expected})`);
    }
  }
  return { ok: failures.length === 0 && absent.length === 0, failures, absent, increases, live, baseline };
}
