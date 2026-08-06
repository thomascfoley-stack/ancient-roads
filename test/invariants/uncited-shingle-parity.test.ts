// `src/bible/uncited-shingle.ts` must behave EXACTLY like the frozen Slice 0 primitives.
//
// WHY THIS TEST CARRIES THE WEIGHT. The uncited-quote channel is Slice 0's make-or-break lever and
// every published number (90% held-out recall; the K trade curve 1→33/93, 2→68/82, 3→96/75) was
// measured with `src/ingest/resource-textmatch.ts` through `scripts/slice0-anchor-recall.mts`.
// Slice 1 cannot import either: `vercel --prod` uploads `web/` alone, and both are FROZEN by the
// Slice 0 pre-registration, so editing them to share code would void those numbers.
//
// So a second implementation is forced, and the ONLY thing standing between "the shipped anchorer
// behaves like the measured one" and "it drifted and nobody noticed" is this file. If it is weak,
// Slice 1 inherits Slice 0's numbers without inheriting Slice 0's behaviour.
//
// HONEST LIMIT, stated rather than papered over. The tokeniser and hasher are compared against the
// REAL frozen exports — no transcription, nothing to get wrong. The matcher loop is ~10 lines and
// is not exported by anything importable, so `referenceMatches` below TRANSCRIBES it from
// `scripts/slice0-anchor-recall.mts:52-64`. That transcription is the one place this test could be
// wrong in the same direction as the code. It is kept literal, and its source lines are cited, so a
// reader can diff it by eye against the frozen file.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The FROZEN primitives — the real ones, as imported by both Slice 0 scripts.
import { shingleHashSetOcr as frozenShingle, tokenListOcr as frozenTokens } from '../../src/ingest/resource-textmatch';
// The Slice 1 re-implementation under test.
import {
  buildVerseShingleIndex,
  shingleHashSetOcr,
  tokenListOcr,
  uncitedMatches,
  type IndexedVerse,
} from '../../src/bible/uncited-shingle';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const KJV_DIR = path.join(REPO, 'web/public/bible/kjv');
const HAVE_BIBLE = existsSync(KJV_DIR);

if (!HAVE_BIBLE) {
  console.warn(
    `⚠ SKIPPED (visibly): ${KJV_DIR} is absent — the bible index is gitignored and lives only in ` +
      'the main clone. The verse-level parity legs did NOT run. Symlink it to run them.',
  );
}

const NGRAM = 6;

// ── inputs chosen to exercise the layout artifacts the tokeniser exists to strip ────────────────
const SAMPLES: Array<[label: string, text: string]> = [
  ['plain prose', 'Doth the plowman plow all day to sow? doth he open and break the clods of his ground?'],
  ['hyphenated across a line break', 'the plow-\nman plows for sow-\ning and opens the ground'],
  ['all-caps running header', 'EXPOSITORY THOUGHTS\nST. JOHN\nHe that hath the Son hath life.'],
  ['page numbers and verse markers', '12 He that hath 34 the Son 7 hath life 999'],
  ['html entities and tags', 'Grace <i>and</i> peace &amp; truth &#8212; be multiplied unto you'],
  ['smart quotes and dashes', '“I am the good shepherd” — the good shepherd giveth his life'],
  ['mixed case and punctuation', 'IN the BEGINNING was the Word, and the Word was with God!!!'],
  ['empty', ''],
  ['whitespace only', '   \n\t  \n '],
  ['single token', 'grace'],
  ['exactly ngram tokens', 'one two three four five six'],
  ['one short of ngram', 'one two three four five'],
  ['unicode and accents', 'Señor, résumé naïve coöperate — the word became flesh'],
  ['digits only', '1 2 3 4 5 6 7 8'],
  ['repeated shingle', 'holy holy holy holy holy holy holy holy holy holy'],
];

describe('tokeniser parity with the frozen primitive', () => {
  it.each(SAMPLES)('tokenListOcr matches on: %s', (_label, text) => {
    // SEED: change any line of tokenListOcr in src/bible/uncited-shingle.ts -> RED.
    expect(tokenListOcr(text)).toEqual(frozenTokens(text));
  });

  it('matches on a large real document, not just curated snippets', () => {
    // Curated samples test the cases I thought of. This tests the ones I did not.
    const doc = SAMPLES.map(([, t]) => t).join('\n').repeat(200);
    expect(tokenListOcr(doc)).toEqual(frozenTokens(doc));
  });
});

