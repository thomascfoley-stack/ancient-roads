import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { BOOKS } from '../bible/books.js';

const OUT = 'web/public/commentaries';

const SLUG_TO_BIBLEHUB: Record<string, string> = {
  gen: 'genesis', exo: 'exodus', lev: 'leviticus', num: 'numbers',
  deu: 'deuteronomy', jos: 'joshua', jdg: 'judges', rut: 'ruth',
  '1sa': '1_samuel', '2sa': '2_samuel', '1ki': '1_kings', '2ki': '2_kings',
  '1ch': '1_chronicles', '2ch': '2_chronicles', ezr: 'ezra', neh: 'nehemiah',
  est: 'esther', job: 'job', psa: 'psalms', pro: 'proverbs',
  ecc: 'ecclesiastes', sng: 'songs', isa: 'isaiah', jer: 'jeremiah',
  lam: 'lamentations', ezk: 'ezekiel', dan: 'daniel', hos: 'hosea',
  jol: 'joel', amo: 'amos', oba: 'obadiah', jon: 'jonah',
  mic: 'micah', nam: 'nahum', hab: 'habakkuk', zep: 'zephaniah',
  hag: 'haggai', zec: 'zechariah', mal: 'malachi',
  mat: 'matthew', mrk: 'mark', luk: 'luke', jhn: 'john', act: 'acts',
  rom: 'romans', '1co': '1_corinthians', '2co': '2_corinthians',
  gal: 'galatians', eph: 'ephesians', php: 'philippians', col: 'colossians',
  '1th': '1_thessalonians', '2th': '2_thessalonians',
  '1ti': '1_timothy', '2ti': '2_timothy', tit: 'titus', phm: 'philemon',
  heb: 'hebrews', jas: 'james', '1pe': '1_peter', '2pe': '2_peter',
  '1jn': '1_john', '2jn': '2_john', '3jn': '3_john', jud: 'jude', rev: 'revelation',
};

interface CommentaryDef {
  slug: string;
  author: string;
  year: number;
  tradition: string;
  sourceTitle: string;
  scope: 'whole' | 'ot' | 'nt' | 'psalms';
}

const COMMENTARIES: CommentaryDef[] = [
  { slug: 'barnes', author: "Barnes' Notes", year: 1834, tradition: 'Presbyterian', sourceTitle: "Barnes' Notes on the Bible", scope: 'whole' },
  { slug: 'calvin', author: 'John Calvin', year: 1554, tradition: 'Reformed', sourceTitle: "Calvin's Commentary on the Bible", scope: 'whole' },
  { slug: 'wes', author: 'John Wesley', year: 1765, tradition: 'Methodist', sourceTitle: "Wesley's Explanatory Notes", scope: 'whole' },
  { slug: 'gsb', author: 'Geneva Study Bible', year: 1599, tradition: 'Reformed', sourceTitle: 'Geneva Study Bible', scope: 'whole' },
  { slug: 'sco', author: 'C.I. Scofield', year: 1917, tradition: 'Dispensational', sourceTitle: 'Scofield Reference Notes', scope: 'whole' },
  { slug: 'darby', author: 'J.N. Darby', year: 1857, tradition: 'Plymouth Brethren', sourceTitle: "Darby's Synopsis of the Bible", scope: 'whole' },
  { slug: 'pulpit', author: 'Pulpit Commentary', year: 1890, tradition: 'Anglican', sourceTitle: 'The Pulpit Commentary', scope: 'whole' },
  { slug: 'benson', author: 'Joseph Benson', year: 1811, tradition: 'Methodist', sourceTitle: 'Benson Commentary', scope: 'whole' },
  { slug: 'cambridge', author: 'Cambridge Bible', year: 1882, tradition: 'Anglican', sourceTitle: 'Cambridge Bible for Schools and Colleges', scope: 'whole' },
  { slug: 'poole', author: 'Matthew Poole', year: 1685, tradition: 'Nonconformist', sourceTitle: "Poole's English Annotations on the Holy Bible", scope: 'whole' },
  { slug: 'bengel', author: 'Johann Bengel', year: 1742, tradition: 'Pietist', sourceTitle: "Bengel's Gnomon of the New Testament", scope: 'nt' },
  { slug: 'pnt', author: 'B.W. Johnson', year: 1891, tradition: 'Restoration Movement', sourceTitle: "The People's New Testament", scope: 'nt' },
  { slug: 'tod', author: 'Charles Spurgeon', year: 1885, tradition: 'Baptist', sourceTitle: 'Treasury of David', scope: 'psalms' },
  { slug: 'maclaren', author: 'Alexander MacLaren', year: 1904, tradition: 'Baptist', sourceTitle: 'Expositions of Holy Scripture', scope: 'whole' },
  { slug: 'lange', author: 'J.P. Lange', year: 1865, tradition: 'Reformed', sourceTitle: 'Commentary on the Holy Scriptures', scope: 'whole' },
];

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#\d+;/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseCommentaryPage(html: string): { verse: number; text: string }[] {
  const results: { verse: number; text: string }[] = [];

  const parts = html.split(/<div class="versenum">/);
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    const verseMatch = part.match(/(\d+)(?:-\d+)?\.htm">/);
    if (!verseMatch?.[1]) continue;
    const verseNum = parseInt(verseMatch[1]);

    const afterVerseDiv = part.replace(/^.*?<\/div>/, '');
    const afterBibleText = afterVerseDiv.replace(/^<div class="verse">.*?<\/div>\s*/, '');

    const text = stripHtml(afterBibleText);
    if (text.length > 20) {
      results.push({ verse: verseNum, text: text.substring(0, 5000) });
    }
  }

  return results;
}

