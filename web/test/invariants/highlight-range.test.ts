// Sub-verse anchoring invariants (build task §1) — the two silent-break bugs, red-first.
// Both guards are proven RED by seeding the bug in src/lib/highlight-range.ts before shipping:
//   §1.1  anchor from v.text, not a DOM-relative offset  → seed offsetInVerse to drop the
//         preceding-piece sum (return offsetWithin) and the multi-piece case drifts.
//   §1.2  render by flattening ranges, not string-splicing → seed flattenToSegments to emit one
//         segment per raw range (no tiling) and the reconstruction of two overlapping highlights
//         no longer equals the verse text.
import { describe, expect, it } from 'vitest';
import { offsetInVerse, rangeToOffsets, flattenToSegments } from '@/lib/highlight-range';

describe('§1.1 anchor is an offset into v.text, never a DOM-relative offset', () => {
  // A highlighted verse renders as several text nodes: e.g. "For God " | "so loved" | " the world".
  // A selection whose DOM offset is 4 inside the THIRD piece is NOT character 4 of the verse.
  const pieces = ['For God '.length, 'so loved'.length, ' the world'.length]; // [8, 8, 10]

  it('sums the preceding pieces (a boundary in a later text node is not its raw DOM offset)', () => {
    // offset 4 within piece index 2 → 8 + 8 + 4 = 20 into v.text, not 4.
    expect(offsetInVerse(pieces, 2, 4)).toBe(20); // SEED: return offsetWithin → 4 (RED)
    expect(offsetInVerse(pieces, 0, 3)).toBe(3); // first piece is unaffected
    expect(offsetInVerse(pieces, 1, 0)).toBe(8); // start of the second piece
  });

  it('maps a selection spanning two text nodes to the right { start, end } in v.text', () => {
    // select from piece1@offset5 ("lo|ved") to piece2@offset4 (" the|") → [13, 20]
    expect(rangeToOffsets(pieces, 1, 5, 2, 4, 26)).toEqual({ start: 13, end: 20 });
  });

  it('normalizes a backwards selection and rejects a collapsed one', () => {
    expect(rangeToOffsets(pieces, 2, 4, 1, 5, 26)).toEqual({ start: 13, end: 20 }); // reversed → same span
    expect(rangeToOffsets(pieces, 0, 3, 0, 3, 26)).toBeNull(); // collapsed
  });

  it('clamps to the verse length (a trailing-space overshoot never exceeds v.text)', () => {
    expect(rangeToOffsets(pieces, 0, 0, 2, 999, 26)).toEqual({ start: 0, end: 26 });
  });
});

describe('§1.2 render by flattening immutable ranges, never string-splicing', () => {
  const text = 'For God so loved the world';

  // The tiling guarantee: slicing the verse by the segments and rejoining reproduces v.text
  // exactly — no gap, no duplication, no drift — no matter how the ranges overlap.
  const reconstruct = (segs: { start: number; end: number }[]) =>
    segs.map((s) => text.slice(s.start, s.end)).join('');

  it('two overlapping highlights tile [0, len] exactly, latest wins the overlap', () => {
    // H1 [0,11] yellow ("For God so "), H2 [7,26] green ("so loved the world") — overlap [7,11].
    const segs = flattenToSegments(text.length, [
      { start: 0, end: 11, color: 'yellow' },
      { start: 7, end: 26, color: 'green' },
    ]);
    expect(reconstruct(segs)).toBe(text); // SEED: one segment per raw range → reconstruction != text (RED)
    // contiguous, non-overlapping, covering [0, len]
    expect(segs[0]!.start).toBe(0);
    expect(segs[segs.length - 1]!.end).toBe(text.length);
    for (let i = 1; i < segs.length; i++) expect(segs[i]!.start).toBe(segs[i - 1]!.end);
    // the overlap [7,11] took the later color (green)
    const overlap = segs.find((s) => s.start <= 7 && 11 <= s.end && s.color === 'green');
    expect(overlap).toBeTruthy();
    expect(segs.find((s) => s.start === 0)!.color).toBe('yellow');
  });

  it('adjacent same-color ranges merge; a gap stays uncolored', () => {
    const segs = flattenToSegments(text.length, [
      { start: 0, end: 3, color: 'sky' },
      { start: 3, end: 7, color: 'sky' }, // adjacent, same color → one segment
    ]);
    expect(reconstruct(segs)).toBe(text);
    const colored = segs.filter((s) => s.color === 'sky');
    expect(colored).toHaveLength(1);
    expect(colored[0]).toMatchObject({ start: 0, end: 7 });
    // the remainder [7,26] is one uncolored run
    expect(segs.filter((s) => s.color === null)).toHaveLength(1);
  });

  it('no highlights → a single uncolored segment covering the whole verse', () => {
    expect(flattenToSegments(text.length, [])).toEqual([{ start: 0, end: text.length, color: null, textColor: null, id: undefined }]);
  });
});
