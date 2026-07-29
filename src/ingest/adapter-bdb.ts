// github structured-data adapter — BDB Hebrew lexicon (manifest slug bdb-lexicon).
// Parses openscriptures/HebrewLexicon BrownDriverBriggs.xml into JSONL
// {key, text}, joining Strong's ids in from LexicalIndex.xml (same repo, same
// CC BY 4.0 markup license; the 1906 BDB text itself is public domain —
// attribution: Open Scriptures Hebrew Bible Project, per the repo readme).
//
//   npx tsx src/ingest/adapter-bdb.ts \
//     --xml=data/raw/github/bdb/BrownDriverBriggs.xml \
//     --index=data/raw/github/bdb/LexicalIndex.xml \
//     --out=data/raw/github/bdb/bdb.jsonl
//
// key format: "H<strong> <headword>" (multiple Strong's ids joined with '+',
// e.g. "H10+H11 אבדה"; OSHB augmented single-letter ids like "Hb" for the
// prefix בְּ pass through). BDB entries with no Strong's mapping (roots and
// cross-reference stubs — 3,011 of 11,845) keep their BDB entry id:
// "bdb:a.ab.aa אבב". Genuine homographs that would collide (same Strong +
// headword across several BDB sense-entries) are disambiguated with the BDB
// entry id in brackets: "H352 אַ֫יִל [a.bx.af]".
//
// FAIL CLOSED on structure surprises: entry-block regex must account for every
// <entry> open tag, every entry must carry an id + <w> headword + non-empty
// text, Strong's ids must be numeric or a single augmented letter, and the
// total must clear the parse-failure floor (BDB is ~11.8k entries; <2000
// means the parse broke).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sanitizeForIngest } from './content-sanity.js';

const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

const ENTRY_FLOOR = 2000; // below this the parse failed, full stop
const STRONG_ID = /^(\d+|[a-z])$/; // numeric Strong's or OSHB augmented letter (b, c, d, i, k, l, m, s)

export interface BdbRecord { key: string; text: string }

// ── LexicalIndex.xml → bdb entry id → Strong's ids (document order, deduped) ──
export function loadStrongMap(indexXml: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  let xrefs = 0;
  for (const m of indexXml.matchAll(/<xref\b([^>]*)\/>/g)) {
    xrefs++;
    const attrs = m[1]!;
    const bdb = attrs.match(/\bbdb="([^"]+)"/)?.[1];
    const strong = attrs.match(/\bstrong="([^"]+)"/)?.[1];
    if (bdb === undefined || strong === undefined) continue; // index rows without both are expected (roots, unnumbered)
    if (!STRONG_ID.test(strong)) {
      throw new Error(`FAIL CLOSED: unexpected strong id "${strong}" for bdb="${bdb}" — not numeric or augmented letter`);
    }
    const ids = map.get(bdb) ?? [];
    if (!ids.includes(strong)) ids.push(strong);
    map.set(bdb, ids);
  }
  if (xrefs === 0 || map.size === 0) {
    throw new Error(`FAIL CLOSED: LexicalIndex yielded ${xrefs} xrefs / ${map.size} bdb→strong mappings — wrong file or format drift`);
  }
  return map;
}

// ── tag stripping: drop <status> editorial markers wholesale, keep all prose ──
function stripTags(xml: string): string {
  const decoded = sanitizeForIngest(
    xml
      .replace(/<status\b[^>]*>[\s\S]*?<\/status>/g, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim();
  if (/&(amp|lt|gt);/.test(decoded)) {
    throw new Error('FAIL CLOSED: XML entity survived decoding — decoder drift');
  }
  return decoded;
}

// ── BrownDriverBriggs.xml → records ──
export function parseBdb(bdbXml: string, strongMap: Map<string, string[]>): BdbRecord[] {
  const openTags = (bdbXml.match(/<entry\b/g) ?? []).length;
  const blocks = [...bdbXml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)];
  if (blocks.length !== openTags) {
    throw new Error(`FAIL CLOSED: matched ${blocks.length} entry blocks but found ${openTags} <entry> open tags — nesting or malformed markup, stop`);
  }

  interface Parsed { id: string; keyBase: string; text: string }
  const parsed: Parsed[] = [];
  const seenIds = new Set<string>();
  for (const m of blocks) {
    const openTag = m[0].slice(0, m[0].indexOf('>') + 1);
    const id = openTag.match(/\bid="([^"]+)"/)?.[1];
    if (id === undefined) throw new Error(`FAIL CLOSED: entry without id: ${openTag}`);
    if (seenIds.has(id)) throw new Error(`FAIL CLOSED: duplicate entry id ${id}`);
    seenIds.add(id);

    const body = m[1]!;
    const headwordXml = body.match(/<w\b[^>]*>([\s\S]*?)<\/w>/)?.[1];
    if (headwordXml === undefined) throw new Error(`FAIL CLOSED: entry ${id} has no <w> headword`);
    const headword = stripTags(headwordXml);
    const text = stripTags(body);
    if (headword.length === 0 || text.length === 0) {
      throw new Error(`FAIL CLOSED: entry ${id} stripped to empty headword/text`);
    }

    const strongs = strongMap.get(id);
    const keyBase = strongs !== undefined
      ? `${strongs.map((s) => `H${s}`).join('+')} ${headword}`
      : `bdb:${id} ${headword}`;
    parsed.push({ id, keyBase, text });
  }

  // Homograph disambiguation: identical Strong+headword across sense-entries
  // gets the BDB entry id appended, so keys are unique file-wide.
  const counts = new Map<string, number>();
  for (const p of parsed) counts.set(p.keyBase, (counts.get(p.keyBase) ?? 0) + 1);
  const records = parsed.map((p): BdbRecord => ({
    key: (counts.get(p.keyBase) ?? 0) > 1 ? `${p.keyBase} [${p.id}]` : p.keyBase,
    text: p.text,
  }));

  const keys = new Set(records.map((r) => r.key));
  if (keys.size !== records.length) {
    throw new Error(`FAIL CLOSED: ${records.length - keys.size} duplicate keys survived disambiguation`);
  }
  if (records.length < ENTRY_FLOOR) {
    throw new Error(`FAIL CLOSED: only ${records.length} entries (< ${ENTRY_FLOOR}) — parse failure, do not use this output`);
  }
  return records;
}

function main() {
  const xmlPath = arg('--xml') ?? 'data/raw/github/bdb/BrownDriverBriggs.xml';
  const indexPath = arg('--index') ?? 'data/raw/github/bdb/LexicalIndex.xml';
  const outPath = arg('--out') ?? 'data/raw/github/bdb/bdb.jsonl';

  const strongMap = loadStrongMap(readFileSync(indexPath, 'utf8'));
  const records = parseBdb(readFileSync(xmlPath, 'utf8'), strongMap);

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, records.map((r) => JSON.stringify(r)).join('\n') + '\n');

  const strongKeyed = records.filter((r) => r.key.startsWith('H')).length;
  console.log(`bdb-lexicon → ${records.length} entries (${strongKeyed} Strong-keyed, ${records.length - strongKeyed} bdb-id-keyed) → ${outPath}`);
  for (const r of [records[0], records[Math.floor(records.length / 2)], records[records.length - 1]]) {
    if (!r) continue;
    console.log(`  sample ${r.key}  ${r.text.slice(0, 110)}`);
  }
}

if (process.argv[1] && /adapter-bdb/.test(process.argv[1])) {
  try {
    main();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
