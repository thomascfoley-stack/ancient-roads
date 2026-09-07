// Write empty-text SKELETON books for the canon books a partial-canon
// translation does not cover — the anderson/tyndale/noyes precedent (OT-only
// and NT-only works ship all 66 book files; the untranslated ones are
// structure with no text, so the reader renders honest emptiness instead of a
// 404 / thrown fetch).
//
//   npx tsx src/ingest/gen-bible-skeletons.ts --id=weymouth
//
// Only books with NO existing per-chapter files are written; existing content
// is never touched. Re-runnable. Run BEFORE consolidate-bibles.ts so the
// skeletons fold into per-book files like everything else.

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadKjvCanon } from './sword-zverse.js';

const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

const ID = arg('--id');
if (!ID || !/^[a-z0-9]+$/.test(ID)) throw new Error('usage: gen-bible-skeletons.ts --id=<translation-id>');
const OUT = `web/public/bible/${ID}`;
if (!existsSync(OUT)) throw new Error(`${OUT} does not exist — decode the real content first; skeletons fill gaps, they do not start a translation`);

const canon = loadKjvCanon();
let booksWritten = 0;
let chaptersWritten = 0;
const skipped: string[] = [];

for (const cb of canon) {
  const dir = path.join(OUT, cb.slug);
  const hasContent = existsSync(dir) && readdirSync(dir).some((f) => f.endsWith('.json'));
  if (hasContent) { skipped.push(cb.slug); continue; }
  for (let ch = 1; ch <= cb.verses.length; ch++) {
    const verses = Array.from({ length: cb.verses[ch - 1]! }, (_, i) => ({ verse: i + 1, text: '' }));
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, `${ch}.json`),
      JSON.stringify({ book: cb.book, chapter: ch, translation: ID, verses }),
    );
    chaptersWritten++;
  }
  booksWritten++;
}

console.log(`${ID}: ${booksWritten} skeleton books written (${chaptersWritten} chapters); ${skipped.length} real books untouched`);
