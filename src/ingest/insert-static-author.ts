// Insert (or replace) ONE author's entries in the static reader corpus from a
// per-verse JSONL — the generic path regen-crosswire-static.ts hard-codes for
// the CrossWire five. Used for staged works (Poole TCP); the reader serves only
// published-allowlist authors, so presence here is staging, not serving.
//
//   npx tsx src/ingest/insert-static-author.ts --jsonl=data/raw/poole/poole.jsonl \
//     --author='Matthew Poole' --title='Annotations upon the Holy Bible' \
//     --url='https://github.com/textcreationpartnership/A55363' --year=1685 \
//     --tradition='Puritan'

import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { chapterLocalVerseEnd } from './chapter-local-range.js';
import path from 'node:path';
import { BOOK_SLUGS } from './source-id.js';

const CORPUS_DIR = 'web/public/commentaries';
const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

interface JsonlEntry { author: string; verseId: number; verseEnd?: number; content: string }
interface StaticEntry {
  verseStart: number; verseEnd: number; author: string; year: number | null;
  tradition?: string; sourceTitle: string; sourceUrl: string; text: string;
}
interface ChapterFile { book: number; chapter: number; entries: StaticEntry[] }

function main() {
  const jsonl = arg('--jsonl'), author = arg('--author'), title = arg('--title'),
    url = arg('--url'), year = Number(arg('--year')), tradition = arg('--tradition');
  if (!jsonl || !author || !title || !url || !year || !tradition) {
    throw new Error('usage: insert-static-author.ts --jsonl --author --title --url --year --tradition');
  }
  const incoming = new Map<string, StaticEntry[]>();
  let n = 0;
  for (const line of readFileSync(jsonl, 'utf8').trim().split('\n')) {
    const e = JSON.parse(line) as JsonlEntry;
    const book = Math.floor(e.verseId / 1e6), chapter = Math.floor((e.verseId % 1e6) / 1000);
    if (!BOOK_SLUGS[book]) continue;
    const k = `${book}:${chapter}`;
    const list = incoming.get(k) ?? [];
    list.push({
      verseStart: e.verseId % 1000, verseEnd: chapterLocalVerseEnd(e.verseId, e.verseEnd),
      author, year, tradition, sourceTitle: title, sourceUrl: url, text: e.content,
    });
    incoming.set(k, list);
    n++;
  }

  let touched = 0, removed = 0, inserted = 0;
  const consumed = new Set<string>();
  for (const bookSlug of readdirSync(CORPUS_DIR).sort()) {
    const dir = path.join(CORPUS_DIR, bookSlug);
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir).sort()) {
      if (!f.endsWith('.json') || f === '_manifest.json') continue;
      const p = path.join(dir, f);
      const j = JSON.parse(readFileSync(p, 'utf8')) as ChapterFile;
      if (!Array.isArray(j.entries)) continue;
      const kept = j.entries.filter((e) => e.author !== author);
      removed += j.entries.length - kept.length;
      const key = `${j.book}:${j.chapter}`;
      const fresh = incoming.get(key);
      if (!fresh && kept.length === j.entries.length) continue;
      if (fresh) {
        kept.push(...fresh.sort((a, b) => a.verseStart - b.verseStart));
        inserted += fresh.length;
        consumed.add(key);
      }
      writeFileSync(p, JSON.stringify({ book: j.book, chapter: j.chapter, entries: kept }));
      touched++;
    }
  }
  // A book:chapter with no file on disk would drop silently otherwise (deep-audit M6).
  const dropped = [...incoming.keys()].filter((k) => !consumed.has(k));
  if (dropped.length > 0) {
    console.error(`⚠ ${dropped.length} incoming chapters had NO chapter file and were NOT inserted: ${dropped.slice(0, 10).join(', ')}${dropped.length > 10 ? ' …' : ''}`);
  }
  console.log(`${author}: inserted ${inserted}/${n} entries into ${touched} chapter files (replaced ${removed} prior)`);
}

main();
