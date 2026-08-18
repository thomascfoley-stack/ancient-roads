/**
 * WHERE THE READER LAST WAS IN SCRIPTURE — the record that A034 and A040 both want.
 *
 * The two findings are one defect seen from two sides, which is why they get one module rather
 * than two fixes:
 *
 *   A040 — read `/read/psa/23`, close the tab, come back: you are at John 1. A Library WORK
 *          reopens exactly where you left it, because `saveWorkProgress`/`loadWorkProgress`
 *          (`lib/work-reader.ts:254-310`) persist `{slug, ordinal, scrollPct}` to localStorage.
 *          So the same app answers the same question two different ways, and the answer it gives
 *          for Scripture — the thing the product is FOR — is the worse one. Measured before
 *          building this: `grep -rn localStorage web/src` lists the reader theme/size/measure
 *          (`lib/reading-prefs.ts`), the translation (`read/[book]/[chapter]/page.tsx:58`), the
 *          verse-gesture hint, the study-editor panel, the sidebar's studies, the save-to-study
 *          target and work progress — and NOTHING keyed to a book and a chapter. There is no
 *          server record either: no `reading_position`-shaped table anywhere in `db/migrations`
 *          (001-116) and no route under `web/src/app/api` that stores one.
 *   A034 — the Bible tab in the bottom nav hardlinked `/read/jhn/1` (`components/mobile-nav.tsx`),
 *          so it threw the position away even WITHIN a session: read Psalm 23, tap Home, tap
 *          Bible, and you are in John. Same missing record; one fix serves both.
 *
 * WHY LOCALSTORAGE AND NOT A TABLE. Deliberate, and it is the same call `work-reader.ts` already
 * made: this is a convenience, not data the reader owns. A server record would need a migration, a
 * route, RLS, and a sign-in — and the reader who most needs "put me back where I was" is the
 * signed-out one on a phone. Per-device is also arguably the RIGHT semantics here (the phone by
 * the bed and the desk machine are usually in different places in the text). If that is ever
 * revisited, this module is the one seam to change.
 *
 * WHY VALIDATION IS THE INTERESTING HALF. **A stored slug outlives the book table it was written
 * against.** Storage is durable and the code is not: a record written by an older build, by a
 * different versification, or by hand in devtools, will be read back by today's build months
 * later. An unvalidated read sends a reader from a tab press straight to the very dead end A035 is
 * about — so every value is re-checked against the CURRENT `BOOKS` table on the way in AND on the
 * way out, and anything that does not check out reads as "no position", never as an error.
 */

import { BOOK_BY_SLUG, type Book } from '@bible/books';
import { resolveBookSlug } from '@bible/ref-parse';

/** The storage key. Exported so tests key off the same constant rather than re-typing the string —
 *  a test that types its own key is testing its own typo. `:v1` because the shape is a JSON object:
 *  if it ever gains a field that changes the meaning of the old ones, the version moves and stale
 *  records simply fail validation below, which is already the safe outcome. */
export const BIBLE_POSITION_KEY = 'bible-position:v1';

/** Where Scripture opens for a reader who has never read any, and the fallback for every
 *  validation failure below. John 1 is what the Bible tab hardlinked before A034, so this is the
 *  existing behaviour preserved as the floor rather than a new choice. */
const DEFAULT_BIBLE_SLUG = 'jhn';
const DEFAULT_BIBLE_CHAPTER = 1;
export const DEFAULT_BIBLE_HREF = `/read/${DEFAULT_BIBLE_SLUG}/${DEFAULT_BIBLE_CHAPTER}`;

/**
 * What to CALL the default destination, for the recovery link A035 adds to the reader.
 *
 * DERIVED from the same two constants as the href above, never typed beside it. A hand-typed
 * "John 1" next to a hand-typed `/read/jhn/1` is this repo's most-repeated defect class — a label
 * and the thing it labels maintained by the same hand, free to drift, with nothing that notices
 * (MASTER.md's failure-mode watchlist; the `maxDuration` route list and the served-asset directory
 * list are the same shape). Changing the default now moves both or neither.
 *
 * The `?? DEFAULT_BIBLE_SLUG` branch is unreachable while `jhn` is in the 66-book canonical table,
 * and it falls back to something VISIBLY wrong ("jhn 1") rather than something plausibly right,
 * so the impossible case announces itself instead of hiding. It is not left unguarded: a leg in
 * `test/invariants/bible-position.test.tsx` asserts the label and the href name the same book.
 */
export const DEFAULT_BIBLE_LABEL = `${
  BOOK_BY_SLUG.get(DEFAULT_BIBLE_SLUG)?.name ?? DEFAULT_BIBLE_SLUG
} ${DEFAULT_BIBLE_CHAPTER}`;

/** The persisted record. `savedAt` is not read by anything today; it is stored because a record
 *  with no timestamp cannot later be aged out or ordered against another device's, and adding the
 *  field afterwards means every existing record lacks it. */
