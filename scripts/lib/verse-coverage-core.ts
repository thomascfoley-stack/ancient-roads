// The pure core of the verse_coverage rebuild (STUDY_PLANS_DESIGN §6):
// sweep admitted anchor ranges over the canonical verse universe and count,
// per real verse, the distinct admitted authors and sections anchored on it.
//
// The verse universe comes from RAW_VERSE_COUNTS (web/src/bible), never from
// generate_series over verse ids — ids are book*1e6+ch*1e3+v, so a naive
// series over a whole-book anchor manufactures ~978 phantom verses per
// chapter (the gap up to the 999 sentinel).
//
// EXEGETICAL_SOURCE_TYPES is the /ask ≥2-voices pool: verse-anchored
// commentary + fathers ONLY, per owner decision (c) recorded at
// web/src/lib/teacher/routing.ts:57-62 — sermons/theology/hymns are their
// own registers and never fill a voice slot (the register wall, today.ts).
// Coverage exists to answer "can a plan day carry voices here", so it counts
// exactly what the voice ladder may use.

import { RAW_VERSE_COUNTS } from '../../web/src/bible/verse-counts.js';

export const EXEGETICAL_SOURCE_TYPES = ['commentary', 'father'] as const;

export interface CoverageAnchor {
  author: string;
  sectionId: number;
  verseIdStart: number;
  verseIdEnd: number;
}

export interface CoverageRow {
  verseId: number;
  authorCount: number;
  sectionCount: number;
}

/** Every real verse id in canonical order, from the repo's own verse counts. */
export function verseUniverse(): number[] {
  const out: number[] = [];
  for (const [bookStr, chapters] of Object.entries(RAW_VERSE_COUNTS)) {
    const book = Number(bookStr);
    for (const [chStr, count] of Object.entries(chapters)) {
      const ch = Number(chStr);
      for (let v = 1; v <= count; v++) out.push(book * 1_000_000 + ch * 1000 + v);
    }
  }
  return out.sort((a, b) => a - b);
}

/**
 * Sweep anchors over the universe. O((V + A·overlap) log A) via an event
 * sweep: anchors enter at start, leave after end. Pure — tested without a DB.
 */
export function sweepCoverage(anchors: CoverageAnchor[], universe: number[] = verseUniverse()): CoverageRow[] {
  const byStart = [...anchors].sort((a, b) => a.verseIdStart - b.verseIdStart);
  const rows: CoverageRow[] = [];
  // Active set keyed by end id — a simple array scan is fine: the active set
  // per verse is the number of overlapping sections, which is small.
  let next = 0;
  let active: CoverageAnchor[] = [];
  for (const v of universe) {
    while (next < byStart.length && byStart[next]!.verseIdStart <= v) active.push(byStart[next++]!);
    if (active.length > 0 && active.some((a) => a.verseIdEnd < v)) {
      active = active.filter((a) => a.verseIdEnd >= v);
    }
    if (active.length === 0) continue;
    const authors = new Set<string>();
    const sections = new Set<number>();
    for (const a of active) { authors.add(a.author); sections.add(a.sectionId); }
    rows.push({ verseId: v, authorCount: authors.size, sectionCount: sections.size });
  }
  return rows;
}
