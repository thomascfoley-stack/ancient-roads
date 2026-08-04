// anchorChunk — the function `docs/SLICE_1_DATA_MODEL.md:45` and `SERMON_SEARCH_DESIGN.md:141`
// both specify and which, until now, nothing implemented.
//
// It turns a chunk of the user's prose into rows for `user_section_anchors`: the verses this chunk
// engages, how they were found, and how strongly.

import { scanReferences } from '@bible/ref-parse';
import { isExplicitCitation } from '@bible/explicit-citation';
import { uncitedMatches, type VerseShingleIndex } from '@bible/uncited-shingle';

/**
 * The channels Slice 1 ships.
 *
 * ── WHY 'prose' IS NOT HERE, decided in the open 2026-08-03 ─────────────────────────────────────
 * The `channel` CHECK constraint (migration 100) permits 'explicit', 'prose' and 'uncited', and the
 * design speaks of three channels. In fact there are one and a half: NOTHING in the tree has ever
 * implemented a prose channel, and Slice 0 measured exactly two — explicit at 0% (structural: the
 * corpus only cites in headers) and uncited at 90%. Every published number rests on those two.
 *
 * The nearest reusable thing is `src/bible/pericopes.ts` — a 34-entry gazetteer ("good shepherd" →
 * John 10) built for QUERY routing. Its corroboration step assumes a short query; run against a
 * 5,000-word sermon the `BIBLICAL_LEXICON` corroboration fires on essentially any body, so it would
 * anchor most documents to most of its pericopes. That is not a channel, it is a precision leak
 * with a gazetteer attached — and it would land in the same table the tradition-gap join reads.
 *
 * So Slice 1 ships two channels and says so. 'prose' stays in the CHECK constraint rather than
 * being removed, because implementing it later should not need a migration, and because a value no
 * writer emits costs nothing while a constraint churned twice costs a review each time.
 */
export type AnchorChannel = 'explicit' | 'uncited';

export interface Anchor {
  verseStart: number;
  verseEnd: number;
  channel: AnchorChannel;
  /** Shingle count K for 'uncited'; null for 'explicit', where a count is meaningless. */
  matchCount: number | null;
  /** 0-1 confidence in the translation family used (ADR-100). */
  confidence: number;
}

export interface AnchorOptions {
  /** The translation-family index to shingle against. Carries its own label (ADR-100). */
  index: VerseShingleIndex;
  /**
   * **K** — a verse is returned iff at least this many of its shingles appear. Required, never
   * defaulted: Slice 0's trade curve is 1 → 33% precision / 93% recall, 2 → 68/82, 3 → 96/75, and
   * this is the number that decides whether "have I written on Romans 8?" returns the passage or
   * buries it in a wall of incidental hits.
   */
  minHits: number;
  /** A verse must have at least this many distinct shingles to be eligible. Slice 0 froze it at 3. */
  minVerseShingles: number;
  /** Confidence in the detected translation family (ADR-100). 1.0 when unambiguous. */
  translationConfidence: number;
}

/**
 * The verses this chunk engages.
 *
 * BOTH channels are emitted for a verse found by both, deliberately — migration 103 made `channel`
 * part of the primary key precisely so that pair survives. Agreement between an explicit citation
 * and a verbatim quote is the strongest evidence an anchor is real, and collapsing them to one row
 * would throw that away exactly where it occurs.
 */
export function anchorChunk(text: string, opts: AnchorOptions): Anchor[] {
  const out: Anchor[] = [];

  // ── explicit ──────────────────────────────────────────────────────────────────────────────────
  // `scanReferences` over free prose false-positives on bare aliases, so every hit goes through
  // `isExplicitCitation`, which requires the book to be NAMED beside a digit. Never call it bare.
  for (const ref of scanReferences(text)) {
    if (!isExplicitCitation(ref.display, text)) continue;
    for (const range of ref.ranges) {
      out.push({
        verseStart: range.start,
        verseEnd: range.end,
        channel: 'explicit',
        // Not 0 and not 1: a citation is not a shingle count, and writing 1 would make a
        // `match_count >= K` filter silently admit every citation (migration 103).
        matchCount: null,
        // An explicit citation is translation-independent — "Romans 8:28" names the same verse in
        // every translation — so the family-detection confidence does not apply to it.
        confidence: 1.0,
      });
    }
  }

  // ── uncited ───────────────────────────────────────────────────────────────────────────────────
  for (const m of uncitedMatches(text, opts.index, {
    minHits: opts.minHits,
    minVerseShingles: opts.minVerseShingles,
  })) {
    out.push({
      verseStart: m.verseId,
      verseEnd: m.verseId,
      channel: 'uncited',
      matchCount: m.matchCount,
      // This channel found the verse by matching ONE translation's wording, so it is only as good
      // as the family detection was (ADR-100). A fallback-family match is recorded as less certain
      // rather than silently presented as fact.
      confidence: opts.translationConfidence,
    });
  }

  // Deterministic: these become rows, and the PK is (section_id, verse_id_start, channel).
  out.sort((a, b) => a.verseStart - b.verseStart || a.channel.localeCompare(b.channel));

  // Two explicit references can resolve to the same range (a sermon citing "Rom. 8:28" twice), and
  // the PK would reject the duplicate. Collapse within a channel, keeping the stronger match.
  const seen = new Map<string, Anchor>();
  for (const a of out) {
    const key = `${a.verseStart}:${a.channel}`;
    const prev = seen.get(key);
    if (!prev || (a.matchCount ?? 0) > (prev.matchCount ?? 0)) seen.set(key, a);
  }
  return [...seen.values()];
}
