// MAKE THE DELIVERED BYTES EQUAL THE RENDERED BYTES (2026-08-02 deep audit, C2).
//
// THE DEFECT. `web/public/commentaries/` ships as unauthenticated static files, and the licence
// filter runs in the BROWSER — `web/src/lib/bible.ts:132`, inside `fetchCommentary`, AFTER Next
// has already delivered the file. The filter decides what to RENDER; it has no bearing on what is
// DELIVERED. `GET /commentaries/1ch/1.json` returns every entry in it, and
// `/commentaries/_manifest.json` is a public index that makes collecting all 1,212 a for-loop.
// Measured at audit time: 15,161 Tyndale Study Notes + 1,272 Origen + 36 Oecumenius + 11
// Theophylact (all on MUST_NOT_SERVE_AUTHORS), plus CS Lewis 1,102, GK Chesterton 714,
// Douglas Wilson 16 (living), JRR Tolkien 11 — 18,323 entries that must not leave the server.
//
// THE FIX, AND WHY THIS SHAPE. The audit offered two: a route handler over `/commentaries/*`, or
// a build step that emits a filtered artifact. This is the second, because `web/public/` IS the
// artifact — Next copies it verbatim — so filtering the tree filters the deploy, with no runtime
// cost and nothing to bypass.
//
// The keep-predicate is `isPublishedCommentaryEntry` ITSELF, imported from the shipped module, not
// re-typed here. Two consequences worth stating:
//
//   1. NOTHING USER-VISIBLE CHANGES. The reader already applies exactly this function to exactly
//      these entries, so every entry removed here is one the reader was discarding anyway. The
//      change is in what leaves the server, not in what appears on screen.
//   2. IT CLOSES THE CLASS, NOT THE INSTANCE. The audit's 18,323 are the named offenders; the
//      predicate also stops delivering the unverified/heretical authors `bible.ts` names
//      (Pelagius, Valentinus, …) and anything a future editorial ruling adds. A list of eight
//      names would have had to be maintained. This has nothing to maintain.
//
// NOTHING IS DELETED. `web/public/commentaries/` is gitignored, untracked, and 407 MB — for the
// scraped sources it is the only copy on this machine, and it is an INGEST INPUT
// (`insert-static-author.ts`, `gate-ingest.ts`, `regen-crosswire-static.ts` all read it). So
// removed entries are MOVED to `corpus-quarantine/`, outside `web/` and therefore outside the
// upload root, and `--restore` puts them back. AGENTS.md reserves content quarantine to the
// owner; this moves bytes out of the serving path on the owner's instruction and destroys none of
// them, so the ruling stays reversible.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isPublishedCommentaryEntry } from '../../web/src/lib/legal-corpus';

const SERVED_ROOT = 'web/public/commentaries';
const QUARANTINE_ROOT = 'corpus-quarantine/commentaries';

interface Entry {
  verseStart?: number;
  verseEnd?: number;
  author: string;
  year?: number | null;
  tradition?: string | null;
  sourceTitle?: string;
  sourceUrl?: string | null;
  text?: string;
  work?: string | null;
  register?: string;
}
interface Doc {
  book: number;
  chapter: number;
  entries: Entry[];
}

/**
 * Stable identity for an entry, so a re-run merges rather than duplicating on restore.
 *
 * THE WHOLE ENTRY, HASHED — not a summary of it. The first version keyed on
 * `verseStart:verseEnd:author:textLength:text.slice(0,64)`, and on the real corpus that collided:
 * the run archived 77,398 of 77,400 dropped entries, because two `Basil of Caesarea` records
 * agreed on all five fields and the Map kept one. Basil carries 100 same-verse pairs and repeats
 * text lengths freely, so the summary was never distinguishing enough. A digest over the ordered
 * key/value pairs cannot collide on anything short of an identical entry, which is the only case
 * where dropping one is correct. (The two are not recoverable: the served tree is the only copy on
 * this machine and it had already been rewritten. Recorded in the tranche notes rather than
 * rounded off — they were unpublished, unserved entries, which is why this is a footnote and not a
 * restore.)
 */
const entryKey = (e: Entry): string =>
  createHash('sha256')
    .update(JSON.stringify(Object.entries(e).sort(([a], [b]) => a.localeCompare(b))))
    .digest('hex');

function chapterFiles(root: string): string[] {
  const out: string[] = [];
  if (!existsSync(root)) return out;
  for (const name of readdirSync(root)) {
    const p = path.join(root, name);
    if (statSync(p).isDirectory()) out.push(...chapterFiles(p));
    else if (name.endsWith('.json') && name !== '_manifest.json') out.push(p);
  }
  return out;
}

