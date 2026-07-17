// helloao adapter (INGESTION_ADAPTERS.md §1) — K&D complete OT into the SERVED
// register store via register-writer (work slug + whole-chunk vectors + static
// reader entries), replacing the old static-only path that head-truncated at
// 3000 chars. Verse-keyed JSON, PD Mark 1.0 — the cleanest adapter: every
// section is a verse-comment with a source-provided anchor.
//
//   DATABASE_URL=<dev owner> NEON_BRANCH=dev DEEPINFRA_API_KEY=<key> \
//     npx tsx src/ingest/adapter-helloao.ts --slug=keil-delitzsch
//
// Polite + resumable: chapter JSON cached to data/raw/helloao/{id}/, 50ms
// between uncached fetches. Fail closed on missing manifest/license.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { HELLOAO_BOOK_MAP } from './helloao-source.js';
import { BOOKS } from '../bible/books.js';
import { writeRegisterWork, type RegisterSection, type RegisterWork } from './register-writer.js';

const CACHE = 'data/raw/helloao';
const arg = (f: string) => process.argv.find((a) => a.startsWith(`${f}=`))?.slice(f.length + 1);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SLUG_TO_BOOK_NUM: Record<string, number> = {};
for (const [i, b] of BOOKS.entries()) SLUG_TO_BOOK_NUM[b.slug] = i + 1;

interface ChapterJson { chapter?: { content?: Array<{ type?: string; number?: number; content?: unknown[] }> } }

async function fetchChapter(api: string, id: string, helloaoBook: string, ch: number): Promise<ChapterJson | null> {
  mkdirSync(`${CACHE}/${id}`, { recursive: true });
  const cached = `${CACHE}/${id}/${helloaoBook}-${ch}.json`;
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8')) as ChapterJson;
  await sleep(50);
  try {
    const res = await fetch(`${api}/c/${id}/${helloaoBook}/${ch}.json`, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.startsWith('<')) return null;
    writeFileSync(cached, text);
    return JSON.parse(text) as ChapterJson;
  } catch { return null; }
}

function verseEntries(content: Array<{ type?: string; number?: number; content?: unknown[] }>): Array<{ verse: number; text: string }> {
  const out: Array<{ verse: number; text: string }> = [];
  for (const item of content) {
    if (item.type === 'verse' && item.number && Array.isArray(item.content)) {
      const parts: string[] = [];
      for (const c of item.content) {
        if (typeof c === 'string') parts.push(c);
        else if (c && typeof c === 'object' && 'text' in c && typeof (c as { text: unknown }).text === 'string') parts.push((c as { text: string }).text);
      }
      const text = parts.join(' ').trim();
      if (text.length > 10) out.push({ verse: item.number, text }); // WHOLE text — no 3000-char slice
    }
  }
  return out;
}

async function main() {
  const slug = arg('--slug') ?? 'keil-delitzsch';
  const manifest = JSON.parse(readFileSync('ingest/sources.config.json', 'utf8')) as Array<Record<string, unknown>>;
  const entry = manifest.find((e) => e.slug === slug);
  if (!entry) throw new Error(`no manifest entry ${slug}`);
  const prov = entry.provenance as Record<string, unknown>;
  const acq = prov.acquire as { adapter: string; commentary_id: string; api: string };
  if (acq.adapter !== 'helloao') throw new Error(`${slug} is not a helloao work`);

  const booksRes = await fetch(`${acq.api}/c/${acq.commentary_id}/books.json`, { signal: AbortSignal.timeout(60_000) });
  if (!booksRes.ok) throw new Error(`books.json ${booksRes.status}`);
  const books = ((await booksRes.json()) as { books: Array<{ id: string; numberOfChapters: number; firstChapterNumber: number }> }).books;

  const sections: RegisterSection[] = [];
  for (const book of books) {
    const bslug = HELLOAO_BOOK_MAP[book.id];
    const bookNum = bslug ? SLUG_TO_BOOK_NUM[bslug] : undefined;
    if (!bookNum) { console.log(`  skip unknown book id ${book.id}`); continue; }
    const bookName = BOOKS[bookNum - 1]!.name;
    for (let ch = book.firstChapterNumber; ch <= book.numberOfChapters; ch++) {
      const data = await fetchChapter(acq.api, acq.commentary_id, book.id, ch);
      const content = data?.chapter?.content;
      if (!content) continue;
      for (const v of verseEntries(content)) {
        const verseId = bookNum * 1_000_000 + ch * 1000 + v.verse;
        sections.push({
          heading: `${bookName} ${ch}:${v.verse}`,
          body: v.text,
          anchors: [{ verseIdStart: verseId, verseIdEnd: verseId }],
        });
      }
    }
    console.log(`  ${bookName}: cumulative ${sections.length} verse entries`);
  }
  if (sections.length < 100) throw new Error(`FAIL CLOSED: only ${sections.length} entries — fetch incomplete`);

  const work: RegisterWork = {
    slug, title: entry.title as string, author: entry.author as string,
    authorDied: entry.author_died as number | undefined, year: entry.year_written as number,
    sourceType: 'commentary', register: 'prose', tradition: entry.tradition as string, era: entry.era as string,
    license: entry.license as string, url: prov.url as string, edition: (prov.edition as string) ?? '',
    publish: true, sections,
  };
  const r = await writeRegisterWork(work);
  console.log(`${slug}: ${sections.length} verse entries → ${r.embedded} embedded, ${r.staticEntries} static reader entries`);
}

main().catch((e) => { console.error(e); process.exit(1); });
