// Canonical-group invariants (web/src/lib/plan/canonical-groups.ts) and the
// books-scope expansion they feed (ADR-047). Pure, no DB.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOOKS, BOOK_BY_NUM, BOOK_BY_SLUG } from '@/bible/books';
import { CANONICAL_GROUPS, validateCanonicalGroups } from '@/lib/plan/canonical-groups';
import { expandPlan } from '@/lib/plan/expand';
import { parsePlanSpec } from '@/lib/plan/spec';

const spec = (over: Record<string, unknown> = {}) => {
  const out = parsePlanSpec(
    Object.assign(
      { scope: { kind: 'books', group: 'pauline-epistles' }, weeks: 8, daysPerWeek: 3, startDate: '2026-08-03' },
      over,
    ),
  );
  if (!out.ok) throw new Error(out.reason);
  return out.spec;
};

describe('CANONICAL_GROUPS — the reviewed table', () => {
  it('is internally valid by its own validator (real slugs, no dupes, none empty)', () => {
    // The validator is exported and asserted here rather than re-deriving a
    // copy of the check — a guard whose expected set is typed by the same
    // hand that typed the thing it guards is not a second opinion
    // (docs/pm/MASTER.md failure-mode watchlist).
    expect(validateCanonicalGroups()).toEqual([]);
  });

  it('every group lists books in strictly ascending canon order', () => {
    for (const [key, group] of Object.entries(CANONICAL_GROUPS)) {
      const nums = group.books.map((s) => BOOK_BY_SLUG.get(s)!.bookNum);
      expect(nums, `${key} must be in canon order`).toEqual([...nums].sort((a, b) => a - b));
    }
  });

  it('whole-bible is DERIVED from BOOKS, not typed', () => {
    // SEED: replace the derivation with a hand-typed 66-slug array and this
    // still passes today — but the source-text assertion below fails, which
    // is the actual guard: the derivation itself must survive.
    expect(CANONICAL_GROUPS['whole-bible']!.books).toEqual(BOOKS.map((b) => b.slug));
    // Path from import.meta.url, never process.cwd() — the qa gate runs from
    // the repo root while a direct vitest run starts in web/ (house rule,
    // api-hardening.test.ts:130-133; this test went red on exactly that).
    const src = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/lib/plan/canonical-groups.ts'),
      'utf8',
    );
    expect(src).toMatch(/books:\s*BOOKS\.map/);
  });

  it('pauline-epistles is Romans through Philemon, 13 letters, and EXCLUDES Hebrews', () => {
    // SEED: add 'heb' to the group and this goes red — the exclusion is a
    // recorded editorial-neutrality decision (ADR-047), not an oversight.
    const g = CANONICAL_GROUPS['pauline-epistles']!;
    expect(g.books).toHaveLength(13);
    expect(g.books[0]).toBe('rom');
    expect(g.books[12]).toBe('phm');
    expect(g.books).not.toContain('heb');
    expect(g.note).toMatch(/Hebrews/);
  });
});

describe('expandPlan — books scope (multi-book, list-driven, no parseRef)', () => {
  it('Pauline epistles over 24 days covers all 87 chapters exactly once, in order', () => {
    const r = expandPlan(spec());
    if (!r.ok) throw new Error(r.reason);
    expect(r.days).toHaveLength(24);
    // Reconstruct the full chapter walk from day spans; verify coverage and order.
    const walked: Array<[number, number]> = [];
    for (const d of r.days) {
      const startBook = Math.floor(d.verseStart / 1_000_000);
      const endBook = Math.floor(d.verseEnd / 1_000_000);
      const startCh = Math.floor((d.verseStart % 1_000_000) / 1000);
      const endCh = Math.floor((d.verseEnd % 1_000_000) / 1000);
      for (let b = startBook; b <= endBook; b++) {
        const cFrom = b === startBook ? startCh : 1;
        const cTo = b === endBook ? endCh : BOOK_BY_NUM.get(b)!.chapterCount;
        for (let c = cFrom; c <= cTo; c++) walked.push([b, c]);
      }
    }
    const expected: Array<[number, number]> = [];
    for (const slug of CANONICAL_GROUPS['pauline-epistles']!.books) {
      const b = BOOK_BY_SLUG.get(slug)!;
      for (let c = 1; c <= b.chapterCount; c++) expected.push([b.bookNum, c]);
    }
    expect(walked).toEqual(expected); // 87 chapters, no gap, no repeat, canon order
  });

  it('a day may straddle a book boundary and its span stays forward-reading', () => {
    // 87 chapters / 24 days guarantees straddling days (measured 3.6 ch/day).
    const r = expandPlan(spec());
    if (!r.ok) throw new Error(r.reason);
    const straddling = r.days.filter(
      (d) => Math.floor(d.verseStart / 1_000_000) !== Math.floor(d.verseEnd / 1_000_000),
    );
    expect(straddling.length).toBeGreaterThan(0);
    for (const d of straddling) {
      expect(d.verseEnd).toBeGreaterThan(d.verseStart); // never a backwards span
    }
  });

  it('whole Bible in 26 weeks x 7 days lands 1,189 chapters on 182 days', () => {
    const r = expandPlan(spec({ scope: { kind: 'books', group: 'whole-bible' }, weeks: 26, daysPerWeek: 7 }));
    if (!r.ok) throw new Error(r.reason);
    expect(r.days).toHaveLength(182);
    expect(Math.floor(r.days[0]!.verseStart / 1_000_000)).toBe(1);   // starts in Genesis
    expect(Math.floor(r.days[181]!.verseEnd / 1_000_000)).toBe(66);  // ends in Revelation
  });

  it('refuses an unknown group at the spec edge with a reason', () => {
    const out = parsePlanSpec({
      scope: { kind: 'books', group: 'catholic-epistles-deluxe' },
      weeks: 4, daysPerWeek: 3, startDate: '2026-08-03',
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/unknown canonical group/);
  });

  it('still refuses a schedule thinner than the scope (pentateuch cannot fill 2 years daily)', () => {
    const r = expandPlan(spec({ scope: { kind: 'books', group: 'pentateuch' }, weeks: 104, daysPerWeek: 7 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/cannot fill/);
  });
});
