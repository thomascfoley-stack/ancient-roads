// Loading the verse shingle index the uncited channel matches against.
//
// ── THE COST, AND WHY IT IS MEMOISED ────────────────────────────────────────────────────────────
// Building the KJV index is 31,102 verses → 588,029 distinct 6-gram shingles, and it takes seconds.
// That is fine once per warm instance and ruinous once per document, so it is memoised at module
// scope as a Promise. The drain processes documents in a loop inside one invocation, so a batch
// pays for it once; concurrent callers in that batch await the SAME in-flight build rather than
// racing a second one.
//
// ── HOW THE BIBLE IS LOADED — HTTP IN PROD, fs IN DEV ───────────────────────────────────────────
// The bible JSON lives at `public/bible/<translation>/<book>.json`. The Corpus CDN migration
// (commit 5e24cd8a, 2026-08-15) stops shipping `public/bible/` in the Vercel deploy bundle and
// serves it from Vercel Blob via `next.config` rewrites instead (docs/CORPUS_CDN_DESIGN.md). A
// serverless function therefore CANNOT `fs.readFileSync` it — `public/bible/` is not in its
// filesystem — but it CAN `fetch` it, the way `lib/bible.ts` already does on the client.
//
// So this module reads via HTTP when `CORPUS_CDN_BASE` is set (production) and via `fs` when it
// is not (dev, where `public/bible/` is a local symlink). This mirrors the CDN design's own
// dev/prod split: "prod flips by setting one env var; dev keeps local files with zero network
// dependency" (§4.2). Every missing-bible condition on either path surfaces as a
// `BibleIndexUnavailable` — never a raw `ENOENT` — so the drain can fail a document permanently
// with a recognisable reason instead of retrying a deployment fault three times.
//
// This was an acknowledged-but-unverified risk while the bible still shipped in the bundle; the
// CDN migration verified the answer (the files leave the function filesystem) and this is the
// catch-up that makes the server-side reader match the client-side one.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { BOOKS } from '@bible/books';
import { buildVerseShingleIndex, type IndexedVerse, type VerseShingleIndex } from '@bible/uncited-shingle';
import { TRANSLATION_LICENSES } from '@/lib/licensing';
import {
  buildDetectionIndex,
  detectTranslation,
  type Detection,
  type DetectionIndex,
} from './translation-detect';

/** 6-gram, matching the frozen Slice 0 harness and every published number. */
export const ANCHOR_NGRAM = 6;

/**
 * The DEFAULT translation — the detection fallback and the eagerly-memoised index.
 *
 * ADR-100 ruled per-document detection, and since 2026-08-21 it is BUILT: `processOne` calls
 * `detectDocumentTranslation` per document and anchors against the winner via
 * `getAnchorIndexFor`, recording the detection's real confidence (translation-detect.ts). The
 * family-union clause stays WITHDRAWN on measurement (union costs 1.640× the largest member
 * against a 1.50 bar), so anchoring is always against ONE translation's index.
 */
export const ANCHOR_TRANSLATION = 'kjv';

/** Per-book bible JSON shape (see src/ingest/consolidate-bibles.ts). */
interface BibleBookJson {
  book: number;
  chapters: Record<string, { verse: number; text: string }[]>;
}

export class BibleIndexUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BibleIndexUnavailable';
  }
}

/** The corpus CDN base URL when set (production); '' in dev, where `public/bible/` is on local disk. */
function corpusCdnBase(): string {
  return (process.env.CORPUS_CDN_BASE ?? '').replace(/\/+$/, '');
}

