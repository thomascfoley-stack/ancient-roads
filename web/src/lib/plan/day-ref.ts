// A chapter-range label for a plan day, shared by the plan detail and the home
// card. Lives outside plans-client.tsx so the home screen does not pull the
// whole plans surface (PassagePane, builder, topic picker) into its bundle.
import { BOOK_BY_NUM } from '@/bible/books';

export function refOf(verseStart: number, verseEnd: number): string {
  const startBook = Math.floor(verseStart / 1_000_000);
  const endBook = Math.floor(verseEnd / 1_000_000);
  const startCh = Math.floor((verseStart % 1_000_000) / 1000);
  const endCh = Math.floor((verseEnd % 1_000_000) / 1000);
  const name = BOOK_BY_NUM.get(startBook)?.name ?? '?';
  if (startBook !== endBook) return `${name} ${startCh}–${BOOK_BY_NUM.get(endBook)?.name ?? '?'} ${endCh}`;
  return startCh === endCh ? `${name} ${startCh}` : `${name} ${startCh}–${endCh}`;
}
