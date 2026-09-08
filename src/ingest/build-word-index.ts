// Build-time English word index: every place each KJV word occurs, keyed by the
// canonical verseId (book*1e6 + chapter*1e3 + verse) — the same encoding
// build-concordance.ts uses. Zero new ingest — a pure pass over the KJV files
// the reader already ships.
//
// NORMALIZATION (applied to every token, and mirrored by fetchWordIndex — keep in sync):
//   1. lowercase ("Charity" -> "charity")
//   2. fold possessives: trailing 's / ’s and bare trailing apostrophes are dropped
//      ("Paul's" -> "paul", "Moses’" -> "moses"), leading apostrophes too ("'tis" -> "tis")
//   3. strip anything that is not a-z; tokens that end up empty are dropped
//      (hyphens split: "loving-kindness" indexes under both "loving" and "kindness")
// NO stemming and NO stopword removal — "love" and "loved" are separate entries, and
// "the" is indexed like any other word. Stopword policy is a display concern.
//
// SHARDING: same shape as the concordance. One file per word = ~12,457 files, so we
// bucket by the word's 2-letter prefix ("love" -> bucket "lo"). Any word with more than
// OUTLIER_MAX verses gets its OWN shard and the bucket records only a
// { count, shard: true } pointer. Unlike the concordance (bucket "G35" vs shard "G3588"
// can never collide), a 2-letter bucket key is a strict PREFIX of every word in it, and
// 28 outlier words ARE their bucket key ("of", "to", "in"…), so outlier shards get a
// "_" prefix ("of" -> "_of.json") to keep the two namespaces disjoint.
//
//   web/public/bible/kjv/{book}.json  ->  web/public/words/{bucket}.json
//   bucket: { "love": { count, verseIds:[...] }, "the": { count, shard: true }, ... }
//   outlier: web/public/words/_the.json = { word, count, verseIds:[...] }
//
// NOT DONE HERE (next slice): per-word Strong's candidates from the interlinear glosses.
// That matching is heuristic on purpose (web/src/lib/original.ts documents returning ALL
// candidates, and the strong match needs the lexicon's kjv-usage lists, not just the
// gloss), so a clean version belongs with the shipped matcher, not duplicated into this
// builder as a lookalike.
//
// Run:  pnpm ingest:words
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KJV_DIR = path.join(process.cwd(), 'web/public/bible/kjv');
const OUT_DIR = path.join(process.cwd(), 'web/public/words');
const OUTLIER_MAX = 400; // a word in more verses than this gets its own shard

interface KjvBook {
  book: number;
  chapters: Record<string, { verse: number; text: string }[]>;
}

/** Normalized lookup key for a raw token; '' when nothing letter-like remains. */
export function normalizeWord(token: string): string {
  return token
    .toLowerCase()
    .replace(/['’]s$/g, '')
    .replace(/^['’]+|['’]+$/g, '')
    .replace(/[^a-z]/g, '');
}

/** The distinct normalized words in one verse's text. */
export function verseWords(text: string): string[] {
  const out = new Set<string>();
  for (const raw of text.split(/[^A-Za-z'’]+/)) {
    const w = normalizeWord(raw);
    if (w) out.add(w);
  }
  return [...out];
}

/** Bucket key for a word: its 2-letter prefix (the word itself when shorter). */
export function wordBucket(word: string): string {
  return word.slice(0, 2);
}

/** Outlier shard name. "_" keeps it disjoint from 2-letter bucket names (see header). */
export function wordShard(word: string): string {
  return `_${word}`;
}

/** word -> verseIds, from already-parsed KJV books (the unit under test). */
export function buildIndex(books: KjvBook[]): Map<string, Set<number>> {
  const index = new Map<string, Set<number>>();
  for (const data of books) {
    for (const [chapterStr, verses] of Object.entries(data.chapters)) {
      for (const v of verses) {
        const verseId = data.book * 1_000_000 + Number(chapterStr) * 1_000 + v.verse;
        for (const w of verseWords(v.text)) {
          let set = index.get(w);
          if (!set) { set = new Set(); index.set(w, set); }
          set.add(verseId);
        }
      }
    }
  }
  return index;
}

function main() {
  if (!existsSync(KJV_DIR)) throw new Error(`missing ${KJV_DIR} — run the KJV ingest first`);
  const books: KjvBook[] = [];
  for (const file of readdirSync(KJV_DIR)) {
    if (!file.endsWith('.json')) continue;
    books.push(JSON.parse(readFileSync(path.join(KJV_DIR, file), 'utf8')) as KjvBook);
  }
  const index = buildIndex(books);

  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  type Entry = { count: number; verseIds: number[] } | { count: number; shard: true };
  const buckets = new Map<string, Record<string, Entry>>();
  let outliers = 0;

  for (const [word, set] of index) {
    const verseIds = [...set].sort((a, b) => a - b);
    const bucket = wordBucket(word);
    let b = buckets.get(bucket);
    if (!b) { b = {}; buckets.set(bucket, b); }
    if (verseIds.length > OUTLIER_MAX) {
      writeFileSync(path.join(OUT_DIR, `${wordShard(word)}.json`), JSON.stringify({ word, count: verseIds.length, verseIds }));
      b[word] = { count: verseIds.length, shard: true };
      outliers++;
    } else {
      b[word] = { count: verseIds.length, verseIds };
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
  console.log(`books scanned    : ${books.length}`);
  console.log(`distinct words   : ${index.size}`);
  console.log(`files            : ${totalFiles} (${buckets.size} buckets + ${outliers} outlier shards)`);
  console.log(`bucket bytes     : ${(bucketBytes / 1024).toFixed(0)} KB total, ${(bucketBytes / buckets.size / 1024).toFixed(1)} KB avg, ${(maxBucket / 1024).toFixed(1)} KB max`);
  console.log(`spot-check       : charity=${index.get('charity')?.size ?? 0}  loved=${index.get('loved')?.size ?? 0}  the=${index.get('the')?.size ?? 0}  bucket(love)=${wordBucket('love')}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
