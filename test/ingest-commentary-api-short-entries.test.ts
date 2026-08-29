// Short-entry filter regression: ingest-commentary-api dropped verse entries
// whose extracted text was <=20 chars (`text.length > 20`). The downstream
// range builder assumes EVERY verse is present, so a dropped intermediate
// verse let the prior verse's range swallow the missing one — verse 6 came to
// cover 6-7, and a query for verse 7 returned verse 6's text. Legitimate
// word-glosses (John 1:7 "through him--John.", 18 chars; John 5:3
// "impotent--infirm.", 17 chars) were silently lost. The fix keeps every
// non-empty entry, like the Thayer's adapter keeps cross-reference stubs.
//
// RED-PROOF: against the unfixed `text.length > 20` filter, the first case
// produces no entry for verse 7 and a 6-7 range for verse 6, so the
// query-for-verse-7 assertion returns verse 6's text and the test goes RED.

import { describe, expect, it } from 'vitest';
import { buildChapterEntries, type ApiVerse, type ChapterEntry } from '../src/ingest/ingest-commentary-api.js';

const SOURCE = { id: 'john-gill', author: 'John Gill', year: 1763, tradition: 'Reformed Baptist' };

function verse(n: number, text: string): ApiVerse {
  return { type: 'verse', number: n, content: [text] };
}

// Mirrors the serving-layer query: the entry whose [verseStart, verseEnd]
// contains the requested verse. This is the path the bug corrupted.
function commentaryForVerse(entries: ChapterEntry[], q: number): ChapterEntry | undefined {
  return entries.find((e) => e.verseStart <= q && q <= e.verseEnd);
}

describe('buildChapterEntries short-entry handling', () => {
  it('keeps a sub-20-char word gloss so verse 7 maps to its own text (regression)', () => {
    // John 1:5-8 raw data; verse 7 is an 18-char word gloss.
    const content: ApiVerse[] = [
      verse(5, 'The light shines in the darkness, and the darkness has not overcome it.'),
      verse(6, 'There was a man sent from God, whose name was John.'),
      verse(7, 'through him--John.'),
      verse(8, 'He was not the light, but came to bear witness about the light.'),
    ];

    const entries = buildChapterEntries(content, SOURCE);

    // Every verse is present, each in its own slot.
    expect(entries.map((e) => e.verseStart)).toEqual([5, 6, 7, 8]);
    expect(entries.map((e) => e.verseEnd)).toEqual([5, 6, 7, 8]);

    // The short entry is preserved verbatim.
    const v7 = entries.find((e) => e.verseStart === 7);
    expect(v7?.text).toBe('through him--John.');

    // The end-to-end query semantic the bug broke: asking for verse 7 returns
    // verse 7's text, NOT verse 6's.
    expect(commentaryForVerse(entries, 7)?.text).toBe('through him--John.');
    expect(commentaryForVerse(entries, 7)?.verseStart).toBe(7);

    // Verse 6 no longer swallows verse 7.
    const v6 = entries.find((e) => e.verseStart === 6);
    expect(v6?.verseEnd).toBe(6);
  });

  it('still spans ranges for section-based commentaries (no regression)', () => {
    // Matthew-Henry-style: one entry headlining a paragraph covering verses.
    const content: ApiVerse[] = [
      verse(1, 'In the beginning God created the heaven and the earth.'),
      verse(3, 'And God said, Let there be light: and there was light.'),
      verse(6, 'And God made two great lights.'),
    ];

    const entries = buildChapterEntries(content, SOURCE);

    expect(entries.map((e) => e.verseStart)).toEqual([1, 3, 6]);
    // verseEnd = nextStart - 1; the last entry closes on itself.
    expect(entries.map((e) => e.verseEnd)).toEqual([2, 5, 6]);
  });

  it('skips verses whose content extracts to empty text', () => {
    const content: ApiVerse[] = [
      verse(1, 'A verse with real text.'),
      { type: 'verse', number: 2, content: [{ type: 'note', noteId: 'n1' }] },
      verse(3, 'Another verse with real text.'),
    ];

    const entries = buildChapterEntries(content, SOURCE);

    // Verse 2 has no extractable text; it is not emitted as an empty entry.
    expect(entries.map((e) => e.verseStart)).toEqual([1, 3]);
  });

  it('ignores non-verse content items (headings, notes)', () => {
    const content: ApiVerse[] = [
      { type: 'heading', number: 0, content: ['Chapter 1'] },
      verse(1, 'The first verse commentary text.'),
      { type: 'note', number: 0, content: ['see also v. 3'] },
    ];

    const entries = buildChapterEntries(content, SOURCE);

    expect(entries.map((e) => e.verseStart)).toEqual([1]);
  });

  it('uses the full recursively-extracted text for each verse', () => {
    const content: ApiVerse[] = [
      {
        type: 'verse',
        number: 1,
        content: [
          { type: 'text', text: 'In the beginning' },
          { type: 'group', content: [' God created', { type: 'text', text: 'the heavens.' }] },
        ],
      },
    ];

    const entries = buildChapterEntries(content, SOURCE);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.text).toBe('In the beginning God created the heavens.');
  });

  it('stamps author, year, tradition, and sourceTitle on every entry', () => {
    const entries = buildChapterEntries([verse(1, 'A verse with real text.')], SOURCE);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      author: 'John Gill',
      year: 1763,
      tradition: 'Reformed Baptist',
      sourceTitle: "John Gill's Commentary",
      sourceUrl: '',
      verseStart: 1,
      verseEnd: 1,
      text: 'A verse with real text.',
    });
  });
});
