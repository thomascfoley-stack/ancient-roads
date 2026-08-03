// expandPlan — the schedule half of STUDY_PLANS_DESIGN §4. Pure function:
// no I/O, no model, no clock (the clock arrives as spec.startDate). The
// division of labor is architectural (PRODUCT_ARCHITECTURE §3): the model
// parses intent, THIS code generates the schedule, and no date or verse
// range ever originates in a model.
//
// Dates are LOCAL calendar dates handled as (y, m, d) integer triples over
// Date.UTC epoch arithmetic — never a local-zone Date, never a day-of-year
// ordinal. today.ts records why ordinals are banned in this codebase: day 60
// is Feb 29 in a leap year and Mar 1 otherwise, so an ordinal silently
// shifts every entry after February.
//
// Reading units are CHAPTERS distributed evenly across reading days —
// arithmetic over the canon, no per-day curation. Verse-granular pacing is
// out of scope for slice 1 (a chapter is the smallest unit the reader and
// the voice-attachment ladder both key on).

import { BOOK_BY_NUM, BOOK_BY_SLUG } from '@/bible/books';
import { parseRef, CHAPTER_END_SENTINEL } from '@/bible/ref-parse';
import type { PlanSpec } from './spec';

export interface PlanDay {
  dayIndex: number;      // 1-based, contiguous
  date: string;          // 'YYYY-MM-DD' local
  verseStart: number;    // canonical verse id (chapter start)
  verseEnd: number;      // canonical verse id (chapter end sentinel)
  bookSlug: string;
  chapterStart: number;
  chapterEnd: number;    // == chapterStart when the day is a single chapter
}

export type ExpandOutcome = { ok: true; days: PlanDay[] } | { ok: false; reason: string };

// ── date arithmetic: (y,m,d) triples over UTC epoch — deterministic, no TZ ──

function toEpochDays(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d) / 86_400_000;
}
function fromEpochDays(days: number): string {
  const dt = new Date(days * 86_400_000);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** startDate plus n calendar days, as YYYY-MM-DD. Exported for tests. */
export function addDays(startDate: string, n: number): string {
  const [y, m, d] = startDate.split('-').map(Number) as [number, number, number];
  return fromEpochDays(toEpochDays(y, m, d) + n);
}

// Reading days fall on the FIRST daysPerWeek days of each week from the
// start date: 5/week from a Monday = Mon-Fri, rest on Sat/Sun. Deliberately
// the simplest honest rule — weekday preferences are intake polish, not
// schedule arithmetic, and belong to a later slice.
function readingDayOffsets(weeks: number, daysPerWeek: number): number[] {
  const out: number[] = [];
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < daysPerWeek; d++) out.push(w * 7 + d);
  }
  return out;
}

interface ChapterSpan { bookNum: number; chapter: number }

function chaptersOfScope(spec: PlanSpec): ChapterSpan[] | { fail: string } {
  if (spec.scope.kind === 'book') {
    const book = BOOK_BY_SLUG.get(spec.scope.book);
    if (!book) return { fail: `unknown book slug "${spec.scope.book}"` };
    return Array.from({ length: book.chapterCount }, (_, i) => ({ bookNum: book.bookNum, chapter: i + 1 }));
  }
  const parsed = parseRef(spec.scope.ref);
  if (!parsed.ok) return { fail: parsed.reason };
  const ranges = parsed.ref.ranges;
  const head = ranges[0];
  const tail = ranges[ranges.length - 1];
  if (!head || !tail) return { fail: 'reference resolved to no range' };
  const out: ChapterSpan[] = [];
  const startBook = Math.floor(head.start / 1_000_000);
  const endBook = Math.floor(tail.end / 1_000_000);
  for (let b = startBook; b <= endBook; b++) {
    const book = BOOK_BY_NUM.get(b);
    if (!book) return { fail: `no book number ${b}` };
    const cFrom = b === startBook ? Math.floor((head.start % 1_000_000) / 1000) : 1;
    const cTo = b === endBook ? Math.floor((tail.end % 1_000_000) / 1000) : book.chapterCount;
    for (let c = cFrom; c <= cTo; c++) out.push({ bookNum: b, chapter: c });
  }
  return out;
}

/**
 * Expand a validated PlanSpec into dated reading days. Pure arithmetic;
 * refuses rather than stretching — a 2-chapter scope over 40 reading days is
 * a spec problem the intake should surface, not a schedule to pad.
 */
export function expandPlan(spec: PlanSpec): ExpandOutcome {
  const chapters = chaptersOfScope(spec);
  if ('fail' in chapters) return { ok: false, reason: chapters.fail };
  if (chapters.length === 0) return { ok: false, reason: 'scope contains no chapters' };

  const offsets = readingDayOffsets(spec.weeks, spec.daysPerWeek);
  const dayCount = offsets.length;
  if (chapters.length < dayCount) {
    return {
      ok: false,
      reason: `${chapters.length} chapter(s) cannot fill ${dayCount} reading days — shorten the plan or widen the scope`,
    };
  }

  const days: PlanDay[] = [];
  for (let i = 0; i < dayCount; i++) {
    // Even distribution: day i takes chapters [i*N/D, (i+1)*N/D).
    const from = Math.floor((i * chapters.length) / dayCount);
    const to = Math.floor(((i + 1) * chapters.length) / dayCount) - 1;
    const first = chapters[from]!;
    const last = chapters[to]!;
    const bookSlug = BOOK_BY_NUM.get(first.bookNum)!.slug;
    days.push({
      dayIndex: i + 1,
      date: addDays(spec.startDate, offsets[i]!),
      verseStart: first.bookNum * 1_000_000 + first.chapter * 1000 + 1,
      verseEnd: last.bookNum * 1_000_000 + last.chapter * 1000 + CHAPTER_END_SENTINEL,
      bookSlug,
      chapterStart: first.chapter,
      chapterEnd: last.chapter,
    });
  }
  return { ok: true, days };
}
