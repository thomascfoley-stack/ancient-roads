/**
 * Is this book/chapter pair worth spending a network request on?
 *
 * WHY THIS EXISTS AS ONE FUNCTION. `/read/jhn/abc` rendered the correct user-visible error and
 * then fired backend requests anyway carrying a literal `NaN` — `/api/annotations?book=43&
 * chapter=NaN`, plus the commentary and original-language prefetches — each 404/401-ing in the
 * console on every malformed URL (A084, 2026-08-16 QA fleet). The page looked right and the
 * network tab did not.
 *
 * The chapter fetch itself was already guarded. THREE OTHER DISPATCHERS WERE NOT, each deciding
 * for itself whether the param was usable, which is this repo's most-repeated defect class: a rule
 * re-typed at every call site instead of derived once. Adding a fourth `isNaN` would have fixed
 * today's three and left the class intact.
 *
 * DELIBERATELY NOT A RANGE CHECK against the book's chapter count. `read/[book]/[chapter]/page.tsx`
 * separately refuses an out-of-range chapter and renders a recovery page; duplicating that bound
 * here would be the same re-typing this function exists to remove, and it would need the book
 * table, which a param guard has no business holding. This answers one question only: could this
 * value ever address a chapter at all.
 */
export function isFetchableChapter(bookNum: number | undefined, chapter: number): boolean {
  if (!bookNum) return false;
  return Number.isInteger(chapter) && chapter >= 1;
}
