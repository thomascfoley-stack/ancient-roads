// TWO SWATCHES THAT LOOK THE SAME ARE ONE SWATCH — owner-reported from a screenshot, 2026-08-02.
//
// The palette shipped `yellow` (dot bg-yellow-400) beside `amber` (dot bg-amber-400): adjacent
// hues at the same Tailwind step, which render as two near-identical circles. A reader cannot tell
// which they picked, so a colour-coding scheme built on the row silently collapses — and the
// highlight is persisted under whichever id they did not mean.
//
// WHAT THIS CAN AND CANNOT PROVE. It cannot prove two colours are *perceptually* distinct; that is
// a judgement, and asserting it would need a colour-space model this repo has no reason to carry.
// What it can prove is the mechanical failure that produced the bug: two entries resolving to the
// same class string, or an id colliding, or the persisted-id set silently changing shape. The
// swatch row itself renders only for a signed-in reader, which a test environment has no session
// for — so the visual check belongs to a human, and is recorded in the WORKLOG rather than faked
// here.

import { describe, expect, it } from 'vitest';
import { HIGHLIGHT_BG, HIGHLIGHT_COLORS } from '@/lib/highlight-colors';

describe('the highlight palette', () => {
  it('has no two entries that render identically', () => {
    // RED-PROOF: set amber's dot back to bg-amber-400 beside yellow's bg-yellow-400 -> two entries
    // whose (bg, dot) pair is not identical but whose DOT is, which is what the reader sees on the
    // row. Both axes are checked because the dot is the picker and the bg is the mark.
    const dots = HIGHLIGHT_COLORS.map((c) => c.dot);
    const bgs = HIGHLIGHT_COLORS.map((c) => c.bg);
    expect(new Set(dots).size, `duplicate dot classes: ${dots.join(', ')}`).toBe(dots.length);
    expect(new Set(bgs).size, `duplicate bg classes: ${bgs.join(', ')}`).toBe(bgs.length);
  });

  it('has no duplicate ids — ids are what persist', () => {
    const ids = HIGHLIGHT_COLORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every id resolves to a background, and HIGHLIGHT_BG has nothing extra', () => {
    // A colour in the picker with no bg entry paints nothing when re-rendered from the server.
    for (const c of HIGHLIGHT_COLORS) expect(HIGHLIGHT_BG[c.id], `${c.id} has no background`).toBe(c.bg);
    expect(Object.keys(HIGHLIGHT_BG).sort()).toEqual(HIGHLIGHT_COLORS.map((c) => c.id).sort());
  });

  it('keeps the ids that are already in the database', () => {
    // APPEND-ONLY. `highlights.color` is a bare TEXT column with no CHECK constraint, so a rename
    // does not fail loudly at the DB — it silently orphans every row a reader already saved, which
    // then renders unstyled. Removing an id from this list is a deliberate act that edits this test.
    const SHIPPED = ['yellow', 'green', 'sky', 'pink', 'amber'];
    for (const id of SHIPPED) {
      expect(HIGHLIGHT_COLORS.map((c) => c.id), `"${id}" was shipped and may be in saved rows`).toContain(id);
    }
  });

  it('offers enough colours to be worth coding with, and few enough to fit a 390px row', () => {
    // The row is horizontally scrollable, but a picker nobody can aim at is not a picker.
    expect(HIGHLIGHT_COLORS.length).toBeGreaterThanOrEqual(8);
    expect(HIGHLIGHT_COLORS.length).toBeLessThanOrEqual(12);
  });
});
