// Builds whole-Bible original-language word data for the reader interlinear:
//   web/public/original/{bookSlug}/{chapter}.json
//   { book, chapter, lang, verses: { "1": [ {w,l,tr,s,m,g}, ... ] } }
//     w  surface word (original script)   l  lemma (dictionary form)
//     tr transliteration                  s  Strong's ("H7225"/"G26"/"")
//     m  morph code                       g  short gloss
//
// Hebrew OT  <- openscriptures/morphhb (OSIS XML, Strong's in lemma attr)
// Greek NT   <- morphgnt/sblgnt (lemma mapped to Strong's via the dictionary)
// Glosses/transliteration denormalized from web/public/lexicon/{greek,hebrew}.json
// so the interlinear renders without loading the full dictionaries.
// Re-runnable.

import { writeFileSync, mkdirSync, readFileSync } from 'fs';

const OUT = 'web/public/original';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Dict = Record<string, { lemma: string; translit: string; def: string; kjv: string }>;
const greek: Dict = JSON.parse(readFileSync('web/public/lexicon/greek.json', 'utf-8'));
const hebrew: Dict = JSON.parse(readFileSync('web/public/lexicon/hebrew.json', 'utf-8'));

// Greek lemma -> Strong's key (NFC-normalized). First match wins.
const greekLemmaToStrong = new Map<string, string>();
for (const [k, v] of Object.entries(greek)) {
  if (v.lemma) {
    const key = v.lemma.normalize('NFC');
    if (!greekLemmaToStrong.has(key)) greekLemmaToStrong.set(key, k);
  }
}

function shortGloss(def: string, kjv: string): string {
  // Strip parenthetical qualifiers and leading non-letters, then take the first
  // clause. Fall back to the KJV usage when the definition is empty/unusable.
  const clean = (s: string) =>
    s.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').replace(/^[^\p{L}]+/u, '').trim();
  let first = clean(def).split(/[;,]/)[0]!.trim();
  if (!first) first = clean(kjv).split(/[;,]/)[0]!.trim();
  if (!first) return '';
  return first.length > 42 ? first.slice(0, 40).trim() + '…' : first;
}

interface Word { w: string; l: string; tr: string; s: string; m: string; g: string }

// ---- Hebrew (morphhb) ------------------------------------------------------

const HEBREW_BOOKS: [osis: string, slug: string][] = [
  ['Gen','gen'],['Exod','exo'],['Lev','lev'],['Num','num'],['Deut','deu'],
  ['Josh','jos'],['Judg','jdg'],['Ruth','rut'],['1Sam','1sa'],['2Sam','2sa'],
  ['1Kgs','1ki'],['2Kgs','2ki'],['1Chr','1ch'],['2Chr','2ch'],['Ezra','ezr'],
  ['Neh','neh'],['Esth','est'],['Job','job'],['Ps','psa'],['Prov','pro'],
  ['Eccl','ecc'],['Song','sng'],['Isa','isa'],['Jer','jer'],['Lam','lam'],
  ['Ezek','ezk'],['Dan','dan'],['Hos','hos'],['Joel','jol'],['Amos','amo'],
  ['Obad','oba'],['Jonah','jon'],['Mic','mic'],['Nah','nam'],['Hab','hab'],
  ['Zeph','zep'],['Hag','hag'],['Zech','zec'],['Mal','mal'],
];

function hebrewStrong(lemma: string): string {
  // lemma like "b/7225", "1254 a", "c/d/776", "9001". Content Strong's is the
  // last "/"-segment; real Strong's are 1..8674 (>=9000 are morphology markers).
  const last = lemma.split('/').pop() ?? '';
  const m = last.match(/\d+/);
  if (!m) return '';
  const n = parseInt(m[0], 10);
  return n >= 1 && n <= 8674 ? `H${n}` : '';
}

function parseHebrewBook(xml: string): Map<number, Record<string, Word[]>> {
  const byChapter = new Map<number, Record<string, Word[]>>();
  const verseRe = /<verse osisID="[^".]+\.(\d+)\.(\d+)">([\s\S]*?)<\/verse>/g;
  const wordRe = /<w\s+([^>]*?)>([\s\S]*?)<\/w>/g;
  let vm: RegExpExecArray | null;
  while ((vm = verseRe.exec(xml))) {
    const chapter = parseInt(vm[1]!, 10);
    const verse = vm[2]!;
    const body = vm[3]!;
    const words: Word[] = [];
    let wm: RegExpExecArray | null;
    while ((wm = wordRe.exec(body))) {
      const attrs = wm[1]!;
      const lemma = attrs.match(/lemma="([^"]*)"/)?.[1] ?? '';
      const morph = attrs.match(/morph="([^"]*)"/)?.[1] ?? '';
      const surface = wm[2]!.replace(/<[^>]+>/g, '').replace(/\//g, '').trim();
      if (!surface) continue;
      const s = hebrewStrong(lemma);
      const entry = s ? hebrew[s] : undefined;
      words.push({
        w: surface,
        l: entry?.lemma ?? '',
        tr: entry?.translit ?? '',
        s,
        m: morph,
        g: entry ? shortGloss(entry.def, entry.kjv) : '',
      });
    }
    if (!byChapter.has(chapter)) byChapter.set(chapter, {});
    byChapter.get(chapter)![verse] = words;
  }
  return byChapter;
}

