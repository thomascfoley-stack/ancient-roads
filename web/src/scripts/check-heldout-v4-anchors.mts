// The ADR-024 v4 label ANCHOR-CHECK — the script the freeze cited but never committed
// (STATE_OF_TRUTH §1 caveat 4; HELDOUT_EVAL_DESIGN.md §v4 "NOT reproducible"). Rebuilt
// 2026-08-22 under W-ADRV4RERUN (W-PN20 had no committed version to prefer at rebuild
// time; order §6 says prefer the committed one — this becomes it unless W-PN20's lands).
//
// WHAT IT VERIFIES. Every v4 epistle/topical label claims to be derived from the query's
// own quoted KJV wording, with anchors recorded in `source` as
//   KJV <Book> <ch>:<vs>[-<vs>] ["verbatim phrase"] · <next anchor> · …
// For each anchor this checks, against the in-repo KJV (web/public/bible/kjv):
//   1. the anchor's chapter is one of the query's labeled `expected` chapters (the label
//      really is "the chapters containing the anchored phrases", not something else);
//   2. when the anchor carries a quoted phrase, that phrase appears VERBATIM
//      (whitespace/case-normalised) in the anchored verse(s) of the in-repo KJV.
// Anchors without a quoted phrase (ADR-024 discloses 3 labels are conceptual parallels)
// get check 1 only — there is no phrase to verify, and the script says so in its count.
//
// READ-ONLY. Exit 0 = every anchor verified; exit 1 = at least one failure, each printed.
//   cd web && npx tsx src/scripts/check-heldout-v4-anchors.mts
// The pure core (checkAnchors) takes its queries + chapter text as arguments so the
// red-proof (test/heldout-v4-anchor-check.test.ts) can feed it a fabricated bad anchor
// without touching the frozen set or the filesystem.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRef } from '../bible/ref-parse';
import { BOOKS } from '../bible/books';
import { FROZEN_V4 } from './heldout-v4-queries.mjs';
import type { Q } from './heldout-queries.mjs';

export interface Anchor {
  ref: string;
  phrase: string | null;
}
export interface AnchorFailure {
  id: string;
  anchor: string;
  reason: string;
}
export interface AnchorReport {
  queries: number;
  anchors: number;
  phraseAnchors: number;
  chapterOnly: number;
  failures: AnchorFailure[];
}

/** Split a v4 `source` field into its anchors. Exported for the red-proof. */
export function parseAnchors(source: string): Anchor[] {
  return source
    .replace(/^KJV\s+/, '')
    .split('·')
    .map((seg) => {
      const s = seg.trim().replace(/\s*\([^)]*\)\s*$/, '');
      const m = s.match(/^(.*?)\s*"([^"]+)"\s*$/);
      return m ? { ref: m[1]!.trim(), phrase: m[2]! } : { ref: s, phrase: null };
    })
    .filter((a) => a.ref.length > 0);
}

/** Normalise for verbatim-phrase comparison: case, curly quotes, punctuation, whitespace. */
const norm = (s: string) =>
  s.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

interface Span { book: number; chLo: number; chHi: number; vLo: number; vHi: number }
function spansOf(ref: string): Span[] {
  const o = parseRef(ref);
  if (!o.ok) throw new Error(`unparseable ref: "${ref}"`);
  return o.ref.ranges.map((r) => ({
    book: Math.floor(r.start / 1e6),
    chLo: Math.floor((r.start % 1e6) / 1000),
    chHi: Math.floor((r.end % 1e6) / 1000),
    vLo: r.start % 1000,
    vHi: r.end % 1000,
  }));
}

/**
 * The check, pure. `chapterText(bookNum, chapter, vLo, vHi)` returns the KJV text of the
 * given verse span (or throws if the chapter does not exist — itself a failure).
 */
export function checkAnchors(
  queries: Array<Pick<Q, 'id' | 'cat' | 'expected'> & { source?: string }>,
  chapterText: (book: number, chapter: number, vLo: number, vHi: number) => string,
): AnchorReport {
  const failures: AnchorFailure[] = [];
  let anchors = 0, phraseAnchors = 0, chapterOnly = 0, nQueries = 0;
  for (const q of queries) {
    if (q.cat !== 'epistle' && q.cat !== 'topical') continue;
    nQueries++;
    if (!q.source) { failures.push({ id: q.id, anchor: '(none)', reason: `${q.cat} query has no source field — the anchor record is missing` }); continue; }
    const labelSpans = q.expected.flatMap(spansOf);
    for (const a of parseAnchors(q.source)) {
      anchors++;
      let spans: Span[];
      try { spans = spansOf(a.ref); } catch (e) { failures.push({ id: q.id, anchor: a.ref, reason: (e as Error).message }); continue; }
      for (const sp of spans) {
        const onLabel = labelSpans.some((l) => l.book === sp.book && sp.chLo >= l.chLo && sp.chHi <= l.chHi);
        if (!onLabel) {
          failures.push({ id: q.id, anchor: a.ref, reason: `anchor chapter is not among the labeled chapters {${q.expected.join(', ')}}` });
          continue;
        }
        if (!a.phrase) { chapterOnly++; continue; }
        phraseAnchors++;
        let text: string;
        try { text = chapterText(sp.book, sp.chLo, sp.vLo, sp.vHi); }
        catch (e) { failures.push({ id: q.id, anchor: a.ref, reason: (e as Error).message }); continue; }
        if (!norm(text).includes(norm(a.phrase))) {
          failures.push({ id: q.id, anchor: `${a.ref} "${a.phrase}"`, reason: 'quoted phrase NOT found verbatim in the anchored KJV verse(s)' });
        }
      }
    }
  }
  return { queries: nQueries, anchors, phraseAnchors, chapterOnly, failures };
}

// The real loader: in-repo KJV chapter JSONs (web/public/bible/kjv/<slug>/<ch>.json).
// Exported so the green leg of the red-proof test runs the frozen set against the REAL
// KJV, not a fixture.
const KJV_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'bible', 'kjv');
export function kjvChapterText(book: number, chapter: number, vLo: number, vHi: number): string {
  const slug = BOOKS.find((b) => b.bookNum === book)?.slug;
  if (!slug) throw new Error(`no book ${book}`);
  const json = JSON.parse(readFileSync(join(KJV_DIR, slug, `${chapter}.json`), 'utf8')) as { verses: Array<{ verse: number; text: string }> };
  const text = json.verses.filter((v) => v.verse >= vLo && v.verse <= vHi).map((v) => v.text).join(' ');
  if (!text) throw new Error(`no verses ${vLo}-${vHi} in kjv ${slug}/${chapter}`);
  return text;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = checkAnchors(FROZEN_V4, kjvChapterText);
  for (const f of r.failures) console.error(`✗ ${f.id}  ${f.anchor} — ${f.reason}`);
  console.log(
    `${r.failures.length ? '✗' : '✓'} v4 label anchors: ${r.anchors} anchors across ${r.queries} doctrinal queries ` +
    `(${r.phraseAnchors} phrase-verified, ${r.chapterOnly} chapter-membership-only) — ${r.failures.length} failure(s)`,
  );
  process.exit(r.failures.length ? 1 : 0);
}
