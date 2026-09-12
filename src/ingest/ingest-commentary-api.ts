#!/usr/bin/env tsx
// CLI: pull verse-by-verse commentaries from the HelloAO commentary API
// → JSON files per chapter, later merged with patristic data for serving.
//
// Usage:  pnpm ingest:commentary-api
//         tsx src/ingest/ingest-commentary-api.ts [source...]
//
// Sources: matthew-henry, john-gill, jamieson-fausset-brown, adam-clarke
// Produces: data/commentaries-api/{source}/{bookSlug}/{chapter}.json

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOKS } from '../bible/books';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');
const API_BASE = 'https://bible.helloao.org/api/c';

const SLUG_TO_API_ID: Record<string, string> = {
  gen: 'GEN', exo: 'EXO', lev: 'LEV', num: 'NUM', deu: 'DEU',
  jos: 'JOS', jdg: 'JDG', rut: 'RUT',
  '1sa': '1SA', '2sa': '2SA', '1ki': '1KI', '2ki': '2KI',
  '1ch': '1CH', '2ch': '2CH', ezr: 'EZR', neh: 'NEH', est: 'EST',
  job: 'JOB', psa: 'PSA', pro: 'PRO', ecc: 'ECC', sng: 'SNG',
  isa: 'ISA', jer: 'JER', lam: 'LAM', ezk: 'EZK', dan: 'DAN',
  hos: 'HOS', jol: 'JOL', amo: 'AMO', oba: 'OBA', jon: 'JON',
  mic: 'MIC', nam: 'NAM', hab: 'HAB', zep: 'ZEP', hag: 'HAG',
  zec: 'ZEC', mal: 'MAL',
  mat: 'MAT', mrk: 'MRK', luk: 'LUK', jhn: 'JHN', act: 'ACT',
  rom: 'ROM', '1co': '1CO', '2co': '2CO', gal: 'GAL', eph: 'EPH',
  php: 'PHP', col: 'COL', '1th': '1TH', '2th': '2TH',
  '1ti': '1TI', '2ti': '2TI', tit: 'TIT', phm: 'PHM', heb: 'HEB',
  jas: 'JAS', '1pe': '1PE', '2pe': '2PE',
  '1jn': '1JN', '2jn': '2JN', '3jn': '3JN', jud: 'JUD', rev: 'REV',
};

export interface CommentarySource {
  id: string;
  author: string;
  year: number;
  tradition: string;
}

const SOURCES: Record<string, CommentarySource> = {
  'matthew-henry': {
    id: 'matthew-henry',
    author: 'Matthew Henry',
    year: 1710,
    tradition: 'Nonconformist',
  },
  'john-gill': {
    id: 'john-gill',
    author: 'John Gill',
    year: 1763,
    tradition: 'Reformed Baptist',
  },
  'jamieson-fausset-brown': {
    id: 'jamieson-fausset-brown',
    author: 'Jamieson, Fausset & Brown',
    year: 1871,
    tradition: 'Presbyterian',
  },
  'adam-clarke': {
    id: 'adam-clarke',
    author: 'Adam Clarke',
    year: 1832,
    tradition: 'Methodist',
  },
};

export interface ApiVerse {
  type: string;
  number: number;
  content: (string | Record<string, unknown>)[];
}

export interface ChapterEntry {
  verseStart: number;
  verseEnd: number;
  author: string;
  year: number;
  tradition: string;
  sourceTitle: string;
  sourceUrl: string;
  text: string;
}

