// Sermon-shaped metadata, extracted not typed (docs/MY_WORKS_DRAFT_AND_METADATA_DESIGN.md §2).
//
// Pure function over the manuscript head. The bar is PRECISION over recall — a wrong suggestion
// is a chip beside the user's own title, so "no suggestion" always beats a guess. Date grammar
// is deliberately named-month-only: "3/4/1871" is ambiguous two ways and never suggested.

import { describe, expect, it } from 'vitest';
import { extractSermonMetadata, METADATA_HEAD_CHARS } from '../../src/lib/user-corpus/metadata-extract';

describe('extractSermonMetadata', () => {
  it('finds the stated text and a named-month date in a classic sermon head', () => {
    const head = [
      'DAILY BLESSINGS FOR GOD\'S PEOPLE',
      'A sermon delivered on Thursday Evening, 21st September, 1871, by C. H. Spurgeon.',
      '"Blessed be the Lord, who daily loadeth us with benefits." — Psalm 68:19-20.',
      'WE observe that this Psalm is a very difficult one.',
    ].join('\n\n');
    const m = extractSermonMetadata(head);
    expect(m.reference).toBe('Psalms 68:19–20'); // canonical display uses the book's full name
    expect(m.date).toBe('1871-09-21');
  });

  it('month-name-first American form parses; ambiguous numerics never do', () => {
    expect(extractSermonMetadata('Preached March 4, 2019.\n\nRomans 8:28 is our text.').date).toBe('2019-03-04');
    expect(extractSermonMetadata('Preached 3/4/2019.\n\nRomans 8:28 is our text.').date).toBeNull();
  });

  it('takes the FIRST explicit citation as the stated text, not a later one', () => {
    const m = extractSermonMetadata('Our text is John 3:16. Compare Romans 5:8 later.');
    expect(m.reference).toBe('John 3:16');
  });

  it('a head with no citation and no date suggests nothing', () => {
    const m = extractSermonMetadata('Notes on the vestry meeting, agenda and minutes, nothing scriptural.');
    expect(m.reference).toBeNull();
    expect(m.date).toBeNull();
  });

  it('only reads the head — a citation buried past the window is not a "stated text"', () => {
    const filler = 'word '.repeat(Math.ceil(METADATA_HEAD_CHARS / 5) + 50);
    const m = extractSermonMetadata(`${filler} John 3:16 says so.`);
    expect(m.reference).toBeNull();
  });

  it('rejects impossible calendar dates rather than normalising them', () => {
    expect(extractSermonMetadata('Preached February 30, 1901.\n\nJohn 3:16.').date).toBeNull();
    expect(extractSermonMetadata('Preached September 31, 1901.\n\nJohn 3:16.').date).toBeNull();
  });
});
