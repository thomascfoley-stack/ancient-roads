// D24 (DEEP_SWEEP) — cross-chapter reader entries were written with verseStart > verseEnd, which
// the reader's `verseStart <= v && v <= verseEnd` predicate matches for NO verse: ingested,
// stored, silently invisible. Latent today (the only producer, poole-tcp, emits single-verse
// entries — verified: 0 backwards ranges across 162,371 served entries) but both call sites
// advertise themselves as the generic path.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chapterLocalVerseEnd } from '../src/ingest/chapter-local-range';

const id = (book: number, chapter: number, verse: number) => book * 1_000_000 + chapter * 1_000 + verse;
const GEN_3_20 = id(1, 3, 20), GEN_4_2 = id(1, 4, 2), GEN_3_24 = id(1, 3, 24);
const GEN_50_26 = id(1, 50, 26), EXOD_1_5 = id(2, 1, 5);

describe('D24 — a reader entry filed under its start chapter never inverts', () => {
  it('the same-chapter range is untouched', () => {
    expect(chapterLocalVerseEnd(GEN_3_20, GEN_3_24)).toBe(24);
  });

  it('a cross-CHAPTER range caps at the rest of the start chapter instead of going backwards', () => {
    expect(chapterLocalVerseEnd(GEN_3_20, GEN_4_2)).toBe(999);
    expect(GEN_3_20 % 1000, 'the old expression produced 20..2 — matches no verse').toBeLessThan(999);
  });

  it('a cross-BOOK range caps too', () => {
    expect(chapterLocalVerseEnd(GEN_50_26, EXOD_1_5)).toBe(999);
  });

  it('an absent end means a single verse', () => {
    expect(chapterLocalVerseEnd(GEN_3_20, undefined)).toBe(20);
  });

  it('THE PROPERTY: the result is never below the chapter-local start', () => {
    for (const [s, e] of [[GEN_3_20, GEN_4_2], [GEN_50_26, EXOD_1_5], [GEN_3_20, GEN_3_24], [GEN_3_20, undefined]] as const) {
      expect(chapterLocalVerseEnd(s, e), `${s} -> ${e}`).toBeGreaterThanOrEqual(s % 1000);
    }
  });

  // Both writers must use it — a helper nobody calls fixes nothing.
  it.each(['insert-static-author.ts', 'regen-crosswire-static.ts'])('%s uses the shared helper', (f) => {
    const src = readFileSync(join(import.meta.dirname, '..', 'src', 'ingest', f), 'utf8');
    expect(src).toMatch(/chapterLocalVerseEnd\s*\(/);
    expect(src, 'the raw modulo is the defect').not.toMatch(/verseEnd:\s*\(e\.verseEnd \?\? e\.verseId\) % 1000/);
  });
});
