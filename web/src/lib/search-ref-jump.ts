import { decodeVerseId } from '@bible/verse-id';
import { CHAPTER_END_SENTINEL, type ResolvedRef } from '@bible/ref-parse';

/**
 * The reader URL for the `/search` reference-jump link (F15) — the "Go to <ref> →" link offered
 * above the text results when the typed query parses as a Bible reference.
 *
 * This lived inline in `search/page.tsx`, branching on `ref.kind === 'verse' || 'verse_range'`,
 * so a verse-led SEQUENCE whose first segment was verse-granular (e.g. `John 3:16, 17`) computed
 * the verse and then threw it away — the link targeted the chapter root with no `#v` anchor, the
 * reader landed on verse 1, and the displayed label `John 3:16, 17` contradicted the target
 * `/read/jhn/3`. Every other verse-landing surface routes through `verseHref` (`lib/verse-link.ts`);
 * the search page was the sole outlier with its own anchor policy.
 *
 * It lives here rather than in the page so the invariant test imports the SHIPPED function (the
 * same red-proof as `verseHref`: a copy of the predicate in the test file cannot go red when the
 * page is seeded with the bug — a named entry on this repo's own failure-mode watchlist).
 *
 * F-144: the anchor is carried ONLY when the first segment is verse-granular
 * (`range.end % 1000 !== CHAPTER_END_SENTINEL`). Chapter-led kinds (`chapter`, `chapter_range`,
 * `book`, chapter-led `sequence`) link to the chapter root with NO hash, so the reader's
 * saved-position restore runs — it is gated on `if (window.location.hash) return;`
 * (`app/read/[book]/[chapter]/page.tsx`), and emitting `#v1` here would silently override it.
 * `verseHref` always emits `#v` (it has no no-verse mode); this helper deliberately diverges to
 * preserve F-144, so the search page does NOT route through `verseHref`.
 *
 * Returns `null` for a ref with no ranges, so the page renders no jump link.
 */
export function searchJumpHref(ref: ResolvedRef): string | null {
  const first = ref.ranges[0];
  if (!first) return null;
  const { chapter, verse } = decodeVerseId(first.start);
  return first.end % 1000 !== CHAPTER_END_SENTINEL
    ? `/read/${ref.book.slug}/${chapter}#v${verse}`
    : `/read/${ref.book.slug}/${chapter}`;
}