/** Run a bounded number of `fn` calls concurrently, preserving input order in the result. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const clamped = Math.max(1, limit);
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(clamped, items.length) }, () => worker()));
  return results;
}

function versesFromBook(j: BibleBookJson): IndexedVerse[] {
  const out: IndexedVerse[] = [];
  for (const [c, vs] of Object.entries(j.chapters)) {
    for (const v of vs) out.push({ verseId: j.book * 1_000_000 + Number(c) * 1000 + v.verse, text: v.text });
  }
  return out;
}

// ── local (fs) loader — dev, where public/bible is a symlink to the main clone ──────────────────

function bibleDir(translation: string): string {
  // process.cwd() is the app root under `next dev`, `next start` and Vercel's runtime alike, so
  // this branch is the one production takes and its behaviour is unchanged.
  //
  // The fallback exists because `npm run audit` invokes vitest from the REPO root, where cwd is one
  // level above `web/` and this path does not exist. Four Slice 1 suites — tradition-gap, search,
  // routes, pipeline-to-ready — read `enabled` off that same directory and so SKIPPED inside the
  // gate while passing when run from `web/`: the audit reported green over the whole My Works
  // feature, the moat included, without executing any of it. Resolving relative to this module as a
  // second try fixes the gate without moving anyone's cwd, which a global chdir did — it broke
  // `commentary-entries-provenance`, whose ingest import scans `web/public/commentaries` from root.
  const fromCwd = path.join(process.cwd(), 'public', 'bible', translation);
  if (existsSync(fromCwd)) return fromCwd;
  return path.join(__dirname, '..', '..', '..', 'public', 'bible', translation);
}

function loadVersesLocal(translation: string): IndexedVerse[] {
  const dir = bibleDir(translation);
  if (!existsSync(dir)) {
    throw new BibleIndexUnavailable(
      `bible index for ${translation} not found at ${dir} — the uncited-quote channel cannot run. ` +
        'Refusing to index documents with no anchoring rather than reporting them ready.',
    );
  }
  const out: IndexedVerse[] = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const j = JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as BibleBookJson;
    for (const v of versesFromBook(j)) out.push(v);
  }
  return out;
}

function availableTranslationsLocal(): string[] {
  const root = path.dirname(bibleDir(ANCHOR_TRANSLATION));
  if (!existsSync(root)) {
    throw new BibleIndexUnavailable(
      `bible corpus not found at ${root} — the uncited-quote channel cannot run. ` +
        'Refusing to index documents with no anchoring rather than reporting them ready.',
    );
  }
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(root, d.name, 'jhn.json')))
    .map((d) => d.name)
    .sort();
}

// ── HTTP (CDN) loader — production, where public/bible is served from Vercel Blob ────────────────
//
// `CORPUS_CDN_BASE` is the same env var `next.config` rewrites use; here it is read directly so the
// serverless function fetches its own origin's Blob store rather than looping back through the
// edge rewrite (a relative `fetch('/bible/…')` has no host to resolve against server-side). A 404
// for one book means that translation does not ship it (NT-only translations omit the OT, OT-only
// omit the NT): skip it, the way the fs loader skips a missing per-book file. Any other failure —
// a 5xx, or a network throw — is the missing-bible condition and becomes BibleIndexUnavailable.

/** Per-book bible JSON fetches are cheap and parallel; 12 keeps a cold 66-book build to a handful
 *  of round-trips without opening 66 sockets at once on a fresh warm instance. */
const BOOK_FETCH_CONCURRENCY = 12;
/** Translation-presence probes are one request each; run more in parallel — they are tiny. */
const PROBE_CONCURRENCY = 16;
/** Loading whole translations for the detection index: a few at once so the peak is bounded. */
const TRANSLATION_FETCH_CONCURRENCY = 4;

