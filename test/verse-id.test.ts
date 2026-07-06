import { describe, expect, it } from 'vitest';
import {
  encodeVerseId,
  decodeVerseId,
  isStructurallyValidVerseId,
  formatVerseId,
} from '../src/bible/verse-id.js';

describe('canonical verse IDs', () => {
  it('Genesis 1:1 = 1001001', () => {
    expect(encodeVerseId({ book: 1, chapter: 1, verse: 1 })).toBe(1001001);
  });

  it('John 3:16 = 43003016', () => {
    expect(encodeVerseId({ book: 43, chapter: 3, verse: 16 })).toBe(43003016);
  });

  it('round-trips', () => {
    expect(decodeVerseId(19119176)).toEqual({ book: 19, chapter: 119, verse: 176 });
  });

  it('validates chapter bounds per book', () => {
    expect(isStructurallyValidVerseId(19150001)).toBe(true); // Psalm 150:1
    expect(isStructurallyValidVerseId(19151001)).toBe(false); // Psalm 151 (not in the 66)
    expect(isStructurallyValidVerseId(1099001)).toBe(false); // Genesis 99
    expect(isStructurallyValidVerseId(67001001)).toBe(false); // book 67 reserved
    expect(isStructurallyValidVerseId(43003000)).toBe(false); // verse 0
  });

  it('formats human-readably', () => {
    expect(formatVerseId(43003016)).toBe('John 3:16');
  });
});
