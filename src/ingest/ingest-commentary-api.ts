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

interface CommentarySource {
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

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ingestSource(source: CommentarySource) {
  console.log(`\n=== ${source.author} (${source.tradition}, ${source.year}) ===`);

  const outDir = join(root, 'data', 'commentaries-api', source.id);
  let totalEntries = 0;
  let totalChapters = 0;
  let errors = 0;

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
      let fetched = false;

      for (let attempt = 0; attempt < 3 && !fetched; attempt++) {
        try {
          if (attempt > 0) await sleep(1000 * attempt);
          const data = await fetchJson(url) as {
            chapter: { content: ApiVerse[] };
          };

          const entries = buildChapterEntries(data.chapter.content, source);
          totalEntries += entries.length;

          const payload = {
            book: book.bookNum,
            chapter: ch,
            source: source.id,
            entries,
          };

          writeFileSync(outPath, JSON.stringify(payload));
          totalChapters++;
          fetched = true;
        } catch (err) {
          if (attempt === 2) {
            console.warn(`  Error: ${book.name} ${ch}: ${err instanceof Error ? err.message : err}`);
            errors++;
          }
        }
      }

      if (ch % 20 === 0) await sleep(100);
    }

    process.stdout.write(`  ${book.name} ✓\n`);
  }

  console.log(`  ${totalEntries} entries, ${totalChapters} chapters`);
  if (errors > 0) console.warn(`  ${errors} errors`);
  return { source: source.id, totalEntries, totalChapters, errors };
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

  const results: { source: string; totalEntries: number; totalChapters: number; errors: number }[] = [];
  for (const id of sourceIds) {
    results.push(await ingestSource(SOURCES[id]!));
  }

  console.log('\n=== Summary ===');
  for (const r of results) {
    console.log(`  ${r.source}: ${r.totalEntries} entries, ${r.totalChapters} chapters${r.errors ? `, ${r.errors} errors` : ''}`);
  }
  // D44 (DEEP_SWEEP): errors were counted, printed, and then thrown away — the run ended
  // "Done." with exit code 0 while chapters were missing. The repo's standard is fail loud, and
  // a script that reports green on an incomplete corpus is the shape a gate exists to prevent.
  // Resume-by-existsSync makes the fix free: re-running fills the gaps.
  const failed = results.reduce((n, r) => n + (r.errors ?? 0), 0);
  if (failed > 0) {
    console.error(`\nFAILED: ${failed} chapter(s) could not be fetched after 3 attempts. Re-run to fill the gaps.`);
    process.exit(1);
  }
  console.log('Done.');
}

