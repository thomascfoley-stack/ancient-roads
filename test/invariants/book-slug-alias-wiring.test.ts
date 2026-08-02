// EVERY URL-PATH BOOK LOOKUP CONSULTS THE ALIAS TABLE — deep audit A7 product walk, 2026-08-02.
//
// `resolveBookSlug` existing is not the fix; a caller CALLING it is. This was found twice in one
// walk — the reader route (`/read/[book]/[chapter]/page.tsx`) and the multi-pane desk
// (`desk-pane.tsx`, reachable via `?p=scripture:john/1`) each did a bare
// `BOOK_BY_BOOK_SLUG.get(slug)` with no fallback, independently. Two callers, same shape, same
// gap — the class this repo's watchlist names most often. This file derives the caller set from
// the tree rather than hand-listing it, so a THIRD copy of the bug turns this red instead of
// waiting for a fourth product walk to find it.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { codeOnly } from '../../scripts/lib/source-scan.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WEB_SRC = path.join(REPO, 'web/src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

// Every file that calls BOOK_BY_BOOK_SLUG.get(...) at all — the exact call the bug lived in.
const CALLERS = walk(WEB_SRC)
  .filter((f) => /BOOK_BY_BOOK_SLUG\.get\(/.test(codeOnly(readFileSync(f, 'utf8'))))
  .map((f) => path.relative(REPO, f))
  .sort();

describe('every BOOK_BY_BOOK_SLUG.get(...) call falls back to resolveBookSlug', () => {
  it('found at least the two known call sites — an anti-vacuity floor', () => {
    // If this list is empty the derivation walked the wrong directory and every case below
    // would pass vacuously.
    expect(CALLERS).toContain('web/src/app/read/[book]/[chapter]/page.tsx');
    expect(CALLERS).toContain('web/src/components/desk-pane.tsx');
    expect(CALLERS.length).toBeGreaterThanOrEqual(2);
  });

  it.each(CALLERS)('%s falls back to resolveBookSlug on a miss', (rel) => {
    // SEED: remove the `?? resolveBookSlug(...)` fallback from either call site -> RED for that
    // file only. A bare `BOOK_BY_BOOK_SLUG.get(x)` with nothing after it is exactly the bug.
    const code = codeOnly(readFileSync(path.join(REPO, rel), 'utf8'));
    expect(code, `${rel} imports resolveBookSlug`).toMatch(/import\s*\{[^}]*resolveBookSlug[^}]*\}\s*from/);
    expect(code, `${rel} calls BOOK_BY_BOOK_SLUG.get(...) with no ?? resolveBookSlug(...) fallback`)
      .toMatch(/BOOK_BY_BOOK_SLUG\.get\([^)]*\)\s*\?\?\s*resolveBookSlug\(/);
  });
});
