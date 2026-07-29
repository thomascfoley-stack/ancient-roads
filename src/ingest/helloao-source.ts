// Shared helloao ("Free Use Bible API") source definitions — the SINGLE place
// that knows how to reach a per-verse commentary text on bible.helloao.org. Used
// by the provenance-repair tool AND embedded (as a recipe) into each repaired
// source's provenance, so a FUTURE full-text rebuild is a clean re-fetch, not a
// re-investigation (RESOURCING_PLAN §8.1).

import { BOOKS } from '../bible/books.js';
import type { SourceAdapter, VerseText } from './resource-textmatch.js';

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

interface HelloaoBookMeta { id: string; numberOfChapters: number; firstChapterNumber: number }
interface HelloaoVerseNode { type?: string; number?: number; content?: Array<string | { text?: string }> }

async function fetchJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const t = await res.text();
    return t.startsWith('<') ? null : JSON.parse(t);
  } catch { return null; }
}
function versesOf(content: HelloaoVerseNode[]): Array<{ verse: number; text: string }> {
  const out: Array<{ verse: number; text: string }> = [];
  for (const item of content) {
    if (item.type === 'verse' && item.number && item.content) {
      const parts = item.content.map((c) => (typeof c === 'string' ? c : c?.text ?? '')).join(' ').trim();
      if (parts.length > 10) out.push({ verse: item.number, text: parts });
    }
  }
  return out;
}
async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]!); }));
}

// The helloao SourceAdapter — the reference implementation of the reusable
// re-source contract (resource-textmatch.ts). fetchWork yields every (verseId,
// text) helloao has for a commentary; the generic matcher does the rest.
export const helloaoAdapter: SourceAdapter = {
  name: 'helloao',
  provenanceUrl: (id) => `${HELLOAO_API}/c/${id}`,
  editionLabel: (id, title) => `${title} (helloao ${id}, CC Public Domain Mark 1.0)`,
  rebuildRecipe,
  async fetchWork(id: string): Promise<VerseText[]> {
    const booksData = await fetchJson(`${HELLOAO_API}/c/${id}/books.json`) as { books: HelloaoBookMeta[] } | null;
    const jobs: Array<{ url: string; bookNum: number; ch: number }> = [];
    for (const b of booksData?.books ?? []) {
      const slug = HELLOAO_BOOK_MAP[b.id];
      const bookNum = slug ? SLUG_TO_BOOK_NUM[slug] : undefined;
      if (!bookNum) continue;
      for (let ch = b.firstChapterNumber; ch <= b.numberOfChapters; ch++) jobs.push({ url: chapterEndpoint(id, b.id, ch), bookNum, ch });
    }
    const out: VerseText[] = [];
    await pool(jobs, 8, async (job) => {
      const data = await fetchJson(job.url) as { chapter?: { content?: HelloaoVerseNode[] } } | null;
      if (!data?.chapter?.content) return;
      for (const { verse, text } of versesOf(data.chapter.content)) out.push({ verseId: job.bookNum * 1_000_000 + job.ch * 1000 + verse, text });
    });
    return out;
  },
};

export const HELLOAO_PD_WORKS: HelloaoWork[] = [
  { commentaryId: 'john-gill', slug: 'john-gill', title: "John Gill's Exposition of the Bible", author: 'John Gill', dataAuthor: 'John Gill', year: 1763, tradition: 'reformed', era: 'modern', license: 'Public Domain' },
  { commentaryId: 'jamieson-fausset-brown', slug: 'jfb', title: 'Jamieson-Fausset-Brown Bible Commentary', author: 'Jamieson, Fausset & Brown', dataAuthor: 'Jamieson, Fausset & Brown', year: 1871, tradition: 'presbyterian', era: 'modern', license: 'Public Domain' },
  { commentaryId: 'adam-clarke', slug: 'adam-clarke', title: "Adam Clarke's Commentary on the Bible", author: 'Adam Clarke', dataAuthor: 'Adam Clarke', year: 1832, tradition: 'methodist', era: 'modern', license: 'Public Domain' },
  { commentaryId: 'matthew-henry', slug: 'matthew-henry', title: "Matthew Henry's Complete Commentary", author: 'Matthew Henry', dataAuthor: 'Matthew Henry', year: 1710, tradition: 'nonconformist', era: 'puritan', license: 'Public Domain' },
];
