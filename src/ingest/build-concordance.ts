// Build-time concordance index: every place each Strong's number occurs, keyed by the
// canonical verseId (book*1e6 + chapter*1e3 + verse). Zero new ingest — a pure pass over
// the original-language files the interlinear already ships. Output feeds the reader's
// WordPanel "every other place this word occurs" list.
//
//   web/public/original/{book}/{chapter}.json  ->  web/public/concordance/{G|H}{n}.json
//   each: { "strong": "G26", "count": 143, "verseIds": [43003016, ...] }  (verseIds sorted)
//
// Run:  pnpm ingest:concordance
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const ORIGINAL_DIR = path.join(process.cwd(), 'web/public/original');
const OUT_DIR = path.join(process.cwd(), 'web/public/concordance');

interface OWord { s?: string }
interface Chapter { book: number; chapter: number; verses: Record<string, OWord[]> }

function main() {
  if (!existsSync(ORIGINAL_DIR)) throw new Error(`missing ${ORIGINAL_DIR} — run the original-language ingest first`);
  // Strong's key -> set of verseIds (Set dedupes multiple occurrences in one verse).
  const index = new Map<string, Set<number>>();

  let chapters = 0;
  for (const bookSlug of readdirSync(ORIGINAL_DIR)) {
    const bookDir = path.join(ORIGINAL_DIR, bookSlug);
    if (!statSync(bookDir).isDirectory()) continue;
    for (const file of readdirSync(bookDir)) {
      if (!file.endsWith('.json')) continue;
      const data = JSON.parse(readFileSync(path.join(bookDir, file), 'utf8')) as Chapter;
      chapters++;
      for (const [verseStr, words] of Object.entries(data.verses)) {
        const verseId = data.book * 1_000_000 + data.chapter * 1_000 + Number(verseStr);
        for (const w of words) {
          const s = (w.s ?? '').trim();
          if (!s) continue; // untagged words (punctuation, particles without Strong's)
          let set = index.get(s);
          if (!set) { set = new Set(); index.set(s, set); }
          set.add(verseId);
        }
      }
    }
  }

  // Rewrite the output dir cleanly so a re-run never leaves stale keys.
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  let totalBytes = 0;
  const top: Array<[string, number]> = [];
  for (const [strong, set] of index) {
    const verseIds = [...set].sort((a, b) => a - b);
    const json = JSON.stringify({ strong, count: verseIds.length, verseIds });
    writeFileSync(path.join(OUT_DIR, `${strong}.json`), json);
    totalBytes += json.length;
    top.push([strong, verseIds.length]);
  }

  top.sort((a, b) => b[1] - a[1]);
  console.log(`chapters scanned : ${chapters}`);
  console.log(`distinct Strong's: ${index.size}`);
  console.log(`output           : ${OUT_DIR} (${(totalBytes / 1_048_576).toFixed(2)} MB across ${index.size} files)`);
  console.log(`top 8 by count   : ${top.slice(0, 8).map(([s, n]) => `${s}=${n}`).join('  ')}`);
  // Spot-checks (looked at, not assumed): G26 = ἀγάπη (love), G3588 = ὁ (the).
  const love = index.get('G26')?.size ?? 0;
  console.log(`spot-check       : G26 (agape/love)=${love}  G3588 (ho/the)=${index.get('G3588')?.size ?? 0}`);
}

main();
