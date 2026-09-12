// "Have I preached this before?" — the draft check (docs/MY_WORKS_DRAFT_AND_METADATA_DESIGN.md §1).
//
// The daily-use loop's three questions fused into one action (SERMON_SEARCH_DESIGN §1): paste a
// draft → the passages it engages (SHIPPED anchoring, detection live) → your own documents on
// those passages (the presence fast path) → the tradition's voices on the same ground (the ONE
// gap SQL body, traditionGapForRanges).
//
// ZERO EMBEDDING SPEND, by construction: everything here is the anchor channel plus indexed DB
// reads. The semantic (paraphrase) overlap leg is out of scope v1 and the UI says so — "matched
// by quoted Scripture" — rather than implying coverage this path does not have.

import { MIN_VERSE_SHINGLES, SHIPPED_K, anchorChunk } from './anchor';
import { detectDocumentTranslation, getAnchorIndexFor } from './bible-index';
import { chunkProse } from './chunk';
import { verseDocScan, MAX_LIMIT } from './search';
import { traditionGapForRanges, type CorpusPredicate, type TraditionGapResult } from './tradition-gap';
import type { Detection } from './translation-detect';

/** Long enough for any sermon manuscript; a book-length paste is refused, not truncated. */
export const DRAFT_MAX_CHARS = 120_000;
/** Ranges carried into the presence scans and the gap join — the tradition-gap bound. */
export const DRAFT_MAX_RANGES = 60;
/**
 * Cap on the documents returned per overlap range. The hazard (below) is a LIMIT on RAW ANCHOR
 * ROWS before the per-document collapse; this cap is applied AFTER the collapse, so it counts
 * DOCUMENTS. Mirrors `MAX_VOICES` in tradition-gap.ts — the "Worst case equals one document's
 * existing voices panel" line in the design doc.
 */
export const DRAFT_MAX_OVERLAP_DOCS = 50;

export interface DraftRange {
  start: number;
  end: number;
  channel: string;
}

export interface DraftOverlap {
  range: DraftRange;
  /** The user's own documents anchored on this range — collapsed per document, strongest first. */
  documents: { documentId: string; title: string; channel: string; matchCount: number | null }[];
  /**
   * True when more matching documents exist than `documents` carries. The cap is applied AFTER the
   * per-document collapse (so the LIMIT counts documents, not anchor rows — tradition-gap.ts's
   * MULTIPLICATION HAZARD), and a truncated list is signalled rather than presented as the whole
   * answer — the same honesty the route's own DRAFT_MAX_CHARS refusal applies to the input, here
   * applied to the output.
   */
  truncated: boolean;
}

export interface DraftCheckResult {
  detection: Pick<Detection, 'translation' | 'confidence' | 'totalHits'>;
  ranges: DraftRange[];
  overlaps: DraftOverlap[];
  gaps: TraditionGapResult;
}

/** Anchor a pasted draft in-process — pure except for the memoised index loads. */
export function anchorDraft(text: string): { detection: Detection; ranges: DraftRange[] } {
  const detection = detectDocumentTranslation(text);
  const index = getAnchorIndexFor(detection.translation);
  const seen = new Map<string, DraftRange>();
  for (const chunk of chunkProse(text)) {
    for (const a of anchorChunk(chunk.text, {
      index,
      minHits: SHIPPED_K,
      minVerseShingles: MIN_VERSE_SHINGLES,
      translationConfidence: detection.confidence,
    })) {
      const key = `${a.verseStart}:${a.verseEnd}`;
      if (!seen.has(key)) seen.set(key, { start: a.verseStart, end: a.verseEnd, channel: a.channel });
    }
  }
  const ranges = [...seen.values()].sort((a, b) => a.start - b.start).slice(0, DRAFT_MAX_RANGES);
  return { detection, ranges };
}

export async function draftCheck(
  userId: string,
  text: string,
  predicate: CorpusPredicate,
  opts: { maxOverlapDocs?: number } = {},
): Promise<DraftCheckResult> {
  const { detection, ranges } = anchorDraft(text);
  // The cap is applied AFTER the per-document collapse, so it counts DOCUMENTS, never anchor rows.
  // `clampLimit` (search.ts) caps any limit at MAX_LIMIT=100 and floors at 1; the cap here stays at
  // most MAX_LIMIT-1 so the over-fetch-by-one truncation probe (cap+1) never exceeds MAX_LIMIT and
  // is itself clamped away — which would silently disable the `truncated` flag.
  const maxOverlapDocs = Math.min(
    MAX_LIMIT - 1,
    Math.max(1, Math.trunc(opts.maxOverlapDocs ?? DRAFT_MAX_OVERLAP_DOCS)),
  );

  // One row per document per range (strongest match kept, in SQL — see verseDocScan's hazard note),
  // so the UI answers "you preached this in X and Y" rather than listing anchor rows, and a range
  // that overlaps many anchors never silently drops a document whose first row sorts past a cap.
  const overlaps: DraftOverlap[] = [];
  for (const range of ranges) {
    const docs = await verseDocScan(userId, range, { limit: maxOverlapDocs + 1 });
    const truncated = docs.length > maxOverlapDocs;
    const documents = truncated ? docs.slice(0, maxOverlapDocs) : docs;
    if (documents.length > 0) overlaps.push({ range, documents, truncated });
  }

  const gaps = await traditionGapForRanges(userId, ranges, predicate);
  return {
    detection: { translation: detection.translation, confidence: detection.confidence, totalHits: detection.totalHits },
    ranges,
    overlaps,
    gaps,
  };
}
