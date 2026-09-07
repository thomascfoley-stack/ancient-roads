// Fetch Tacitus, Annals (Church & Brodribb 1876 translation) from Wikisource
// into historian-contract JSONL ({path, content}) for ingest-historian.ts.
//
//   npx tsx src/ingest/wikisource-annals.ts --out=data/raw/wikisource/tacitus-annals.jsonl
//
// Edition verified by READING the work's header before any fetch
// (2026-09-07): en.wikisource.org/wiki/The_Annals_(Tacitus) declares
// "Translation based on Alfred John Church and William Jackson Brodribb
// (1876)" with {{translation license|original=PD-old|translation=PD-old}},
// and Book 15 carries the XV.44 Christus passage in Church & Brodribb's
// exact wording. Wikisource is an explicitly permitted PD source
// (ADR-008 remediation list). Books 7-10 are lost in the manuscript
// tradition — the work is Books 1-6 and 11-16, 12 books total.
//
// Structure (surveyed on the live pages): each Book page holds its chapters
// as level-3 sections numbered 1..N (Book 15: 74 sections = 74 chapters).
// Chapters are split at <h3> boundaries; markup is stripped to plain text.
// FAIL CLOSED: a book whose chapter count is implausible (<10) or a chapter
// that strips to <100 chars throws — better no data than partial data.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

const BOOKS = [1, 2, 3, 4, 5, 6, 11, 12, 13, 14, 15, 16];
const API = 'https://en.wikisource.org/w/api.php';
const UA = 'ap-ingest/1.0 (Tacitus Annals fetch; research)';

interface HistNode { path: string[]; content: string }

function htmlToText(html: string): string {
  return html
    .replace(/<span class="mw-editsection"[\s\S]*?<\/span>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();
}

export function splitChapters(bookHtml: string, book: number): Array<{ chapter: number; text: string }> {
  // Chapter heads are <div class="mw-heading mw-heading3"><h3 id="N">N</h3>…</div>
  const chunks = bookHtml.split(/<div class="mw-heading mw-heading3">/i).slice(1);
  const chapters: Array<{ chapter: number; text: string }> = [];
  for (const c of chunks) {
    const head = c.match(/^<h3 id="(\d+)">/i);
    if (!head) continue;
    const chapter = parseInt(head[1]!, 10);
    const bodyEnd = c.indexOf('</div>');
    const body = htmlToText(c.slice(bodyEnd + 6));
    if (body.length < 100) {
      throw new Error(`FAIL CLOSED: Book ${book} ch.${chapter} stripped to ${body.length} chars`);
    }
    chapters.push({ chapter, text: body });
  }
  if (chapters.length < 10) {
    throw new Error(`FAIL CLOSED: Book ${book} yielded only ${chapters.length} chapters — page structure changed?`);
  }
  return chapters;
}

async function fetchBook(book: number): Promise<string> {
  const url = `${API}?action=parse&page=${encodeURIComponent(`The Annals (Tacitus)/Book ${book}`)}&prop=text&format=json&formatversion=2`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`FAIL CLOSED: Book ${book} fetch HTTP ${res.status}`);
    const j = (await res.json()) as { parse?: { text?: string } };
    const text = j.parse?.text;
    if (!text) throw new Error(`FAIL CLOSED: Book ${book} returned no parsed text`);
    return text;
  }
  throw new Error(`FAIL CLOSED: Book ${book} still 429 after 5 attempts`);
}

async function main() {
  const outPath = arg('--out') ?? 'data/raw/wikisource/tacitus-annals.jsonl';
  const nodes: HistNode[] = [];
  for (const book of BOOKS) {
    const html = await fetchBook(book);
    for (const { chapter, text } of splitChapters(html, book)) {
      nodes.push({ path: ['The Annals', `Book ${book}`, `Chapter ${chapter}`], content: text });
    }
    console.log(`Book ${book}: ${nodes.length} chapters so far`);
    await new Promise((r) => setTimeout(r, 2000)); // polite: 12 requests total
  }
  if (nodes.length < 500) {
    throw new Error(`FAIL CLOSED: only ${nodes.length} chapters across 12 books (expected ~700) — incomplete fetch`);
  }
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, nodes.map((n) => JSON.stringify(n)).join('\n') + '\n');
  console.log(`tacitus-annals → ${nodes.length} chapters → ${outPath}`);
}

if (process.argv[1] && /wikisource-annals/.test(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
