// MEASURE the ≥2-voices floor across the WHOLE served corpus, before and after a change to
// voicesForPassage / pickDiverse.
//
//   cd web && npx tsx src/scripts/measure-voice-floor.mts [--json out.json]
//
// WHY THIS AND NOT THE HELD-OUT EVAL. The frozen v4 set measures /ask RETRIEVAL accuracy through
// `legalBasePool` → `selectDiverse`, which caps by CHAPTER. The Today card is a different code
// path: `voicesForPassage` → `pickDiverse`, which buckets by TRADITION. They share no function,
// so a v4 re-measure cannot detect a regression here and cannot certify an improvement either.
// There is no held-out set for this surface, so the honest measurement is a census: run the real
// shipped function over every verse of every chapter file and count how often the promise holds.
//
// THE PROMISE UNDER TEST (CLAUDE.md, docs/PRINCIPLES.md): a Today card shows "≥2 grounded
// voices". A *voice* is an author. Two cards quoting the same author twice is ONE voice presented
// as two, which is the failure this script counts.

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { voicesForPassage } from '../lib/today';
import { BOOKS } from '../bible/books';
import type { CommentaryEntry } from '../lib/bible';

const CORPUS = path.resolve(process.cwd(), 'public/commentaries');

function argVal(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

interface Row {
  book: number;
  chapter: number;
  verse: number;
  rung: string;
  authors: string[];
}

function loadChapter(bookSlug: string, chapter: number): CommentaryEntry[] {
  const f = path.join(CORPUS, bookSlug, `${chapter}.json`);
  if (!existsSync(f)) return [];
  const raw = JSON.parse(readFileSync(f, 'utf8')) as unknown;
  const arr = Array.isArray(raw) ? raw : ((raw as { entries?: unknown[] }).entries ?? []);
  return arr as CommentaryEntry[];
}

function main() {
  if (!existsSync(CORPUS)) throw new Error(`corpus not found at ${CORPUS} (it is gitignored; run from web/)`);

  const rows: Row[] = [];
  const bookBySlug = new Map(BOOKS.map((b) => [b.slug, b]));

  for (const slug of readdirSync(CORPUS)) {
    const book = bookBySlug.get(slug);
    if (!book) continue;
    const dir = path.join(CORPUS, slug);
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const chapter = Number(file.replace('.json', ''));
      if (!Number.isFinite(chapter)) continue;
      const entries = loadChapter(slug, chapter);
      if (entries.length === 0) continue;

      // every verse that any entry touches
      const verses = new Set<number>();
      for (const e of entries) {
        // entries carry PLAIN verse numbers (verseStart: 1), not encoded ids — no % 1000.
        for (let v = e.verseStart; v <= e.verseEnd; v++) verses.add(v);
      }
      for (const verse of verses) {
        const id = book.bookNum * 1_000_000 + chapter * 1_000 + verse;
        const { voices, rung } = voicesForPassage({ start: id, end: id }, entries, book.bookNum);
        if (voices.length === 0) continue;
        rows.push({ book: book.bookNum, chapter, verse, rung, authors: voices.map((v) => v.author) });
      }
    }
  }

  const nonEmpty = rows.length;
  const byRung = new Map<string, Row[]>();
  for (const r of rows) byRung.set(r.rung, [...(byRung.get(r.rung) ?? []), r]);

  // THE DEFECT: a set that reports ≥2 cards but carries fewer than 2 DISTINCT authors.
  const sameAuthor = rows.filter((r) => r.authors.length >= 2 && new Set(r.authors).size < 2);
  // and its sibling: a set that claims a rung but delivers a single card.
  const singleCard = rows.filter((r) => r.authors.length < 2);

  console.log(`non-empty voice sets:            ${nonEmpty}`);
  for (const [rung, rs] of [...byRung].sort()) console.log(`  rung=${rung.padEnd(10)} ${rs.length}`);
  console.log(`\nSETS WITH >=2 CARDS BUT <2 DISTINCT AUTHORS: ${sameAuthor.length}`);
  console.log(`SETS DELIVERING A SINGLE CARD:               ${singleCard.length}`);

  if (sameAuthor.length) {
    const byAuthor = new Map<string, number>();
    for (const r of sameAuthor) byAuthor.set(r.authors[0]!, (byAuthor.get(r.authors[0]!) ?? 0) + 1);
    console.log('\n  duplicated author → count:');
    for (const [a, n] of [...byAuthor].sort((x, y) => y[1] - x[1])) console.log(`    ${a}: ${n}`);
    const books = new Set(sameAuthor.map((r) => r.book));
    console.log(`  affected books: ${[...books].sort((a, b) => a - b).join(', ')}`);
  }

  const out = argVal('--json');
  if (out) {
    writeFileSync(out, JSON.stringify({ nonEmpty, sameAuthor: sameAuthor.length, singleCard: singleCard.length,
      byRung: Object.fromEntries([...byRung].map(([k, v]) => [k, v.length])) }, null, 2));
    console.log(`\nwrote ${out}`);
  }
}

main();
