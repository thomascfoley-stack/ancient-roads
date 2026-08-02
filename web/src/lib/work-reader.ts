// Book Reader client helpers (docs/LIBRARY_READER_DESIGN.md §2). The load-bearing logic —
// reading-unit grouping, the paragraph split that backs the §3 offset invariant, the resume
// cursor, the saved-position record — is PURE and unit-tested (test/invariants/work-reader-*.test.*);
// only the unavoidable DOM glue lives in the components.

import type { WorkTocRow } from './work';
import { decodeVerseId, isStructurallyValidVerseId } from '@bible/verse-id';
import { BOOK_BY_NUM } from '@bible/books';

/** Sections per fetch. Matches the route's default page size: a few screens per page, so
 *  scrolling fetches ahead without thrashing requests on a 3,448-section work. */
export const WORK_READER_PAGE_LIMIT = 50;

/** A reading unit (ADR-026): consecutive TOC rows sharing a `unit_ordinal`. */
export interface TocUnit {
  /** Null only for pre-024 rows that carry no unit_ordinal; such rows never group. */
  unitOrdinal: number | null;
  /** The unit's label — the first heading inside it (chunked ingest repeats a work's
   *  title across its chunks, so the first row's heading names the whole unit). */
  label: string;
  rows: WorkTocRow[];
}

/** Group a (unit_ordinal, ordinal)-ordered TOC into reading units, preserving order.
 *  Rows with a null unit_ordinal stand alone (pre-024 data) rather than collapsing
 *  into one anonymous unit. */
/**
 * What a section is CALLED.
 *
 * "Section 109" was never a design decision — it is the fallback that shows when `heading` is
 * null, and commentaries have `heading` null for all 72,863 rows because
 * `migrate-sections-slice.ts` inserts (source_id, ordinal, body, source_url) and never writes
 * the column. Sermons and historians build real headings at ingest and are unaffected; only the
 * verse-anchored works were reading like a filing cabinet.
 *
 * The verse range is the right name for them: a commentary section IS its passage. The order is
 * heading, then the passage, then the ordinal — so a work that has real headings keeps them, and
 * the ordinal is now a last resort that a healthy corpus never reaches.
 */
export function sectionLabel(row: Pick<WorkTocRow, 'heading' | 'ordinal' | 'verseStart' | 'verseEnd'>): string {
  if (row.heading && row.heading.trim() !== '') return row.heading;
  const ref = formatVerseRange(row.verseStart, row.verseEnd);
  return ref ?? `Section ${row.ordinal}`;
}

/**
 * "John 3:16", "John 3:16-18", "John 3:16 - 4:2". Null when there is no anchor to format, so
 * callers can fall through rather than render a half-formed reference.
 *
 * A structurally invalid id formats as null rather than as "Book 0 0:0": a nonsense reference in
 * the table of contents is worse than the ordinal, because it reads like a real passage.
 */
export function formatVerseRange(start: number | null, end: number | null): string | null {
  if (start == null || !isStructurallyValidVerseId(start)) return null;
  const a = decodeVerseId(start);
  const book = BOOK_BY_NUM.get(a.book);
  if (!book) return null;
  const head = `${book.name} ${a.chapter}:${a.verse}`;
  if (end == null || end === start || !isStructurallyValidVerseId(end)) return head;
  const b = decodeVerseId(end);
  if (b.book !== a.book) return head; // a cross-book range is not a thing this corpus produces
  return b.chapter === a.chapter ? `${head}-${b.verse}` : `${head} - ${b.chapter}:${b.verse}`;
}

/**
 * The label for a whole reading UNIT. For a verse-anchored work a unit is a CHAPTER (migration
 * 024 groups them that way), so the unit reads "John 3" and its sections read "John 3:16" — which
 * is what the owner asked for: chapter names, like the works that already have them.
 */