async function fetchBibleJson(url: string): Promise<BibleBookJson | null> {
  try {
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new BibleIndexUnavailable(`fetch ${url} -> ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as BibleBookJson;
  } catch (e) {
    if (e instanceof BibleIndexUnavailable) throw e;
    throw new BibleIndexUnavailable(`fetch ${url} failed: ${String((e as Error)?.message ?? e)}`);
  }
}

async function loadVersesHttp(translation: string): Promise<IndexedVerse[]> {
  const base = corpusCdnBase();
  const books = await mapWithConcurrency(BOOKS, BOOK_FETCH_CONCURRENCY, async (book) =>
    fetchBibleJson(`${base}/bible/${translation}/${book.slug}.json`),
  );
  const out: IndexedVerse[] = [];
  for (const j of books) if (j) for (const v of versesFromBook(j)) out.push(v);
  return out;
}

async function availableTranslationsHttp(): Promise<string[]> {
  const base = corpusCdnBase();
  // The license record is the single source of truth for which translation IDs may exist under
  // public/bible (the deploy gate blocks any without one). Probing `jhn.json` for each — the same
  // file the fs loader gates on — keeps "derived, never hand-listed" honest over HTTP: the record is
  // the candidate set, presence on the CDN is what narrows it to the shipped set.
  const candidates = Object.keys(TRANSLATION_LICENSES);
  const present = await mapWithConcurrency(candidates, PROBE_CONCURRENCY, async (translation) => {
    const url = `${base}/bible/${translation}/jhn.json`;
    try {
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new BibleIndexUnavailable(`probe ${url} -> ${res.status} ${res.statusText}`);
      await res.arrayBuffer();
      return translation;
    } catch (e) {
      if (e instanceof BibleIndexUnavailable) throw e;
      throw new BibleIndexUnavailable(`probe ${url} failed: ${String((e as Error)?.message ?? e)}`);
    }
  });
  return present.filter((t): t is string => t !== null).sort();
}

// ── the dispatch — one code path per environment, both throwing BibleIndexUnavailable on failure ─

async function loadVerses(translation: string): Promise<IndexedVerse[]> {
  return corpusCdnBase() ? loadVersesHttp(translation) : loadVersesLocal(translation);
}

export async function availableTranslations(): Promise<string[]> {
  return corpusCdnBase() ? availableTranslationsHttp() : availableTranslationsLocal();
}

// ── the indexes, built once per warm instance and memoised as Promises ──────────────────────────

let cachedIndex: Promise<VerseShingleIndex> | null = null;

/**
 * The index, built once per instance.
 *
 * Throws `BibleIndexUnavailable` rather than returning an empty index when the files are missing.
 * An empty index would anchor nothing, every document would be stored with zero uncited anchors,
 * and the pipeline would report `ready` — a silent, total loss of the channel that carries 90% of
 * the recall, presented to the user as success. That is the exact failure class this slice exists
 * to refuse.
 *
 * Memoised as a Promise: concurrent callers in a drain batch await the same in-flight build, and a
 * rejection clears the slot so the next invocation rebuilds (a transient CDN blip does not poison
 * the whole warm instance).
 */
export function getAnchorIndex(): Promise<VerseShingleIndex> {
  if (cachedIndex) return cachedIndex;
  const p = (async () => {
    const verses = await loadVerses(ANCHOR_TRANSLATION);
    if (verses.length === 0) {
      throw new BibleIndexUnavailable(`bible index for ${ANCHOR_TRANSLATION} contained no verses`);
    }
    return buildVerseShingleIndex(verses, ANCHOR_NGRAM, ANCHOR_TRANSLATION);
  })();
  cachedIndex = p;
  p.catch(() => {
    cachedIndex = null;
  });
  return p;
}

// ── per-document translation detection (ADR-100, built 2026-08-21) ─────────────────────────────
// Detection picks WHICH translation's index the uncited channel matches against, per document,
// with honest confidence — see translation-detect.ts for the mechanism and the measured why.
// Memoisation mirrors the KJV index above: the combined detection index and a small cache of
// per-translation anchor indexes are built once per warm instance; a drain batch pays once.

let detectionCached: Promise<DetectionIndex> | null = null;

function getDetectionIndex(): Promise<DetectionIndex> {
  if (detectionCached) return detectionCached;
  const p = (async () => {
    const translations = await availableTranslations();
    if (translations.length === 0) {
      throw new BibleIndexUnavailable('no translation directories found — detection cannot run');
    }
    const corpora = await mapWithConcurrency(translations, TRANSLATION_FETCH_CONCURRENCY, async (translation) => ({
      translation,
      texts: (await loadVerses(translation)).map((v) => v.text),
    }));
    return buildDetectionIndex(corpora, ANCHOR_NGRAM);
  })();
  detectionCached = p;
  p.catch(() => {
    detectionCached = null;
  });
  return p;
}

/**
 * Per-translation anchor indexes, small LRU. Most documents detect into the KJV family, so in
 * practice this holds one or two entries; the cap exists so a pathological mixed batch cannot
 * hold 18 full indexes in memory.
 */
const anchorIndexCache = new Map<string, Promise<VerseShingleIndex>>();
const ANCHOR_INDEX_CACHE_MAX = 3;

export function getAnchorIndexFor(translation: string): Promise<VerseShingleIndex> {
  if (translation === ANCHOR_TRANSLATION) return getAnchorIndex();
  const hit = anchorIndexCache.get(translation);
  if (hit) return hit;
  if (anchorIndexCache.size >= ANCHOR_INDEX_CACHE_MAX) {
    const oldest = anchorIndexCache.keys().next().value;
    if (oldest !== undefined) anchorIndexCache.delete(oldest);
  }
  const p = (async () => {
    const verses = await loadVerses(translation);
    if (verses.length === 0) {
      throw new BibleIndexUnavailable(`bible index for detected translation '${translation}' contained no verses`);
    }
    return buildVerseShingleIndex(verses, ANCHOR_NGRAM, translation);
  })();
  anchorIndexCache.set(translation, p);
  p.catch(() => {
    anchorIndexCache.delete(translation);
  });
  return p;
}

/** Detect a document's translation. Throws BibleIndexUnavailable rather than guessing silently. */
export async function detectDocumentTranslation(text: string): Promise<Detection> {
  const index = await getDetectionIndex();
  return detectTranslation(text, index);
}
