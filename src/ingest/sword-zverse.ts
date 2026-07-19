// SWORD zVerse (zCom) commentary decoder — the re-stood, COMMITTED version of the
// throwaway scratchpad/sword reader that produced the 2026-07-10 CrossWire NT JSONL
// (WORKLOG: "no libsword available... wrote the zVerse compressed-commentary reader
// directly"). This one is part of the pipeline, not a scratchpad.
//
//   npx tsx src/ingest/sword-zverse.ts --module=data/raw/sword/CalvinCommentaries \
//     --author='John Calvin' --testament=ot --out=data/raw/sword/calvin-ot.jsonl
//
// Format (CompressType=ZIP, ModDrv=zCom): per testament three files —
//   <t>.bzv|czv  verse index, 10 bytes/slot: u32LE block, u32LE start, u16LE size
//   <t>.bzs|czs  block index, 12 bytes/block: u32LE offset, u32LE compSize, u32LE uncompSize
//   <t>.bzz|czz  zlib-compressed blocks  ('b' = BlockType BOOK, 'c' = CHAPTER)
// Slot order (KJV v11n, proven by file-size arithmetic: NT .bzv = 82,460 B = 8,246
// slots = 2 + 27 books + 260 chapters + 7,957 verses; OT = 24,115 = 2+39+929+23,145):
//   [module intro][testament intro] then per book: [book intro], per chapter:
//   [chapter intro], then verse slots. Consecutive verse slots sharing an identical
//   (block,start,size) are LINKED — one comment spanning verses; emitted once,
//   keyed at the first verse with verseEnd = last linked verse of that chapter.
//
// The canon is built from web/public/bible/kjv/*.json, verified an exact KJV v11n
// (66 books, OT 23,145 / NT 7,957 verses) — the same canon the module indexes use.
//
// FAIL CLOSED at the decoder mouth: refuses any module whose .conf lacks
// DistributionLicense in the allowed set (license-manifest.isAllowedLicense).

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { isAllowedLicense } from './license-manifest.js';
import { sanitizeForIngest } from './content-sanity.js';

const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

// ── KJV v11n canon from the repo's own KJV corpus ──
interface CanonBook { book: number; slug: string; verses: number[] } // verses[ch-1] = verse count
export function loadKjvCanon(kjvDir = 'web/public/bible/kjv'): CanonBook[] {
  const books: CanonBook[] = [];
  for (const f of readdirSync(kjvDir)) {
    if (!f.endsWith('.json')) continue;
    const j = JSON.parse(readFileSync(path.join(kjvDir, f), 'utf8')) as
      { book: number; slug: string; chapters: Record<string, unknown[]> };
    const chNums = Object.keys(j.chapters).map(Number).sort((a, b) => a - b);
    books.push({ book: j.book, slug: j.slug, verses: chNums.map((c) => j.chapters[String(c)]!.length) });
  }
  books.sort((a, b) => a.book - b.book);
  const ot = books.filter((b) => b.book <= 39), nt = books.filter((b) => b.book >= 40);
  const count = (bs: CanonBook[]) => bs.reduce((a, b) => a + b.verses.reduce((x, y) => x + y, 0), 0);
  if (books.length !== 66 || count(ot) !== 23145 || count(nt) !== 7957) {
    throw new Error(`canon drift: books=${books.length} ot=${count(ot)} nt=${count(nt)} (expected 66/23145/7957)`);
  }
  return books;
}

// ── zVerse testament reader ──
interface Slot { block: number; start: number; size: number }
export interface DecodedEntry { author: string; verseId: number; verseEnd: number; content: string }

function readSlots(bzv: Buffer): Slot[] {
  const out: Slot[] = [];
  for (let i = 0; i + 10 <= bzv.length; i += 10) {
    out.push({ block: bzv.readUInt32LE(i), start: bzv.readUInt32LE(i + 4), size: bzv.readUInt16LE(i + 8) });
  }
  return out;
}

