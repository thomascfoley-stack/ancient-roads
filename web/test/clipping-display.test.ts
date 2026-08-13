import { describe, expect, it } from 'vitest';
import { clippingDisplay } from '../src/lib/clipping-display';

// The ONE trim display rule (migration 111, "trim not edit"). Properties:
//   - no offsets → the full quote, untrimmed;
//   - a valid range → the kept slice with an ellipsis at each CUT edge (never at an uncut one);
//   - anything invalid — reversed, negative, past the end, half a pair, offsets that outlived a
//     purge/re-hydration — falls back to the FULL quote (fail-SAFE: the trim is a view over
//     text licensing already admitted; hiding or crashing would punish the user for corpus
//     churn they cannot see).
// Red-proof: these were written against the implementation and each case watched to fail by
// inverting the guard under test (e.g. `end > quote.length` flipped) during development.

const QUOTE = 'And Jesus himself began to be about thirty years of age.';

describe('clippingDisplay', () => {
  it('returns the full quote when no trim is stored', () => {
    expect(clippingDisplay({ quote: QUOTE })).toEqual({ text: QUOTE, trimmed: false });
    expect(clippingDisplay({ quote: QUOTE, trim_start: null, trim_end: null })).toEqual({ text: QUOTE, trimmed: false });
  });

  it('keeps the selected range with ellipses at both cut edges', () => {
    const d = clippingDisplay({ quote: QUOTE, trim_start: 4, trim_end: 25 });
    expect(d.trimmed).toBe(true);
    // Both edges are cuts (4 > 0, 25 < length): ellipsis on each side of the kept slice.
    expect(d.text).toBe(`… ${QUOTE.slice(4, 25).trim()} …`);
    expect(d.text).toContain('Jesus himself began');
    expect(d.text).not.toContain('years of age');
  });

  it('a range touching the start omits the leading ellipsis', () => {
    const d = clippingDisplay({ quote: QUOTE, trim_start: 0, trim_end: 9 });
    expect(d.text.startsWith('…')).toBe(false);
    expect(d.text.endsWith('…')).toBe(true);
    expect(d.text).toContain('And Jesus');
  });

  it('a range touching the end omits the trailing ellipsis', () => {
    const d = clippingDisplay({ quote: QUOTE, trim_start: 36, trim_end: QUOTE.length });
    expect(d.text.startsWith('…')).toBe(true);
    expect(d.text.endsWith('…')).toBe(false);
    expect(d.text).toContain('thirty years of age.');
  });

  it('fails SAFE to the full quote on every invalid shape', () => {
    const full = { text: QUOTE, trimmed: false };
    expect(clippingDisplay({ quote: QUOTE, trim_start: 10, trim_end: 5 })).toEqual(full); // reversed
    expect(clippingDisplay({ quote: QUOTE, trim_start: -1, trim_end: 5 })).toEqual(full); // negative
    expect(clippingDisplay({ quote: QUOTE, trim_start: 0, trim_end: QUOTE.length + 10 })).toEqual(full); // outlived a re-hydration
    expect(clippingDisplay({ quote: QUOTE, trim_start: 3, trim_end: null })).toEqual(full); // half a pair
    expect(clippingDisplay({ quote: QUOTE, trim_start: 2.5 as number, trim_end: 9 })).toEqual(full); // non-integer
  });

  it('a whitespace-only kept range falls back to the full quote', () => {
    const spaced = 'word   word';
    expect(clippingDisplay({ quote: spaced, trim_start: 4, trim_end: 7 })).toEqual({ text: spaced, trimmed: false });
  });

  it('a purged quote (tombstone) yields empty text and no trim', () => {
    expect(clippingDisplay({ quote: null, trim_start: 0, trim_end: 5 })).toEqual({ text: '', trimmed: false });
  });
});
