// Build-time concordance index: every place each Strong's number occurs, keyed by the
// canonical verseId (book*1e6 + chapter*1e3 + verse). Zero new ingest — a pure pass over
// the original-language files the interlinear already ships.
//
// SHARDING (§0, queue #4): one file per Strong's = 13,480 files = a dictionary stored as
// a filesystem, and it blew Vercel's 15k-file limit. Instead we bucket by a 2-digit
// prefix of the Strong's NUMBER (G3588 -> bucket "G35" = numbers 3500-3599), ~1 small
// CDN-cached fetch per lookup. Big function words ("the", "and", YHWH) would bloat a
// bucket, so any Strong's with > OUTLIER_MAX verses gets its OWN shard and the bucket
// records only a { count, shard: true } pointer.
//
//   web/public/original/{book}/{chapter}.json  ->  web/public/concordance/{bucket}.json
//   bucket: { "G3056": { count, verseIds:[...] }, "G3588": { count, shard: true }, ... }
//   outlier: web/public/concordance/G3588.json = { strong, count, verseIds:[...] }
//
// Run:  pnpm ingest:concordance
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ORIGINAL_DIR = path.join(process.cwd(), 'web/public/original');
const OUT_DIR = path.join(process.cwd(), 'web/public/concordance');
const OUTLIER_MAX = 400; // a Strong's with more verses than this gets its own shard

interface OWord { s?: string }
interface Chapter { book: number; chapter: number; verses: Record<string, OWord[]> }

/** Bucket key for a Strong's number: language letter + floor(number/100), e.g. G3588 -> "G35". */
export function concordanceBucket(strong: string): string {
  const lang = strong[0]!;
  const num = parseInt(strong.slice(1), 10);
  return `${lang}${Math.floor(num / 100)}`;
}

function main() {
  if (!existsSync(ORIGINAL_DIR)) throw new Error(`missing ${ORIGINAL_DIR} — run the original-language ingest first`);
  const index = new Map<string, Set<number>>(); // Strong's -> verseIds (Set dedupes per verse)

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
          if (!s || !/^[GH]\d+$/.test(s)) continue; // Strong's only (skip untagged / malformed)
          let set = index.get(s);
          if (!set) { set = new Set(); index.set(s, set); }
          set.add(verseId);
        }
      }
    }
  }

  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  type Entry = { count: number; verseIds: number[] } | { count: number; shard: true };
  const buckets = new Map<string, Record<string, Entry>>();
  let outliers = 0;

  for (const [strong, set] of index) {
    const verseIds = [...set].sort((a, b) => a - b);
    const bucket = concordanceBucket(strong);
    let b = buckets.get(bucket);
    if (!b) { b = {}; buckets.set(bucket, b); }
    if (verseIds.length > OUTLIER_MAX) {
      writeFileSync(path.join(OUT_DIR, `${strong}.json`), JSON.stringify({ strong, count: verseIds.length, verseIds }));
      b[strong] = { count: verseIds.length, shard: true };
      outliers++;
    } else {
      b[strong] = { count: verseIds.length, verseIds };
    }
  }

  let bucketBytes = 0;
  let maxBucket = 0;
  for (const [bucket, entries] of buckets) {
    const json = JSON.stringify(entries);
    writeFileSync(path.join(OUT_DIR, `${bucket}.json`), json);
    bucketBytes += json.length;
    maxBucket = Math.max(maxBucket, json.length);
  }

  const totalFiles = buckets.size + outliers;
  console.log(`chapters scanned : ${chapters}`);
  console.log(`distinct Strong's: ${index.size}`);
  console.log(`files            : ${totalFiles} (${buckets.size} buckets + ${outliers} outlier shards)  [was 13,480]`);
  console.log(`bucket bytes     : ${(bucketBytes / 1024).toFixed(0)} KB total, ${(bucketBytes / buckets.size / 1024).toFixed(1)} KB avg, ${(maxBucket / 1024).toFixed(1)} KB max`);
  console.log(`spot-check       : G26(love)=${index.get('G26')?.size ?? 0}  G3588(the)=${index.get('G3588')?.size ?? 0}  bucket(G3588)=${concordanceBucket('G3588')}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
