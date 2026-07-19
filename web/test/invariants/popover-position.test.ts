// Collision-aware popover placement (HIGHLIGHTER_POLISH §4): prefer above → flip below →
// clamp inside the viewport; horizontal shift keeps every edge on-screen. Pure math, so the
// never-clipped guarantee is unit-guarded.
import { describe, expect, it } from 'vitest';
import { placePopover, POPOVER_GAP, POPOVER_MARGIN } from '@/lib/popover-position';

const vp = { width: 1280, height: 800 };
const pop = { width: 320, height: 110 };
const anchor = (top: number, left: number, width = 200, height = 24) => ({
  top,
  left,
  bottom: top + height,
  right: left + width,
  width,
  height,
});

describe('placePopover — flip / shift / clamp', () => {
  it('prefers ABOVE the selection, horizontally centered', () => {
    const p = placePopover(anchor(400, 500), pop, vp);
    expect(p.side).toBe('above');
    expect(p.top).toBe(400 - POPOVER_GAP - pop.height);
    expect(p.left).toBe(500 + 100 - pop.width / 2); // anchor center 600, popover centered on it
  });

  it('flips BELOW when there is no headroom above', () => {
    const p = placePopover(anchor(40, 500), pop, vp);
    expect(p.side).toBe('below');
    expect(p.top).toBe(40 + 24 + POPOVER_GAP);
    // fully on-screen
    expect(p.top + pop.height).toBeLessThanOrEqual(vp.height - POPOVER_MARGIN);
  });

  it('shifts right when the anchor hugs the left edge (never off-screen left)', () => {
    const p = placePopover(anchor(400, 2, 40), pop, vp);
    expect(p.left).toBe(POPOVER_MARGIN);
  });

  it('shifts left when the anchor hugs the right edge (never off-screen right)', () => {
    const p = placePopover(anchor(400, 1250, 20), pop, vp);
    expect(p.left + pop.width).toBeLessThanOrEqual(vp.width - POPOVER_MARGIN);
  });

  it('when NEITHER side fits, clamps inside the viewport instead of clipping', () => {
    // A tall selection in a short viewport: no room above, no room below.
    const shortVp = { width: 1280, height: 200 };
    const p = placePopover(anchor(5, 500, 200, 185), pop, shortVp);
    expect(p.top).toBe(POPOVER_MARGIN); // pinned to the top margin, on-screen — not at -115
  });

  it('an anchor scrolled half out of view still yields an on-screen position (never negative)', () => {
    // The selection's rect went above the viewport (inner scroll container moved it up).
    const p = placePopover(anchor(-100, 500), pop, vp);
    expect(p.top).toBe(POPOVER_MARGIN);
  });
});
