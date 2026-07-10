// Shared helloao ("Free Use Bible API") source definitions — the SINGLE place
// that knows how to reach a per-verse commentary text on bible.helloao.org. Used
// by the provenance-repair tool AND embedded (as a recipe) into each repaired
// source's provenance, so a FUTURE full-text rebuild is a clean re-fetch, not a
// re-investigation (RESOURCING_PLAN §8.1).

import { BOOKS } from '../bible/books.js';

export const HELLOAO_API = 'https://bible.helloao.org/api';

// helloao book id -> our slug (helloao uses both UPPER and Mixed casings across
// commentaries, so include both).
export const HELLOAO_BOOK_MAP: Record<string, string> = {
  GEN: 'gen', EXO: 'exo', LEV: 'lev', NUM: 'num', DEU: 'deu', JOS: 'jos', JDG: 'jdg', RUT: 'rut',
  '1SA': '1sa', '2SA': '2sa', '1KI': '1ki', '2KI': '2ki', '1CH': '1ch', '2CH': '2ch',
  EZR: 'ezr', NEH: 'neh', EST: 'est', JOB: 'job', PSA: 'psa', PRO: 'pro', ECC: 'ecc', SNG: 'sng',
  ISA: 'isa', JER: 'jer', LAM: 'lam', EZK: 'ezk', DAN: 'dan', HOS: 'hos', JOL: 'jol', AMO: 'amo',
  OBA: 'oba', JON: 'jon', MIC: 'mic', NAM: 'nam', HAB: 'hab', ZEP: 'zep', HAG: 'hag', ZEC: 'zec', MAL: 'mal',
  MAT: 'mat', MRK: 'mrk', LUK: 'luk', JHN: 'jhn', ACT: 'act', ROM: 'rom', '1CO': '1co', '2CO': '2co',
  GAL: 'gal', EPH: 'eph', PHP: 'php', COL: 'col', '1TH': '1th', '2TH': '2th', '1TI': '1ti', '2TI': '2ti',
  TIT: 'tit', PHM: 'phm', HEB: 'heb', JAS: 'jas', '1PE': '1pe', '2PE': '2pe', '1JN': '1jn', '2JN': '2jn',
  '3JN': '3jn', JUD: 'jud', REV: 'rev',
  Gen: 'gen', Exod: 'exo', Lev: 'lev', Num: 'num', Deut: 'deu', Josh: 'jos', Judg: 'jdg', Ruth: 'rut',
  '1Sam': '1sa', '2Sam': '2sa', '1Kgs': '1ki', '2Kgs': '2ki', '1Chr': '1ch', '2Chr': '2ch',
  Ezra: 'ezr', Neh: 'neh', Esth: 'est', Job: 'job', Ps: 'psa', Prov: 'pro', Eccl: 'ecc', Song: 'sng',
  Isa: 'isa', Jer: 'jer', Lam: 'lam', Ezek: 'ezk', Dan: 'dan', Hos: 'hos', Joel: 'jol', Amos: 'amo',
  Obad: 'oba', Jonah: 'jon', Mic: 'mic', Nah: 'nam', Hab: 'hab', Zeph: 'zep', Hag: 'hag', Zech: 'zec', Mal: 'mal',
  Matt: 'mat', Mark: 'mrk', Luke: 'luk', John: 'jhn', Acts: 'act', Rom: 'rom', '1Cor': '1co', '2Cor': '2co',
  Gal: 'gal', Eph: 'eph', Phil: 'php', Col: 'col', '1Thess': '1th', '2Thess': '2th', '1Tim': '1ti', '2Tim': '2ti',
  Titus: 'tit', Phlm: 'phm', Heb: 'heb', Jas: 'jas', '1Pet': '1pe', '2Pet': '2pe', '1John': '1jn',
  '2John': '2jn', '3John': '3jn', Jude: 'jud', Rev: 'rev',
};

export const SLUG_TO_BOOK_NUM: Record<string, number> = {};
for (const [i, b] of BOOKS.entries()) SLUG_TO_BOOK_NUM[b.slug] = i + 1;

// The per-chapter endpoint that yields every verse of a commentary chapter.
export function chapterEndpoint(commentaryId: string, helloaoBookId: string, chapter: number): string {
  return `${HELLOAO_API}/c/${commentaryId}/${helloaoBookId}/${chapter}.json`;
}

// The forward-compatible rebuild recipe stored in a repaired source's provenance:
// everything needed to re-fetch untruncated text for any verse, deterministically.
export function rebuildRecipe(commentaryId: string) {
  return {
    source: 'helloao' as const,
    commentary_id: commentaryId,
    api: HELLOAO_API,
    books_endpoint: `${HELLOAO_API}/c/${commentaryId}/books.json`,
    verse_endpoint: `${HELLOAO_API}/c/${commentaryId}/{helloao_book_id}/{chapter}.json  (verse = content item where type='verse', item.number)`,
    book_id_map: 'src/ingest/helloao-source.ts#HELLOAO_BOOK_MAP',
    note: 'stored section body is the vector-backing text (some verses truncated); a full-text rebuild re-fetches untruncated text via this recipe',
  };
}

// The PD commentaries on helloao that map to our no-provenance works. `dataAuthor`
// = the exact author string in our embeddings/commentary_entries.
export interface HelloaoWork {
  commentaryId: string;
  slug: string;
  title: string;
  author: string;
  dataAuthor: string;
  year: number;
  tradition: string;
  era: string;
  license: 'Public Domain';
}

export const HELLOAO_PD_WORKS: HelloaoWork[] = [
  { commentaryId: 'john-gill', slug: 'john-gill', title: "John Gill's Exposition of the Bible", author: 'John Gill', dataAuthor: 'John Gill', year: 1763, tradition: 'reformed', era: 'modern', license: 'Public Domain' },
  { commentaryId: 'jamieson-fausset-brown', slug: 'jfb', title: 'Jamieson-Fausset-Brown Bible Commentary', author: 'Jamieson, Fausset & Brown', dataAuthor: 'Jamieson, Fausset & Brown', year: 1871, tradition: 'presbyterian', era: 'modern', license: 'Public Domain' },
  { commentaryId: 'adam-clarke', slug: 'adam-clarke', title: "Adam Clarke's Commentary on the Bible", author: 'Adam Clarke', dataAuthor: 'Adam Clarke', year: 1832, tradition: 'methodist', era: 'modern', license: 'Public Domain' },
  { commentaryId: 'matthew-henry', slug: 'matthew-henry', title: "Matthew Henry's Complete Commentary", author: 'Matthew Henry', dataAuthor: 'Matthew Henry', year: 1710, tradition: 'nonconformist', era: 'puritan', license: 'Public Domain' },
];
