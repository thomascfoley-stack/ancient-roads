// The uncited-quote channel: find the verses a document quotes verbatim without citing them.
//
// This is Slice 0's make-or-break lever (90% held-out chapter recall) and the mechanism the whole
// personal-corpus feature rests on. It exists here as a MIRRORED module because Slice 1 needs it
// inside the Next app, and `vercel --prod` uploads `web/` alone — importing `src/ingest/` from
// `web/src/` is the exact failure that killed a production deploy (A6, `Module not found:
// '../../../src/ingest/forbidden-provenance.mjs'`).
//
// ── WHY THIS IS A SECOND IMPLEMENTATION, AND HOW THAT IS KEPT HONEST ────────────────────────────
// The logic already exists three times: `scripts/slice0-anchor-recall.mts:52`,
// `scripts/slice0-precision.mts`, and `src/ingest/ingest-sermon.ts:119`. Normally the answer is to
// extract and delete the copies. Here that is not available:
//   * both `.mts` scripts and `src/ingest/resource-textmatch.ts` are FROZEN — the Slice 0
//     pre-registration rests its "never tuned to the test" claim on them being git-verified
//     unchanged. Editing them to import this module would void every published Slice 0 number.
//   * `web/` cannot import `src/ingest/` at all (above).
// So this is a faithful re-implementation, and the drift risk is handled by a DIFFERENTIAL guard
// rather than by deletion: `test/invariants/uncited-shingle-parity.test.ts` asserts this module's
// tokeniser, hasher and matcher agree with the frozen originals over a corpus of inputs. If the
// frozen primitives ever change, that test goes red rather than the two quietly diverging.
//
// PURE ON PURPOSE — no `node:fs`. The caller supplies verses. `src/bible/` is mirrored byte-for-byte
// into `web/src/bible/` (guarded by `test/bible-sync.test.ts`, which asserts the FILE SETS match
// before it compares contents), and that tree is importable from client components, where `node:fs`
// would break the build.

/**
 * 32-bit FNV-1a. Copied verbatim from `src/ingest/resource-textmatch.ts:157`.
 * Store hashes, not strings: a whole-corpus Set<string> of n-grams is memory-prohibitive.
 */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * OCR-tolerant tokeniser. Copied verbatim from `src/ingest/resource-textmatch.ts:45`.
 *
 * Strips LAYOUT artifacts (line-break hyphenation, all-caps running headers, page numbers) which
 * fragment exact shingles, but NOT OCR character errors, which are real signal that the words
 * differ. Measured there: layout-only damage recovers from ~85% to ~99% containment.
 */
