// anchorChunk — the two channels, composed.
//
// Runs against the REAL KJV index, not a fixture: the explicit channel's gate and the uncited
// channel's index are the two things most likely to be wrong together, and a stubbed index would
// test neither.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { anchorChunk } from '@/lib/user-corpus/anchor';
import { buildVerseShingleIndex, type IndexedVerse } from '@bible/uncited-shingle';

const KJV_DIR = path.resolve(__dirname, '../../public/bible/kjv');
const HAVE_BIBLE = existsSync(KJV_DIR);
if (!HAVE_BIBLE) {
  console.warn(`⚠ SKIPPED (visibly): ${KJV_DIR} absent — the bible index is gitignored. anchorChunk legs did NOT run.`);
}

function loadKjv(): IndexedVerse[] {
  const out: IndexedVerse[] = [];
  for (const f of readdirSync(KJV_DIR).filter((n) => n.endsWith('.json'))) {
    const j = JSON.parse(readFileSync(path.join(KJV_DIR, f), 'utf8')) as {
      book: number;
      chapters: Record<string, { verse: number; text: string }[]>;
    };
    for (const [c, vs] of Object.entries(j.chapters)) {
      for (const v of vs) out.push({ verseId: j.book * 1_000_000 + Number(c) * 1000 + v.verse, text: v.text });
    }
  }
  return out;
}

const index = HAVE_BIBLE ? buildVerseShingleIndex(loadKjv(), 6, 'kjv') : null;
const base = () => ({ index: index!, minHits: 1, minVerseShingles: 3, translationConfidence: 1.0 });

const JOHN_3_16 = 43003016;
const ROM_8_28 = 45008028;

describe.skipIf(!HAVE_BIBLE)('the explicit channel', () => {
  it('anchors a genuine citation', () => {
    const a = anchorChunk('As Paul writes in Romans 8:28, all things work together.', base());
    const explicit = a.filter((x) => x.channel === 'explicit');
    expect(explicit.length).toBeGreaterThan(0);
    expect(explicit.some((x) => x.verseStart === ROM_8_28)).toBe(true);
  });

  it('records matchCount as null, not 0 or 1', () => {
    // Migration 103: a citation is not a shingle count. Writing 1 would make a `match_count >= K`
    // filter silently admit every citation, which is the whole reason the columns were split.
    const a = anchorChunk('See Romans 8:28 for the promise.', base());
    for (const x of a.filter((y) => y.channel === 'explicit')) expect(x.matchCount).toBeNull();
  });

  // THE FIXTURES HERE ARE CHOSEN BECAUSE THE RED-PROOF REJECTED THE OBVIOUS ONES.
  // The first version used "The Romans conquered Britain..." and passed 13/13 with the gate
  // DELETED — because scanReferences needs a book beside a digit, found nothing there, and the
  // gate was never consulted. A test for a filter must feed it something to filter.
  // These three all produce a scanReferences hit that the gate must then reject.
  it.each([
    ['the deep-audit regression', 'a sum which is 3,000,000 talents of silver was gathered'],
    ['a count and a distance', 'there were about 3,000 souls, and it is 5 miles thence'],
    ['a span of years', 'he laboured, as is 40 years in the wilderness taught him'],
  ])('refuses a scanReferences hit that is not a citation: %s', (_label, body) => {
    // SEED: drop the isExplicitCitation filter and call scanReferences bare -> RED.
    // Each of these parses as Isaiah N via the `is` alias.
    const a = anchorChunk(body, base());
    expect(a.filter((x) => x.channel === 'explicit')).toEqual([]);
  });

  it('has a known limit, recorded rather than hidden: a book name beside any digit passes', () => {
    // "The Romans 8 legions marched" satisfies the gate's rule — the book IS named beside a digit
    // — and is not a citation. The heuristic cannot tell them apart without parsing the sentence.
    // Documented here so the next person meets the limit as a known one rather than as a surprise;
    // the uncited channel and the ≥2-tradition floor are what stop a stray anchor mattering.
    const a = anchorChunk('The Romans 8 legions marched, though it is not scripture.', base());
    expect(a.filter((x) => x.channel === 'explicit').length).toBeGreaterThan(0);
  });

  it('is unaffected by translation confidence — a citation names the same verse in every translation', () => {
    const a = anchorChunk('See Romans 8:28.', { ...base(), translationConfidence: 0.4 });
    for (const x of a.filter((y) => y.channel === 'explicit')) expect(x.confidence).toBe(1.0);
  });
});

