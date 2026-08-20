// Sub-verse highlight anchoring (build task §1). Two silent-break bugs live here, so the
// load-bearing logic is PURE and unit-tested; only the unavoidable DOM glue
// (rangeToOffsetsInContainer) touches the browser, and it delegates all arithmetic to the
// tested core. The math is container-generic: it anchors offsets into ANY canonical text whose
// container's text nodes concatenate to it — a verse today, a work section (Phase 2) tomorrow.
//
// BUG 1 — anchor from the canonical verse text, never from a DOM-relative selection offset.
//   The verse element holds a <sup> number and, once highlighted, nested <span> segments, so
//   the verse text is split across several text nodes. range.startOffset is relative to ONE
//   node; used directly it drifts by the length of every preceding node. offsetInVerse sums the
//   preceding pieces so the stored { start, end } are offsets into v.text — stable across
//   re-renders and across how many segment spans currently exist.
//
// BUG 2 — render by flattening immutable ranges into segments, never by string-splicing.
//   Splicing one highlight into the text, then the next, compounds: overlapping or adjacent
//   ranges shift each other's indices and corrupt the text. flattenToSegments computes a single
//   non-overlapping tiling of [0, len] from the immutable ranges, so the text is never mutated.

/** Offset into the verse text for a selection boundary that DOM-reports as
 *  (pieceIndex, offsetWithinPiece), where `pieceLengths` are the verse container's text-node
 *  lengths in document order. Summing the preceding pieces is the whole fix for BUG 1. */
export function offsetInVerse(pieceLengths: number[], pieceIndex: number, offsetWithin: number): number {
  let acc = 0;
  for (let i = 0; i < pieceIndex && i < pieceLengths.length; i++) acc += pieceLengths[i] ?? 0;
  return acc + offsetWithin;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Expand a [start, end) range to whole-word boundaries (§3: snap selection to words), then trim
 *  any whitespace the expansion pulled in at the edges. Returns null if nothing is left. */
export function snapToWords(text: string, start: number, end: number): { start: number; end: number } | null {
  let s = clamp(Math.min(start, end), 0, text.length);
  let e = clamp(Math.max(start, end), 0, text.length);
  // Trim to the actually-selected non-whitespace content first, so a selection that starts on a
  // boundary space doesn't reach back into the previous word.
  while (s < e && /\s/.test(text[s]!)) s++;
  while (e > s && /\s/.test(text[e - 1]!)) e--;
  if (s >= e) return null; // empty or all-whitespace selection
  // Then expand outward to whole-word boundaries.
  while (s > 0 && /\S/.test(text[s - 1]!)) s--;
  while (e < text.length && /\S/.test(text[e]!)) e++;
  return { start: s, end: e };
}

/** Map a selection (as text-piece indices/offsets) to a { start, end } range within v.text.
 *  Returns null for a collapsed/empty/out-of-range selection. */
export function rangeToOffsets(
  pieceLengths: number[],
  startPiece: number,
  startOffset: number,
  endPiece: number,
  endOffset: number,
  textLen: number,
): { start: number; end: number } | null {
  let start = offsetInVerse(pieceLengths, startPiece, startOffset);
  let end = offsetInVerse(pieceLengths, endPiece, endOffset);
  if (start > end) [start, end] = [end, start];
  start = clamp(start, 0, textLen);
  end = clamp(end, 0, textLen);
  if (start >= end) return null;
  return { start, end };
}

/** Whole-word tokens with their char offsets into `text` — deterministic, so the tap-mode
 *  targets verse-display renders carry exactly the offsets a two-tap span persists. Words are
 *  maximal non-whitespace runs, matching what snapToWords keeps (trailing punctuation rides
 *  with its word in both). */
export function wordTokens(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ start: m.index, end: m.index + m[0].length });
  return out;
}

export interface HighlightRange {
  start: number;
  end: number;
  color: string; // background color key (HIGHLIGHT_COLORS id)
  textColor?: string | null; // reserved for the later text-color tool; ignored for now
  id?: string;
  /** Just written this session (not hydrated from the server) — the mark blooms once on render. */
  fresh?: boolean;
}
export interface Segment {
  start: number;
  end: number;
  color: string | null; // null = unhighlighted run
  textColor?: string | null;
  id?: string;
  fresh?: boolean;
}

/** Flatten immutable highlight ranges into a contiguous, non-overlapping tiling of [0, textLen].
 *  Later ranges win on overlap (they were applied more recently — caller passes creation order).
 *  Guarantee: the segments partition [0, textLen] exactly, so text.slice-ing them and rejoining
 *  reproduces the original verse text with no gaps, duplication, or drift (BUG 2). */
