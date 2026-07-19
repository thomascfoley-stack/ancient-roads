// SWORD lexicon/dictionary decoder (zLD + RawLD) — sibling of sword-zverse.ts,
// same conventions. Decodes a module dir to JSONL lines {key, text}:
//
//   npx tsx src/ingest/sword-ld.ts --module=data/raw/sword/ISBE --out=data/raw/sword/isbe.jsonl
//
// Formats, PROVEN against the actual bytes of ISBE/Easton/Nave/Smith (xxd first,
// spec second — the on-disk key record is NOT the ASCII "block\tentry" some docs
// describe):
//   zLD  (ModDrv=zLD, CompressType=ZIP), files <base>.idx/.dat/.zdx/.zdt —
//     .idx  8 B/entry: u32LE offset, u32LE size → a record in .dat
//     .dat  record = "KEY\r\n" + BINARY u32LE blockNum + u32LE entryNum
//           (records separated by an uncounted \r\n; links are ASCII "@LINK key")
//     .zdx  8 B/block: u32LE offset, u32LE compSize → zlib block in .zdt
//     .zdt  zlib blocks; uncompressed block = u32LE count, then count ×
//           (u32LE offset-within-block, u32LE size), then NUL-terminated entries
//   RawLD (ModDrv=RawLD), files <base>.idx/.dat —
//     .idx  6 B/entry: u32LE offset, u16LE size (Smith.idx = 27,834 B: %6=0, %8≠0)
//     .dat  record = "KEY\r\n" + entry markup
//
// Entry markup is TEI (ISBE/Easton/Nave) or ThML (Smith). Stripped to plain text
// with paragraph breaks preserved as \n\n. <ref>/<scripRef> INNER TEXT IS KEPT —
// in a dictionary the verse references are the content (Nave is nothing else),
// unlike adapter-ccel where they are marginal annotations. Whitespace cleanup
// touches ONLY spaces/tabs per line — never \s in a multiline anchor, which eats
// newlines and fuses words (the corpus scar; see thmlText in adapter-ccel.ts).
//
// FAIL CLOSED at the decoder mouth: license gate (as sword-zverse), and any
// unrecognized layout — bad index arithmetic, malformed key record, entry out of
// block bounds, unresolvable @LINK — throws rather than guessing.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { isAllowedLicense } from './license-manifest.js';
import { sanitizeForIngest } from './content-sanity.js';

const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

const MIN_TEXT_CHARS = 20;

export interface LdEntry { key: string; text: string }

// SWORD's default module encoding is Latin-1/cp1252, NOT UTF-8 — Smith declares
// no Encoding and its .dat really does hold 0x92 (cp1252 ’) and 0xA0 (nbsp);
// decoding it as UTF-8 yields U+FFFD ("1�Chronicles"). Decode latin1, then map
// the cp1252 punctuation block (0x80–0x9F, where cp1252 differs from latin1).
const CP1252: Record<number, string> = {
  0x82: '‚', 0x84: '„', 0x85: '…', 0x8b: '‹', 0x91: '‘', 0x92: '’',
  0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x9b: '›',
};
type ModEncoding = 'utf8' | 'cp1252';
function decodeBytes(buf: Buffer, encoding: ModEncoding): string {
  if (encoding === 'utf8') return buf.toString('utf8');
  return buf.toString('latin1').replace(/[\u0080-\u009f]/g, (c) => CP1252[c.charCodeAt(0)] ?? c);
}

interface ModConf { modDrv: 'zLD' | 'RawLD'; base: string; encoding: ModEncoding }

