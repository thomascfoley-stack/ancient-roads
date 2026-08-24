// Chapter-local verse range for a reader entry.
//
// D24 (DEEP_SWEEP): a static reader entry is filed under the START chapter, so its `verseEnd`
// must be chapter-local. `(verseEnd ?? verseId) % 1000` is chapter-local only when both ends sit
// in the same chapter — across a chapter boundary it produces a SMALLER number than verseStart
// (start Gen 3:20, end Gen 4:2 gives 20..2). Nothing crashes: the reader's predicate is
// `verseStart <= verse && verse <= verseEnd` (read/[book]/[chapter]/page.tsx, today.ts,
// work-beside-tradition.tsx), and an inverted range matches NO verse — so the entry is ingested,
// stored, and silently never displayed.
//
// register-writer.ts:340-346 found and fixed this on 2026-07-17 and documents it with the same
// Gen 3:20 / Gen 4:2 example. insert-static-author.ts and regen-crosswire-static.ts were both
// created the day BEFORE and never got the fix. This is that fix, extracted so the two of them
// share one definition rather than a third and fourth hand-typed copy.
export function chapterLocalVerseEnd(verseIdStart: number, verseIdEnd: number | undefined): number {
  const end = verseIdEnd ?? verseIdStart;
  const sameChapter = Math.floor(verseIdStart / 1000) === Math.floor(end / 1000);
  // Cap a cross-chapter (or cross-book) range at the rest of the start chapter.
  return sameChapter ? end % 1000 : 999;
}