export interface BiblePosition {
  /** ALWAYS the canonical book slug (`jhn`, never `john`) — see `canonicalBook` below. */
  slug: string;
  chapter: number;
  savedAt: number;
}

/**
 * The book this slug names in TODAY's table, or undefined.
 *
 * Alias-tolerant on the way in, canonical on the way out, for the reason A7's product walk found
 * the hard way (2026-08-02): `/read/john/1` failed while `/read/jhn/1` worked, because a caller
 * did a bare Map lookup and never consulted the alias table. `resolveBookSlug` is exact-alias-only
 * — never a prefix or a candidate guess — so this stays deterministic, and it means a position
 * captured from an alias URL still resolves. Callers store `book.slug`, so only ONE spelling ever
 * reaches storage.
 */
function canonicalBook(slug: string): Book | undefined {
  if (typeof slug !== 'string' || slug.length === 0) return undefined;
  return BOOK_BY_SLUG.get(slug) ?? resolveBookSlug(slug);
}

/**
 * Is this book/chapter pair somewhere a reader could actually be?
 *
 * Deliberately a RANGE check, which is exactly what `lib/chapter-param.ts`'s `isFetchableChapter`
 * documents itself as NOT being. These are different questions and both are needed: that one asks
 * "could this param ever address a chapter at all" for a value straight off the URL, and it has no
 * business holding the book table. This one asks "is this a real place in Scripture" for a value
 * we are about to hand a reader as a destination, and the book table is the whole point. Calling
 * `isFetchableChapter` here would pass `psa 999`, which is the dead end this record must never
 * become.
 */
function validate(slug: unknown, chapter: unknown): Book | undefined {
  if (typeof slug !== 'string') return undefined;
  if (typeof chapter !== 'number' || !Number.isInteger(chapter) || chapter < 1) return undefined;
  const book = canonicalBook(slug);
  if (!book || chapter > book.chapterCount) return undefined;
  return book;
}

/**
 * The last position, or null when there is no usable one.
 *
 * NEVER THROWS. Storage can be unavailable outright (Safari private mode throws on access, not on
 * write), the entry can be corrupt, and the record can be stale — and in every one of those cases
 * the honest answer is "no saved position", because remembering where you were must never be able
 * to stop you reading. Same contract as `loadWorkProgress`, for the same reason.
 */
export function loadBiblePosition(): BiblePosition | null {
  if (typeof window === 'undefined') return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(BIBLE_POSITION_KEY);
  } catch {
    // Privacy mode / storage disabled: resume unavailable, reading unaffected.
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupt JSON — treat as no saved position rather than breaking the Bible tab.
    return null;
  }
  // `unknown` and narrow, never `any`: this value came from outside the program (CLAUDE.md
  // "validate external input at the edge"), and localStorage is as external as a request body.
  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as { slug?: unknown; chapter?: unknown; savedAt?: unknown };
  const book = validate(record.slug, record.chapter);
  if (!book) return null;
  return {
    // The CANONICAL slug, re-derived rather than echoed back: a record written under an alias by
    // an older build must not keep that spelling alive through every subsequent read.
    slug: book.slug,
    chapter: record.chapter as number,
    savedAt: typeof record.savedAt === 'number' && Number.isFinite(record.savedAt) ? record.savedAt : 0,
  };
}

/**
 * Remember this position. Returns false — never throws — when the value is not a real place in
 * Scripture, or when storage is unavailable.
 *
 * VALIDATES ON THE WAY IN AS WELL AS OUT, which is not belt-and-braces. The read side protects
 * against records older than the current book table; this side stops a bad value ever becoming a
 * record in the first place, so a reader who lands on `/read/psa/999` does not have their next tab
 * press aimed at it. Without it, A035's dead end would be *saved* and then *returned to*.
 */
export function saveBiblePosition(slug: string, chapter: number): boolean {
  if (typeof window === 'undefined') return false;
  const book = validate(slug, chapter);
  if (!book) return false;
  const record: BiblePosition = { slug: book.slug, chapter, savedAt: Date.now() };
  try {
    window.localStorage.setItem(BIBLE_POSITION_KEY, JSON.stringify(record));
    return true;
  } catch {
    // Quota or privacy failure: non-fatal by design — resume is a convenience, not a gate.
    return false;
  }
}

/**
 * Where the Bible tab should point (A034).
 *
 * MUST NOT BE CALLED DURING RENDER. It reads localStorage, and the first client render has to
 * produce what the server produced — the server has no storage, so it produces
 * `DEFAULT_BIBLE_HREF`. Reading this in a `useState` initializer is precisely the React #418 this
 * repo has already paid for twice (`read/[book]/[chapter]/page.tsx:38-51` documents the reader's
 * translation badge throwing on every page load until 2026-08-02; `lib/auth/use-signed-in.ts`
 * documents the session doing it). Call it from an effect, after mount. `mobile-nav.tsx` does.
 */
export function bibleTabHref(): string {
  const pos = loadBiblePosition();
  return pos ? `/read/${pos.slug}/${pos.chapter}` : DEFAULT_BIBLE_HREF;
}