describe('hasher parity with the frozen primitive', () => {
  it.each(SAMPLES)('shingleHashSetOcr(_, 6) matches on: %s', (_label, text) => {
    // Sets compared as sorted arrays: Set equality in vitest is order-insensitive, but sorting
    // makes a failure readable rather than a wall of unordered numbers.
    const mine = [...shingleHashSetOcr(text, NGRAM)].sort((a, b) => a - b);
    const frozen = [...frozenShingle(text, NGRAM)].sort((a, b) => a - b);
    expect(mine).toEqual(frozen);
  });

  it('the required n is honoured — n=3 and n=6 differ, so a default could not be silent', () => {
    // The frozen signature defaults n=3 while every anchoring call site passes 6. This module
    // makes n required. That is only meaningful if the two actually differ.
    const text = SAMPLES[0]![1];
    const three = [...frozenShingle(text, 3)].sort((a, b) => a - b);
    const six = [...shingleHashSetOcr(text, 6)].sort((a, b) => a - b);
    expect(six).not.toEqual(three);
    expect(six).toEqual([...frozenShingle(text, 6)].sort((a, b) => a - b));
  });
});

// ── verse-level parity, over the real KJV index ────────────────────────────────────────────────

function loadKjv(): IndexedVerse[] {
  const out: IndexedVerse[] = [];
  for (const f of readdirSync(KJV_DIR).filter((n) => n.endsWith('.json'))) {
    const j = JSON.parse(readFileSync(path.join(KJV_DIR, f), 'utf8')) as {
      book: number;
      chapters: Record<string, { verse: number; text: string }[]>;
    };
    for (const [chap, vs] of Object.entries(j.chapters)) {
      for (const v of vs) {
        out.push({ verseId: j.book * 1_000_000 + Number(chap) * 1000 + v.verse, text: v.text });
      }
    }
  }
  return out;
}

/**
 * TRANSCRIBED from `scripts/slice0-anchor-recall.mts:28-64`, using the FROZEN primitives.
 * This is the one transcription in this file; keep it literal so it can be diffed by eye.
 */
function referenceMatches(body: string, verses: IndexedVerse[], minVerseShingles: number, minHits: number): Set<number> {
  const shingleIndex = new Map<number, number[]>();
  const shCountById = new Map<number, number>();
  for (const v of verses) {
    const sh = frozenShingle(v.text, NGRAM);
    shCountById.set(v.verseId, sh.size);
    for (const h of sh) (shingleIndex.get(h) ?? shingleIndex.set(h, []).get(h)!).push(v.verseId);
  }
  const hits = new Map<number, number>();
  for (const h of frozenShingle(body, NGRAM)) {
    const ids = shingleIndex.get(h);
    if (!ids) continue;
    for (const id of ids) hits.set(id, (hits.get(id) ?? 0) + 1);
  }
  const out = new Set<number>();
  for (const [id, n] of hits) {
    if ((shCountById.get(id) ?? 0) >= minVerseShingles && n >= minHits) out.add(id);
  }
  return out;
}

