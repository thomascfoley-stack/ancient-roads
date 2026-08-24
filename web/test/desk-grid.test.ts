// UX-3 — THE DESK GRID HAS A SHAPE TABLE, AND THE CEILING IS 4x4.
//
// The desk grew from "up to 3 panes in a row" to a grid (owner: "we're gonna have to go to a
// 4x4, not a side-by-side aspect"). The layout's geometry is a PURE function — deskGridShape —
// because a grid computed in CSS from `auto-fill` would place panes differently depending on
// viewport width, and the desk's contract is that a shared URL looks the same for the person
// who received it. The shape table below is the whole model, pinned cell by cell: 16 panes is
// 4x4, and nothing past 4 columns or 4 rows exists at any count — the parser's ceiling and the
// grid's are the same number (MAX_PANES), so a URL can never decode a desk the grid cannot
// place.

import { describe, expect, it } from 'vitest';
import { MAX_PANES, deskGridShape } from '@/lib/desk';

describe('the 4x4 ceiling', () => {
  it('MAX_PANES is 16 — the owner’s stated 4x4, and the parser’s bound on hostile URLs', () => {
    // Pinned as a literal, not derived: a silent edit back to 3 (or up to "unbounded") is a
    // build event, not a detail. The rationale lives in desk.ts's header comment.
    expect(MAX_PANES).toBe(16);
  });
});

describe('deskGridShape', () => {
  // [panes, cols, rows] — the whole table, so every boundary is explicit and reviewable.
  const TABLE: [number, number, number][] = [
    [1, 1, 1],
    [2, 2, 1],
    [3, 2, 2],
    [4, 2, 2],
    [5, 3, 2],
    [6, 3, 2],
    [7, 3, 3],
    [8, 3, 3],
    [9, 3, 3],
    [10, 4, 3],
    [11, 4, 3],
    [12, 4, 3],
    [13, 4, 4],
    [14, 4, 4],
    [15, 4, 4],
    [16, 4, 4],
  ];
  for (const [n, cols, rows] of TABLE) {
    it(`${n} pane${n === 1 ? '' : 's'} → ${cols}x${rows}`, () => {
      expect(deskGridShape(n)).toEqual({ cols, rows });
    });
  }

  it('holds every pane: cols × rows is never smaller than the count', () => {
    for (let n = 1; n <= MAX_PANES; n++) {
      const { cols, rows } = deskGridShape(n);
      expect(cols * rows).toBeGreaterThanOrEqual(n);
    }
  });

  it('never exceeds 4x4, at any input — the grid cannot overflow the ceiling', () => {
    for (const n of [0, 1, 17, 100, 10_000, -3, Number.NaN]) {
      const { cols, rows } = deskGridShape(n);
      expect(cols).toBeGreaterThanOrEqual(1);
      expect(cols).toBeLessThanOrEqual(4);
      expect(rows).toBeGreaterThanOrEqual(1);
      expect(rows).toBeLessThanOrEqual(4);
    }
  });
});
