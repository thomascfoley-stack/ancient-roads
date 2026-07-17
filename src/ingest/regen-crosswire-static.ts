// Regenerate the static reader corpus for the biblehub-collapsed authors
// (docs/CORPUS_VERSE_KEY_REPAIR.md §4, workorder 2026-07-16).
//
//   npx tsx src/ingest/regen-crosswire-static.ts
//
// - REPLACES the 5 CrossWire-resourceable authors' entries (Barnes' Notes, John
//   Wesley, John Calvin, C.I. Scofield, B.W. Johnson) with per-verse entries
//   decoded by sword-zverse.ts — correct verse keys, clean provenance.
// - QUARANTINES (moves to data/quarantine/, NOT deletion — reversible, per the
//   owner's 2026-07-11 "HOLD all 14" ruling) the authors with no clean per-verse
//   source: Cambridge, Poole, Pulpit, Benson, Bengel, MacLaren, Darby, Lange,
//   and Geneva Study Bible (CrossWire "Geneva" module carries NO license grant —
//   fail closed).
// Every other author's entries pass through byte-identical.

import { readFileSync, readdirSync, writeFileSync, appendFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { BOOK_SLUGS } from './source-id.js';

const CORPUS_DIR = 'web/public/commentaries';
const QUARANTINE_DIR = 'data/quarantine';

// Old biblehub author string → replacement JSONL + display metadata.
const REPLACE: Record<string, { jsonl: string; year: number; tradition: string; sourceTitle: string; sourceUrl: string }> = {
  "Barnes' Notes": { jsonl: 'data/raw/sword/barnes-nt.jsonl', year: 1834, tradition: 'Presbyterian', sourceTitle: "Barnes' New Testament Notes", sourceUrl: 'https://crosswire.org/sword/modules/ModInfo.jsp?modName=Barnes' },
  'John Wesley': { jsonl: 'data/raw/sword/wesley-all.jsonl', year: 1765, tradition: 'Methodist', sourceTitle: "Wesley's Explanatory Notes", sourceUrl: 'https://crosswire.org/sword/modules/ModInfo.jsp?modName=Wesley' },
  'John Calvin': { jsonl: 'data/raw/sword/calvin-all.jsonl', year: 1555, tradition: 'Reformed', sourceTitle: "Calvin's Commentaries", sourceUrl: 'https://crosswire.org/sword/modules/ModInfo.jsp?modName=CalvinCommentaries' },
  'C.I. Scofield': { jsonl: 'data/raw/sword/scofield-all.jsonl', year: 1917, tradition: 'Dispensationalist', sourceTitle: 'Scofield Reference Notes (1917)', sourceUrl: 'https://crosswire.org/sword/modules/ModInfo.jsp?modName=Scofield' },
  'B.W. Johnson': { jsonl: 'data/raw/sword/pnt-nt.jsonl', year: 1891, tradition: 'Restoration', sourceTitle: "The People's New Testament", sourceUrl: 'https://crosswire.org/sword/modules/ModInfo.jsp?modName=PNT' },
};
// JSONL author string → static corpus author string (reader naming).
const JSONL_AUTHOR_TO_STATIC: Record<string, string> = {
  'Albert Barnes': "Barnes' Notes",
  'John Wesley': 'John Wesley',
  'John Calvin': 'John Calvin',
  'C.I. Scofield': 'C.I. Scofield',
  'B.W. Johnson': 'B.W. Johnson',
};

const QUARANTINE_ONLY = [
  'Cambridge Bible', 'Matthew Poole', 'Pulpit Commentary', 'Joseph Benson',
  'Johann Bengel', 'Alexander MacLaren', 'J.N. Darby', 'J.P. Lange', 'Geneva Study Bible',
];

interface StaticEntry {
  verseStart: number; verseEnd: number; author: string; year: number | null;
  tradition?: string; sourceTitle: string; sourceUrl: string; text: string;
}
interface ChapterFile { book: number; chapter: number; entries: StaticEntry[] }
interface JsonlEntry { author: string; verseId: number; verseEnd: number; content: string }

function main() {
  const removeSet = new Set([...Object.keys(REPLACE), ...QUARANTINE_ONLY]);

  // Rerun guard: once regenerated, the replaced authors carry crosswire provenance.
  // Running again would quarantine the CLEAN entries and clobber the quarantine
  // file with them (this happened once, 2026-07-17 — the file had to be rebuilt
  // from the pre-regen corpus). Probe MULTIPLE books across the alphabet: a crashed
  // first run rewrites early dirs while a single late-alphabet probe still looks
  // pre-regen (deep-audit 2026-07-16, H2).
  for (const probeRel of ['gen/1.json', 'psa/23.json', 'jhn/3.json']) {
    const probeJson = JSON.parse(readFileSync(path.join(CORPUS_DIR, probeRel), 'utf8')) as ChapterFile;
    if (probeJson.entries.some((e) => removeSet.has(e.author) && /crosswire\.org/.test(e.sourceUrl))) {
      console.error(`ABORT: corpus already (partially) regenerated — crosswire provenance on a replaced author in ${probeRel}.`);
      process.exit(1);
    }
  }

  // Load replacement entries, grouped per (book, chapter).
  const incoming = new Map<string, StaticEntry[]>(); // "book:chapter" -> entries
  const incomingCounts = new Map<string, number>();
  for (const [staticAuthor, meta] of Object.entries(REPLACE)) {
    const lines = readFileSync(meta.jsonl, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as JsonlEntry);
    for (const e of lines) {
      const book = Math.floor(e.verseId / 1e6);
      const chapter = Math.floor((e.verseId % 1e6) / 1000);
      if (!BOOK_SLUGS[book]) continue;
      const mapped = JSONL_AUTHOR_TO_STATIC[e.author] ?? e.author;
      if (mapped !== staticAuthor) continue; // each JSONL holds one author; guard anyway
      const k = `${book}:${chapter}`;
      const list = incoming.get(k) ?? [];
      list.push({
        verseStart: e.verseId % 1000,
        verseEnd: (e.verseEnd ?? e.verseId) % 1000,
        author: staticAuthor,
        year: meta.year,
        tradition: meta.tradition,
        sourceTitle: meta.sourceTitle,
        sourceUrl: meta.sourceUrl,
        text: e.content,
      });
      incoming.set(k, list);
      incomingCounts.set(staticAuthor, (incomingCounts.get(staticAuthor) ?? 0) + 1);
    }
  }

  mkdirSync(QUARANTINE_DIR, { recursive: true });
  // Collision-proof hold file, appended BEFORE each chapter file is mutated — a
  // mid-run crash must never lose removed entries, and a rerun must never clobber
  // an existing hold (deep-audit 2026-07-16, H2; the 2026-07-17 incident).
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const quarantinePath = path.join(QUARANTINE_DIR, `biblehub-collapsed-${stamp}.jsonl`);
  if (existsSync(quarantinePath)) {
    console.error(`ABORT: ${quarantinePath} already exists — refusing to overwrite a hold file.`);
    process.exit(1);
  }
  const removedCounts = new Map<string, number>();
  let filesTouched = 0, added = 0, removedTotal = 0;

  for (const bookSlug of readdirSync(CORPUS_DIR).sort()) {
    const dir = path.join(CORPUS_DIR, bookSlug);
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir).sort()) {
      if (!f.endsWith('.json') || f === '_manifest.json') continue;
      const p = path.join(dir, f);
      const j = JSON.parse(readFileSync(p, 'utf8')) as ChapterFile;
      if (!Array.isArray(j.entries)) continue;
      const kept: StaticEntry[] = [];
      const removedHere: string[] = [];
      for (const e of j.entries) {
        if (removeSet.has(e.author)) {
          removedHere.push(JSON.stringify({ book: j.book, chapter: j.chapter, ...e }));
          removedCounts.set(e.author, (removedCounts.get(e.author) ?? 0) + 1);
        } else {
          kept.push(e);
        }
      }
      let changed = removedHere.length > 0;
      const fresh = incoming.get(`${j.book}:${j.chapter}`);
      if (fresh) {
        kept.push(...fresh.sort((a, b) => a.verseStart - b.verseStart));
        added += fresh.length;
        changed = true;
      }
      if (changed) {
        if (removedHere.length > 0) {
          appendFileSync(quarantinePath, removedHere.join('\n') + '\n'); // persist FIRST
          removedTotal += removedHere.length;
        }
        writeFileSync(p, JSON.stringify({ book: j.book, chapter: j.chapter, entries: kept }));
        filesTouched++;
      }
    }
  }
  console.log(`files rewritten: ${filesTouched} · entries added: ${added} · removed→quarantine: ${removedTotal}`);
  console.log(`quarantine file: ${quarantinePath}`);
  console.log('replaced (new counts):', Object.fromEntries(incomingCounts));
  console.log('removed (old counts):', Object.fromEntries(removedCounts));
}

main();
