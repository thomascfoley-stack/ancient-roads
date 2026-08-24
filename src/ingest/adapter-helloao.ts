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
import { assertNotQuarantined } from './license-manifest.js';

const CACHE = 'data/raw/helloao';
const arg = (f: string) => process.argv.find((a) => a.startsWith(`${f}=`))?.slice(f.length + 1);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SLUG_TO_BOOK_NUM: Record<string, number> = {};
for (const [i, b] of BOOKS.entries()) SLUG_TO_BOOK_NUM[b.slug] = i + 1;

interface ChapterJson { chapter?: { content?: Array<{ type?: string; number?: number; content?: unknown[] }> } }

// Discriminated result so the loop can iterate the full first..last chapter span
// (commentaries skip chapters, so numberOfChapters < lastChapterNumber) and tell
// a legitimately-absent chapter (404, skip silently) from a real fetch error
// (network/timeout/HTML — fail closed). A6 line-by-line 2026-07-17.
type ChapterResult = { status: 'ok'; data: ChapterJson } | { status: 'absent' } | { status: 'error' };
async function fetchChapter(api: string, id: string, helloaoBook: string, ch: number): Promise<ChapterResult> {
  mkdirSync(`${CACHE}/${id}`, { recursive: true });
  const cached = `${CACHE}/${id}/${helloaoBook}-${ch}.json`;
  if (existsSync(cached)) return { status: 'ok', data: JSON.parse(readFileSync(cached, 'utf8')) as ChapterJson };
  await sleep(50);
  try {
    const res = await fetch(`${api}/c/${id}/${helloaoBook}/${ch}.json`, { signal: AbortSignal.timeout(60_000) });
    if (res.status === 404) return { status: 'absent' }; // this commentary simply doesn't cover this chapter
    if (!res.ok) return { status: 'error' };
    const text = await res.text();
    if (text.startsWith('<')) return { status: 'error' }; // an HTML error page, not JSON — do NOT cache
    JSON.parse(text); // validate BEFORE caching so a bad body never poisons the cache
    writeFileSync(cached, text);
    return { status: 'ok', data: JSON.parse(text) as ChapterJson };
  } catch { return { status: 'error' }; }
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
  // D25 (DEEP_SWEEP): this path had NO quarantine check at all — the D2 fix wired
  // assertNotQuarantined into acquireCcel and acquireGutenberg and missed this adapter, and D2's
  // guard tested the HELPER rather than each mouth, so the gap stayed green. The loop's queue
  // filter is no cover either: adapter-loop.ts escalates helloao as "not run by this loop", so
  // the CLI is the only path and it was ungated.
  assertNotQuarantined(entry);

  const booksRes = await fetch(`${acq.api}/c/${acq.commentary_id}/books.json`, { signal: AbortSignal.timeout(60_000) });
  if (!booksRes.ok) throw new Error(`books.json ${booksRes.status}`);
  const books = ((await booksRes.json()) as { books: Array<{ id: string; numberOfChapters: number; firstChapterNumber: number; lastChapterNumber?: number }> }).books;

  const sections: RegisterSection[] = [];
  let chaptersTried = 0, chaptersFailed = 0, booksUnmapped = 0;
  for (const book of books) {
    if ((book.numberOfChapters ?? 0) === 0) continue; // commentary doesn't cover this book (e.g. K&D has no Song of Songs)
    const bslug = HELLOAO_BOOK_MAP[book.id];
    const bookNum = bslug ? SLUG_TO_BOOK_NUM[bslug] : undefined;
    // An unknown book id is NOT a silent skip — it drops a whole book of
    // commentary. Count it so the fail-closed gate below can catch a bad map.
    if (!bookNum) { console.log(`  ⚠ unknown book id ${book.id} (${book.numberOfChapters} chapters dropped)`); booksUnmapped++; continue; }
    const bookName = BOOKS[bookNum - 1]!.name;
    // Iterate the full first..LAST chapter span — numberOfChapters is a COUNT, and
    // commentaries skip chapters, so it is < lastChapterNumber (K&D: Ps 147-150,
    // Ezk 46-48, Exo 39-40 were dropped when the bound was the count). A6 2026-07-17.
    const lastCh = book.lastChapterNumber ?? (book.firstChapterNumber + book.numberOfChapters - 1);
    for (let ch = book.firstChapterNumber; ch <= lastCh; ch++) {
      const r = await fetchChapter(acq.api, acq.commentary_id, book.id, ch);
      if (r.status === 'absent') continue; // commentary skips this chapter — legitimate, not a failure
      chaptersTried++;
      const content = r.status === 'ok' ? r.data?.chapter?.content : undefined;
      if (!content) { chaptersFailed++; continue; }
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
  // fail CLOSED on fetch errors, not just low totals: a timeout/404/HTML page
  // must never silently thin the corpus (the K&D 3-row shell, A6 audit)
  if (chaptersFailed > Math.max(5, chaptersTried * 0.02)) {
    throw new Error(`FAIL CLOSED: ${chaptersFailed}/${chaptersTried} chapter fetches failed — retry when the source is healthy`);
  }
  if (booksUnmapped > 0) throw new Error(`FAIL CLOSED: ${booksUnmapped} book id(s) not in HELLOAO_BOOK_MAP — whole books would be dropped; fix the map`);

  const work: RegisterWork = {
    slug, title: entry.title as string, author: entry.author as string,
    authorDied: entry.author_died as number | undefined, year: entry.year_written as number,
    sourceType: 'commentary', register: 'prose', tradition: entry.tradition as string, era: entry.era as string,
    license: entry.license as string, url: prov.url as string, edition: (prov.edition as string) ?? '',
    // D25: this was hardcoded to the literal boolean — the ONLY writeRegisterWork caller in the repo
    // that hardcoded it; every other caller either consults the manifest or hardcodes false. It
    // took the serve flag, and with it the owner's gate, out of the decision entirely. helloao is
    // a top-level main() with no exports, so there is no `opts` to fall back through; the
    // precedent for a no-opts caller is sword-register-bridge.ts:42.
    publish: entry.serve !== false, sections,
  };
  const r = await writeRegisterWork(work);
  console.log(`${slug}: ${sections.length} verse entries → ${r.embedded} embedded, ${r.staticEntries} static reader entries`);
}

main().catch((e) => { console.error(e); process.exit(1); });
