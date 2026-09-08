// English word -> verse index (src/ingest/build-word-index.ts): the normalization contract,
// the bucket/shard split, and — against the REAL shipped KJV — hand-verified counts for a
// known word set. The real-corpus expectations were counted by hand against
// web/public/bible/kjv on 2026-09-08 (the script is quoted in the commit message), not
// copied out of the builder's own output — an expectation the builder generates proves nothing.
//
// Two KJV facts these numbers pin, because they are the ones a reviewer gets wrong from memory:
//   - 1 Corinthians 13 says CHARITY, not "love" (vv. 1,2,3,4,8,13 — 24 verses corpus-wide).
//   - John 3:16 says "loVED", and there is no stemming, so "love" (281 verses) does NOT
//     contain 43_003_016 while "loved" (89 verses) does.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildIndex, normalizeWord, verseWords, wordBucket, wordShard } from '../src/ingest/build-word-index';

describe('normalizeWord — the lookup-key contract', () => {
  it.each([
    ['Charity', 'charity'],
    ["Paul's", 'paul'],      // possessive folds to the head word
    ['Moses’', 'moses'],     // bare trailing curly apostrophe
    ["GOD’S", 'god'],        // curly possessive, uppercase
    ["'tis", 'tis'],         // leading apostrophe
    ['beginning.', 'beginning'],
    ['“shepherd”', 'shepherd'],
    ['§', ''],               // nothing letter-like -> dropped
  ])('%s -> %s', (raw, want) => {
    expect(normalizeWord(raw)).toBe(want);
  });

  it('splits hyphens into both parts rather than fusing or dropping them', () => {
    expect(verseWords('loving-kindness')).toEqual(['loving', 'kindness']);
  });

  it('verseWords dedupes repeats within a verse', () => {
    // 1 Cor 13:4 has "charity" twice; a verse contributes ONE id per word.
    expect(verseWords('Charity suffereth long, and is kind; charity envieth not;')).toContain('charity');
    expect(verseWords('charity charity')).toEqual(['charity']);
  });
});

describe('bucketing — the concordance shape, with the collision the concordance never had', () => {
  it('buckets by 2-letter prefix', () => {
    expect(wordBucket('love')).toBe('lo');
    expect(wordBucket('a')).toBe('a');
  });

  it('outlier shards can never collide with a bucket name', () => {
    // "of"/"to"/"in" are outliers AND their own 2-letter bucket key; an unprefixed shard
    // name would overwrite the bucket file. 28 such words exist in the real build.
    for (const w of ['of', 'to', 'in', 'a', 'i']) {
      expect(wordShard(w)).not.toBe(wordBucket(w));
    }
    expect(wordShard('the')).toBe('_the');
  });
});

describe('buildIndex over a hand-made fixture', () => {
  const books = [
    {
      book: 43,
      chapters: {
        '3': [
          { verse: 16, text: 'For God so loved the world, that he gave his only begotten Son' },
          { verse: 17, text: 'For God sent not his Son into the world to condemn the world' },
        ],
      },
    },
  ];

  it('keys by the canonical verseId (book*1e6 + chapter*1e3 + verse), deduped per verse', () => {
    const index = buildIndex(books);
    expect([...(index.get('world') ?? [])].sort((a, b) => a - b)).toEqual([43_003_016, 43_003_017]);
    expect(index.get('loved')).toEqual(new Set([43_003_016]));
    // "god" appears in both verses; "the" twice in v17 — one id each.
    expect(index.get('god')?.size).toBe(2);
    expect(index.get('the')).toEqual(new Set([43_003_016, 43_003_017]));
  });
});

// web/public/bible is gitignored; in CI the root vitest leg can run without the corpus
// (same guard as heldout-v4-anchor-check.test.ts). Locally the corpus is the point.
const KJV_DIR = path.resolve(__dirname, '../web/public/bible/kjv');
const KJV_PRESENT = existsSync(path.join(KJV_DIR, 'jhn.json'));

describe('buildIndex over the real shipped KJV — hand-verified counts', () => {
  const index = KJV_PRESENT
    ? buildIndex(
        readdirSync(KJV_DIR)
          .filter((f) => f.endsWith('.json'))
          .map((f) => JSON.parse(readFileSync(path.join(KJV_DIR, f), 'utf8'))),
      )
    : new Map<string, Set<number>>();

  it.skipIf(!KJV_PRESENT)('reads all 66 books and finds the hand-counted vocabulary size', () => {
    expect(readdirSync(KJV_DIR).filter((f) => f.endsWith('.json'))).toHaveLength(66);
    expect(index.size).toBe(12_457);
  });

  it.skipIf(!KJV_PRESENT)('charity: 24 verses, including 1 Cor 13:1-4,8,13 (the KJV word a reviewer mis-remembers as "love")', () => {
    const ids = index.get('charity');
    expect(ids?.size).toBe(24);
    for (const v of [1, 2, 3, 4, 8, 13]) expect(ids?.has(46_013_000 + v)).toBe(true);
  });

  it.skipIf(!KJV_PRESENT)('loved: 89 verses, including John 3:16; love: 281, NOT including it (no stemming)', () => {
    expect(index.get('loved')?.size).toBe(89);
    expect(index.get('loved')?.has(43_003_016)).toBe(true);
    expect(index.get('love')?.size).toBe(281);
    expect(index.get('love')?.has(43_003_016)).toBe(false);
  });

  it.skipIf(!KJV_PRESENT)('vaunteth: a single occurrence, 1 Cor 13:4 (the rare-word case)', () => {
    expect([...(index.get('vaunteth') ?? [])]).toEqual([46_013_004]);
  });

  it.skipIf(!KJV_PRESENT)("paul: 158 verses — possessive folding puts Paul's under paul", () => {
    expect(index.get('paul')?.size).toBe(158);
  });

  it.skipIf(!KJV_PRESENT)('outlier census matches the sharding the builder writes (212 words over 400 verses)', () => {
    const outliers = [...index.values()].filter((s) => s.size > 400).length;
    expect(outliers).toBe(212);
  });
});