function readConf(moduleDir: string): ModConf {
  const confName = readdirSync(path.join(moduleDir, 'mods.d')).find((f) => f.endsWith('.conf'));
  if (!confName) throw new Error(`${moduleDir}: no mods.d/*.conf`);
  const conf = readFileSync(path.join(moduleDir, 'mods.d', confName), 'utf8');
  const get = (k: string) => conf.match(new RegExp(`^${k}=(.*)`, 'mi'))?.[1]?.trim();
  const license = get('DistributionLicense') ?? '';
  if (!isAllowedLicense(license)) {
    throw new Error(`FAIL CLOSED: ${moduleDir} DistributionLicense="${license || '(absent)'}" not in the allowed set — do not decode`);
  }
  const modDrv = get('ModDrv');
  if (modDrv !== 'zLD' && modDrv !== 'RawLD') {
    throw new Error(`unsupported module: ModDrv=${modDrv} (only zLD / RawLD)`);
  }
  if (modDrv === 'zLD' && get('CompressType')?.toUpperCase() !== 'ZIP') {
    throw new Error(`unsupported zLD compression: CompressType=${get('CompressType')} (only ZIP)`);
  }
  const dataPath = get('DataPath');
  if (!dataPath) throw new Error(`${moduleDir}: conf has no DataPath`);
  // Absent/other Encoding means SWORD's Latin-1 default (Smith), not UTF-8.
  const encoding: ModEncoding = get('Encoding')?.toUpperCase() === 'UTF-8' ? 'utf8' : 'cp1252';
  // DataPath=./modules/lexdict/zld/isbe/isbe → dir + file-basename prefix
  return { modDrv, base: path.join(moduleDir, dataPath.replace(/^\.\//, '')), encoding };
}

// ── markup → plain text (TEI entryFree / ThML), paragraph breaks preserved ──
function markupToText(raw: string): string {
  const text = sanitizeForIngest(
    raw
      .replace(/\r\n/g, '\n')
      // block-level closers → paragraph/line breaks BEFORE tags are stripped
      .replace(/<\/(p|title|div\d?)>/gi, '\n\n')
      .replace(/<\/(item|li|l|def|list|ol|ul)>/gi, '\n')
      .replace(/<(lb|br)\s*\/?>/gi, '\n')
      // inline emphasis: remove tag only, no space (keeps "(<i>a teacher</i>)" tight)
      .replace(/<\/?(i|b|hi|term|foreign|em|sup|sub)\b[^>]*>/gi, '')
      // everything else (entryFree, p, ref, scripRef, def, list, item, …):
      // tag → space, inner text KEPT — refs are content in a dictionary
      .replace(/<[^>]+>/g, ' '),
  );
  return text
    .replace(/\u00a0/g, ' ') // nbsp (cp1252 modules) → plain space
    // spaces/tabs ONLY — never \s here (multiline \s eats \n\n and fuses words)
    .replace(/[ \t]+/g, ' ')
    // tag-stripping debris: "ALEPH ; ALPHABET ." → "ALEPH; ALPHABET."
    .replace(/ ([,;:.!?)])/g, '$1')
    .replace(/\( /g, '(')
    .replace(/^[ \t]+|[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Easton opens every entry with <title> repeating the headword — drop that line
// when (and only when) it is exactly the key, so text doesn't start "Aaron\n\nThe…".
function dropEchoedHeadword(key: string, text: string): string {
  const nl = text.indexOf('\n');
  const first = (nl === -1 ? text : text.slice(0, nl)).trim();
  if (first.toLowerCase() !== key.trim().toLowerCase()) return text;
  return nl === -1 ? '' : text.slice(nl).replace(/^\n+/, '');
}

// ── shared: split a .dat key record into key + payload at the first \r\n ──
function splitKeyRecord(record: Buffer, encoding: ModEncoding, where: string): { key: string; payload: Buffer } {
  const sep = record.indexOf('\r\n');
  if (sep < 0) throw new Error(`${where}: key record has no CRLF separator — unrecognized layout`);
  return { key: decodeBytes(record.subarray(0, sep), encoding), payload: record.subarray(sep + 2) };
}

interface RawRecord { key: string; payload: Buffer }

// @LINK records alias another headword; resolve to the target's payload or throw.
// (None exist in ISBE/Easton/Nave/Smith — grep -c '@LINK' = 0 — but the format
// allows them, and silently emitting "@LINK X" as text would be a lie.)
function resolveLinks(records: RawRecord[], encoding: ModEncoding): RawRecord[] {
  const isLink = (p: Buffer) => p.subarray(0, 5).toString('latin1') === '@LINK';
  const byKey = new Map<string, Buffer>();
  for (const r of records) if (!isLink(r.payload)) byKey.set(r.key, r.payload);
  return records.map((r) => {
    if (!isLink(r.payload)) return r;
    const target = decodeBytes(r.payload, encoding).replace(/^@LINK[ \t]*/, '').trim();
    const payload = byKey.get(target);
    if (!payload) throw new Error(`@LINK "${r.key}" → "${target}": target key not found — unrecognized layout`);
    return { key: r.key, payload };
  });
}

// ── zLD ──
export function decodeZld(base: string, encoding: ModEncoding): LdEntry[] {
  const idx = readFileSync(`${base}.idx`);
  const dat = readFileSync(`${base}.dat`);
  const zdx = readFileSync(`${base}.zdx`);
  const zdt = readFileSync(`${base}.zdt`);
  if (idx.length % 8 !== 0) throw new Error(`${base}.idx length ${idx.length} not a multiple of 8 — unrecognized layout`);
  if (zdx.length % 8 !== 0) throw new Error(`${base}.zdx length ${zdx.length} not a multiple of 8 — unrecognized layout`);
  const blockCount = zdx.length / 8;

  const blockCache = new Map<number, Buffer>();
  const getBlock = (n: number): Buffer => {
    const hit = blockCache.get(n);
    if (hit) return hit;
    if (n >= blockCount) throw new Error(`${base}: block ${n} out of range (${blockCount} blocks)`);
    const off = zdx.readUInt32LE(n * 8);
    const comp = zdx.readUInt32LE(n * 8 + 4);
    const buf = inflateSync(zdt.subarray(off, off + comp));
    blockCache.set(n, buf);
    return buf;
  };
  const getBlockEntry = (block: number, entry: number): string => {
    const blk = getBlock(block);
    const count = blk.readUInt32LE(0);
    if (entry >= count) throw new Error(`${base}: entry ${entry} out of range in block ${block} (count ${count})`);
    const off = blk.readUInt32LE(4 + entry * 8);
    const size = blk.readUInt32LE(4 + entry * 8 + 4);
    if (off + size > blk.length) throw new Error(`${base}: block ${block} entry ${entry} overruns block — unrecognized layout`);
    let end = off + size;
    while (end > off && blk[end - 1] === 0) end--; // entries are NUL-terminated
    return decodeBytes(blk.subarray(off, end), encoding);
  };

  const raw: RawRecord[] = [];
  for (let i = 0; i + 8 <= idx.length; i += 8) {
    const off = idx.readUInt32LE(i);
    const size = idx.readUInt32LE(i + 4);
    raw.push(splitKeyRecord(dat.subarray(off, off + size), encoding, `${base}.dat @${off}`));
  }
  return resolveLinks(raw, encoding).map(({ key, payload }) => {
    if (payload.length !== 8) {
      throw new Error(`${base}: key "${key}" payload is ${payload.length} B (expected u32 block + u32 entry) — unrecognized layout`);
    }
    return { key, text: markupToText(getBlockEntry(payload.readUInt32LE(0), payload.readUInt32LE(4))) };
  });
}

// ── RawLD ──
export function decodeRawLd(base: string, encoding: ModEncoding): LdEntry[] {
  const idx = readFileSync(`${base}.idx`);
  const dat = readFileSync(`${base}.dat`);
  if (idx.length % 6 !== 0) throw new Error(`${base}.idx length ${idx.length} not a multiple of 6 — unrecognized layout`);
  const raw: RawRecord[] = [];
  for (let i = 0; i + 6 <= idx.length; i += 6) {
    const off = idx.readUInt32LE(i);
    const size = idx.readUInt16LE(i + 4);
    if (size === 0) continue; // empty slot
    if (off + size > dat.length) throw new Error(`${base}.idx entry @${i} overruns .dat — unrecognized layout`);
    raw.push(splitKeyRecord(dat.subarray(off, off + size), encoding, `${base}.dat @${off}`));
  }
  return resolveLinks(raw, encoding).map(({ key, payload }) => ({
    key,
    text: markupToText(decodeBytes(payload, encoding)),
  }));
}

export function decodeLdModule(moduleDir: string): { entries: LdEntry[]; skipped: number } {
  const { modDrv, base, encoding } = readConf(moduleDir);
  const decoded = modDrv === 'zLD' ? decodeZld(base, encoding) : decodeRawLd(base, encoding);
  const entries: LdEntry[] = [];
  let skipped = 0;
  for (const e of decoded) {
    const text = dropEchoedHeadword(e.key, e.text);
    if (text.length < MIN_TEXT_CHARS) { skipped++; continue; }
    entries.push({ key: e.key, text });
  }
  return { entries, skipped };
}

async function main() {
  const moduleDir = arg('--module');
  const outPath = arg('--out');
  if (!moduleDir || !outPath) {
    throw new Error('usage: sword-ld.ts --module=<dir> --out=<f.jsonl>');
  }
  const { entries, skipped } = decodeLdModule(moduleDir);
  if (entries.length < 500) {
    throw new Error(`${moduleDir}: only ${entries.length} entries decoded — treat as parse failure, not a small dictionary`);
  }
  writeFileSync(outPath, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
  console.log(`${path.basename(moduleDir)} → ${entries.length} entries (${skipped} skipped <${MIN_TEXT_CHARS} chars) → ${outPath}`);
  for (const e of [entries[0], entries[Math.floor(entries.length / 2)], entries[entries.length - 1]]) {
    if (!e) continue;
    console.log(`  sample [${e.key}] ${e.text.slice(0, 110).replace(/\n/g, ' ¶ ')}`);
  }
}

if (process.argv[1] && /sword-ld/.test(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
