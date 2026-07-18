// THE "TODAY" SEAM (build task §2/§3/§4). The whole "framework" is ONE typed return shape plus
// one design decision: a SOURCE picks the passage; voice-attachment is a separate, invariant step.
// A future Tier 1/2 is a new DailySource emitting the same { lead, passage } — it inherits
// voice-attachment, the license filter, the grounding invariant, and the render for free.
//
// GUARANTEE (§4), enforced mechanically because no verifier runs on this read path (no generation):
//  - The app authors NOTHING but the date + a bare attribution. Only the Spurgeon lead carries
//    attributed devotional prose (his verbatim words).
//  - Voices are POINTERS into the corpus (CommentaryEntry rows), never app-authored strings.
//  - Selection is a mechanical function of the passage: grounded (verse-range intersects) +
//    pickDiverse's rotation. No per-passage curation table exists, so "teaching by lineup" is
//    structurally impossible.
import { parseRef, type VerseRange } from '@/bible/ref-parse';
import { decodeVerseId } from '@/bible/verse-id';
import { pickDiverse } from '@/components/commentary-panel';
import { isPublishedCommentaryEntry } from '@/lib/legal-corpus';
import { isSongVerse, type CommentaryEntry } from '@/lib/bible';

// ---- date resolution (§3): LOCAL calendar date + MM-DD key, never ordinal day-of-year --------
/** The user's LOCAL month-day as "MM-DD". Never an ordinal index: day 60 is Feb 29 in a leap
 *  year and Mar 1 otherwise, so an ordinal silently shifts every entry after February. */
export function mmddOf(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** AM before midday, PM after — by the user's LOCAL clock (Spurgeon wrote Morning and Evening). */
export function halfOf(d: Date): 'am' | 'pm' {
  return d.getHours() < 12 ? 'am' : 'pm';
}
/** A bare, app-authored local date header ("Thursday, July 16"). The ONLY app-authored words. */
export function dateLabelOf(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ---- shapes ----------------------------------------------------------------------------------
export interface DevotionalEntry {
  ref: string;
  refDisplay: string;
  verseText: string;
  body: string;
  attribution: string;
}
export type DevotionalData = Record<string, { am?: DevotionalEntry; pm?: DevotionalEntry }>;

export interface TodayLead {
  refDisplay: string;
  verseText: string;
  body: string;
  attribution: string;
}
export type Rung = 'verse' | 'chapter' | 'lead-only';
export interface TodayCard {
  dateLabel: string; // app-authored: a bare local date, nothing more
  half: 'am' | 'pm';
  lead: TodayLead; // Spurgeon's verbatim entry, attributed
  passage: VerseRange; // the anchor from the lead
  bookSlug: string;
  chapter: number;
  voices: CommentaryEntry[]; // corpus rows, license-filtered + grounded (never app-authored)
  rung: Rung;
}
export interface PickedDay {
  lead: TodayLead;
  passage: VerseRange;
  bookSlug: string;
  chapter: number;
  half: 'am' | 'pm';
}
// A source picks the passage. Tier 1/2 later = another impl of THIS, emitting the same shape.
export type DailySource = (date: Date, data: DevotionalData) => PickedDay | null;

// ---- the only source today: Spurgeon's Morning and Evening -----------------------------------
export const spurgeonSource: DailySource = (date, data) => {
  const key = mmddOf(date);
  const half = halfOf(date);
  const day = data[key];
  // Prefer the local half; fall back to the other half of the same day rather than a blank screen.
  const entry = day?.[half] ?? day?.am ?? day?.pm;
  if (!entry) return null;
  const parsed = parseRef(entry.ref); // §2: the displayed reference IS the bridge to the corpus
  if (!parsed.ok || !parsed.ref.ranges[0]) return null;
  const passage = parsed.ref.ranges[0];
  const { chapter } = decodeVerseId(passage.start);
  return {
    lead: { refDisplay: entry.refDisplay, verseText: entry.verseText, body: entry.body, attribution: entry.attribution },
    passage,
    bookSlug: parsed.ref.book.slug,
    chapter,
    half,
  };
};

// ---- voice attachment (§4): grounded + license-filtered + mechanical, never curated ----------
/** A chapter-relative commentary entry [verseStart,verseEnd] intersects the passage's verses. */
function intersectsVerses(e: CommentaryEntry, startV: number, endV: number): boolean {
  return e.verseStart <= endV && startV <= e.verseEnd;
}

/**
 * The passage picks the voices, mechanically. `chapterEntries` are the commentary rows for the
 * lead's book+chapter (so cross-chapter voices cannot appear by construction). Degrade ladder,
 * never a blank morning: verse-exact -> whole chapter (same location) -> Spurgeon's lead alone.
 * Defense-in-depth: re-apply the published-author filter even though fetchCommentary already did,
 * so a forbidden author (Tyndale Study Notes) can never render even if the loader has a hole.
 */
export function voicesForPassage(
  passage: VerseRange,
  chapterEntries: CommentaryEntry[],
  bookNum: number,
): { voices: CommentaryEntry[]; rung: Rung } {
  // Register wall: Today's voices are EXEGETICAL only. Hymns/poems must never
  // fill a voice slot or satisfy the >=2-voices floor (A6 line-by-line 2026-07-17:
  // voicesForPassage had no wall, so a hymn on a verse counted as a commentator).
  const published = chapterEntries.filter((e) =>
    !isSongVerse(e) &&
    isPublishedCommentaryEntry({ author: e.author, sourceUrl: e.sourceUrl, book: bookNum, work: (e as { work?: string }).work }),
  );
  const startV = passage.start % 1000;
  const endV = passage.end % 1000;
  const verseExact = published.filter((e) => intersectsVerses(e, startV, endV));
  if (verseExact.length >= 2) return { voices: pickDiverse(verseExact, 2), rung: 'verse' };
  if (published.length >= 1) return { voices: pickDiverse(published, 2), rung: 'chapter' };
  return { voices: [], rung: 'lead-only' };
}

/** Tie it together: active source picks the passage, then voices attach separately (the seam). */
export async function resolveToday(
  date: Date,
  data: DevotionalData,
  loadChapter: (bookSlug: string, chapter: number) => Promise<CommentaryEntry[]>,
  source: DailySource = spurgeonSource,
): Promise<TodayCard | null> {
  const picked = source(date, data);
  if (!picked) return null;
  const { book } = decodeVerseId(picked.passage.start);
  const entries = await loadChapter(picked.bookSlug, picked.chapter);
  const { voices, rung } = voicesForPassage(picked.passage, entries, book);
  return {
    dateLabel: dateLabelOf(date),
    half: picked.half,
    lead: picked.lead,
    passage: picked.passage,
    bookSlug: picked.bookSlug,
    chapter: picked.chapter,
    voices,
    rung,
  };
}