/** Write via a temp file + rename, so an interrupted run never leaves a half-written chapter. */
function writeAtomic(file: string, data: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(data));
  renameSync(tmp, file);
}

function readDoc(file: string): Doc {
  const doc = JSON.parse(readFileSync(file, 'utf8')) as Doc;
  if (!Array.isArray(doc?.entries)) throw new Error(`${file}: no entries array`);
  return doc;
}

function quarantinePathFor(servedFile: string): string {
  return path.join(QUARANTINE_ROOT, path.relative(SERVED_ROOT, servedFile));
}

function filterRun(apply: boolean): void {
  const files = chapterFiles(SERVED_ROOT);
  if (files.length === 0) {
    // A scan that finds nothing must never read as "clean". The corpus is 1,212 files; zero means
    // the tree is absent, and filtering an absent tree proves nothing.
    throw new Error(`No chapter files under ${SERVED_ROOT}. Refusing: an empty scan is not a pass.`);
  }

  let entries = 0;
  let removed = 0;
  let touched = 0;
  const byAuthor = new Map<string, number>();

  for (const file of files) {
    const doc = readDoc(file);
    const keep: Entry[] = [];
    const drop: Entry[] = [];
    for (const e of doc.entries) {
      entries += 1;
      const ok = isPublishedCommentaryEntry({
        author: e.author,
        sourceUrl: e.sourceUrl,
        book: doc.book,
        work: e.work,
      });
      (ok ? keep : drop).push(e);
    }
    if (drop.length === 0) continue;

    touched += 1;
    removed += drop.length;
    for (const e of drop) byAuthor.set(e.author, (byAuthor.get(e.author) ?? 0) + 1);
    if (!apply) continue;

    // QUARANTINE FIRST, THEN SHRINK. If the quarantine write throws, the served file is still
    // whole and the run aborts with nothing lost. The reverse order can lose entries.
    const qFile = quarantinePathFor(file);
    const existing = existsSync(qFile) ? readDoc(qFile).entries : [];
    const merged = new Map(existing.map((e) => [entryKey(e), e]));
    for (const e of drop) merged.set(entryKey(e), e);
    writeAtomic(qFile, { book: doc.book, chapter: doc.chapter, entries: [...merged.values()] });

    writeAtomic(file, { ...doc, entries: keep });
  }

  const verb = apply ? 'quarantined' : 'would quarantine';
  console.log(`${files.length.toLocaleString()} files, ${entries.toLocaleString()} entries scanned`);
  console.log(`${verb} ${removed.toLocaleString()} entries across ${touched.toLocaleString()} files`);
  for (const [author, n] of [...byAuthor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    console.log(`  ${String(n).padStart(7)}  ${author}`);
  }
  if (byAuthor.size > 25) console.log(`  … and ${byAuthor.size - 25} more authors`);
  if (apply) {
    console.log(`\nMoved to ${QUARANTINE_ROOT}/ (outside the upload root). Restore: --restore`);
    console.log('NEXT: pnpm exec tsx src/ingest/build-commentary-manifest.ts  — the manifest still lists them.');
  }
}

function restoreRun(apply: boolean): void {
  const files = chapterFiles(QUARANTINE_ROOT);
  if (files.length === 0) {
    console.log(`Nothing under ${QUARANTINE_ROOT}. Nothing to restore.`);
    return;
  }
  let restored = 0;
  for (const qFile of files) {
    const qDoc = readDoc(qFile);
    const servedFile = path.join(SERVED_ROOT, path.relative(QUARANTINE_ROOT, qFile));
    if (!existsSync(servedFile)) {
      console.warn(`  ! ${servedFile} is absent; skipping (the served tree has moved on)`);
      continue;
    }
    const doc = readDoc(servedFile);
    const merged = new Map(doc.entries.map((e) => [entryKey(e), e]));
    let added = 0;
    for (const e of qDoc.entries) {
      if (merged.has(entryKey(e))) continue;
      merged.set(entryKey(e), e);
      added += 1;
    }
    if (added === 0) continue;
    restored += added;
    if (!apply) continue;
    const all = [...merged.values()].sort(
      (a, b) => (a.verseStart ?? 0) - (b.verseStart ?? 0) || a.author.localeCompare(b.author),
    );
    writeAtomic(servedFile, { ...doc, entries: all });
  }
  console.log(`${apply ? 'restored' : 'would restore'} ${restored.toLocaleString()} entries into ${SERVED_ROOT}`);
  if (apply) console.log('The served tree now ships quarantined content again. Re-run without --restore before deploying.');
}

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
if (argv.includes('--restore')) restoreRun(apply);
else filterRun(apply);
if (!apply) console.log('\nDRY RUN. Nothing was written. Re-run with --apply.');
