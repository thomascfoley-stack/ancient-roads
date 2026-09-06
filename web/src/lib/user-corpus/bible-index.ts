// Loading the verse shingle index the uncited channel matches against.
//
// ── THE COST, AND WHY IT IS MEMOISED ────────────────────────────────────────────────────────────
// Building the KJV index is 31,102 verses → 588,029 distinct 6-gram shingles, and it takes seconds.
// That is fine once per warm instance and ruinous once per document, so it is memoised at module
// scope. The drain processes documents in a loop inside one invocation, so a batch pays for it once.
//
// ── AN UNVERIFIED DEPLOYMENT RISK, STATED RATHER THAN DISCOVERED ────────────────────────────────
// This reads JSON out of `web/public/bible/` with `fs` at runtime. Locally that is a symlink to the
// main clone and works. On Vercel it is NOT verified, and it is the exact shape of the A6 defect
// that killed three production deploys: code that works in the repo tree and fails in the upload
// root, because `vercel --prod` uploads `web/` alone and Next traces only the files it can see.
// `public/` ships as static assets; whether a serverless function can `fs.readFileSync` them is a
// separate question this slice has not answered.
//
// It is written this way anyway because the alternative — bundling ~5 MB of JSON into the function,
// or fetching it over HTTP from our own origin — is a bigger decision than an unverified read, and
// making it now would be guessing.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { buildVerseShingleIndex, type IndexedVerse, type VerseShingleIndex } from '@bible/uncited-shingle';
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

let cached: VerseShingleIndex | null = null;

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

function loadVerses(dir: string): IndexedVerse[] {
  const out: IndexedVerse[] = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const j = JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as {
      book: number;
      chapters: Record<string, { verse: number; text: string }[]>;
    };
    for (const [c, vs] of Object.entries(j.chapters)) {
      for (const v of vs) out.push({ verseId: j.book * 1_000_000 + Number(c) * 1000 + v.verse, text: v.text });
    }
  }
  return out;
}

export class BibleIndexUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BibleIndexUnavailable';
  }
}

/**
 * The index, built once per instance.
 *
 * Throws rather than returning an empty index when the files are missing. An empty index would
 * anchor nothing, every document would be stored with zero uncited anchors, and the pipeline would
 * report `ready` — a silent, total loss of the channel that carries 90% of the recall, presented
 * to the user as success. That is the exact failure class this slice exists to refuse.
 */
export function getAnchorIndex(): VerseShingleIndex {
  if (cached) return cached;
  const dir = bibleDir(ANCHOR_TRANSLATION);
  if (!existsSync(dir)) {
    throw new BibleIndexUnavailable(
      `bible index not found at ${dir} — the uncited-quote channel cannot run. ` +
        'Refusing to index documents with no anchoring rather than reporting them ready.',
    );
  }
  const verses = loadVerses(dir);
  if (verses.length === 0) {
    throw new BibleIndexUnavailable(`bible index at ${dir} contained no verses`);
  }
  cached = buildVerseShingleIndex(verses, ANCHOR_NGRAM, ANCHOR_TRANSLATION);
  return cached;
}

// ── per-document translation detection (ADR-100, built 2026-08-21) ─────────────────────────────
// Detection picks WHICH translation's index the uncited channel matches against, per document,
// with honest confidence — see translation-detect.ts for the mechanism and the measured why.
// Memoisation mirrors the KJV index above: the combined detection index and a small cache of
// per-translation anchor indexes are built once per warm instance; a drain batch pays once.

/** The translations shipped under public/bible — derived from disk, never hand-listed. */
export function availableTranslations(): string[] {
  const root = path.dirname(bibleDir(ANCHOR_TRANSLATION));
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(root, d.name, 'jhn.json')))
    .map((d) => d.name)
    .sort();
}

let detectionCached: DetectionIndex | null = null;

function getDetectionIndex(): DetectionIndex {
  if (detectionCached) return detectionCached;
  const corpora = availableTranslations().map((translation) => ({
    translation,
    texts: loadVerses(bibleDir(translation)).map((v) => v.text),
  }));
  if (corpora.length === 0) {
    throw new BibleIndexUnavailable('no translation directories found — detection cannot run');
  }
  detectionCached = buildDetectionIndex(corpora, ANCHOR_NGRAM);
  return detectionCached;
}

/**
 * Per-translation anchor indexes, small LRU. Most documents detect into the KJV family, so in
 * practice this holds one or two entries; the cap exists so a pathological mixed batch cannot
 * hold 18 full indexes in memory.
 */
const anchorIndexCache = new Map<string, VerseShingleIndex>();
const ANCHOR_INDEX_CACHE_MAX = 3;

export function getAnchorIndexFor(translation: string): VerseShingleIndex {
  if (translation === ANCHOR_TRANSLATION) return getAnchorIndex();
  const hit = anchorIndexCache.get(translation);
  if (hit) return hit;
  const dir = bibleDir(translation);
  if (!existsSync(dir)) {
    throw new BibleIndexUnavailable(`bible index for detected translation '${translation}' not found at ${dir}`);
  }
  const verses = loadVerses(dir);
  if (verses.length === 0) throw new BibleIndexUnavailable(`bible index at ${dir} contained no verses`);
  const built = buildVerseShingleIndex(verses, ANCHOR_NGRAM, translation);
  if (anchorIndexCache.size >= ANCHOR_INDEX_CACHE_MAX) {
    const oldest = anchorIndexCache.keys().next().value;
    if (oldest !== undefined) anchorIndexCache.delete(oldest);
  }
  anchorIndexCache.set(translation, built);
  return built;
}

/** Detect a document's translation. Throws BibleIndexUnavailable rather than guessing silently. */
export function detectDocumentTranslation(text: string): Detection {
  return detectTranslation(text, getDetectionIndex());
}
