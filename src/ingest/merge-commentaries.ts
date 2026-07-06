#!/usr/bin/env tsx
// Merge all commentary sources (patristic DB + API sources) into
// web/public/commentaries/{bookSlug}/{chapter}.json for static serving.
//
// Usage: pnpm ingest:merge-commentaries

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOKS } from '../bible/books';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

const patristicDir = join(root, 'data', 'commentaries');
const apiBaseDir = join(root, 'data', 'commentaries-api');
const outDir = join(root, 'web', 'public', 'commentaries');

interface Entry {
  verseStart: number;
  verseEnd: number;
  author: string;
  year: number | null;
  tradition?: string;
  sourceTitle: string;
  sourceUrl: string;
  text: string;
}

interface ChapterFile {
  book: number;
  chapter: number;
  entries: Entry[];
}

function readChapterFile(path: string): Entry[] {
  try {
    const data: ChapterFile = JSON.parse(readFileSync(path, 'utf-8'));
    return data.entries ?? [];
  } catch {
    return [];
  }
}

let totalFiles = 0;
let totalEntries = 0;

// Discover API source directories
const apiSources: string[] = [];
if (existsSync(apiBaseDir)) {
  for (const name of readdirSync(apiBaseDir)) {
    const stat = existsSync(join(apiBaseDir, name));
    if (stat) apiSources.push(name);
  }
}

console.log(`Sources: patristic DB${apiSources.length ? ' + ' + apiSources.join(', ') : ''}`);

for (const book of BOOKS) {
  for (let ch = 1; ch <= book.chapterCount; ch++) {
    const entries: Entry[] = [];

    // Patristic entries
    const patristicPath = join(patristicDir, book.slug, `${ch}.json`);
    if (existsSync(patristicPath)) {
      for (const e of readChapterFile(patristicPath)) {
        entries.push({ ...e, tradition: e.tradition ?? 'Patristic' });
      }
    }

    // API source entries
    for (const source of apiSources) {
      const apiPath = join(apiBaseDir, source, book.slug, `${ch}.json`);
      if (existsSync(apiPath)) {
        entries.push(...readChapterFile(apiPath));
      }
    }

    if (entries.length === 0) continue;

    // Truncate long entries to keep static file sizes manageable
    for (const e of entries) {
      if (e.text.length > 1200) {
        e.text = e.text.slice(0, 1200).replace(/\s+\S*$/, '') + '…';
      }
    }

    entries.sort((a, b) => {
      if (a.verseStart !== b.verseStart) return a.verseStart - b.verseStart;
      return (a.year ?? 9999) - (b.year ?? 9999);
    });

    const dir = join(outDir, book.slug);
    mkdirSync(dir, { recursive: true });

    const payload: ChapterFile = {
      book: book.bookNum,
      chapter: ch,
      entries,
    };

    writeFileSync(join(dir, `${ch}.json`), JSON.stringify(payload));
    totalFiles++;
    totalEntries += entries.length;
  }
}

console.log(`Wrote ${totalFiles} chapter files (${totalEntries} entries) to ${outDir}`);
console.log('Done.');