function shouldProcess(commentary: CommentaryDef, testament: 'OT' | 'NT'): boolean {
  if (commentary.scope === 'whole') return true;
  if (commentary.scope === 'ot') return testament === 'OT';
  if (commentary.scope === 'nt') return testament === 'NT';
  return false;
}

async function main() {
  const startIdx = parseInt(process.argv[2] || '0');
  const endIdx = parseInt(process.argv[3] || String(COMMENTARIES.length));
  const selected = COMMENTARIES.slice(startIdx, endIdx);

  let grandTotal = 0;

  for (const commentary of selected) {
    console.log(`\n=== ${commentary.author} (${commentary.slug}) ===`);
    let commentaryTotal = 0;

    for (const book of BOOKS) {
      if (commentary.scope === 'psalms' && book.slug !== 'psa') continue;
      if (!shouldProcess(commentary, book.testament)) continue;

      const bhBook = SLUG_TO_BIBLEHUB[book.slug];
      if (!bhBook) continue;

      for (let ch = 1; ch <= book.chapterCount; ch++) {
        await sleep(150);

        const url = `https://biblehub.com/commentaries/${commentary.slug}/${bhBook}/${ch}.htm`;
        try {
          const res = await fetch(url);
          if (!res.ok) {
            if (res.status === 404) { process.stdout.write('x'); continue; }
            process.stdout.write('!');
            continue;
          }

          const html = await res.text();
          if (html.startsWith('<') && html.includes('<!DOCTYPE') && !html.includes('versenum')) {
            process.stdout.write('e');
            continue;
          }

          const verses = parseCommentaryPage(html);
          if (verses.length === 0) { process.stdout.write('-'); continue; }

          const outDir = `${OUT}/${book.slug}`;
          mkdirSync(outDir, { recursive: true });
          const outFile = `${outDir}/${ch}.json`;

          let existing: { book: number; chapter: number; entries: any[] };
          if (existsSync(outFile)) {
            existing = JSON.parse(readFileSync(outFile, 'utf-8'));
          } else {
            existing = { book: book.bookNum, chapter: ch, entries: [] };
          }

          const alreadyHas = existing.entries.some(
            (e: any) => e.author === commentary.author
          );
          if (alreadyHas) { process.stdout.write('='); continue; }

          for (const v of verses) {
            existing.entries.push({
              verseStart: v.verse,
              verseEnd: v.verse,
              author: commentary.author,
              year: commentary.year,
              tradition: commentary.tradition,
              sourceTitle: commentary.sourceTitle,
              sourceUrl: `https://biblehub.com/commentaries/${commentary.slug}/${bhBook}/${ch}.htm`,
              text: v.text,
            });
            commentaryTotal++;
          }

          existing.entries.sort((a: any, b: any) =>
            a.verseStart - b.verseStart || a.author.localeCompare(b.author)
          );

          writeFileSync(outFile, JSON.stringify(existing));
          process.stdout.write('.');
        } catch {
          process.stdout.write('E');
        }
      }
    }

    console.log(`\n  Added ${commentaryTotal} entries`);
    grandTotal += commentaryTotal;
  }

  console.log(`\nTotal new entries: ${grandTotal}`);
}

main().catch(console.error);
