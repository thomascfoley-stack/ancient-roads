// Ingest the JPS 1917 Old Testament (eBible.org `engjps`, Public Domain per its
// copyright page) into the static reader corpus.
//
//   npx tsx src/ingest/ingest-ebible-jps.ts [--src=/tmp/ap-bibles/jps-usfm]
//
// Source facts (verified 2026-09-06, printed at run time):
//   - https://ebible.org/engjps/copyright.htm — "The Jewish Bible (Old Testament)
//     in English, published by the Jewish Publication Society in 1917 — Public Domain".
//   - The 1917 text: "The LORD is my shepherd" (Ps 23:1) — NOT the altered
//     "HaShem" digitizations (scrollmapper/getbible's JPS.json is one; rejected).
//   - eBible pre-mapped the MT versification to English (KJV) numbering, keeping
//     the original refs as parenthetical inline markers ("(22-1) … (22-2) …").
//     This script STRIPS those markers and then PROVES the result is canon-exact
//     (every book/chapter/verse count equals the repo's KJV canon) before
//     writing anything — a pre-mapped claim is a hypothesis until the counts
//     agree (THE_LOOP rule 4).
//
// Output: per-chapter files web/public/bible/jps/<slug>/<ch>.json — the
// regeneration source consolidated by src/ingest/consolidate-bibles.ts.
// The NT is not part of the work: those 27 books are written as empty-text
// skeletons by src/ingest/gen-bible-skeletons.ts (the anderson/tyndale/noyes
// precedent), so coverage is honest in the reader instead of 404ing.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseUsfmDir } from './usfm.js';
import { loadKjvCanon } from './sword-zverse.js';
import { BOOKS } from '../bible/books.js';

const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

const SRC = arg('--src') ?? '/tmp/ap-bibles/jps-usfm';
const ID = 'jps';
const OUT = `web/public/bible/${ID}`;

// ── CANON-EXACT PROOF (extracted for direct testing) ──
//
// The whole premise of using this pre-mapped source. A pre-mapped claim is a
// hypothesis until the counts agree (THE_LOOP rule 4); this is the ingest-time
// gate that PROVES the result is canon-exact before anything is written.
//
// The accumulator is a per-chapter ROW COUNT plus the SET of seen verse numbers,
// not a max verse number. Math.max(verseNums) only equals the count when every
// integer 1..N appears exactly once — an assumption the original proof made
// silently and never verified. That blind spot passed chapters with an interior
// gap (e.g. 1..4,6..8) or a duplicated verse number (e.g. two \v 4 rows) because
// max is insensitive to both. Counting rows catches any net mismatch; the
// seen-set contiguity check catches the offset case where a gap and a duplicate
// in the same chapter cancel out (count == canon but a number in 1..canon is
// missing). Exported so the proof can be exercised against known-bad fixtures
// without standing up a USFM tree or the gitignored KJV corpus.
export interface CanonOtBook { book: number; slug: string; verses: number[] }

export function canonExactDiffs(
  verses: { book: number; chapter: number; verse: number }[],
  canonOt: CanonOtBook[],
): string[] {
  const diffs: string[] = [];
  const byBook = new Map<number, Map<number, { count: number; seen: Set<number> }>>();
  for (const v of verses) {
    const chs = byBook.get(v.book) ?? new Map<number, { count: number; seen: Set<number> }>();
    const cur = chs.get(v.chapter) ?? { count: 0, seen: new Set<number>() };
    cur.count++;
    cur.seen.add(v.verse);
    chs.set(v.chapter, cur);
    byBook.set(v.book, chs);
  }
  for (const cb of canonOt) {
    const got = byBook.get(cb.book);
    if (!got) { diffs.push(`${cb.slug}: book absent from source`); continue; }
    if (got.size !== cb.verses.length) {
      diffs.push(`${cb.slug}: ${got.size} chapters vs canon ${cb.verses.length}`);
      continue;
    }
    for (let ch = 1; ch <= cb.verses.length; ch++) {
      const want = cb.verses[ch - 1]!;
      const g = got.get(ch);
      if (!g || g.count !== want) {
        diffs.push(`${cb.slug} ${ch}: ${g?.count ?? 0} verse rows vs canon ${want}`);
        continue;
      }
      // Counts agree — still reject a verse missing from 1..want: a gap and an
      // exactly-offsetting duplicate in the same chapter cancel out (count ==
      // want but a number is absent). max() would pass this; the seen-set does not.
      for (let n = 1; n <= want; n++) {
        if (!g.seen.has(n)) {
          diffs.push(`${cb.slug} ${ch}: missing verse ${n}`);
          break;
        }
      }
    }
  }
  const ntBooks = verses.filter((v) => v.book >= 40);
  if (ntBooks.length > 0) diffs.push(`source unexpectedly contains NT verses (${ntBooks.length}) — wrong artifact?`);
  return diffs;
}

function main() {
  if (!existsSync(SRC)) {
    throw new Error(`source dir ${SRC} absent — fetch https://ebible.org/Scriptures/engjps_usfm.zip and unzip it there first`);
  }
  if (existsSync(OUT) && readdirSync(OUT).length > 0) {
    throw new Error(`${OUT} already exists — refusing to clobber an existing translation (delete it deliberately first)`);
  }

  const verses = parseUsfmDir(SRC).map((v) => ({
    ...v,
    // eBible's original-reference markers: "(3-1)", "(22-2)" — metadata, not text.
    text: v.text.replace(/\(\d+-\d+\)\s*/g, '').replace(/\s+/g, ' ').trim(),
  }));

  // ── CANON-EXACT PROOF — the whole premise of using this source. ──
  const canon = loadKjvCanon();
  const canonOt = canon.filter((b) => b.book <= 39);
  const diffs = canonExactDiffs(verses, canonOt);
  if (diffs.length > 0) {
    throw new Error(`CANON MISMATCH — NOT canon-exact, refusing to write:\n  ${diffs.slice(0, 20).join('\n  ')}`);
  }
  console.log(`canon proof: all 39 OT books match the KJV canon exactly (${verses.length.toLocaleString()} verse slots)`);

  // ── Write per-chapter files ──
  let chapters = 0;
  let empty = 0;
  for (const cb of canonOt) {
    const slug = BOOKS[cb.book - 1]!.slug;
    for (let ch = 1; ch <= cb.verses.length; ch++) {
      const chVerses = verses
        .filter((v) => v.book === cb.book && v.chapter === ch)
        .sort((a, b) => a.verse - b.verse)
        .map((v) => ({ verse: v.verse, text: v.text }));
      for (const v of chVerses) if (!v.text) empty++;
      const dir = path.join(OUT, slug);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        path.join(dir, `${ch}.json`),
        JSON.stringify({ book: cb.book, chapter: ch, translation: ID, verses: chVerses }),
      );
      chapters++;
    }
  }
  console.log(`wrote ${chapters} chapters → ${OUT}/<slug>/<ch>.json (${empty} empty-text verses)`);
  for (const probe of ['gen/1.json', 'psa/23.json', 'mal/4.json']) {
    const j = JSON.parse(readFileSync(path.join(OUT, probe), 'utf8')) as { verses: { verse: number; text: string }[] };
    const last = j.verses[j.verses.length - 1]!;
    console.log(`  sample ${probe} v1: ${j.verses[0]!.text.slice(0, 100)}`);
    console.log(`  sample ${probe} v${last.verse}: ${last.text.slice(0, 100)}`);
  }
}

if (process.argv[1] && /ingest-ebible-jps/.test(process.argv[1])) {
  main();
}
