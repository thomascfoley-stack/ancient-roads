// github structured-data adapter — Strong's Greek + Hebrew dictionaries
// (manifest slug strongs-concordance). Parses openscriptures/strongs
// strongs-{greek,hebrew}-dictionary.js into JSONL {key, text}, keyed by
// Strong's number ("G1 ἀάω", "H1 אָב") so Thayer's and BDB lookups share one
// key space. The underlying dictionaries are Strong's own (Greek 1890, Hebrew
// 1894, public domain); the Open Scriptures JSON e-text declares CC-BY-SA in
// each file's header comment (verified by reading the header, 2026-09-07).
//
//   npx tsx src/ingest/adapter-strongs.ts \
//     --greek=data/raw/github/strongs/strongs-greek-dictionary.js \
//     --hebrew=data/raw/github/strongs/strongs-hebrew-dictionary.js \
//     --out=data/raw/github/strongs/strongs.jsonl
//
// FAIL CLOSED on structure surprises: every entry must carry a numeric
// Strong's key and a non-empty definition, keys must be unique file-wide, and
// the totals must clear the parse-failure floor (Greek ~5.5k G1-G5624, Hebrew
// ~8.6k H1-H8674; far below that means the parse broke).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sanitizeForIngest } from './content-sanity.js';

const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

const GREEK_FLOOR = 5000;
const HEBREW_FLOOR = 8000;

interface RawEntry {
  lemma?: string;
  xlit?: string;
  translit?: string;
  pron?: string;
  pronounce?: string;
  strongs_def?: string;
  derivation?: string;
  kjv_def?: string;
}

export interface StrongsRecord { key: string; text: string }

// The files are `var strongs<X>Dictionary = { ... };` behind a licence header
// comment. Slice the object literal and evaluate it in a sandboxed Function —
// same approach as src/ingest/ingest-strongs.ts, which serves the static copy.
export function parseJsDict(js: string, label: string): Record<string, RawEntry> {
  const start = js.indexOf('{');
  const end = js.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`FAIL CLOSED: ${label} has no object literal — wrong file or format drift`);
   
  return Function(`"use strict"; return (${js.slice(start, end + 1)});`)() as Record<string, RawEntry>;
}

export function parseStrongs(js: string, prefix: 'G' | 'H', floor: number): StrongsRecord[] {
  const raw = parseJsDict(js, prefix);
  const records: StrongsRecord[] = [];
  for (const [id, e] of Object.entries(raw)) {
    if (!new RegExp(`^${prefix}\\d+$`).test(id)) {
      throw new Error(`FAIL CLOSED: unexpected key "${id}" — not ${prefix}<digits>`);
    }
    // 20 of 5,523 Greek entries (e.g. G687 ἆρα, G5184 Τύρος) carry an empty
    // strongs_def with the actual gloss living in the derivation field — a
    // quirk of the e-text, not a parse break. Fall back to derivation, and
    // fail closed only if BOTH are empty.
    const derivation = (e.derivation ?? '').trim();
    const defFromDerivation = (e.strongs_def ?? '').trim().length === 0;
    const def = sanitizeForIngest(((e.strongs_def ?? '').trim() || derivation).trim());
    if (def.length === 0) throw new Error(`FAIL CLOSED: entry ${id} has an empty strongs_def AND derivation`);
    const lemma = (e.lemma ?? '').trim();
    if (lemma.length === 0) throw new Error(`FAIL CLOSED: entry ${id} has no lemma headword`);
    const parts = [
      def,
      !defFromDerivation && derivation && `Derivation: ${derivation}`,
      (e.kjv_def ?? '').trim() && `KJV: ${(e.kjv_def ?? '').trim()}`,
    ].filter((p): p is string => typeof p === 'string' && p.length > 0);
    records.push({ key: `${id} ${lemma}`, text: parts.join(' ') });
  }
  const keys = new Set(records.map((r) => r.key));
  if (keys.size !== records.length) {
    throw new Error(`FAIL CLOSED: ${records.length - keys.size} duplicate keys`);
  }
  if (records.length < floor) {
    throw new Error(`FAIL CLOSED: only ${records.length} ${prefix} entries (< ${floor}) — parse failure, do not use this output`);
  }
  return records.sort((a, b) => parseInt(a.key.slice(1), 10) - parseInt(b.key.slice(1), 10));
}

function main() {
  const greekPath = arg('--greek') ?? 'data/raw/github/strongs/strongs-greek-dictionary.js';
  const hebrewPath = arg('--hebrew') ?? 'data/raw/github/strongs/strongs-hebrew-dictionary.js';
  const outPath = arg('--out') ?? 'data/raw/github/strongs/strongs.jsonl';

  const greek = parseStrongs(readFileSync(greekPath, 'utf8'), 'G', GREEK_FLOOR);
  const hebrew = parseStrongs(readFileSync(hebrewPath, 'utf8'), 'H', HEBREW_FLOOR);
  const all = [...greek, ...hebrew];
  const keys = new Set(all.map((r) => r.key));
  if (keys.size !== all.length) throw new Error('FAIL CLOSED: G/H key collision across dictionaries');

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, all.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(`strongs-concordance → ${all.length} entries (${greek.length} Greek, ${hebrew.length} Hebrew), 100% Strong's-keyed → ${outPath}`);
  for (const r of [all[0], greek[0], all[all.length - 1]]) {
    if (r) console.log(`  sample ${r.key}  ${r.text.slice(0, 110)}`);
  }
}

if (process.argv[1] && /adapter-strongs/.test(process.argv[1])) {
  try {
    main();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