function extractText(content: (string | Record<string, unknown>)[]): string {
  const parts: string[] = [];
  for (const item of content) {
    if (typeof item === 'string') {
      parts.push(item);
    } else if (item && typeof item === 'object') {
      if ('text' in item && typeof item.text === 'string') {
        parts.push(item.text);
      }
      if ('content' in item && Array.isArray(item.content)) {
        parts.push(extractText(item.content as (string | Record<string, unknown>)[]));
      }
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

// Collect verse entries from a chapter's content and compute verse ranges.
// Section-based commentaries (e.g. Matthew Henry) span multiple verses, so
// verseEnd = nextEntry.number - 1. The range builder assumes EVERY verse is
// present: a dropped intermediate verse lets the prior entry's range swallow
// the missing one (a query for verse 7 returned verse 6's text). Keep all
// non-empty entries — never re-introduce a text-length floor here. Short
// word-glosses (John 1:7 "through him--John.", 18 chars) are real commentary,
// and the Thayer's adapter keeps cross-reference stubs for the same reason.
export function buildChapterEntries(
  content: ApiVerse[],
  source: CommentarySource,
): ChapterEntry[] {
  const verseItems: { number: number; text: string }[] = [];
  for (const item of content) {
    if (item.type === 'verse' && typeof item.number === 'number') {
      const text = extractText(item.content);
      if (text) {
        verseItems.push({ number: item.number, text });
      }
    }
  }

  const entries: ChapterEntry[] = [];
  for (let vi = 0; vi < verseItems.length; vi++) {
    const item = verseItems[vi]!;
    const nextStart = verseItems[vi + 1]?.number;
    const verseEnd = nextStart ? nextStart - 1 : item.number;

    entries.push({
      verseStart: item.number,
      verseEnd: Math.max(item.number, verseEnd),
      author: source.author,
      year: source.year,
      tradition: source.tradition,
      sourceTitle: `${source.author}'s Commentary`,
      sourceUrl: '',
      text: item.text,
    });
  }
  return entries;
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// Discriminated fetch result so the loop can tell a legitimately-absent chapter
// (404 — this commentary simply doesn't cover this chapter) from a real fetch
// error (network/5xx/bad body). Mirrors adapter-helloao.ts on the SAME HelloAO
// chapter endpoint: a 404 is "absent" and must be skipped without retry or error
// accounting, while other failures are transient and should retry + trip the
// fail-loud gate. Treating 404 as a thrown error made the default invocation
// exit 1 forever (358 permanent gaps in matthew-henry + adam-clarke) and waste
// ~18 min of dead retries per resume — re-running can never fill a coverage gap.
export type ChapterFetchResult =
  | { status: 'ok'; data: { chapter: { content: ApiVerse[] } } }
  | { status: 'absent' }
  | { status: 'error'; message: string };

export async function fetchChapterResult(url: string): Promise<ChapterFetchResult> {
  try {
    const res = await fetch(url);
    if (res.status === 404) return { status: 'absent' }; // this commentary doesn't cover this chapter
    if (!res.ok) return { status: 'error', message: `${res.status}` };
    return { status: 'ok', data: (await res.json()) as { chapter: { content: ApiVerse[] } } };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

// Retry real (transient) errors up to 3× with 0/1/2s backoff, but return `absent`
// and `ok` immediately — a permanent 404 can never succeed on retry. `sleepFn`
// is injectable so tests can exercise the retry policy without real timers.
export async function fetchChapterWithRetry(
  url: string,
  sleepFn: (ms: number) => Promise<void> = sleep,
): Promise<ChapterFetchResult> {
  for (let attempt = 0; ; attempt++) {
    if (attempt > 0) await sleepFn(1000 * attempt);
    const r = await fetchChapterResult(url);
    if (r.status === 'ok' || r.status === 'absent') return r;
    if (attempt === 2) return r; // exhausted retries — return the last error
  }
}

export interface SourceResult {
  source: string;
  totalEntries: number;
  totalChapters: number;
  errors: number;
  absent: number;
}

// The D44 fail-loud gate sums this across sources and exits 1 on any non-zero
// count. `absent` (permanent coverage gaps) is deliberately excluded — re-
// running can never fill a 404, so it must not trip a gate whose own message
// ("Re-run to fill the gaps") assumes the gaps are transient.
export function countFailedChapters(results: SourceResult[]): number {
  return results.reduce((n, r) => n + (r.errors ?? 0), 0);
}

export async function ingestSource(
  source: CommentarySource,
  opts: { sleepFn?: (ms: number) => Promise<void> } = {},
): Promise<SourceResult> {
  const sleepFn = opts.sleepFn ?? sleep;
  console.log(`\n=== ${source.author} (${source.tradition}, ${source.year}) ===`);

  const outDir = join(root, 'data', 'commentaries-api', source.id);
  let totalEntries = 0;
  let totalChapters = 0;
  let errors = 0;
  let absent = 0;

  for (const book of BOOKS) {
    const apiBookId = SLUG_TO_API_ID[book.slug];
    if (!apiBookId) continue;

    const bookDir = join(outDir, book.slug);
    mkdirSync(bookDir, { recursive: true });

    for (let ch = 1; ch <= book.chapterCount; ch++) {
      const outPath = join(bookDir, `${ch}.json`);
      if (existsSync(outPath)) {
        totalChapters++;
        continue;
      }

      const url = `${API_BASE}/${source.id}/${apiBookId}/${ch}.json`;
      const r = await fetchChapterWithRetry(url, sleepFn);
      if (r.status === 'absent') {
        // Permanent coverage gap — don't write, don't count as fetched, don't
        // count as an error: re-running can never fill it, so it must not trip
        // the fail-loud gate.
        absent++;
      } else if (r.status === 'error') {
        console.warn(`  Error: ${book.name} ${ch}: ${r.message}`);
        errors++;
      } else {
        const entries = buildChapterEntries(r.data.chapter.content, source);
        totalEntries += entries.length;

        const payload = {
          book: book.bookNum,
          chapter: ch,
          source: source.id,
          entries,
        };

        writeFileSync(outPath, JSON.stringify(payload));
        totalChapters++;
      }

      if (ch % 20 === 0) await sleepFn(100);
    }

    process.stdout.write(`  ${book.name} ✓\n`);
  }

  console.log(`  ${totalEntries} entries, ${totalChapters} chapters`);
  if (errors > 0) console.warn(`  ${errors} errors`);
  if (absent > 0) console.log(`  ${absent} chapters absent (permanent coverage gaps)`);
  return { source: source.id, totalEntries, totalChapters, errors, absent };
}

// --- Main ---
if (process.argv[1] && /ingest-commentary-api/.test(process.argv[1])) {
  const requestedSources = process.argv.slice(2);
  const sourceIds = requestedSources.length > 0
    ? requestedSources
    : Object.keys(SOURCES);

  const invalid = sourceIds.filter((s) => !SOURCES[s]);
  if (invalid.length > 0) {
    console.error(`Unknown source(s): ${invalid.join(', ')}`);
    console.error(`Available: ${Object.keys(SOURCES).join(', ')}`);
    process.exit(1);
  }

  console.log(`Pulling ${sourceIds.length} commentary source(s) from ${API_BASE}`);

  const results: SourceResult[] = [];
  for (const id of sourceIds) {
    results.push(await ingestSource(SOURCES[id]!));
  }

  console.log('\n=== Summary ===');
  for (const r of results) {
    console.log(
      `  ${r.source}: ${r.totalEntries} entries, ${r.totalChapters} chapters` +
      `${r.errors ? `, ${r.errors} errors` : ''}` +
      `${r.absent ? `, ${r.absent} absent (coverage gaps)` : ''}`,
    );
  }
  // D44 (DEEP_SWEEP): errors were counted, printed, and then thrown away — the run ended
  // "Done." with exit code 0 while chapters were missing. The repo's standard is fail loud, and
  // a script that reports green on an incomplete corpus is the shape a gate exists to prevent.
  // The gate fires on real (transient) errors only: permanent coverage-gap 404s are counted as
  // `absent`, not `errors`, so a source that simply doesn't cover some chapters exits 0.
  const failed = countFailedChapters(results);
  if (failed > 0) {
    console.error(`\nFAILED: ${failed} chapter(s) could not be fetched after 3 attempts. Re-run to fill the gaps.`);
    process.exit(1);
  }
  console.log('Done.');
}