export function tokenListOcr(s: string): string[] {
  const dehyphenated = s.replace(/([A-Za-z])-[ \t]*\r?\n[ \t]*([A-Za-z])/g, '$1$2');
  const bodyOnly = dehyphenated
    .split(/\r?\n/)
    .filter((line) => {
      const letters = line.replace(/[^A-Za-z]/g, '');
      // Drop all-caps running-header/title lines (e.g. "EXPOSITORY THOUGHTS", "ST. JOHN").
      return !(letters.length >= 4 && letters === letters.toUpperCase());
    })
    .join(' ');
  const folded = bodyOnly
    .toLowerCase()
    .replace(/&#x?[0-9a-f]+;/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!folded) return [];
  // Drop pure-digit tokens (page numbers, verse markers, scripture-ref numerals).
  return folded.split(/\s+/).filter((tok) => !/^\d+$/.test(tok));
}

/**
 * Hashed n-gram shingles of a string.
 *
 * **`n` is REQUIRED here, deliberately.** The frozen original defaults to `n = 3`, while every
 * anchoring call site passes 6 — a 6-word verbatim run is a distinctive quote and a 3-word one is
 * not. Inheriting that default would be a silent, catastrophic precision regression, so this
 * signature refuses to have an opinion and makes every caller state the number.
 */
export function shingleHashSetOcr(s: string, n: number): Set<number> {
  const t = tokenListOcr(s);
  const out = new Set<number>();
  for (let i = 0; i + n <= t.length; i++) out.add(fnv1a(t.slice(i, i + n).join(' ')));
  return out;
}

export interface IndexedVerse {
  verseId: number;
  text: string;
}

export interface VerseShingleIndex {
  /** Which translation this index was built from. Carried so a report cannot mislabel it. */
  readonly translation: string;
  readonly ngram: number;
  readonly verseCount: number;
  /** shingle hash -> verse ids carrying it */
  readonly shingleToVerses: Map<number, number[]>;
  /** verse id -> how many distinct shingles that verse has (its distinctiveness) */
  readonly shinglesPerVerse: Map<number, number>;
}

/**
 * Build the inverted shingle index for one translation.
 *
 * `translation` is stored on the index rather than passed to the reporter separately, because the
 * frozen harness hardcodes the literal `WEB` in its own output and therefore reports a translation
 * it may not have used (see `docs/evidence/lane-b-slice1/slice0-harness-runnable.log` — three
 * translations, three different indexes, one label). Making the label a property of the artifact
 * means a report cannot disagree with the thing it describes.
 */
export function buildVerseShingleIndex(
  verses: Iterable<IndexedVerse>,
  ngram: number,
  translation: string,
): VerseShingleIndex {
  const shingleToVerses = new Map<number, number[]>();
  const shinglesPerVerse = new Map<number, number>();
  let verseCount = 0;

  for (const v of verses) {
    const sh = shingleHashSetOcr(v.text, ngram);
    shinglesPerVerse.set(v.verseId, sh.size);
    verseCount++;
    for (const h of sh) {
      const ids = shingleToVerses.get(h);
      if (ids) ids.push(v.verseId);
      else shingleToVerses.set(h, [v.verseId]);
    }
  }

  return { translation, ngram, verseCount, shingleToVerses, shinglesPerVerse };
}

export interface UncitedMatch {
  verseId: number;
  /**
   * How many of this verse's distinct shingles appeared in the body — the **K** of the Slice 0
   * trade curve, and what `user_section_anchors.match_count` stores (migration 103).
   */
  matchCount: number;
}

export interface UncitedOptions {
  /**
   * A verse is only eligible if it has at least this many distinct shingles — i.e. is long enough
   * to be distinctive. Slice 0 froze this at 3 (~11 words). NOT the K of the trade curve; the two
   * were easy to confuse because the frozen script calls one of them `K_MIN_VERSE_SHINGLES`.
   */
  minVerseShingles: number;
  /**
   * **K.** A verse is returned iff at least this many of its shingles appear. The frozen recall
   * harness runs at 1; the measured trade curve is 1 → 33% precision / 93% recall, 2 → 68/82,
   * 3 → 96/75. Required, never defaulted — this is the number that decides the feature.
   */
  minHits: number;
}

/**
 * The verses a body quotes verbatim, with how strongly.
 *
 * Returns matches rather than a bare Set so the caller can persist `matchCount` and re-filter at a
 * different K later without re-running the scan. At `minHits = 1` the verse SET is identical to the
 * frozen harness's `uncitedMatches` — asserted differentially in
 * `test/invariants/uncited-shingle-parity.test.ts`, over real Bible text, not a fixture.
 */
export function uncitedMatches(
  body: string,
  index: VerseShingleIndex,
  opts: UncitedOptions,
): UncitedMatch[] {
  const hits = new Map<number, number>();
  for (const h of shingleHashSetOcr(body, index.ngram)) {
    const ids = index.shingleToVerses.get(h);
    if (!ids) continue;
    for (const id of ids) hits.set(id, (hits.get(id) ?? 0) + 1);
  }

  const out: UncitedMatch[] = [];
  for (const [verseId, matchCount] of hits) {
    if ((index.shinglesPerVerse.get(verseId) ?? 0) < opts.minVerseShingles) continue;
    if (matchCount < opts.minHits) continue;
    out.push({ verseId, matchCount });
  }
  // Deterministic order: strongest first, then by verse. Map iteration order depends on insertion,
  // which depends on shingle iteration order — fine for a Set, not fine for rows written to a table
  // or compared between runs.
  out.sort((a, b) => b.matchCount - a.matchCount || a.verseId - b.verseId);
  return out;
}