function stripMarkup(raw: string): string {
  return sanitizeForIngest(
    raw
      .replace(/<(scripRef|reference|title|hi|note|foreign|q|seg|w)\b[^>]*>/gi, ' ')
      .replace(/<\/(scripRef|reference|title|hi|note|foreign|q|seg|w)>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim();
}

export function decodeTestament(
  moduleDir: string,
  testament: 'ot' | 'nt',
  author: string,
  canon: CanonBook[],
): DecodedEntry[] {
  const confPath = readdirSync(path.join(moduleDir, 'mods.d')).find((f) => f.endsWith('.conf'));
  const conf = readFileSync(path.join(moduleDir, 'mods.d', confPath!), 'utf8');
  const get = (k: string) => conf.match(new RegExp(`^${k}=(.*)`, 'mi'))?.[1]?.trim();
  const license = get('DistributionLicense') ?? '';
  if (!isAllowedLicense(license)) {
    throw new Error(`FAIL CLOSED: ${moduleDir} DistributionLicense="${license || '(absent)'}" not in the allowed set — do not decode`);
  }
  if (get('ModDrv')?.toLowerCase() !== 'zcom' || get('CompressType')?.toUpperCase() !== 'ZIP') {
    throw new Error(`unsupported module: ModDrv=${get('ModDrv')} CompressType=${get('CompressType')} (only zCom/ZIP)`);
  }
  const dataPath = get('DataPath')!.replace(/^\.\//, '');
  const dir = path.join(moduleDir, dataPath);
  const blockChar = existsSync(path.join(dir, `${testament}.bzv`)) ? 'b'
    : existsSync(path.join(dir, `${testament}.czv`)) ? 'c' : null;
  if (!blockChar) return []; // testament absent in this module (e.g. Barnes/PNT are NT-only)

  const slots = readSlots(readFileSync(path.join(dir, `${testament}.${blockChar}zv`)));
  const blockIdx = readFileSync(path.join(dir, `${testament}.${blockChar}zs`));
  const blob = readFileSync(path.join(dir, `${testament}.${blockChar}zz`));

  const books = canon.filter((b) => (testament === 'ot' ? b.book <= 39 : b.book >= 40));
  const expected = 2 + books.length + books.reduce((a, b) => a + b.verses.length, 0)
    + books.reduce((a, b) => a + b.verses.reduce((x, y) => x + y, 0), 0);
  if (slots.length !== expected) {
    throw new Error(`slot-count drift: ${testament} has ${slots.length} slots, canon expects ${expected} — WRONG VERSIFICATION, stop`);
  }

  const blockCache = new Map<number, Buffer>();
  const getBlock = (n: number): Buffer => {
    const hit = blockCache.get(n);
    if (hit) return hit;
    const off = blockIdx.readUInt32LE(n * 12);
    const comp = blockIdx.readUInt32LE(n * 12 + 4);
    const buf = inflateSync(blob.subarray(off, off + comp));
    blockCache.set(n, buf);
    return buf;
  };

  const out: DecodedEntry[] = [];
  const seen = new Set<string>(); // global (block:start:size) dedupe — linked entries emit once
  let i = 2; // skip [module intro][testament intro]
  for (const b of books) {
    i++; // book intro
    for (let ch = 1; ch <= b.verses.length; ch++) {
      i++; // chapter intro
      let run: { first: number; last: number; key: string; slot: Slot } | null = null;
      const flush = () => {
        if (!run) return;
        if (!seen.has(run.key)) {
          seen.add(run.key);
          const raw = getBlock(run.slot.block).subarray(run.slot.start, run.slot.start + run.slot.size).toString('utf8');
          const content = stripMarkup(raw);
          if (content.length > 0) {
            out.push({
              author,
              verseId: b.book * 1_000_000 + ch * 1_000 + run.first,
              verseEnd: b.book * 1_000_000 + ch * 1_000 + run.last,
              content,
            });
          }
        }
        run = null;
      };
      for (let v = 1; v <= b.verses[ch - 1]!; v++, i++) {
        const s = slots[i]!;
        if (s.size === 0) { flush(); continue; }
        const key = `${s.block}:${s.start}:${s.size}`;
        if (run && run.key === key) { run.last = v; continue; }
        flush();
        run = { first: v, last: v, key, slot: s };
      }
      flush();
    }
  }
  return out;
}

// ── alignment self-check: modules whose text embeds "Verse N." labels (Barnes) ──
export function verseLabelCheck(entries: DecodedEntry[]): { labeled: number; agree: number } {
  let labeled = 0, agree = 0;
  for (const e of entries) {
    const m = e.content.match(/^Verse (\d+)/);
    if (!m) continue;
    labeled++;
    if (Number(m[1]) === e.verseId % 1000) agree++;
  }
  return { labeled, agree };
}

async function main() {
  const moduleDir = arg('--module');
  const author = arg('--author');
  const outPath = arg('--out');
  const testament = (arg('--testament') ?? 'all') as 'ot' | 'nt' | 'all';
  if (!moduleDir || !author || !outPath) {
    throw new Error("usage: sword-zverse.ts --module=<dir> --author='Name' --testament=ot|nt|all --out=<f.jsonl>");
  }
  const canon = loadKjvCanon();
  const entries: DecodedEntry[] = [];
  for (const t of testament === 'all' ? (['ot', 'nt'] as const) : [testament]) {
    entries.push(...decodeTestament(moduleDir, t, author, canon));
  }
  const books = new Set(entries.map((e) => Math.floor(e.verseId / 1e6)));
  const { labeled, agree } = verseLabelCheck(entries);
  writeFileSync(outPath, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
  console.log(`${path.basename(moduleDir)} [${testament}] → ${entries.length} entries, ${books.size} books → ${outPath}`);
  if (labeled > 0) {
    const pct = ((100 * agree) / labeled).toFixed(2);
    console.log(`  verse-label alignment check: ${agree}/${labeled} agree (${pct}%)${agree === labeled ? ' — bulletproof' : ' ⚠ INVESTIGATE'}`);
  }
  // spot samples for eyeball verification
  for (const e of [entries[0], entries[Math.floor(entries.length / 2)], entries[entries.length - 1]]) {
    if (!e) continue;
    const b = Math.floor(e.verseId / 1e6), c = Math.floor((e.verseId % 1e6) / 1000), v = e.verseId % 1000;
    console.log(`  sample b${b} ${c}:${v}${e.verseEnd !== e.verseId ? `-${e.verseEnd % 1000}` : ''}  ${e.content.slice(0, 110)}`);
  }
}

if (process.argv[1] && /sword-zverse/.test(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
