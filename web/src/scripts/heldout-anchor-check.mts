// Label anchor-check — the script STATE_OF_TRUTH §1 caveat 4 records as never committed
// ("the ADR-024 label anchor-check script was never committed, so v4 label verification is
// not reproducible from this repo"). Written under W-PN20 (2026-08-22) so the pn20 mint AND
// the v4 anchors are both mechanically re-checkable. READ-ONLY: it touches no database and
// no provider — only the frozen query files and the in-repo KJV (web/public/bible/kjv).
//
// WHAT IT CHECKS
//  1. ANCHORS. A case's `source` field cites KJV anchors as `·`-separated entries,
//     each `[KJV] <Book abbrev> <ch>:<v>["<quoted phrase>"]`. For every QUOTED entry the
//     phrase must occur (punctuation-insensitive) in the cited chapter of the in-repo KJV.
//     Entries with no quote carry no checkable phrase: they are counted and reported as
//     `unquoted` (declared, never silently skipped) but cannot fail this check.
//  2. PN20 LABEL COVERAGE. Every chapter in a pn20 case's `expected` list must contain at
//     least one verified anchor phrase (PRE-REG labeling rule).
//  3. PN20 DISJOINTNESS (ADR-118 §3). No pn20 label chapter may appear in ANY prior frozen
//     set's `expected` list (pilot, v2/frozen, v3, v4).
//
// Exit 1 on any anchor failure, coverage gap, or disjointness collision; exit 0 otherwise.
//   cd web && npx tsx src/scripts/heldout-anchor-check.mts [--set pn20|v4|all]   (default: all)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseRef } from '../bible/ref-parse';
import { BOOKS } from '../bible/books';
import { PILOT, FROZEN, type Q } from './heldout-queries.mjs';
import { FROZEN_V3 } from './heldout-v3-queries.mjs';
import { FROZEN_V4 } from './heldout-v4-queries.mjs';
import { FROZEN_PN20 } from './heldout-pn20-queries.mjs';

const KJV_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../public/bible/kjv');
const SLUG = new Map(BOOKS.map((b) => [b.bookNum, b.slug]));

// Book abbreviations as written in the sets' `source` fields → canonical book number.
const ABBREV: Record<string, number> = {
  Gen: 1, Exod: 2, Lev: 3, Num: 4, Deut: 5, Josh: 6, Judg: 7, Ruth: 8,
  '1 Sam': 9, '2 Sam': 10, '1 Kgs': 11, '2 Kgs': 12, '1 Chr': 13, '2 Chr': 14,
  Ezra: 15, Neh: 16, Esth: 17, Job: 18, Ps: 19, Prov: 20, Eccl: 21, Song: 22,
  Isa: 23, Jer: 24, Lam: 25, Ezek: 26, Dan: 27, Hos: 28, Joel: 29, Amos: 30,
  Obad: 31, Jonah: 32, Mic: 33, Nah: 34, Hab: 35, Zeph: 36, Hag: 37, Zech: 38, Mal: 39,
  Matt: 40, Mark: 41, Luke: 42, John: 43, Jn: 43, Acts: 44, Rom: 45, '1 Cor': 46, '2 Cor': 47,
  Gal: 48, Eph: 49, Phil: 50, Col: 51, '1 Thess': 52, '2 Thess': 53, '1 Tim': 54, '2 Tim': 55,
  Titus: 56, Phlm: 57, Heb: 58, Jas: 59, '1 Pet': 60, '2 Pet': 61, '1 Jn': 62, '2 Jn': 63,
  '3 John': 64, Jude: 65, Rev: 66,
};

// Punctuation-insensitive comparison: KJV commas/semicolons and curly quotes must not matter.
const norm = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9]+/g, ' ').trim();

const chapterTextCache = new Map<string, string>();
function chapterText(book: number, chapter: number): string {
  const key = `${book}:${chapter}`;
  if (!chapterTextCache.has(key)) {
    const slug = SLUG.get(book);
    if (!slug) throw new Error(`no slug for book ${book}`);
    const json = JSON.parse(readFileSync(join(KJV_DIR, `${slug}.json`), 'utf8')) as {
      chapters: Record<string, Array<{ verse: number; text: string }>>;
    };
    const verses = json.chapters[String(chapter)];
    if (!verses) throw new Error(`no chapter ${chapter} in ${slug}.json`);
    chapterTextCache.set(key, norm(verses.map((v) => v.text).join(' ')));
  }
  return chapterTextCache.get(key)!;
}

