#!/usr/bin/env -S npx tsx
/**
 * FRONT-MATTER SCAN — Work Order v2 Stage 3.2. Read-only, dev only, REPORTS ONLY.
 *
 *   npx tsx scripts/front-matter-scan.mts                      # static corpus only
 *   FRONT_MATTER_DATABASE_URL=<dev url> npx tsx scripts/front-matter-scan.mts \
 *     --target=ep-tiny-hat                                     # + commentary_entries, embeddings
 *
 * PROPERTY: no SERVED commentary entry keyed to a verse is book- or chapter-level apparatus.
 *
 * It STOPS (exit non-zero) when a hit lands on an ADMITTED entry — one a reader can actually
 * reach — and when a catalog it was asked to scan yielded zero entries, because zero-of-zero
 * is the shape every broken scan takes.
 *
 * IT DOES NOT FIX ANYTHING, by instruction and on the evidence. ADR-029's sweep of the same
 * class of defect recorded two reported ranges that were WRONG and one chunk that would have
 * destroyed sermon text if it had been deleted on the report alone. What an entry IS gets
 * settled by reading it.
 *
 * The predicates are IMPORTED, never re-typed: `isPublishedCommentaryEntry` decides admission
 * for static entries and `isPublishedAuthor` for database rows, so this report cannot come to
 * disagree with the product it describes. The rules themselves live in
 * scripts/lib/front-matter-detector.mjs so they can be red-proofed with no corpus and no
 * database at all.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  frontMatterVerdictSummary,
  scanEntries,
  type ScannedEntry,
} from './lib/front-matter-detector.mjs';
import { endpointId, hostOf, isProdHost } from './lib/target-guard.mjs';
import { isPublishedAuthor, isPublishedCommentaryEntry } from '../web/src/lib/legal-corpus';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS = path.join(ROOT, 'web/public/commentaries');
const args = process.argv.slice(2);
const declared = args.find((a) => a.startsWith('--target='))?.split('=')[1];
const url = process.env.FRONT_MATTER_DATABASE_URL;

const stops: string[] = [];
const report = (line = ''): void => console.log(line);

function ref(e: ScannedEntry): string {
  return `${e.book ?? '?'}:${e.chapter ?? '?'}:${e.verseStart ?? '?'}${e.verseEnd && e.verseEnd !== e.verseStart ? `-${e.verseEnd}` : ''}`;
}

function printScan(label: string, scan: ReturnType<typeof scanEntries>): void {
  report(`\n=== ${label} ===`);
  report(`  entries scanned        : ${scan.scanned.toLocaleString()}`);
  report(`  apparatus hits         : ${scan.hits.length.toLocaleString()}  (${
    Object.entries(scan.byKind).map(([k, n]) => `${k}=${n}`).join(', ') || 'none'
  })`);
  report(`  of those, ADMITTED     : ${scan.admittedHits.length.toLocaleString()}`);
  report(`  short-body stubs       : ${scan.stubs.length.toLocaleString()} (reported apart — a suspicion, not a finding)`);

  // Admitted hits first and in full: those are the property violations.
  for (const h of scan.admittedHits.slice(0, 60)) {
    report(`  ✗ ADMITTED ${ref(h.entry)} ${String(h.entry.author ?? '(no author)').padEnd(28)} [${h.kind}] ${JSON.stringify(h.evidence)}`);
  }
  if (scan.admittedHits.length > 60) report(`  … ${scan.admittedHits.length - 60} more admitted hit(s)`);

  const held = scan.hits.filter((h) => !h.admitted);
  for (const h of held.slice(0, 25)) {
    report(`    held    ${ref(h.entry)} ${String(h.entry.author ?? '(no author)').padEnd(28)} [${h.kind}] ${JSON.stringify(h.evidence)}`);
  }
  if (held.length > 25) report(`    … ${held.length - 25} more hit(s) on entries that are not served`);

  const verdict = frontMatterVerdictSummary(scan);
  if (verdict.stop) stops.push(`${label}: ${verdict.reason}`);
}

// ── static corpus ────────────────────────────────────────────────────────────
// The corpus the reader ships. It has no `heading` field, so the detector reads each entry's
// first line — which is where front matter announces itself.
function loadStatic(): ScannedEntry[] {
  const out: ScannedEntry[] = [];
  if (!existsSync(CORPUS)) return out;
  for (const book of readdirSync(CORPUS).sort()) {
    const dir = path.join(CORPUS, book);
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json') || f === '_manifest.json') continue;
      let j: { book?: number; chapter?: number; entries?: Array<Record<string, unknown>> };
      try {
        j = JSON.parse(readFileSync(path.join(dir, f), 'utf-8'));
      } catch {
        continue;
      }
      if (!Array.isArray(j.entries)) continue;
      for (const e of j.entries) {
        out.push({
          author: String(e.author ?? ''),
          book: typeof j.book === 'number' ? j.book : undefined,
          chapter: typeof j.chapter === 'number' ? j.chapter : undefined,
          verseStart: Number(e.verseStart ?? 0),
          verseEnd: Number(e.verseEnd ?? 0),
          sourceUrl: (e.sourceUrl as string) ?? '',
          work: (e.work as string) ?? null,
          body: String(e.text ?? ''),
        });
      }
    }
  }
  return out;
}

report(`front-matter scan — PROPERTY: no served entry keyed to a verse is book/chapter apparatus`);
report(`corpus: ${CORPUS}`);

const staticEntries = loadStatic();
if (staticEntries.length === 0) {
  stops.push('static corpus: absent or empty, so the scan could not have found anything');
  report('\n=== static corpus ===\n  ABSENT — nothing scanned.');
} else {
  printScan(
    'static corpus (web/public/commentaries)',
    scanEntries(staticEntries, {
      // The reader's own per-entry rule, imported. Book-aware, and MUST_NOT_SERVE vetoes first.
      served: (e) =>
        isPublishedCommentaryEntry({
          author: String(e.author ?? ''),
          sourceUrl: e.sourceUrl ?? '',
          book: e.book,
          work: e.work ?? null,
        }),
    }),
  );
}

// ── dev database ─────────────────────────────────────────────────────────────
if (!url) {
  report('\n=== dev database ===');
  report('  NOT RUN — FRONT_MATTER_DATABASE_URL is unset.');
  report('  Pass a dev connection string plus --target=<endpoint-id> to scan commentary_entries');
  report('  and the served embeddings. This is a LOUD skip: the static half above passing is');
  report('  not evidence about the rows /ask retrieves.');
} else {
  if (!declared) {
    console.error('--target=<endpoint-id> is required whenever a database URL is given.');
    process.exit(2);
  }
  if (isProdHost(url)) {
    console.error(`REFUSING: ${hostOf(url)} is production. This scan is a dev instrument; it has no reason to touch ep-odd-fog.`);
    process.exit(2);
  }
  if (endpointId(hostOf(url)) !== endpointId(declared)) {
    console.error(`STOP: ${hostOf(url)} is not the declared target '${declared}' (exact endpoint id required).`);
    process.exit(2);
  }

  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, application_name: 'front-matter-scan' });
  await c.connect();
  try {
    await c.query('BEGIN');
    await c.query('SET TRANSACTION READ ONLY');
    if ((await c.query('SHOW transaction_read_only')).rows[0]?.transaction_read_only !== 'on') {
      throw new Error('STOP: read-only transaction not in force');
    }
    report(`\ntarget: ${hostOf(url)} (read-only txn; credentials not printed)`);

    const ce = (await c.query<{ book: number; chapter: number; verse_start: number; verse_end: number; author: string; body: string; source_url: string }>(
      `SELECT book, chapter, verse_start, verse_end, author, body, source_url FROM commentary_entries`,
    )).rows;
    printScan(
      'dev commentary_entries',
      scanEntries(
        ce.map((r) => ({
          author: r.author,
          book: r.book,
          chapter: r.chapter,
          verseStart: r.verse_start,
          verseEnd: r.verse_end,
          sourceUrl: r.source_url,
          body: r.body,
        })),
        { served: (e) => isPublishedCommentaryEntry({ author: String(e.author ?? ''), sourceUrl: e.sourceUrl ?? '', book: e.book, work: e.work ?? null }) },
      ),
    );

    // The retrieval store. `heading` is present here, so the detector has a real title field —
    // and these are the rows /ask can quote, which makes them the sharper half of the property.
    const emb = (await c.query<{ author: string | null; heading: string | null; work: string | null; verse_id: string | null; body: string | null }>(
      `SELECT metadata->>'author' AS author, metadata->>'heading' AS heading, metadata->>'work' AS work,
              metadata->>'verseId' AS verse_id, content AS body
         FROM embeddings
        WHERE user_id IS NULL AND metadata->>'verseId' ~ '^[0-9]+$'`,
    )).rows;
    printScan(
      'dev embeddings (verse-keyed, served store)',
      scanEntries(
        emb.map((r) => ({
          author: r.author ?? '',
          work: r.work,
          heading: r.heading,
          body: r.body ?? '',
          where: `verseId=${r.verse_id}`,
        })),
        // Author-level admission here: these rows carry a work slug and an author but no book
        // number, and isPublishedAuthor is the check the library facet uses for exactly that case.
        { served: (e) => isPublishedAuthor(String(e.author ?? '')) },
      ),
    );
  } finally {
    await c.query('ROLLBACK').catch(() => {});
    await c.end();
  }
}

report('\n=== VERDICT ===');
if (stops.length > 0) {
  for (const s of stops) console.error(`  STOP  ${s}`);
  console.error('\n✗ front-matter scan STOPS. Read the entries above; do not delete on this report alone (ADR-029).');
  process.exitCode = 1;
} else {
  report('  ✓ no served entry keyed to a verse is book/chapter apparatus.');
  report('    A clean scan is a claim about the rules in front-matter-detector.mjs, not a proof');
  report('    that no apparatus exists — the rules are heuristics with stated bounds.');
}
