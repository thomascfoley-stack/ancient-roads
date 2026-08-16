// The marketing verse-panel demo carries ten baked excerpts (the corpus is gated, so the
// public page cannot fetch it). This is the guard that keeps that page honest: every
// excerpt must be a VERBATIM substring of a SERVED entry by that author on John 1:1, and
// every author must pass isPublishedCommentaryEntry. Red-proof: change one word of any
// excerpt in verse-panel-demo.tsx, or name an unserved author, and this goes red.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { VERSE_PANEL_VOICES } from '@/components/marketing/verse-panel-demo';
import { isPublishedCommentaryEntry } from '@/lib/legal-corpus';
import { announceSkip } from './helpers/loud-skip';

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

// The corpus is gitignored — local disk is the only copy — so CI can never have this file
// (deploy.sh:206: "this content reaches production WITHOUT ever passing through git or CI").
// Reading it at module load therefore ENOENT'd collection in CI and the whole suite failed
// before a single assertion ran (run 31910463039). House pattern: a LOUD artifact skip, never
// a silent pass — the excerpts stay enforced wherever the corpus exists (locally and at the
// predeploy gate, which hard-fails on the same tree).
const CORPUS_AVAILABLE = existsSync(file);
const SKIP = announceSkip(
  'marketing verse-panel demo sync',
  [{
    name: 'web/public/commentaries/jhn/1.json (gitignored static corpus)',
    present: CORPUS_AVAILABLE,
    kind: 'artifact',
  }],
  'a marketing excerpt drifting from the verbatim served corpus text, or naming an unserved author',
);

const entries = CORPUS_AVAILABLE
  ? (JSON.parse(readFileSync(file, 'utf8')) as { entries: Entry[] }).entries.filter(
      (e) => e.verseStart <= 1 && 1 <= e.verseEnd,
    )
  : [];

describe.skipIf(SKIP)('marketing verse-panel demo — every excerpt is verbatim served corpus text', () => {
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
