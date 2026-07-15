/**
 * SLICE 0 — anchor recall on Spurgeon (docs/SERMON_SEARCH_DESIGN.md §13). A MEASUREMENT, not
 * the feature. PD text (Metropolitan Tabernacle Pulpit, archive.org). Answers the one question
 * the whole sermon-search ambition rests on: can the system find the passage a document is about?
 *
 * Ground truth = each sermon's STATED TEXT (the header line: "...quote..." — John x. 10).
 * Channels measured over the sermon BODY (header/stated-text line stripped):
 *   - explicit  : scanReferences (arabic + roman-normalised)
 *   - uncited★  : shingle the body's prose against the WEB Bible — recover the passage the
 *                 sermon expounds even when it never cites it. The high-value lever.
 * Recall = did the produced anchors include the sermon's stated text (chapter-level + exact-verse).
 * Precision proxy (uncited) = matched verses per sermon (a wall of matches = low precision).
 *
 * Run: npx tsx scripts/slice0-anchor-recall.mts <volume.txt>
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { scanReferences } from '../src/bible/ref-parse.ts';
import { shingleHashSetOcr, tokenListOcr } from '../src/ingest/resource-textmatch.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The translation to shingle against — MUST match what the source quotes. 19th-c. sermons quote
// the KJV, so BIBLE_TR=kjv removes the cross-translation confound (WEB rephrases → verbatim
// runs miss). Real user docs would index all translations / the user's own.
const WEB_DIR = path.join(REPO, 'web/public/bible', process.env.BIBLE_TR ?? 'web');

// ---- WEB Bible → verses + shingle inverted index -------------------------------------------
interface Verse { verseId: number; text: string; shCount: number }
const verses: Verse[] = [];
const shingleIndex = new Map<number, number[]>(); // shingleHash -> verseIds
const NGRAM = 6; // 6-WORD shingles — a 6-word verbatim run is a distinctive quote (3-word is not)
for (const f of readdirSync(WEB_DIR).filter((n) => n.endsWith('.json'))) {
  const j = JSON.parse(readFileSync(path.join(WEB_DIR, f), 'utf8')) as { book: number; chapters: Record<string, { verse: number; text: string }[]> };
  for (const [chap, vs] of Object.entries(j.chapters)) {
    for (const v of vs) {
      const verseId = j.book * 1_000_000 + Number(chap) * 1000 + v.verse;
      const sh = shingleHashSetOcr(v.text, NGRAM);
      verses.push({ verseId, text: v.text, shCount: sh.size });
      for (const h of sh) (shingleIndex.get(h) ?? shingleIndex.set(h, []).get(h)!).push(verseId);
    }
  }
}
const shCountById = new Map(verses.map((v) => [v.verseId, v.shCount]));
console.error(`indexed ${verses.length} WEB verses, ${shingleIndex.size} distinct ${NGRAM}-shingles`);

// A verse is "quoted" if it has >= MIN_VERSE_SHINGLES 6-shingles (>= ~11 words, distinctive) AND
// >= MIN_HITS of them appear in the body. One 6-word verbatim run is a strong quote signal.
const MIN_VERSE_SHINGLES = 3;
const MIN_HITS = 1;

function uncitedMatches(body: string): Set<number> {
  const hits = new Map<number, number>();
  for (const h of shingleHashSetOcr(body, NGRAM)) {
    const ids = shingleIndex.get(h);
    if (!ids) continue;
    for (const id of ids) hits.set(id, (hits.get(id) ?? 0) + 1);
  }
  const out = new Set<number>();
  for (const [id, n] of hits) {
    if ((shCountById.get(id) ?? 0) >= MIN_VERSE_SHINGLES && n >= MIN_HITS) out.add(id);
  }
  return out;
}

// ---- roman numerals (Spurgeon states chapters in roman: "John x. 10") ----------------------
const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
function romanToInt(s: string): number | null {
  s = s.toLowerCase(); let n = 0;
  for (let i = 0; i < s.length; i++) { const c = ROMAN[s[i]!]; if (!c) return null; const nx = ROMAN[s[i + 1]!] ?? 0; n += c < nx ? -c : c; }
  return n || null;
}
// Convert "Book xiv. 12" → "Book 14:12" so scanReferences can parse it.
function romaniseRefs(text: string): string {
  return text.replace(/\b([1-3]?\s?[A-Za-z]{3,})\s+([ivxlc]{1,6})\.\s*(\d{1,3})/g, (m, book, rom, verse) => {
    const c = romanToInt(rom); return c ? `${book} ${c}:${verse}` : m;
  });
}

// ---- split the volume into sermons on the stated-text line ---------------------------------
// A stated-text line ends a quote and cites the ref: ..." — John x. 10.   (OCR-noisy)
const RAW = readFileSync(process.argv[2]!, 'utf8');
const lines = RAW.split('\n');
// CLEAN Gutenberg stated-text line:  ..."--PROVERBS 24:30-32.   (arabic, uppercase book)
const cleanRe = /["'”’][.,*]{0,3}\s*[—-]{1,3}\s*([1-3]?\s?[A-Z][A-Za-z]{2,})\.?\s+(\d{1,3}):(\d{1,3})/;
// OCR MTP stated-text line:  ..." — John x. 10.   (roman chapter)
const romanRe = /["'”’][.,*]{0,3}\s*[—-]{1,2}\s*([1-3]?\s?[A-Z][a-z]{2,})\s+([ivxlcIVXLC]{1,6})\.\s*(\d{1,3})/;
const titleCase = (b: string) => b.replace(/\s+/g, ' ').trim().replace(/\S+/g, (w) => w[0]! + w.slice(1).toLowerCase());

interface Sermon { gtVerseId: number; gtBook: number; gtChap: number; body: string }
const sermons: Sermon[] = [];
let markers: { line: number; verseId: number; book: number; chap: number }[] = [];
for (let i = 0; i < lines.length; i++) {
  let book: string | null = null, chap: number | null = null, verse = 0;
  const c = lines[i]!.match(cleanRe);
  if (c) { book = titleCase(c[1]!); chap = Number(c[2]); verse = Number(c[3]); }
  else { const r = lines[i]!.match(romanRe); if (r) { book = titleCase(r[1]!); chap = romanToInt(r[2]!); verse = Number(r[3]); } }
  if (!book || !chap) continue;
  const refs = scanReferences(`${book} ${chap}:${verse}`);
  if (refs.length === 0 || !refs[0]!.ranges[0]) continue;
  const gt = refs[0]!.ranges[0]!.start;
  markers.push({ line: i, verseId: gt, book: Math.floor(gt / 1_000_000), chap });
}
// body = text after this marker, bounded to ~one sermon (avoid merging when a marker is missed)
const SERMON_LINES = 700;
for (let k = 0; k < markers.length; k++) {
  const start = markers[k]!.line + 1;
  const next = k + 1 < markers.length ? markers[k + 1]!.line : lines.length;
  const end = Math.min(next, start + SERMON_LINES, lines.length);
  const body = lines.slice(start, end).join('\n');
  if (tokenListOcr(body).length < 300) continue; // too short → likely a mis-split
  sermons.push({ gtVerseId: markers[k]!.verseId, gtBook: markers[k]!.book, gtChap: markers[k]!.chap, body });
}
console.error(`parsed ${markers.length} stated-text markers → ${sermons.length} usable sermons`);

// ---- measure --------------------------------------------------------------------------------
const N = Math.min(sermons.length, 30);
const set = sermons.slice(0, N);
let explicitHit = 0, uncitedHit = 0, unionHit = 0, uncitedExactHit = 0;
let uncitedMatchTotal = 0;
const misses: string[] = [];
const chapOf = (id: number) => Math.floor(id / 1000);

for (const s of set) {
  const explicit = new Set<number>(scanReferences(romaniseRefs(s.body)).flatMap((r) => r.ranges.map((rr) => rr.start)));
  const uncited = uncitedMatches(s.body);
  uncitedMatchTotal += uncited.size;
  const gtChapKey = chapOf(s.gtVerseId);
  const eHit = [...explicit].some((id) => chapOf(id) === gtChapKey);
  const uHit = [...uncited].some((id) => chapOf(id) === gtChapKey);
  const uExact = uncited.has(s.gtVerseId);
  if (eHit) explicitHit++;
  if (uHit) uncitedHit++;
  if (uExact) uncitedExactHit++;
  if (eHit || uHit) unionHit++;
  else misses.push(`${s.gtBook}:${s.gtChap} (uncited matched ${uncited.size} verses; body ${tokenListOcr(s.body).length} tok)`);
}

const pct = (n: number) => `${((100 * n) / N).toFixed(0)}%`;
console.log(`\n=== SLICE 0 — anchor recall on Spurgeon (n=${N}, WEB shingle n=3, MIN_HITS=${MIN_HITS}/MIN_VERSE_SH=${MIN_VERSE_SHINGLES}) ===`);
console.log(`stated-text recall — explicit channel (body citations)   : ${pct(explicitHit)}  (${explicitHit}/${N})  [0% is real: the text is cited only in the header, not re-cited in the body]`);
console.log(`stated-text recall — ★ uncited-quote channel (chapter)   : ${pct(uncitedHit)}  (${uncitedHit}/${N})  ← the make-or-break lever`);
console.log(`stated-text recall — uncited-quote channel (EXACT verse) : ${pct(uncitedExactHit)}  (${uncitedExactHit}/${N})`);
console.log(`stated-text recall — UNION (any channel)                 : ${pct(unionHit)}  (${unionHit}/${N})`);
console.log(`uncited-channel precision proxy — avg verses matched/sermon: ${(uncitedMatchTotal / N).toFixed(1)}`);
if (misses.length) { console.log(`\nMISSES (${misses.length}):`); for (const m of misses.slice(0, 12)) console.log('  - ' + m); }
