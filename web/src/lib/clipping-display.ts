// The ONE trim display rule (migration 111; owner ruling 2026-08-13 "trim, not edit").
// A trimmed clipping stores OFFSETS into the server-snapshotted quote — never edited text —
// and every surface derives the visible excerpt through this function: the editor, the
// markdown export, the .docx model, and the print view. A second derivation is how one of
// them would eventually show a range the others don't.
//
// CLIENT-SAFE ON PURPOSE: no imports, no DB — the editor is a client component and must share
// this exact rule with the server-side exports (the same reason servability.ts stays OUT of
// the editor bundle).
//
// FAIL-SAFE, NOT FAIL-CLOSED — deliberately, and the difference matters: licensing decisions
// (tombstones) fail CLOSED in servability.ts; the trim is the user's own view preference over
// text the licensing rule already admitted, so an invalid range (e.g. offsets that outlived a
// purge → re-hydration that changed the quote's length) falls back to the FULL quote rather
// than crashing or hiding an admitted quote.

export interface TrimmableClipping {
  quote: string | null;
  trim_start?: number | null;
  trim_end?: number | null;
}

export interface ClippingDisplay {
  /** What to show: the full quote, or the kept range with ellipses marking the cuts. */
  text: string;
  trimmed: boolean;
}

export function clippingDisplay(block: TrimmableClipping): ClippingDisplay {
  const quote = block.quote ?? '';
  const start = block.trim_start;
  const end = block.trim_end;
  if (
    start === null || start === undefined ||
    end === null || end === undefined ||
    !Number.isInteger(start) || !Number.isInteger(end) ||
    start < 0 || end <= start || end > quote.length
  ) {
    return { text: quote, trimmed: false };
  }
  const kept = quote.slice(start, end).trim();
  if (!kept) return { text: quote, trimmed: false };
  // Standard quotation practice: an ellipsis marks each cut edge, so the excerpt never
  // presents itself as the whole.
  return {
    text: `${start > 0 ? '… ' : ''}${kept}${end < quote.length ? ' …' : ''}`,
    trimmed: true,
  };
}
