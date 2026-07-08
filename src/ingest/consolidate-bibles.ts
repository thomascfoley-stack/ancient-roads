// Consolidates per-chapter Bible JSON (public/bible/{t}/{slug}/{ch}.json) into
// one per-book file (public/bible/{t}/{slug}.json). This is a DEPLOYMENT fix:
// Vercel's CLI deploy caps at 15,000 files, and 22 translations x ~1,189
// chapters = ~26,000 per-chapter files blew past that (so the data was being
// dropped from production). Per-book files bring the Bible down to ~1,450 files
// while keeping every translation and verse. Commentaries stay per-chapter
// (fetched one chapter at a time), so they are untouched here.
//
// Output shape: { translation, book, slug, chapters: { "1": [{verse,text}], ... } }
//
// NON-DESTRUCTIVE: the per-chapter files are left in place as the regeneration
// source; they are excluded from the Vercel upload via web/.vercelignore
// (public/bible/*/*/). Re-runnable: overwrites per-book files each run.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = 'web/public/bible';

interface Verse { verse: number; text: string }

let booksWritten = 0;
let chaptersFolded = 0;

const translations = readdirSync(ROOT).filter((t) => statSync(join(ROOT, t)).isDirectory());

for (const translation of translations) {
  const tDir = join(ROOT, translation);
  const bookDirs = readdirSync(tDir).filter((name) => statSync(join(tDir, name)).isDirectory());

  for (const slug of bookDirs) {
    const bookDir = join(tDir, slug);
    const chapterFiles = readdirSync(bookDir).filter((f) => f.endsWith('.json'));
    if (chapterFiles.length === 0) continue;

    const chapters: Record<string, Verse[]> = {};
    let bookNum = 0;

    for (const cf of chapterFiles) {
      const data = JSON.parse(readFileSync(join(bookDir, cf), 'utf-8')) as {
        book: number;
        chapter: number;
        verses: Verse[];
      };
      bookNum = data.book ?? bookNum;
      chapters[String(data.chapter)] = data.verses;
      chaptersFolded++;
    }

    writeFileSync(
      join(tDir, `${slug}.json`),
      JSON.stringify({ translation, book: bookNum, slug, chapters }),
    );
    booksWritten++;
  }
}

console.log(`Per-book files written:  ${booksWritten}`);
console.log(`Chapters folded in:      ${chaptersFolded}`);