describe.skipIf(!HAVE_BIBLE)('verse-level parity over the real KJV index', () => {
  const verses = HAVE_BIBLE ? loadKjv() : [];
  const index = HAVE_BIBLE ? buildVerseShingleIndex(verses, NGRAM, 'kjv') : null;

  it('indexes the same corpus the frozen harness reports', () => {
    // The frozen harness prints "indexed 31102 ... 588029 distinct 6-shingles" for KJV.
    expect(index!.verseCount).toBe(31102);
    expect(index!.shingleToVerses.size).toBe(588029);
    // And the index knows which translation it is — the frozen one hardcodes 'WEB' in its report.
    expect(index!.translation).toBe('kjv');
  });

  it.each([
    ['a verbatim quote', 'He said unto them, Doth the plowman plow all day to sow? doth he open and break the clods of his ground?'],
    ['a quote inside prose', 'Beloved, consider this: For God so loved the world, that he gave his only begotten Son, and let us take heart.'],
    ['prose quoting nothing', 'The weather in the parish has been uncommonly disagreeable this fortnight, and the roof leaks.'],
    ['multiple quotes', 'In the beginning God created the heaven and the earth. And later: The LORD is my shepherd; I shall not want.'],
  ])('returns the same verse set as the frozen matcher at K=1: %s', (_label, body) => {
    // SEED: change minVerseShingles, the ngram, or the hit accounting in uncitedMatches -> RED.
    const mine = new Set(uncitedMatches(body, index!, { minVerseShingles: 3, minHits: 1 }).map((m) => m.verseId));
    const frozen = referenceMatches(body, verses, 3, 1);
    expect([...mine].sort((a, b) => a - b)).toEqual([...frozen].sort((a, b) => a - b));
  });

  it('agrees at every K on the trade curve, not only at the frozen K=1', () => {
    // Slice 0 ran at K=1; the shipped anchorer will run at K=2 or K=3. Parity at the K nobody
    // ships would be a check that cannot fail where it matters.
    const body =
      'For God so loved the world, that he gave his only begotten Son. ' +
      'The LORD is my shepherd; I shall not want. He maketh me to lie down in green pastures. ' +
      'In the beginning was the Word, and the Word was with God, and the Word was God.';
    for (const K of [1, 2, 3, 4, 5]) {
      const mine = new Set(uncitedMatches(body, index!, { minVerseShingles: 3, minHits: K }).map((m) => m.verseId));
      const frozen = referenceMatches(body, verses, 3, K);
      expect([...mine].sort((a, b) => a - b), `K=${K}`).toEqual([...frozen].sort((a, b) => a - b));
    }
  });

  it('agrees ON the distinctiveness boundary, where a verse has EXACTLY minVerseShingles', () => {
    // THIS TEST EXISTS BECAUSE THE RED-PROOF FOUND IT MISSING. Seeding `<` -> `<=` on the
    // distinctiveness floor passed 40/40: every fixture above quotes a long verse, so no verse
    // with exactly 3 shingles was ever hit and the off-by-one was invisible. 188 KJV verses sit
    // exactly on that boundary; the floor is `>= minVerseShingles`, so they must be KEPT.
    // 1 Chronicles 1:18 has exactly 3 six-gram shingles.
    const boundaryVerseId = 13001018;
    expect(index!.shinglesPerVerse.get(boundaryVerseId)).toBe(3);

    const body = 'The genealogy runs thus: And Arphaxad begat Shelah, and Shelah begat Eber. So the line continued.';
    const mine = uncitedMatches(body, index!, { minVerseShingles: 3, minHits: 1 });
    const frozen = referenceMatches(body, verses, 3, 1);

    // SEED: `<` -> `<=` in uncitedMatches -> RED here, and only here.
    expect(mine.map((m) => m.verseId)).toContain(boundaryVerseId);
    expect(frozen.has(boundaryVerseId)).toBe(true);
    expect([...new Set(mine.map((m) => m.verseId))].sort((a, b) => a - b)).toEqual(
      [...frozen].sort((a, b) => a - b),
    );
  });

  it('agrees one BELOW the boundary too — the floor excludes, it does not merely include', () => {
    // The other side. A floor tested only from above passes just as happily when it admits
    // everything, which is the failure mode that lets short common clauses collide.
    const body = 'The genealogy runs thus: And Arphaxad begat Shelah, and Shelah begat Eber. So the line continued.';
    const mine = new Set(uncitedMatches(body, index!, { minVerseShingles: 4, minHits: 1 }).map((m) => m.verseId));
    const frozen = referenceMatches(body, verses, 4, 1);
    expect(mine.has(13001018)).toBe(false); // 3 shingles < a floor of 4
    expect([...mine].sort((a, b) => a - b)).toEqual([...frozen].sort((a, b) => a - b));
  });

  it('is not vacuous — the fixtures actually match verses', () => {
    // Every parity assertion above would pass trivially if both sides returned nothing.
    const body = 'For God so loved the world, that he gave his only begotten Son.';
    const hits = uncitedMatches(body, index!, { minVerseShingles: 3, minHits: 1 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.map((h) => h.verseId)).toContain(43003016); // John 3:16
  });

  it('reports matchCount, which the frozen Set could not, and it is a real count', () => {
    // matchCount is what migration 103's match_count stores and what the K filter re-reads later.
    const body = 'The LORD is my shepherd; I shall not want. He maketh me to lie down in green pastures.';
    const hits = uncitedMatches(body, index!, { minVerseShingles: 3, minHits: 1 });
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(h.matchCount).toBeGreaterThanOrEqual(1);
    // Sorted strongest-first and deterministic, because these become table rows.
    const counts = hits.map((h) => h.matchCount);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });
});
