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
import { verseAnchorScan, type VersePresence } from './search';
import { traditionGapForRanges, type CorpusPredicate, type TraditionGapResult } from './tradition-gap';
import type { Detection } from './translation-detect';

/** Long enough for any sermon manuscript; a book-length paste is refused, not truncated. */
export const DRAFT_MAX_CHARS = 120_000;
/** Ranges carried into the presence scans and the gap join — the tradition-gap bound. */
export const DRAFT_MAX_RANGES = 60;

export interface DraftRange {
  start: number;
  end: number;
  channel: string;
}

export interface DraftOverlap {
  range: DraftRange;
  /** The user's own documents anchored on this range — collapsed per document, strongest first. */
  documents: { documentId: string; title: string; channel: string; matchCount: number | null }[];
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
): Promise<DraftCheckResult> {
  const { detection, ranges } = anchorDraft(text);

  // The presence fast path per range, collapsed to one row per document (strongest match kept),
  // so the UI answers "you preached this in X and Y" rather than listing anchor rows.
  const overlaps: DraftOverlap[] = [];
  for (const range of ranges) {
    const hits: VersePresence[] = await verseAnchorScan(userId, range, { limit: 50 });
    const byDoc = new Map<string, DraftOverlap['documents'][number]>();
    for (const h of hits) {
      const prev = byDoc.get(h.documentId);
      if (!prev || (h.matchCount ?? 0) > (prev.matchCount ?? 0)) {
        byDoc.set(h.documentId, {
          documentId: h.documentId,
          title: h.title,
          channel: h.channel,
          matchCount: h.matchCount,
        });
      }
    }
    if (byDoc.size > 0) overlaps.push({ range, documents: [...byDoc.values()] });
  }

  const gaps = await traditionGapForRanges(userId, ranges, predicate);
  return {
    detection: { translation: detection.translation, confidence: detection.confidence, totalHits: detection.totalHits },
    ranges,
    overlaps,
    gaps,
  };
}