// ---- Greek (MorphGNT) ------------------------------------------------------

const GREEK_FILES: [file: string, slug: string][] = [
  ['61-Mt','mat'],['62-Mk','mrk'],['63-Lk','luk'],['64-Jn','jhn'],['65-Ac','act'],
  ['66-Ro','rom'],['67-1Co','1co'],['68-2Co','2co'],['69-Ga','gal'],['70-Eph','eph'],
  ['71-Php','php'],['72-Col','col'],['73-1Th','1th'],['74-2Th','2th'],['75-1Ti','1ti'],
  ['76-2Ti','2ti'],['77-Tit','tit'],['78-Phm','phm'],['79-Heb','heb'],['80-Jas','jas'],
  ['81-1Pe','1pe'],['82-2Pe','2pe'],['83-1Jn','1jn'],['84-2Jn','2jn'],['85-3Jn','3jn'],
  ['86-Jud','jud'],['87-Re','rev'],
];

function parseGreekFile(txt: string): Map<number, Record<string, Word[]>> {
  const byChapter = new Map<number, Record<string, Word[]>>();
  for (const line of txt.trim().split('\n')) {
    const p = line.split(' ');
    if (p.length < 7) continue;
    const ref = p[0]!; // BBCCVV
    const chapter = parseInt(ref.slice(2, 4), 10);
    const verse = String(parseInt(ref.slice(4, 6), 10));
    const pos = p[1]!;
    const parse = p[2]!;
    const surface = p[4]!; // bare word
    const lemma = p[6]!;
    const s = greekLemmaToStrong.get(lemma.normalize('NFC')) ?? '';
    const entry = s ? greek[s] : undefined;
    const w: Word = {
      w: surface,
      l: lemma,
      tr: entry?.translit ?? '',
      s,
      m: `${pos} ${parse}`.trim(),
      g: entry ? shortGloss(entry.def, entry.kjv) : '',
    };
    if (!byChapter.has(chapter)) byChapter.set(chapter, {});
    (byChapter.get(chapter)![verse] ??= []).push(w);
  }
  return byChapter;
}

async function fetchText(url: string, tries = 3): Promise<string> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res.text();
    } catch { /* retry */ }
    await sleep(500);
  }
  throw new Error(`failed ${url}`);
}

function writeBook(slug: string, bookNum: number, lang: string, byChapter: Map<number, Record<string, Word[]>>) {
  mkdirSync(`${OUT}/${slug}`, { recursive: true });
  let words = 0;
  for (const [chapter, verses] of byChapter) {
    for (const vs of Object.values(verses)) words += vs.length;
    writeFileSync(`${OUT}/${slug}/${chapter}.json`, JSON.stringify({ book: bookNum, chapter, lang, verses }));
  }
  return words;
}

async function main() {
  const onlyLang = process.argv[2]; // 'hebrew' | 'greek' | undefined = both
  let total = 0;

  if (!onlyLang || onlyLang === 'hebrew') {
    console.log('=== Hebrew OT (morphhb) ===');
    for (let i = 0; i < HEBREW_BOOKS.length; i++) {
      const [osis, slug] = HEBREW_BOOKS[i]!;
      const xml = await fetchText(`https://raw.githubusercontent.com/openscriptures/morphhb/master/wlc/${osis}.xml`);
      const parsed = parseHebrewBook(xml);
      const n = writeBook(slug, i + 1, 'hebrew', parsed);
      total += n;
      process.stdout.write(`${slug}(${n}) `);
      await sleep(120);
    }
    console.log('');
  }

  if (!onlyLang || onlyLang === 'greek') {
    console.log('=== Greek NT (MorphGNT) ===');
    for (let i = 0; i < GREEK_FILES.length; i++) {
      const [file, slug] = GREEK_FILES[i]!;
      const txt = await fetchText(`https://raw.githubusercontent.com/morphgnt/sblgnt/master/${file}-morphgnt.txt`);
      const parsed = parseGreekFile(txt);
      const n = writeBook(slug, 40 + i, 'greek', parsed);
      total += n;
      process.stdout.write(`${slug}(${n}) `);
      await sleep(120);
    }
    console.log('');
  }

  console.log(`\nTotal tagged words: ${total}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
