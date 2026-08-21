// Per-document translation detection — the half of ADR-100 that never got built.
//
// ── WHY (measured, not argued) ──────────────────────────────────────────────────────────────────
// The uncited anchor channel shingles against ONE translation. Shipped pinned to KJV, a preacher
// quoting anything else got roughly half the recall — measured across all 18 indexes on 50 real
// sermons: KJV-family 70–76% chapter-level, median non-KJV 48%, BSB 36%, worst 16%
// (docs/evidence/uploader-deep-dive-2026-08-20/MEASUREMENTS.md Run 3) — while every anchor row
// recorded confidence 1.0. ADR-100 ruled per-document detection with the below-floor fallback
// RECORDED; migration 103's `confidence` column exists to hold exactly this signal.
// Pre-registration for this build (bars set before the code existed):
// docs/evidence/uploader-deep-dive-2026-08-20/translation-detect-PRE-REGISTRATION.md.
//
// ── HOW ─────────────────────────────────────────────────────────────────────────────────────────
// ONE combined index over the union of all shipped translations: shingle-hash → bitmask of the
// translations containing it, built with the SAME frozen tokenizer/hasher the matcher uses
// (shingleHashSetOcr — parity discipline: detection must count in the space the anchorer matches
// in, or the detected winner is about a different question). Detection = one pass over the
// document's shingle set, incrementing a counter per set bit. Memoised per warm instance beside
// the anchor index; the drain pays once per batch.
//
// Families are the MEASURED ADR-100 clusters (translation-family-RESULT.md: the five
// KJV-descended texts cluster at every threshold tested; union WITHDRAWN at 1.640× vs a 1.50
// bar) — so we shingle against the single argmax translation, and "family" exists only so that
// confidence is not penalised by a sibling that shares most of its shingles.

import { shingleHashSetOcr } from '@bible/uncited-shingle';

/** Measured family table (ADR-100 / translation-family-RESULT.md). Everything else is a singleton. */
export const KJV_FAMILY = ['kjv', 'akjv', 'ukjv', 'webster', 'rwebster'] as const;

export function familyOf(translation: string): readonly string[] {
  return (KJV_FAMILY as readonly string[]).includes(translation) ? KJV_FAMILY : [translation];
}

/**
 * Below this many total distinct shingle hits, detection is guessing — a document that barely
 * quotes Scripture cannot vote on which translation it quotes. Falls back to KJV with the
 * fallback CONFIDENCE recorded (ADR-100: "a fallback that is not recorded is the silent failure
 * this whole ADR exists to prevent").
 */
export const DETECT_MIN_HITS = 25;
export const FALLBACK_TRANSLATION = 'kjv';
export const FALLBACK_CONFIDENCE = 0.5;

export interface TranslationVote {
  translation: string;
  hits: number;
}

export interface Detection {
  /** The translation the uncited channel should shingle against. */
  translation: string;
  /**
   * [0.5, 1]: winner's hits over (winner + best-outside-family). 1.0 only when nothing outside
   * the family matched at all; FALLBACK_CONFIDENCE when the floor bound.
   */
  confidence: number;
  /** Total distinct shingle hits across all translations — the floor's input, kept for evidence. */
  totalHits: number;
  /** Per-translation counts, descending — observability, and what the eval asserts against. */
  votes: TranslationVote[];
}

export interface DetectionIndex {
  /** shingle hash → bitmask of translation indexes (bit i = translations[i]). */
  mask: Map<number, number>;
  translations: string[];
  ngram: number;
}

/** Build the combined mask index. Caller supplies each translation's verse texts (fs stays out). */
export function buildDetectionIndex(
  corpora: { translation: string; texts: Iterable<string> }[],
  ngram: number,
): DetectionIndex {
  if (corpora.length > 30) throw new Error('detection bitmask is a 30-bit int; got more translations than bits');
  const mask = new Map<number, number>();
  const translations: string[] = [];
  for (let i = 0; i < corpora.length; i++) {
    const { translation, texts } = corpora[i]!;
    translations.push(translation);
    const bit = 1 << i;
    for (const text of texts) {
      for (const h of shingleHashSetOcr(text, ngram)) {
        mask.set(h, (mask.get(h) ?? 0) | bit);
      }
    }
  }
  return { mask, translations, ngram };
}

/** Detect which shipped translation a document quotes, with honest confidence. Pure. */
export function detectTranslation(text: string, index: DetectionIndex): Detection {
  const counts = new Array<number>(index.translations.length).fill(0);
  let totalHits = 0;
  for (const h of shingleHashSetOcr(text, index.ngram)) {
    const bits = index.mask.get(h);
    if (!bits) continue;
    totalHits++;
    for (let i = 0; i < counts.length; i++) if (bits & (1 << i)) counts[i]!++;
  }

  const votes: TranslationVote[] = index.translations
    .map((translation, i) => ({ translation, hits: counts[i]! }))
    .sort((a, b) => b.hits - a.hits || a.translation.localeCompare(b.translation));

  if (totalHits < DETECT_MIN_HITS) {
    return { translation: FALLBACK_TRANSLATION, confidence: FALLBACK_CONFIDENCE, totalHits, votes };
  }

  const winner = votes[0]!;
  // CONFIDENCE IS COMPATIBILITY, NOT MARGIN. The v1 estimator (winner over winner-plus-best-
  // rival-outside-family) FAILED its pre-registered bar on the v2 held-out — median 0.65 on
  // uniformly-KJV documents — for a structural reason visible in the index itself: ASV is a KJV
  // revision sharing most of its shingles, so the "rival" is never far behind and the margin
  // caps near 0.65 no matter how unambiguous the document is. Margin answers "how much better
  // is the winner than the runner-up"; anchoring cares about "how much of this document's
  // quoting evidence exists in the index we are about to match it against" — which is the
  // fraction of matched shingles carrying the winner's bit. A pure-KJV document scores near 1
  // (its quotes are IN the KJV index, however many siblings also hold them); a half-KJV
  // half-NIV document scores near 0.5, which is exactly the truth the column should record.
  // Amendment + fresh-v3 confirmation: translation-detect-PRE-REGISTRATION.md.
  const confidence = Math.max(0.5, Math.min(1, winner.hits / totalHits));
  return { translation: winner.translation, confidence, totalHits, votes };
}