function unitLabelFor(rows: WorkTocRow[]): string {
  const first = rows[0]!;
  if (first.heading && first.heading.trim() !== '') return first.heading;
  if (first.verseStart != null && isStructurallyValidVerseId(first.verseStart)) {
    const { book, chapter } = decodeVerseId(first.verseStart);
    const b = BOOK_BY_NUM.get(book);
    // One-chapter books (Jude, Obadiah…) read "Jude", not "Jude 1".
    if (b) return b.chapterCount === 1 ? b.name : `${b.name} ${chapter}`;
  }
  return sectionLabel(first);
}

export function groupTocByUnit(toc: WorkTocRow[]): TocUnit[] {
  const units: TocUnit[] = [];
  for (const row of toc) {
    const last = units[units.length - 1];
    if (last && row.unitOrdinal !== null && last.unitOrdinal === row.unitOrdinal) {
      last.rows.push(row);
    } else {
      units.push({ unitOrdinal: row.unitOrdinal, label: '', rows: [row] });
    }
  }
  // The label is computed AFTER grouping, from the unit's own rows. Computing it while building
  // meant it was decided by the first row alone, before the unit knew what it contained.
  for (const u of units) u.label = unitLabelFor(u.rows);
  return units;
}

/** Split a section body into paragraph slices at blank-line boundaries, KEEPING the
 *  separator whitespace at the end of each slice, so the slices rejoin to exactly `body`.
 *  This is the §3 offset invariant in render form: each slice becomes one <p> inside the
 *  data-section-text container, and the container's text nodes then concatenate to
 *  sections.body byte-for-byte — annotation offsets walked from the DOM are offsets into
 *  the canonical body. (Trailing separator whitespace collapses visually at a block end,
 *  so carrying it in the text node costs nothing on screen.) */
export function splitBodyParagraphs(body: string): string[] {
  const out: string[] = [];
  let start = 0;
  const re = /\n(?:[ \t]*\n)+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.push(body.slice(start, re.lastIndex));
    start = re.lastIndex;
  }
  if (start < body.length) out.push(body.slice(start));
  return out;
}

/** The keyset cursor whose page CONTAINS `ordinal`: sections serve `ordinal > after`
 *  ascending, so the page after `ordinal - 1` starts AT the saved section. This is the
 *  resume/deep-link contract — never an offset page number. */
export function pageAfterContaining(ordinal: number): number {
  return Math.max(0, Math.floor(ordinal) - 1);
}

/** The resume record persisted to localStorage (§2: {slug, ordinal, scrollPct}).
 *  scrollPct is the fraction of the ordinal's own section already scrolled past, so a
 *  restore lands mid-section exactly where the reader left off. */
export interface WorkProgress {
  slug: string;
  ordinal: number;
  scrollPct: number;
  savedAt: number;
}

const progressKey = (slug: string) => `work-progress:${slug}`;

/** The last saved position for a work, or null. Never throws — a corrupt or unreadable
 *  entry is treated as "no saved position", because resume must never gate reading. */
export function loadWorkProgress(slug: string): WorkProgress | null {
  if (typeof window === 'undefined') return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(progressKey(slug));
  } catch {
    // Privacy-mode / disabled storage: resume unavailable, reading unaffected.
    return null;
  }
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<WorkProgress>;
    if (typeof p.ordinal !== 'number' || !Number.isFinite(p.ordinal) || p.ordinal < 1) return null;
    const scrollPct =
      typeof p.scrollPct === 'number' && Number.isFinite(p.scrollPct)
        ? Math.min(1, Math.max(0, p.scrollPct))
        : 0;
    return {
      slug,
      ordinal: Math.floor(p.ordinal),
      scrollPct,
      savedAt: typeof p.savedAt === 'number' && Number.isFinite(p.savedAt) ? p.savedAt : 0,
    };
  } catch {
    // Corrupt JSON — treat as no saved position rather than breaking the reader.
    return null;
  }
}

/** Persist the resume record. Returns false (never throws) when storage is unavailable —
 *  quota/privacy failures are non-fatal: resume is a convenience, not a gate. */
export function saveWorkProgress(p: WorkProgress): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(progressKey(p.slug), JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}
