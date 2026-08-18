// B030 — the paragraph around a match, so "+ Add to study" stops inserting whole chapters.
//
// The owner's ruling: insert the surrounding paragraph, let the reader widen later, because
// subtracting is the 100% case and adding is the occasional one. This is the pure half; the
// stored bytes are untouched (migration 111 "trim not edit" — these offsets are a VIEW).
import { describe, expect, it } from 'vitest';
import { paragraphAround } from '../src/lib/paragraph-around';

const TEXT = 'First paragraph about faith.\n\nSecond paragraph mentions grace abounding here.\n\nThird paragraph about hope.';

describe('paragraphAround', () => {
  it('returns only the paragraph containing the match', () => {
    // SEED: return the whole text -> RED. That is the defect as filed.
    const r = paragraphAround(TEXT, 'grace abounding')!;
    expect(TEXT.slice(r.start, r.end)).toBe('Second paragraph mentions grace abounding here.');
  });

  it('is case-insensitive, like the search that produced the match', () => {
    const r = paragraphAround(TEXT, 'GRACE ABOUNDING')!;
    expect(TEXT.slice(r.start, r.end)).toContain('grace abounding');
  });

  it('falls back to single newlines — OCR prose often has no blank lines', () => {
    const t = 'Line one about faith.\nLine two about grace.\nLine three.';
    const r = paragraphAround(t, 'about grace')!;
    expect(t.slice(r.start, r.end)).toBe('Line two about grace.');
  });

  it('places a match by its first words when the snippet has been re-spaced', () => {
    const r = paragraphAround(TEXT, 'Second paragraph   mentions   grace')!;
    expect(TEXT.slice(r.start, r.end)).toContain('Second paragraph');
  });

  it('returns null when the paragraph IS the whole section — a no-op trim is worse than none', () => {
    expect(paragraphAround('One single paragraph about grace.', 'grace')).toBeNull();
  });

  it('returns null on no match, empty text, or a too-short hint to place honestly', () => {
    expect(paragraphAround(TEXT, 'nowhere in the text')).toBeNull();
    expect(paragraphAround('', 'grace')).toBeNull();
    expect(paragraphAround(TEXT, '  ')).toBeNull();
  });

  it('the view never opens or closes on whitespace', () => {
    const t = 'A.\n\n   padded paragraph with grace   \n\nB.';
    const r = paragraphAround(t, 'grace')!;
    const slice = t.slice(r.start, r.end);
    expect(slice).toBe(slice.trim());
  });
});
