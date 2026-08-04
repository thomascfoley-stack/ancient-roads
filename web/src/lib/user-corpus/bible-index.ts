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
// making it now would be guessing. `indexHealth()` exists so the answer is a check rather than a
// surprise, and step 7's browser DoD is where it gets exercised for real.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { buildVerseShingleIndex, type IndexedVerse, type VerseShingleIndex } from '@bible/uncited-shingle';

/** 6-gram, matching the frozen Slice 0 harness and every published number. */
export const ANCHOR_NGRAM = 6;

/**
 * The translation the uncited channel shingles against.
 *
 * ADR-100 ruled per-document detection; ADR-100's family-union clause was WITHDRAWN on measurement
 * (union costs 1.640× the largest member against a 1.50 bar). Detection itself is not built yet, so
 * Slice 1 uses the KJV family's canonical member and records full confidence — which is honest for
 * the corpus this ships against and is exactly what `translationConfidence` exists to qualify when
 * detection does land.
 */
export const ANCHOR_TRANSLATION = 'kjv';

let cached: VerseShingleIndex | null = null;

function bibleDir(translation: string): string {
  // process.cwd() is the app root under `next dev`, `next start` and Vercel's runtime alike.
  return path.join(process.cwd(), 'public', 'bible', translation);
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

/** Is the index reachable, and does it look right? For the deploy check, not for the hot path. */
export function indexHealth(): { ok: boolean; translation: string; dir: string; verses?: number; shingles?: number; error?: string } {
  const dir = bibleDir(ANCHOR_TRANSLATION);
  try {
    const idx = getAnchorIndex();
    return { ok: true, translation: idx.translation, dir, verses: idx.verseCount, shingles: idx.shingleToVerses.size };
  } catch (e) {
    return { ok: false, translation: ANCHOR_TRANSLATION, dir, error: String((e as Error)?.message ?? e) };
  }
}