export function flattenToSegments(textLen: number, highlights: HighlightRange[]): Segment[] {
  if (textLen <= 0) return [];
  const bounds = new Set<number>([0, textLen]);
  for (const h of highlights) {
    bounds.add(clamp(h.start, 0, textLen));
    bounds.add(clamp(h.end, 0, textLen));
  }
  const cuts = [...bounds].sort((a, b) => a - b);
  const out: Segment[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const lo = cuts[i]!;
    const hi = cuts[i + 1]!;
    if (lo >= hi) continue;
    // The last highlight that fully covers this elementary interval wins.
    let winner: HighlightRange | null = null;
    for (const h of highlights) {
      if (h.start <= lo && hi <= h.end) winner = h;
    }
    out.push({
      start: lo,
      end: hi,
      color: winner?.color ?? null,
      textColor: winner?.textColor ?? null,
      id: winner?.id,
      fresh: winner?.fresh,
    });
  }
  // Merge adjacent runs that render identically, so the DOM stays minimal.
  const merged: Segment[] = [];
  for (const s of out) {
    const last = merged[merged.length - 1];
    if (last && last.color === s.color && last.textColor === s.textColor && last.id === s.id && last.fresh === s.fresh && last.end === s.start) {
      last.end = s.end;
    } else {
      merged.push({ ...s });
    }
  }
  return merged;
}

// ---- DOM glue (browser only) -----------------------------------------------------------------
// Walk the annotatable container's text nodes and hand the arithmetic to the tested core above.
// The container is the element that holds ONLY the canonical text (for a verse: never the <sup>
// number), so its text nodes concatenate to that text (plus any trailing space, which clamps
// away). This is the §3 offset invariant both readers share.

function textNodesOf(root: Element): Text[] {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  return nodes;
}

/** Locate a selection boundary node among the container's text nodes. If the boundary is on an
 *  element (offset = child index), resolve to the nearest enclosed text node. */
function pieceIndexOf(nodes: Text[], node: Node, offset: number): { piece: number; offset: number } | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const i = nodes.indexOf(node as Text);
    return i === -1 ? null : { piece: i, offset };
  }
  // Element boundary: map to the first text node at/after the child index, offset 0.
  const child = node.childNodes[offset] ?? node.childNodes[node.childNodes.length - 1] ?? null;
  for (let i = 0; i < nodes.length; i++) {
    if (child && (nodes[i] === child || child.contains(nodes[i]))) return { piece: i, offset: 0 };
  }
  return nodes.length ? { piece: nodes.length - 1, offset: nodes[nodes.length - 1]!.length } : null;
}

/** Browser adapter: DOM Range + annotatable container → { start, end } offsets into the
 *  container's canonical text (v.text / sections.body). Formerly `rangeToVerseOffsets`; the
 *  logic was always container-generic — the name was the only verse coupling. */
export function rangeToOffsetsInContainer(range: Range, container: Element, textLen: number): { start: number; end: number } | null {
  // A START outside the container is still refused: `useTextAnnotation` resolves its target FROM
  // the start node, so a start elsewhere means the caller asked about the wrong container, and
  // clamping it would be a guess at which verse the reader meant.
  if (!container.contains(range.startContainer)) return null;
  const nodes = textNodesOf(container);
  if (nodes.length === 0) return null;
  const s = pieceIndexOf(nodes, range.startContainer, range.startOffset);
  if (!s) return null;
  // AN END OUTSIDE THE CONTAINER CLAMPS TO THIS CONTAINER'S END, rather than voiding the whole
  // selection. It used to be half of one guard with the start check, so a drag that crossed a
  // verse boundary returned null — `pending` went null and the popover never mounted. The reader
  // dragged, released, and the app did nothing at all: no highlight, no popover, no message
  // (B047, 2026-08-16 QA fleet).
  //
  // Clamping is the repair, not multi-verse spanning. Highlights ARE stored per verse so spanning
  // is buildable, but it changes what `useTextAnnotation` returns and that hook serves two other
  // surfaces — a design change, filed separately. Clamping is visible in its result: the highlight
  // paints on the first verse only, which tells the reader exactly what happened.
  const lastNode = nodes[nodes.length - 1]!;
  const e = container.contains(range.endContainer)
    ? pieceIndexOf(nodes, range.endContainer, range.endOffset)
    : pieceIndexOf(nodes, lastNode, lastNode.length);
  if (!e) return null;
  const lengths = nodes.map((n) => n.length);
  return rangeToOffsets(lengths, s.piece, s.offset, e.piece, e.offset, textLen);
}
