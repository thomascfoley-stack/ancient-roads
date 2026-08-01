// PROPERTY: every `maxDuration` route segment config export under `web/src/app` is a numeric
// literal, and it equals ASK_MAX_DURATION_SEC.
//
// WHY A LITERAL AT ALL. Next 16 statically analyses route segment config exports. Both ask routes
// used `export const maxDuration = ASK_MAX_DURATION_SEC`, and that non-literal export failed the
// PRODUCTION BUILD outright — `Invalid segment configuration export detected`, exit 1, no route
// named in the output. Discovered 2026-08-01 by running `next build` at HEAD for the first time;
// nothing in CI built the app, so it had been broken with nothing to say so (fixed at 19798ec).
//
// WHY THIS TEST EXISTS. The fix inlines `300`, which duplicates a constant — the exact shape this
// repo has paid for nine times ("a hand-maintained expected set that nothing enforces"). Next gives
// no way to import it, so the duplication is forced by the framework. What is NOT forced is leaving
// it unguarded. This test derives the literal from the route source and compares it to the constant,
// so raising the timeout in one place and not the other is red, not a silent production mismatch.
//
// THE TENTH INSTANCE, and it was in this file. Until 2026-08-01 the route set here was a typed
// array of two paths — in the very file whose header names that defect class. It had been incomplete
// since the commit that introduced it: `web/src/app/api/eval/bait/route.ts:12` carries the same
// export, runs the REAL teach() pipeline, and no list mentioned it. Dropping ASK_MAX_DURATION_SEC to
// 240 would have left `next build` green (all three are literals) and this guard green (it read two
// files), with eval/bait keeping a 300s Vercel ceiling against a 240s budget. So the set is now
// DERIVED from the tree, the same discipline as `servedAssetDirs()` reading the client's own fetches
// and `backfillSqlFromMigration()` reading 024's UPDATE.
//
// THE FAILURE THIS PREVENTS IS NOT COSMETIC. `maxDuration` is the Vercel function ceiling and
// ASK_MAX_DURATION_SEC is the in-process budget. If the ceiling drops below the budget, the platform
// kills the function mid-answer; if the budget exceeds the ceiling, the fail-closed fallback never
// gets to run. They are one number with two consumers.
//
// HONEST LIMIT, and the guard for it: this is a source scan. Its discovery rule is deliberately
// WIDER than its parse rule — any file under `web/src/app` mentioning `maxDuration` in code must
// parse into a segment config export, or the scan refuses. A scan that quietly finds nothing is
// worse than no scan, so under-reading is loud rather than silent.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { codeOnly } from '../scripts/lib/source-scan.mjs';
import { ASK_MAX_DURATION_SEC } from '../web/src/lib/teacher/teach-budget';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIR = path.join(ROOT, 'web/src/app');

/** Files Next could read a route segment config from. */
const SOURCE_FILE = /\.(ts|tsx|mts|js|jsx|mjs)$/;

/** The identifier, anywhere in code. Discovery is wider than the parse below, on purpose. */
const MENTIONS = /\bmaxDuration\b/;

/** The segment config export Next actually reads. */
const SEGMENT_EXPORT = /^export const maxDuration\s*=\s*(.+?);/m;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (SOURCE_FILE.test(name)) out.push(p);
  }
  return out;
}

/**
 * Every file under `web/src/app` that mentions `maxDuration` in code, derived from the tree.
 * No list to maintain: a new route carrying the export joins this set by existing.
 */
function routesMentioningMaxDuration(): string[] {
  return walk(APP_DIR)
    .filter((p) => MENTIONS.test(codeOnly(readFileSync(p, 'utf8'))))
    .map((p) => path.relative(ROOT, p))
    .sort();
}

/**
 * The literal Next will actually read. `null` means the scanner could not find the export at all —
 * a refusal condition, not a pass. `NaN` means a non-literal, which fails `next build`.
 */
function maxDurationLiteral(relPath: string): number | null {
  const m = SEGMENT_EXPORT.exec(codeOnly(readFileSync(path.join(ROOT, relPath), 'utf8')));
  if (!m) return null;
  return /^\d+$/.test(m[1]!.trim()) ? Number(m[1]!.trim()) : NaN;
}

describe('route segments — maxDuration is a literal, and it matches the budget constant', () => {
  const routes = routesMentioningMaxDuration();

  it('the scan finds routes at all (positive control — a dead scan must not pass vacuously)', () => {
    // Anchored on the route the guard exists for. If it moves, going red here is correct: the
    // anchor proves the walk reaches real files, it does not define the set being checked.
    expect(routes.length, 'no maxDuration exports found under web/src/app — the scan is broken').toBeGreaterThan(0);
    expect(routes).toContain('web/src/app/api/ask/route.ts');
  });

  it('every mention parses as a segment config export (refuse rather than under-read)', () => {
    // Discovery is wider than the parse. A file that mentions maxDuration in a shape this scanner
    // cannot read — a re-export, a destructure, an indented declaration — lands here rather than
    // being skipped, because a skipped route is exactly the drift the guard exists to catch.
    const unparseable = routes.filter((r) => maxDurationLiteral(r) === null);
    expect(unparseable, 'mentions maxDuration in a form the scanner cannot read').toEqual([]);
  });

  it('every maxDuration export is a NUMERIC LITERAL — a non-literal fails `next build`', () => {
    for (const r of routes) {
      const v = maxDurationLiteral(r);
      expect(Number.isFinite(v), `${r}: maxDuration must be a numeric literal, not an identifier`).toBe(true);
    }
  });

  it('every literal equals ASK_MAX_DURATION_SEC — the two may not drift', () => {
    for (const r of routes) {
      expect(maxDurationLiteral(r), `${r}: maxDuration literal != ASK_MAX_DURATION_SEC`).toBe(ASK_MAX_DURATION_SEC);
    }
  });
});
