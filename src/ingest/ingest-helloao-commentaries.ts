import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { BOOKS } from '../bible/books.js';

const API = 'https://bible.helloao.org/api';
const OUT = 'web/public/commentaries';

const COMMENTARIES = ['keil-delitzsch', 'tyndale'];

const SLUG_TO_BOOK_NUM: Record<string, number> = {};
for (const [i, b] of BOOKS.entries()) {
  SLUG_TO_BOOK_NUM[b.slug] = i + 1;
}

const HELLOAO_BOOK_MAP: Record<string, string> = {
  GEN: 'gen', EXO: 'exo', LEV: 'lev', NUM: 'num', DEU: 'deu',
  JOS: 'jos', JDG: 'jdg', RUT: 'rut', '1SA': '1sa', '2SA': '2sa',
  '1KI': '1ki', '2KI': '2ki', '1CH': '1ch', '2CH': '2ch',
  EZR: 'ezr', NEH: 'neh', EST: 'est', JOB: 'job', PSA: 'psa',
  PRO: 'pro', ECC: 'ecc', SNG: 'sng', ISA: 'isa', JER: 'jer',
  LAM: 'lam', EZK: 'ezk', DAN: 'dan', HOS: 'hos', JOL: 'jol',
  AMO: 'amo', OBA: 'oba', JON: 'jon', MIC: 'mic', NAM: 'nam',
  HAB: 'hab', ZEP: 'zep', HAG: 'hag', ZEC: 'zec', MAL: 'mal',
  MAT: 'mat', MRK: 'mrk', LUK: 'luk', JHN: 'jhn', ACT: 'act',
  ROM: 'rom', '1CO': '1co', '2CO': '2co', GAL: 'gal', EPH: 'eph',
  PHP: 'php', COL: 'col', '1TH': '1th', '2TH': '2th',
  '1TI': '1ti', '2TI': '2ti', TIT: 'tit', PHM: 'phm',
  HEB: 'heb', JAS: 'jas', '1PE': '1pe', '2PE': '2pe',
  '1JN': '1jn', '2JN': '2jn', '3JN': '3jn', JUD: 'jud', REV: 'rev',
  Ezek: 'ezk', Gen: 'gen', Exod: 'exo', Lev: 'lev', Num: 'num',
  Deut: 'deu', Josh: 'jos', Judg: 'jdg', Ruth: 'rut',
  '1Sam': '1sa', '2Sam': '2sa', '1Kgs': '1ki', '2Kgs': '2ki',
  '1Chr': '1ch', '2Chr': '2ch', Ezra: 'ezr', Neh: 'neh',
  Esth: 'est', Job: 'job', Ps: 'psa', Prov: 'pro', Eccl: 'ecc',
  Song: 'sng', Isa: 'isa', Jer: 'jer', Lam: 'lam',
  Dan: 'dan', Hos: 'hos', Joel: 'jol', Amos: 'amo', Obad: 'oba',
  Jonah: 'jon', Mic: 'mic', Nah: 'nam', Hab: 'hab', Zeph: 'zep',
  Hag: 'hag', Zech: 'zec', Mal: 'mal',
  Matt: 'mat', Mark: 'mrk', Luke: 'luk', John: 'jhn', Acts: 'act',
  Rom: 'rom', '1Cor': '1co', '2Cor': '2co', Gal: 'gal', Eph: 'eph',
  Phil: 'php', Col: 'col', '1Thess': '1th', '2Thess': '2th',
  '1Tim': '1ti', '2Tim': '2ti', Titus: 'tit', Phlm: 'phm',
  Heb: 'heb', Jas: 'jas', '1Pet': '1pe', '2Pet': '2pe',
  '1John': '1jn', '2John': '2jn', '3John': '3jn', Jude: 'jud', Rev: 'rev',
};

const AUTHOR_NAMES: Record<string, string> = {
  'keil-delitzsch': 'Keil & Delitzsch',
  'tyndale': 'Tyndale Study Notes',
};

const YEARS: Record<string, number> = {
  'keil-delitzsch': 1878,
  'tyndale': 2020,
};

const TRADITIONS: Record<string, string> = {
  'keil-delitzsch': 'Reformed',
  'tyndale': 'Evangelical',
};

const TITLES: Record<string, string> = {
  'keil-delitzsch': 'Commentary on the Old Testament',
  'tyndale': 'Tyndale Open Study Notes',
};

async function fetchJson(url: string): Promise<any> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    if (text.startsWith('<')) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function extractText(content: any[]): { verse: number; text: string }[] {
  const results: { verse: number; text: string }[] = [];
  for (const item of content) {
    if (item.type === 'verse' && item.number && item.content) {
      const parts: string[] = [];
      for (const c of item.content) {
        if (typeof c === 'string') parts.push(c);
        else if (c?.text) parts.push(c.text);
      }
      const text = parts.join(' ').trim();
      if (text.length > 10) {
        results.push({ verse: item.number, text: text.substring(0, 3000) });
      }
    }
  }
  return results;
}

async function main() {
  let grandTotal = 0;
  for (const commentaryId of COMMENTARIES) {
    console.log(`\n=== ${commentaryId} ===`);
    const booksData = await fetchJson(`${API}/c/${commentaryId}/books.json`);
    if (!booksData) { console.log('  Failed to fetch books'); continue; }

    const books = booksData.books;
    let totalAdded = 0;

    for (const book of books) {
      const slug = HELLOAO_BOOK_MAP[book.id];
      if (!slug) {
        console.log(`  Skipping unknown book ID: ${book.id}`);
        continue;
      }
      const bookNum = SLUG_TO_BOOK_NUM[slug];
      if (!bookNum) continue;

      const numChapters = book.numberOfChapters;
      for (let chNum = book.firstChapterNumber; chNum <= numChapters; chNum++) {
        await sleep(50);
        const chapterData = await fetchJson(
          `${API}/c/${commentaryId}/${book.id}/${chNum}.json`
        );
        if (!chapterData?.chapter?.content) continue;

        const verses = extractText(chapterData.chapter.content);
        if (verses.length === 0) continue;

        const outDir = `${OUT}/${slug}`;
        mkdirSync(outDir, { recursive: true });
        const outFile = `${outDir}/${chNum}.json`;

        let existing: { book: number; chapter: number; entries: any[] };
        if (existsSync(outFile)) {
          existing = JSON.parse(readFileSync(outFile, 'utf-8'));
        } else {
          existing = { book: bookNum, chapter: chNum, entries: [] };
        }

        const authorName = AUTHOR_NAMES[commentaryId]!;
        const alreadyHas = existing.entries.some(
          (e: any) => e.author === authorName
        );
        if (alreadyHas) {
          process.stdout.write('-');
          continue;
        }

        for (const v of verses) {
          existing.entries.push({
            verseStart: v.verse,
            verseEnd: v.verse,
            author: authorName,
            year: YEARS[commentaryId],
            sourceTitle: TITLES[commentaryId],
            sourceUrl: 'https://bible.helloao.org',
            text: v.text,
            tradition: TRADITIONS[commentaryId],
          });
          totalAdded++;
        }

        existing.entries.sort((a: any, b: any) =>
          a.verseStart - b.verseStart || a.author.localeCompare(b.author)
        );

        writeFileSync(outFile, JSON.stringify(existing));
        process.stdout.write('.');
      }
    }
    console.log(`\n  Added ${totalAdded} entries`);
    grandTotal += totalAdded;
  }
  console.log(`\nTotal new entries: ${grandTotal}`);
}

main().catch(console.error);
