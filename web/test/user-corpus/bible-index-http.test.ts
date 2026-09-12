// The fix: a serverless function loads the bible over HTTP from the Corpus CDN, the way
// `lib/bible.ts` does on the client. This suite proves that path end-to-end with `fetch`
// stubbed to serve a canned KJV John:
//   - `availableTranslations` derives the shipped set from the CDN probes
//   - `getAnchorIndex` / `getAnchorIndexFor` build a real shingle index from fetched JSON
//   - `detectDocumentTranslation` runs against the fetched detection index
//   - the uncited channel anchors a verbatim quote using the fetched index
//   - the built index is memoised as a Promise (one build per warm instance)
//
// No fs, no DB, no network: `CORPUS_CDN_BASE` routes bible-index through `fetch`, which is
// stubbed per test. `vi.resetModules()` gives each test a fresh module (fresh caches).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANCHOR_NGRAM } from '../../src/lib/user-corpus/bible-index';
import { MIN_VERSE_SHINGLES, SHIPPED_K, anchorChunk } from '../../src/lib/user-corpus/anchor';

const CDN = 'https://cdn.example.test';
// KJV John, a handful of verses. Enough shingles for the uncited channel to anchor John 1:1.
const JHN = {
  translation: 'kjv',
  book: 43,
  slug: 'jhn',
  chapters: {
    '1': [
      { verse: 1, text: 'In the beginning was the Word, and the Word was with God, and the Word was God.' },
      { verse: 2, text: 'The same was in the beginning with God.' },
      { verse: 3, text: 'All things were made by him; and without him was not any thing made that was made.' },
      { verse: 4, text: 'In him was life; and the life was the light of men.' },
      { verse: 5, text: 'And the light shineth in darkness; and the darkness comprehended it not.' },
      {
        verse: 14,
        text: 'And the Word was made flesh, and dwelt among us, (and we beheld his glory, the glory as of the only begotten of the Father,) full of grace and truth.',
      },
    ],
    '3': [
      {
        verse: 16,
        text: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.',
      },
      {
        verse: 17,
        text: 'For God sent not his Son into the world to condemn the world; but that the world through him might be saved.',
      },
    ],
  },
};

// John 1:1 KJV — the verse the uncited channel should anchor.
const JOHN_1_1 = 'In the beginning was the Word, and the Word was with God, and the Word was God.';
const JOHN_3_16 =
  'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.';
// A "sermon" body that quotes both passages verbatim, embedded in connective prose.
const SERMON = `Our text this morning calls us to worship. ${JOHN_1_1} Let us dwell on that together.
And again, beloved, hear the promise of the gospel: ${JOHN_3_16} What manner of love is this?`;

let savedBase: string | undefined;

beforeEach(() => {
  savedBase = process.env.CORPUS_CDN_BASE;
  process.env.CORPUS_CDN_BASE = CDN;
  vi.resetModules();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === `${CDN}/bible/kjv/jhn.json`) {
        return new Response(JSON.stringify(JHN), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('not found', { status: 404, statusText: 'Not Found' });
    }),
  );
});

afterEach(() => {
  if (savedBase === undefined) delete process.env.CORPUS_CDN_BASE;
  else process.env.CORPUS_CDN_BASE = savedBase;
  vi.unstubAllGlobals();
});

async function importIndex() {
  return import('../../src/lib/user-corpus/bible-index');
}

describe('bible-index over HTTP (CDN mode)', () => {
  it('availableTranslations derives the shipped set from the CDN probe (kjv present, others 404)', async () => {
    const { availableTranslations } = await importIndex();
    expect(await availableTranslations()).toEqual(['kjv']);
  });

  it('getAnchorIndex builds a real shingle index from the fetched John verses', async () => {
    const { getAnchorIndex } = await importIndex();
    const index = await getAnchorIndex();
    expect(index.translation).toBe('kjv');
    expect(index.ngram).toBe(ANCHOR_NGRAM);
    expect(index.verseCount).toBeGreaterThan(0);
    expect(index.shingleToVerses.size).toBeGreaterThan(0);
  });

  it('getAnchorIndexFor(kjv) shortcircuits to the shared KJV index', async () => {
    const { getAnchorIndex, getAnchorIndexFor } = await importIndex();
    const direct = await getAnchorIndex();
    const viaFor = await getAnchorIndexFor('kjv');
    // Same Promise (memoised), same resolved index — the ANCHOR_TRANSLATION shortcut.
    expect(getAnchorIndexFor('kjv')).toBe(getAnchorIndex());
    expect(viaFor).toBe(direct);
  });

  it('the built index is memoised — one build per warm instance, not one per document', async () => {
    const { getAnchorIndex } = await importIndex();
    const first = getAnchorIndex();
    const second = getAnchorIndex();
    expect(first).toBe(second);
    expect(await first).toBe(await second);
  });

  it('detectDocumentTranslation runs against the fetched detection index and lands on kjv', async () => {
    const { detectDocumentTranslation } = await importIndex();
    const detection = await detectDocumentTranslation(SERMON);
    expect(detection.translation).toBe('kjv');
    expect(detection.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('the uncited channel anchors a verbatim John 1:1 quote using the fetched index', async () => {
    const { getAnchorIndex } = await importIndex();
    const index = await getAnchorIndex();
    const anchors = anchorChunk(JOHN_1_1, {
      index,
      minHits: SHIPPED_K,
      minVerseShingles: MIN_VERSE_SHINGLES,
      translationConfidence: 1,
    });
    const john_1_1 = 43 * 1_000_000 + 1 * 1000 + 1;
    const uncited = anchors.filter((a) => a.channel === 'uncited');
    expect(uncited.length, JSON.stringify(anchors)).toBeGreaterThan(0);
    expect(uncited.some((a) => a.verseStart === john_1_1 && a.verseEnd === john_1_1)).toBe(true);
  });

  it('the drain-shaped call sequence (detect then anchor) succeeds with no fs and no raw errors', async () => {
    // processOne calls detectDocumentTranslation then getAnchorIndexFor(detection.translation).
    // This is the exact pair that ENOENT'd in production before the fix; here it resolves.
    const { detectDocumentTranslation, getAnchorIndexFor } = await importIndex();
    const detection = await detectDocumentTranslation(SERMON);
    const index = await getAnchorIndexFor(detection.translation);
    expect(index.translation).toBe(detection.translation);
    expect(index.verseCount).toBeGreaterThan(0);
  });
});
