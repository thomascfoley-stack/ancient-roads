#!/usr/bin/env tsx
// CLI: pull Bible translations from the Free Use Bible API (bible.helloao.org)
// → verse JSON for the reader + copies to web/public/bible/ for static serving.
//
// Usage:  pnpm ingest:api BSB eng_kjv
//         tsx src/ingest/ingest-api.ts BSB eng_kjv

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOKS } from '../bible/books';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');
const API_BASE = 'https://bible.helloao.org/api';

// Map our book slugs (3-letter lowercase) to the USFM-style IDs the API uses.
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

// Known translations and their local slug (what we use in file paths / reader URLs).
const TRANSLATION_SLUGS: Record<string, string> = {
  BSB: 'bsb',
  eng_kjv: 'kjv',
  eng_asv: 'asv',
  eng_ylt: 'ylt',
  eng_dby: 'darby',
  eng_bbe: 'bbe',
  eng_lsv: 'lsv',
  ENGWEBP: 'web',
};

interface ApiVerse {
  type: string;
  number: number;
  content: (string | Record<string, unknown>)[];
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
      // Skip noteId, lineBreak, heading markers
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  return res.json();
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ingestTranslation(apiId: string) {
  const slug = TRANSLATION_SLUGS[apiId];
  if (!slug) {
    console.error(`Unknown translation: ${apiId}. Known: ${Object.keys(TRANSLATION_SLUGS).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n=== Ingesting ${apiId} as "${slug}" ===`);

  const dataDir = join(root, 'data', slug);
  const publicDir = join(root, 'web', 'public', 'bible', slug);
  let totalVerses = 0;
  let totalChapters = 0;
  let errors = 0;

  for (const book of BOOKS) {
    const apiBookId = SLUG_TO_API_ID[book.slug];
    if (!apiBookId) {
      console.warn(`  No API ID mapping for ${book.slug}, skipping`);
      continue;
    }

    const bookDataDir = join(dataDir, book.slug);
    const bookPublicDir = join(publicDir, book.slug);
    mkdirSync(bookDataDir, { recursive: true });
    mkdirSync(bookPublicDir, { recursive: true });

    for (let ch = 1; ch <= book.chapterCount; ch++) {
      const dataPath = join(bookDataDir, `${ch}.json`);
      const publicPath = join(bookPublicDir, `${ch}.json`);

      if (existsSync(dataPath)) {
        totalChapters++;
        continue;
      }

      const url = `${API_BASE}/${apiId}/${apiBookId}/${ch}.json`;
      let fetched = false;
      for (let attempt = 0; attempt < 3 && !fetched; attempt++) {
        try {
          if (attempt > 0) await sleep(1000 * attempt);
          const data = await fetchJson(url) as {
            chapter: { number: number; content: ApiVerse[] };
          };

          const verses: { verse: number; text: string }[] = [];
          for (const item of data.chapter.content) {
            if (item.type === 'verse' && typeof item.number === 'number') {
              const text = extractText(item.content);
              if (text) {
                verses.push({ verse: item.number, text });
                totalVerses++;
              }
            }
          }

          const payload = {
            book: book.bookNum,
            chapter: ch,
            translation: slug,
            verses,
          };

          const json = JSON.stringify(payload);
          writeFileSync(dataPath, json);
          writeFileSync(publicPath, json);
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

  console.log(`  ${totalVerses} verses, ${totalChapters} chapters`);
  if (errors > 0) console.warn(`  ${errors} errors`);

  return { slug, totalVerses, totalChapters, errors };
}

// --- Main ---
const translationIds = process.argv.slice(2);
if (translationIds.length === 0) {
  console.log('Usage: tsx src/ingest/ingest-api.ts <translation_id> [...]');
  console.log(`Available: ${Object.keys(TRANSLATION_SLUGS).join(', ')}`);
  process.exit(0);
}

console.log(`Pulling ${translationIds.length} translation(s) from ${API_BASE}`);

const results: { slug: string; totalVerses: number; totalChapters: number; errors: number }[] = [];
for (const id of translationIds) {
  results.push(await ingestTranslation(id));
}

console.log('\n=== Summary ===');
for (const r of results) {
  console.log(`  ${r.slug}: ${r.totalVerses} verses, ${r.totalChapters} chapters${r.errors ? `, ${r.errors} errors` : ''}`);
}
console.log('Done.');
