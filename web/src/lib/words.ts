// English word -> verse index (built by src/ingest/build-word-index.ts from the KJV).
// Sharded by 2-letter prefix bucket ("love" -> "lo"); words occurring in more than
// OUTLIER_MAX verses have their own shard, flagged in the bucket. Outlier shard names
// carry a "_" prefix because a 2-letter bucket key is a strict prefix of the words in
// it and short outliers ("of", "to") would otherwise collide with their own bucket.
// bucketOf/normalizeWord/shardOf MUST stay in sync with wordBucket/normalizeWord/
// wordShard in build-word-index.ts.

export interface WordIndex { word: string; count: number; verseIds: number[] }
type BucketEntry = { count: number; verseIds: number[] } | { count: number; shard: true };

/** Lowercase, fold possessives ('s / ’s / trailing apostrophe), drop non-letters. */
function normalizeWord(token: string): string {
  return token
    .toLowerCase()
    .replace(/['’]s$/g, '')
    .replace(/^['’]+|['’]+$/g, '')
    .replace(/[^a-z]/g, '');
}

/** Bucket file for a word: its 2-letter prefix. */
function bucketOf(word: string): string {
  return word.slice(0, 2);
}

/** Outlier shard file for a word: "_" + word (see header). */
function shardOf(word: string): string {
  return `_${word}`;
}

const bucketCache = new Map<string, Record<string, BucketEntry> | null>();
const shardCache = new Map<string, WordIndex | null>();

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function fetchWordIndex(word: string): Promise<WordIndex | null> {
  const key = normalizeWord(word ?? '');
  if (!key) return null;
  const bucketKey = bucketOf(key);
  if (!bucketCache.has(bucketKey)) {
    bucketCache.set(bucketKey, await fetchJson<Record<string, BucketEntry>>(`/words/${bucketKey}.json`));
  }
  const entry = bucketCache.get(bucketKey)?.[key];
  if (!entry) return null;
  if ('shard' in entry) {
    // Outlier: verseIds live in a dedicated shard file.
    if (!shardCache.has(key)) {
      shardCache.set(key, await fetchJson<WordIndex>(`/words/${shardOf(key)}.json`));
    }
    return shardCache.get(key) ?? null;
  }
  return { word: key, count: entry.count, verseIds: entry.verseIds };
}
