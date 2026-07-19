// Pure, collision-aware placement for the selection popover (HIGHLIGHTER_POLISH §4).
// The popover needs exactly prefer-above → flip-below → clamp-in-viewport plus horizontal
// shift — small enough to keep pure and unit-tested rather than pulling in a positioning
// dependency. Viewport coordinates in, position:fixed coordinates out.

export interface AnchorRect {
  top: number;
  left: number;
  bottom: number;
  right: number;
  width: number;
  height: number;
}

export interface PopoverSize {
  width: number;
  height: number;
}

export interface Placement {
  top: number;
  left: number;
  side: 'above' | 'below';
}

/** Gap between the selection and the popover. */
export const POPOVER_GAP = 10;
/** Minimum clearance from every viewport edge. */
export const POPOVER_MARGIN = 8;

export function placePopover(
  anchor: AnchorRect,
  pop: PopoverSize,
  viewport: { width: number; height: number },
  gap: number = POPOVER_GAP,
  margin: number = POPOVER_MARGIN,
): Placement {
  // Prefer ABOVE the selection: a drag usually ends at its bottom edge, so above stays clear
  // of both the cursor and (on touch) the OS selection handles.
  let side: 'above' | 'below' = 'above';
  let top = anchor.top - gap - pop.height;
  if (top < margin) {
    // Flip below when there is no headroom above.
    const below = anchor.bottom + gap;
    if (below + pop.height <= viewport.height - margin) {
      side = 'below';
      top = below;
    }
  }
  // Never clipped, whatever the anchor did (it may have scrolled partly out of view):
  // clamp fully inside the viewport. The top margin wins when the viewport is shorter
  // than the card.
  top = Math.min(Math.max(top, margin), Math.max(margin, viewport.height - margin - pop.height));
  // Shift horizontally: center on the anchor, clamped to the viewport with margin.
  const center = anchor.left + anchor.width / 2;
  const left = Math.min(
    Math.max(center - pop.width / 2, margin),
    Math.max(margin, viewport.width - margin - pop.width),
  );
  return { top, left, side };
}