describe.skipIf(!HAVE_BIBLE)('the uncited channel', () => {
  it('anchors a verbatim quote that is never cited', () => {
    // The make-or-break lever: recover the passage from prose alone, with no citation.
    const a = anchorChunk('He told them plainly: For God so loved the world, that he gave his only begotten Son.', base());
    const uncited = a.filter((x) => x.channel === 'uncited');
    expect(uncited.some((x) => x.verseStart === JOHN_3_16)).toBe(true);
    expect(a.filter((x) => x.channel === 'explicit')).toEqual([]); // nothing was cited
  });

  it('carries the shingle count as matchCount', () => {
    const a = anchorChunk('For God so loved the world, that he gave his only begotten Son.', base());
    const hit = a.find((x) => x.channel === 'uncited' && x.verseStart === JOHN_3_16);
    expect(hit?.matchCount).toBeGreaterThanOrEqual(1);
  });

  it('carries the translation-family confidence, so a fallback match is not presented as fact', () => {
    // ADR-100: a below-floor detection falls back to the KJV family and RECORDS it. An unrecorded
    // fallback is the silent failure the ADR exists to prevent.
    const a = anchorChunk('For God so loved the world, that he gave his only begotten Son.', {
      ...base(),
      translationConfidence: 0.55,
    });
    const hit = a.find((x) => x.channel === 'uncited' && x.verseStart === JOHN_3_16);
    expect(hit?.confidence).toBeCloseTo(0.55);
  });

  it('K actually filters, and the cut is monotone', () => {
    // SEED: ignore opts.minHits -> RED. K is the number that decides the feature.
    //
    // SELF-CALIBRATING, because a hardcoded K did not discriminate: the first version compared
    // K=1 against K=4 over three fully-quoted verses, every one of which matched on more than 4
    // shingles, so both sides returned 3 and the assertion "3 > 3" failed for a reason that had
    // nothing to do with K working. The threshold that separates is a property of the fixture, so
    // it is read off the fixture rather than guessed.
    const body =
      'For God so loved the world, that he gave his only begotten Son. ' +
      'The LORD is my shepherd; I shall not want. He maketh me to lie down in green pastures.';

    const k1 = anchorChunk(body, { ...base(), minHits: 1 }).filter((x) => x.channel === 'uncited');
    expect(k1.length).toBeGreaterThan(1); // not vacuous

    const strongest = Math.max(...k1.map((x) => x.matchCount ?? 0));
    const above = anchorChunk(body, { ...base(), minHits: strongest + 1 }).filter((x) => x.channel === 'uncited');
    expect(above).toEqual([]); // nothing survives a K above the strongest match

    // Monotone all the way down: raising K can never ADD a verse.
    let prev = Infinity;
    for (let K = 1; K <= strongest + 1; K++) {
      const n = anchorChunk(body, { ...base(), minHits: K }).filter((x) => x.channel === 'uncited').length;
      expect(n, `K=${K}`).toBeLessThanOrEqual(prev);
      prev = n;
    }
  });
});

describe.skipIf(!HAVE_BIBLE)('both channels on one verse', () => {
  it('emits BOTH rows, because their agreement is the strongest evidence an anchor is real', () => {
    // This is what migration 103 exists for: `channel` is in the PK so the pair survives.
    // SEED: dedupe on verseStart alone -> RED, one row is lost and the agreement with it.
    const body =
      'Romans 8:28 says it plainly: And we know that all things work together for good to them that love God.';
    const a = anchorChunk(body, base());
    const onRom = a.filter((x) => x.verseStart === ROM_8_28);
    expect(onRom.map((x) => x.channel).sort()).toEqual(['explicit', 'uncited']);
  });

  it('collapses duplicates WITHIN a channel, keeping the stronger match', () => {
    // The PK is (section_id, verse_id_start, channel), so two explicit hits on one range would
    // collide on insert. SEED: remove the collapse -> a duplicate key reaches the database.
    const a = anchorChunk('See Romans 8:28. And again, Romans 8:28 is the ground of it.', base());
    const explicitOnRom = a.filter((x) => x.channel === 'explicit' && x.verseStart === ROM_8_28);
    expect(explicitOnRom).toHaveLength(1);
  });

  it('produces no two rows sharing (verseStart, channel)', () => {
    // The invariant behind the PK, asserted over a body dense enough to stress it.
    const body =
      'Romans 8:28. For God so loved the world, that he gave his only begotten Son. ' +
      'The LORD is my shepherd; I shall not want. See also Romans 8:28 and John 3:16.';
    const a = anchorChunk(body, base());
    const keys = a.map((x) => `${x.verseStart}:${x.channel}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe.skipIf(!HAVE_BIBLE)('shape', () => {
  it('returns nothing for prose that neither cites nor quotes', () => {
    const a = anchorChunk('The weather in the parish has been disagreeable and the roof leaks badly.', base());
    expect(a).toEqual([]);
  });

  it('never emits a prose channel — Slice 1 ships two, and says so', () => {
    const body = 'Romans 8:28. For God so loved the world, that he gave his only begotten Son.';
    for (const x of anchorChunk(body, base())) expect(['explicit', 'uncited']).toContain(x.channel);
  });
});
