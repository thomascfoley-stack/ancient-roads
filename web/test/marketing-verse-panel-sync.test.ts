// The marketing verse-panel demo carries ten baked excerpts (the corpus is gated, so the
// public page cannot fetch it). This is the guard that keeps that page honest: every
// excerpt must be a VERBATIM substring of a SERVED entry by that author on John 1:1, and
// every author must pass isPublishedCommentaryEntry. Red-proof: change one word of any
// excerpt in verse-panel-demo.tsx, or name an unserved author, and this goes red.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { VERSE_PANEL_VOICES } from '@/components/marketing/verse-panel-demo';
import { isPublishedCommentaryEntry } from '@/lib/legal-corpus';

interface Entry {
  verseStart: number;
  verseEnd: number;
  author: string;
  sourceUrl?: string | null;
  work?: string | null;
  text: string;
}

// Typographic normalization ONLY (curly vs straight quotes, whitespace runs). Words,
// order and punctuation marks all still have to match — this cannot paper over a
// paraphrase, which is the failure mode the test exists to catch.
const norm = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

const file = path.join(__dirname, '..', 'public', 'commentaries', 'jhn', '1.json');
const entries = (JSON.parse(readFileSync(file, 'utf8')) as { entries: Entry[] }).entries.filter(
  (e) => e.verseStart <= 1 && 1 <= e.verseEnd,
);

describe('marketing verse-panel demo — every excerpt is verbatim served corpus text', () => {
  it('names ten distinct voices', () => {
    expect(VERSE_PANEL_VOICES).toHaveLength(10);
    expect(new Set(VERSE_PANEL_VOICES.map((v) => v.author)).size).toBe(10);
  });

  for (const v of VERSE_PANEL_VOICES) {
    it(`${v.label}: served, and the excerpt is verbatim from the John 1:1 corpus data`, () => {
      const own = entries.filter((e) => e.author === v.author);
      expect(own.length, `no John 1:1 entries by "${v.author}"`).toBeGreaterThan(0);
      const served = own.filter((e) =>
        isPublishedCommentaryEntry({ author: e.author, sourceUrl: e.sourceUrl, book: 43, work: e.work }),
      );
      expect(served.length, `"${v.author}" has entries but none are served`).toBeGreaterThan(0);
      const hit = served.some((e) => norm(e.text).includes(norm(v.excerpt)));
      expect(hit, `excerpt for ${v.label} is not verbatim in any served entry`).toBe(true);
    });
  }
});
