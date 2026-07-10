// Canonical commentary `source_id` synthesis — the SINGLE source of truth shared
// by the embed job (`embed-full-corpus.ts`) and every coverage check
// (`check-corpus-coverage.ts`, `measure-embedding-gap.ts`).
//
// If these ever diverged, the coverage gate would silently lie: it would compare
// the corpus against keys the embed job never wrote, reporting phantom gaps (or
// missing real ones). Both MUST import from here so the format can only change in
// one place.

export const BOOK_SLUGS: Record<number, string> = {
  1:'gen',2:'exo',3:'lev',4:'num',5:'deu',6:'jos',7:'jdg',8:'rut',9:'1sa',10:'2sa',
  11:'1ki',12:'2ki',13:'1ch',14:'2ch',15:'ezr',16:'neh',17:'est',18:'job',19:'psa',
  20:'pro',21:'ecc',22:'sng',23:'isa',24:'jer',25:'lam',26:'ezk',27:'dan',28:'hos',
  29:'jol',30:'amo',31:'oba',32:'jon',33:'mic',34:'nam',35:'hab',36:'zep',37:'hag',
  38:'zec',39:'mal',40:'mat',41:'mrk',42:'luk',43:'jhn',44:'act',45:'rom',46:'1co',
  47:'2co',48:'gal',49:'eph',50:'php',51:'col',52:'1th',53:'2th',54:'1ti',55:'2ti',
  56:'tit',57:'phm',58:'heb',59:'jas',60:'1pe',61:'2pe',62:'1jn',63:'2jn',64:'3jn',
  65:'jud',66:'rev',
};

// Minimum body length for a `commentary_entries` row to be eligible for
// embedding. Rows below this are stub/boilerplate entries the embed job skips,
// so the coverage gate must apply the same floor or it counts un-embeddable
// rows as gaps.
export const MIN_BODY_LENGTH = 100;

export interface CommentaryKey {
  book: number;
  chapter: number;
  verse_start: number;
  verse_end: number;
  author: string;
}

// The `embeddings.source_id` format the embed job writes:
//   commentary:{book_slug}:{chapter}:{verse_start}-{verse_end}:{author}
//
// Returns `null` when the book number has no slug mapping — the embed job skips
// those rows (`if (!slug) continue`), so the coverage gate must skip them too.
export function synthesizeSourceId(k: CommentaryKey): string | null {
  const slug = BOOK_SLUGS[k.book];
  if (!slug) return null;
  return `commentary:${slug}:${k.chapter}:${k.verse_start}-${k.verse_end}:${k.author}`;
}
