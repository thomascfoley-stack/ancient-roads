// "SECTION 109" WAS NOT A DESIGN DECISION — 2026-08-02, owner-reported.
//
// Every commentary section in the corpus has `heading IS NULL`, because
// `src/ingest/migrate-sections-slice.ts` inserts (source_id, ordinal, body, source_url) and never
// writes the column. So the Book Reader's fallback — `Section ${ordinal}` — was what a reader
// actually saw for all 72,863 of them: a filing-cabinet label on a work whose sections each ARE a
// passage. Sermons (ingest-sermon.ts) and historians (ingest-historian.ts) build real headings at
// ingest and were never affected; this is specific to the verse-anchored works.
//
// The fix does NOT backfill `heading`, and that restraint is the interesting part. Filling it
// would have (a) reclassified every commentary under migration 024, whose verse-anchored branch is
// selected BY `heading IS NULL`, turning chapter units into per-verse fragments, (b) moved
// `unit_ordinal` and therefore the G10 rollup digest, tripping the production ratchet, and
// (c) rewritten `sections.tsv` — a generated column over `heading || body` — for every row, which
// is a retrieval change requiring its own accuracy run. The label is derived at read time instead.

import { describe, expect, it } from 'vitest';
import { formatVerseRange, groupTocByUnit, sectionLabel } from '@/lib/work-reader';
import type { WorkTocRow } from '@/lib/work';

const row = (p: Partial<WorkTocRow>): WorkTocRow => ({
  id: 1,
  ordinal: 1,
  unitOrdinal: 1,
  heading: null,
  verseStart: null,
  verseEnd: null,
  ...p,
});

// John 3:16 = book 43, chapter 3, verse 16 → 43*1e6 + 3*1e3 + 16.
const JOHN_3_16 = 43_003_016;
const JOHN_3_18 = 43_003_018;
const JOHN_4_2 = 43_004_002;
const JUDE_1_3 = 65_001_003; // Jude has exactly one chapter

describe('sectionLabel', () => {
  it('names a commentary section by its passage, not its ordinal', () => {
    // SEED: return `Section ${row.ordinal}` first -> RED. This is the reported defect.
    expect(sectionLabel(row({ ordinal: 109, verseStart: JOHN_3_16, verseEnd: JOHN_3_16 }))).toBe('John 3:16');
  });

  it('renders a within-chapter range compactly', () => {
    expect(sectionLabel(row({ ordinal: 109, verseStart: JOHN_3_16, verseEnd: JOHN_3_18 }))).toBe('John 3:16-18');
  });

  it('spells out a range that crosses a chapter', () => {
    expect(sectionLabel(row({ verseStart: JOHN_3_16, verseEnd: JOHN_4_2 }))).toBe('John 3:16 - 4:2');
  });

  it('PREFERS a real heading — sermons and historians must be untouched', () => {
    // The regression that would matter most: "fixing" commentaries by overwriting the titles the
    // sermon and historian adapters already build.
    expect(sectionLabel(row({ heading: 'TALKS TO FARMERS — PROVERBS 24:30-32', verseStart: JOHN_3_16 })))
      .toBe('TALKS TO FARMERS — PROVERBS 24:30-32');
    expect(sectionLabel(row({ heading: 'The War of the Jews — Book 6 — Chapter 4' })))
      .toBe('The War of the Jews — Book 6 — Chapter 4');
  });

  it('treats a blank heading as no heading', () => {
    expect(sectionLabel(row({ heading: '   ', verseStart: JOHN_3_16, verseEnd: JOHN_3_16 }))).toBe('John 3:16');
  });

  it('falls back to the ordinal only when there is nothing else — and never to a nonsense reference', () => {
    expect(sectionLabel(row({ ordinal: 7 }))).toBe('Section 7');
    // A structurally invalid id must NOT format as "Book 0 0:0": a fake-looking passage in the
    // table of contents is worse than an honest ordinal, because a reader would trust it.
    expect(sectionLabel(row({ ordinal: 7, verseStart: 999_999_999 }))).toBe('Section 7');
    expect(sectionLabel(row({ ordinal: 7, verseStart: -1 }))).toBe('Section 7');
    expect(sectionLabel(row({ ordinal: 7, verseStart: 0 }))).toBe('Section 7');
  });
});

describe('formatVerseRange', () => {
  it('is null when there is nothing to format, so callers can fall through', () => {
    expect(formatVerseRange(null, null)).toBeNull();
    expect(formatVerseRange(999_999_999, null)).toBeNull();
  });

  it('ignores an end that is invalid or in another book rather than inventing a span', () => {
    expect(formatVerseRange(JOHN_3_16, 999_999_999)).toBe('John 3:16');
    expect(formatVerseRange(JOHN_3_16, 1_001_001)).toBe('John 3:16'); // Genesis 1:1 as an "end"
  });
});

describe('groupTocByUnit labels the unit as a CHAPTER', () => {
  it('a verse-anchored unit reads "John 3", and its sections read "John 3:16"', () => {
    // This is the shape the owner asked for: chapter names, like the works that already have them.
    const units = groupTocByUnit([
      row({ id: 1, ordinal: 1, unitOrdinal: 3, verseStart: JOHN_3_16, verseEnd: JOHN_3_16 }),
      row({ id: 2, ordinal: 2, unitOrdinal: 3, verseStart: JOHN_3_18, verseEnd: JOHN_3_18 }),
    ]);
    expect(units).toHaveLength(1);
    expect(units[0]!.label).toBe('John 3');
    expect(units[0]!.rows.map(sectionLabel)).toEqual(['John 3:16', 'John 3:18']);
  });

  it('a one-chapter book reads "Jude", not "Jude 1"', () => {
    const units = groupTocByUnit([row({ unitOrdinal: 1, verseStart: JUDE_1_3, verseEnd: JUDE_1_3 })]);
    expect(units[0]!.label).toBe('Jude');
  });

  it('a unit whose first row has a real heading keeps it', () => {
    const units = groupTocByUnit([
      row({ id: 1, ordinal: 1, unitOrdinal: 1, heading: 'Sermon I (1/3)' }),
      row({ id: 2, ordinal: 2, unitOrdinal: 1, heading: 'Sermon I (2/3)' }),
    ]);
    expect(units[0]!.label).toBe('Sermon I (1/3)');
    expect(units[0]!.rows).toHaveLength(2);
  });

  it('still groups by unit_ordinal, unchanged', () => {
    // The labelling change must not disturb the grouping migration 024 and the TOC depend on.
    const units = groupTocByUnit([
      row({ id: 1, ordinal: 1, unitOrdinal: 1 }),
      row({ id: 2, ordinal: 2, unitOrdinal: 1 }),
      row({ id: 3, ordinal: 3, unitOrdinal: 2 }),
    ]);
    expect(units.map((u) => u.rows.length)).toEqual([2, 1]);
  });
});
