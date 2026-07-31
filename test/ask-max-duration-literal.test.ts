// PROPERTY: the `maxDuration` literal in the /api/ask route segments equals ASK_MAX_DURATION_SEC.
//
// WHY A LITERAL AT ALL. Next 16 statically analyses route segment config exports. Both ask routes
// used `export const maxDuration = ASK_MAX_DURATION_SEC`, and that non-literal export failed the
// PRODUCTION BUILD outright — `Invalid segment configuration export detected`, exit 1, no route
// named in the output. Discovered 2026-08-01 by running `next build` at HEAD for the first time;
// nothing in CI builds the app, so it had been broken with nothing to say so.
//
// WHY THIS TEST EXISTS. The fix inlines `300`, which duplicates a constant — the exact shape this
// repo has paid for nine times ("a hand-maintained expected set that nothing enforces"). Next gives
// no way to import it, so the duplication is forced by the framework. What is NOT forced is leaving
// it unguarded. This test derives the literal from the route source and compares it to the constant,
// so raising the timeout in one place and not the other is red, not a silent production mismatch.
//
// The failure it prevents is not cosmetic: `maxDuration` is the Vercel function ceiling and
// ASK_MAX_DURATION_SEC is the in-process budget. If the ceiling drops below the budget, the platform
// kills the function mid-answer; if the budget exceeds the ceiling, the fail-closed fallback never
// gets to run. They are one number with two consumers.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ASK_MAX_DURATION_SEC } from '../web/src/lib/teacher/teach-budget';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROUTES = [
  'web/src/app/api/ask/route.ts',
  'web/src/app/api/ask/stream/route.ts',
];

/** The literal Next will actually read, parsed out of the segment config export. */
function maxDurationLiteral(relPath: string): number | null {
  const src = readFileSync(path.join(ROOT, relPath), 'utf8');
  // Whole-line comments stripped so the explanation above each export is not scanned.
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');
  const m = /^export const maxDuration\s*=\s*(.+?);/m.exec(code);
  if (!m) return null;
  return /^\d+$/.test(m[1]!.trim()) ? Number(m[1]!.trim()) : NaN;
}

describe('ask routes — maxDuration is a literal, and it matches the budget constant', () => {
  it('the scanner finds an export in every route (positive control)', () => {
    // Without this, a regex that matched nothing would make the assertions below vacuous.
    for (const r of ROUTES) {
      expect(maxDurationLiteral(r), `${r} has no maxDuration export the scanner can see`).not.toBeNull();
    }
  });

  it('every maxDuration export is a NUMERIC LITERAL — a non-literal fails `next build`', () => {
    for (const r of ROUTES) {
      const v = maxDurationLiteral(r);
      expect(Number.isFinite(v), `${r}: maxDuration must be a numeric literal, not an identifier`).toBe(true);
    }
  });

  it('every literal equals ASK_MAX_DURATION_SEC — the two may not drift', () => {
    for (const r of ROUTES) {
      expect(maxDurationLiteral(r), `${r}: maxDuration literal != ASK_MAX_DURATION_SEC`).toBe(ASK_MAX_DURATION_SEC);
    }
  });
});
