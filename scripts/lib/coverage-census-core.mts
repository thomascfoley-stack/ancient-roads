// THE PURE CORE of the canon-coverage census (cutover order P0.4, 2026-08-03).
//
// The instrument that measures what admitting a corpus is FOR: per Bible
// book/chapter, how many real verses carry ANY served exegetical voice and how
// many carry ≥2 DISTINCT authors (the voice floor a plan day and the /ask
// ladder need). "Exegetical" is EXEGETICAL_SOURCE_TYPES — imported, never
// re-typed; it is the same pair the served_legal index predicates on.
//
// The verse universe comes from RAW_VERSE_COUNTS, never generate_series — ids
// are book*1e6+ch*1e3+v, so a naive series manufactures ~978 phantom verses
// per chapter up to the 999 sentinel.
//
// The pre-registered bar (the order, Phase 4): no book/chapter that had ≥2
// distinct-author voices LOSES one across a serve batch. diffCensus is that
// bar; gains are reported because they are the point.

export interface VerseVoiceRow {
  verseId: number;
  /** distinct served exegetical authors anchored on this verse */
  authors: number;
}

export interface ChapterStat {
  book: number;
  chapter: number;
  /** real verses in the chapter (canon), the denominator */
  verses: number;
  /** verses with ≥1 served exegetical voice */
  withVoice: number;
  /** verses with ≥2 distinct served exegetical authors */
  with2Plus: number;
}

export function chapterKeyOf(verseId: number): number {
  return Math.floor(verseId / 1000);
}

export function buildCensus(
  rows: VerseVoiceRow[],
  verseCounts: Record<string, Record<string, number>>,
): ChapterStat[] {
  const byChapter = new Map<number, { withVoice: number; with2Plus: number }>();
  for (const r of rows) {
    const key = chapterKeyOf(r.verseId);
    const c = byChapter.get(key) ?? { withVoice: 0, with2Plus: 0 };
    if (r.authors >= 1) c.withVoice++;
    if (r.authors >= 2) c.with2Plus++;
    byChapter.set(key, c);
  }
  const out: ChapterStat[] = [];
  for (const [bookStr, chapters] of Object.entries(verseCounts)) {
    const book = Number(bookStr);
    for (const [chStr, verses] of Object.entries(chapters)) {
      const chapter = Number(chStr);
      const c = byChapter.get(book * 1000 + chapter) ?? { withVoice: 0, with2Plus: 0 };
      out.push({ book, chapter, verses, withVoice: c.withVoice, with2Plus: c.with2Plus });
    }
  }
  return out.sort((a, b) => a.book - b.book || a.chapter - b.chapter);
}

export interface FloorBreak {
  book: number;
  chapter: number;
  before: number;
  after: number;
}

export interface CensusDiff {
  /** chapters that HAD ≥2-author coverage and lost verses of it — the bar */
  floorBreaks: FloorBreak[];
  /** chapters that had no ≥2-author coverage and gained it — the point */
  chaptersGained2Plus: number;
  versesGained2Plus: number;
  versesGainedVoice: number;
}

export function diffCensus(before: ChapterStat[], after: ChapterStat[]): CensusDiff {
  const afterBy = new Map(after.map((c) => [c.book * 1000 + c.chapter, c]));
  const floorBreaks: FloorBreak[] = [];
  let chaptersGained2Plus = 0;
  let versesGained2Plus = 0;
  let versesGainedVoice = 0;
  for (const b of before) {
    const a = afterBy.get(b.book * 1000 + b.chapter);
    if (!a) {
      if (b.with2Plus > 0) floorBreaks.push({ book: b.book, chapter: b.chapter, before: b.with2Plus, after: 0 });
      continue;
    }
    // The floor bites only where coverage EXISTED — a chapter at zero before a
    // batch is a gap the batch did not create.
    if (b.with2Plus > 0 && a.with2Plus < b.with2Plus) {
      floorBreaks.push({ book: b.book, chapter: b.chapter, before: b.with2Plus, after: a.with2Plus });
    }
    if (b.with2Plus === 0 && a.with2Plus > 0) chaptersGained2Plus++;
    versesGained2Plus += Math.max(0, a.with2Plus - b.with2Plus);
    versesGainedVoice += Math.max(0, a.withVoice - b.withVoice);
  }
  return { floorBreaks, chaptersGained2Plus, versesGained2Plus, versesGainedVoice };
}