interface Anchor { book: number; chapter: number; phrase: string | null }
function parseAnchors(source: string): Anchor[] {
  const out: Anchor[] = [];
  for (const raw of source.split('·')) {
    const entry = raw.trim().replace(/^KJV\s+/, '');
    const m = entry.match(/^(.+?)\s+(\d+):[\d,-]+(?:\s+"([^"]+)")?/);
    if (!m) continue; // e.g. trailing parenthetical remarks — no ref, nothing to check
    const book = ABBREV[m[1]!];
    if (!book) throw new Error(`unknown book abbrev in source: "${m[1]}" (${entry})`);
    out.push({ book, chapter: Number(m[2]), phrase: m[3] ?? null });
  }
  return out;
}

type Fail = { id: string; what: string };
function checkAnchors(setName: string, set: Q[]): { fails: Fail[]; quoted: number; unquoted: number } {
  const fails: Fail[] = [];
  let quoted = 0, unquoted = 0;
  for (const q of set) {
    if (!q.source) continue;
    for (const a of parseAnchors(q.source)) {
      if (a.phrase === null) { unquoted++; continue; }
      quoted++;
      if (!chapterText(a.book, a.chapter).includes(norm(a.phrase))) {
        fails.push({ id: q.id, what: `anchor "${a.phrase}" NOT in KJV ${a.book}/${a.chapter}` });
      }
    }
    // PN20 label coverage: every labeled chapter holds at least one verified anchor.
    if (setName === 'pn20') {
      const anchoredChapters = new Set(
        parseAnchors(q.source).filter((a) => a.phrase !== null).map((a) => `${a.book}:${a.chapter}`),
      );
      for (const ref of q.expected) {
        const o = parseRef(ref);
        if (!o.ok) { fails.push({ id: q.id, what: `unparseable expected ref "${ref}"` }); continue; }
        for (const r of o.ref.ranges) {
          const book = Math.floor(r.start / 1e6);
          for (let ch = Math.floor((r.start % 1e6) / 1000); ch <= Math.floor((r.end % 1e6) / 1000); ch++) {
            if (!anchoredChapters.has(`${book}:${ch}`)) {
              fails.push({ id: q.id, what: `label ${ref} chapter ${book}:${ch} has NO anchor in that chapter` });
            }
          }
        }
      }
    }
  }
  return { fails, quoted, unquoted };
}

// Disjointness: pn20 label chapters vs the union of every prior frozen set's labels.
function checkDisjoint(): Fail[] {
  const prior = new Map<string, string>(); // "book:ch" → where it was used before
  const add = (name: string, set: Q[]) => {
    for (const q of set) {
      for (const ref of q.expected) {
        const o = parseRef(ref);
        if (!o.ok) continue;
        for (const r of o.ref.ranges) {
          const book = Math.floor(r.start / 1e6);
          for (let ch = Math.floor((r.start % 1e6) / 1000); ch <= Math.floor((r.end % 1e6) / 1000); ch++) {
            prior.set(`${book}:${ch}`, `${name}:${q.id}`);
          }
        }
      }
    }
  };
  add('pilot', PILOT); add('v2-frozen', FROZEN); add('v3', FROZEN_V3); add('v4', FROZEN_V4);
  const fails: Fail[] = [];
  for (const q of FROZEN_PN20) {
    for (const ref of q.expected) {
      const o = parseRef(ref);
      if (!o.ok) continue;
      for (const r of o.ref.ranges) {
        const book = Math.floor(r.start / 1e6);
        for (let ch = Math.floor((r.start % 1e6) / 1000); ch <= Math.floor((r.end % 1e6) / 1000); ch++) {
          const seen = prior.get(`${book}:${ch}`);
          if (seen) fails.push({ id: q.id, what: `label chapter ${book}:${ch} collides with ${seen} (ADR-118 freshness)` });
        }
      }
    }
  }
  return fails;
}

function main() {
  const arg = process.argv.find((a) => a.startsWith('--set='))?.slice(6) ?? 'all';
  const sets: Array<[string, Q[]]> =
    arg === 'pn20' ? [['pn20', FROZEN_PN20]]
    : arg === 'v4' ? [['v4', FROZEN_V4]]
    : [['pn20', FROZEN_PN20], ['v4', FROZEN_V4]];
  let failed = 0;
  for (const [name, set] of sets) {
    const { fails, quoted, unquoted } = checkAnchors(name, set);
    for (const f of fails) { failed++; console.log(`  ✗ [${name}] ${f.id}: ${f.what}`); }
    console.log(`  ${fails.length ? '✗' : '✓'} [${name}] anchors: ${quoted} quoted checked, ${fails.length} failed, ${unquoted} unquoted (no phrase recorded — declared, not checked)`);
  }
  const dj = checkDisjoint();
  for (const f of dj) { failed++; console.log(`  ✗ [disjoint] ${f.id}: ${f.what}`); }
  console.log(`  ${dj.length ? '✗' : '✓'} [disjoint] pn20 labels vs pilot/v2/v3/v4: ${dj.length} collision(s)`);
  if (failed) { console.error(`anchor-check FAILED (${failed})`); process.exit(1); }
  console.log('anchor-check OK');
}

main();
