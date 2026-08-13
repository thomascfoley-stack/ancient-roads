// github structured-data adapter — Thayer's Greek-English Lexicon (manifest slug
// thayers-lexicon). Parses the EveryPromiseBible/Every-Promise-Thayers markdown
// edition (book/*.md, pinned commit a31ff38c40a681ef1029dcc51eb7e7ee3f2ea409 —
// checksums in data/raw/github/thayers/SHA256SUMS) into JSONL {key, text}:
//
//   npx tsx src/ingest/adapter-thayers.ts \
//     --dir=data/raw/github/thayers/book \
//     --out=data/raw/github/thayers/thayers.jsonl
//
// WHY THIS SOURCE: the archive.org OCR path is dead (A6 run 2026-07-17 measured
// 50.2% fuzzy / 6.2% strict headword recognizability, 0% Greek script, systemic
// across 3 scans — see the quarantine note in ingest/sources.config.json). This
// edition is STRUCTURED: every entry carries its Strong's number in markup
// (`Strong's G25`) and a real polytonic-Greek headword, so keys are
// recognizable BY CONSTRUCTION — they come from markup, not OCR.
// License verified BEFORE ingest (the geneva-notes lesson): the underlying
// lexicon is 1889 PD (Thayer d. 1901) and the digitization carries an explicit
// CC0-1.0 dedication (LICENSE + NOTICE, both archived). Verification recorded
// in docs/evidence/profiles/thayers-*.log.
//
// key format: "G<strong> <headword>" (e.g. "G25 ἀγαπάω") — same convention as
// adapter-bdb's "H<strong> <headword>". This edition carries exactly one
// Strong's id per entry (measured: 5,521 entries, G1..G5624, zero duplicates,
// zero missing). An entry WITHOUT a Strong's line is neither dropped nor
// mis-keyed: it keeps its headword under a "thayer:<file>:<n>" key and is
// counted separately in the run summary. Expected count is 0 — any other
// number is format drift; read it before using the output.
//
// FAIL CLOSED on structure surprises: every "### " heading must parse, every
// entry must carry a non-empty headword and non-empty body, Strong's ids
// must be numeric and unique, ≥95% of headwords must contain Greek script
// (0% Greek was the OCR failure mode), and the total must clear the floor
// (Thayer covers ~5.6k NT words; <5000 means the parse broke).

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sanitizeForIngest } from './content-sanity.js';

const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

const ENTRY_FLOOR = 5000; // below this the parse failed, full stop
const GREEK = /[Ͱ-Ͽἀ-῿]/;
const MIN_GREEK_HEADWORD_RATE = 0.95;

export interface ThayerRecord { key: string; text: string }
export interface ThayerParse {
  records: ThayerRecord[];
  strongKeyed: number;
  noStrong: { key: string }[]; // counted deliberately — never silently dropped, never mis-keyed
  stubs: { key: string }[];    // sub-20-char cross-reference entries ("see X") — kept under their Strong's key, counted
  repaired: { key: string }[]; // junk headings repaired from markup ("-" → - Original:, "STRONGS" → STRONGS NT marker), counted
  junkHeadwords: { key: string }[]; // non-Greek headwords that could NOT be repaired — kept verbatim, counted
  greekHeadwords: number;
}

interface Parsed { headword: string; strong: string | null; text: string; repaired: boolean }

// One book file → entries. Entry shape (verified against the pinned bytes):
//   ### <headword>[ — <transliteration>]
//   `Strong's G<num>`
//
//   <body paragraphs>
// separated by "\n---\n". The file preamble (title, nav links) precedes the
// first "### " and is skipped by construction.
function parseFile(filename: string, md: string): Parsed[] {
  const heads = [...md.matchAll(/^### (.+)$/gm)];
  const out: Parsed[] = [];
  for (let i = 0; i < heads.length; i++) {
    const m = heads[i]!;
    const heading = m[1]!.trim();
    const chunkStart = m.index! + m[0].length;
    const chunkEnd = i + 1 < heads.length ? heads[i + 1]!.index! : md.length;
    const chunk = md.slice(chunkStart, chunkEnd).replace(/^\s*\n/, '');

    // the Strong's line is the first non-empty line after the heading, or the
    // entry has no Strong's mapping (counted, keyed thayer: below)
    const firstLineEnd = chunk.indexOf('\n');
    const firstLine = (firstLineEnd === -1 ? chunk : chunk.slice(0, firstLineEnd)).trim();
    const strong = /^`Strong's G(\d+)`$/.exec(firstLine)?.[1] ?? null;
    const bodyRaw = strong !== null ? chunk.slice(firstLineEnd + 1) : chunk;

    // headword: text up to " — " if present (11 headings carry no transliteration).
    // Two measured junk-heading shapes are repaired FROM MARKUP, never invented:
    //   "### -"        (44×) — the dataset's inflected-form filler entries; the
    //                  Greek lemma sits in the body's "- Original:" line.
    //   "### STRONGS"  (1×, G687) — a botched heading; the body's leading
    //                  "STRONGS NT 687: ἄρα (2)…" marker carries the headword.
    // Anything else without Greek in the heading keeps its heading verbatim and
    // is counted in junkHeadwords — visible in the summary, never silently fixed.
    let headword = heading.split(' — ')[0]!.trim();
    if (headword.length === 0) throw new Error(`FAIL CLOSED: ${filename}: empty headword in heading "${heading}"`);
    let repaired = false;
    if (headword === '-') {
      headword = /^- Original: (.+)$/m.exec(bodyRaw)?.[1]?.trim() ?? headword;
      repaired = headword !== '-';
    } else if (!GREEK.test(headword)) {
      const m2 = /STRONGS NT \d+[a-z]?:\s+([Ͱ-Ͽἀ-῿]+(?: ?\(\d+\))?)/.exec(bodyRaw);
      if (m2) { headword = m2[1]!; repaired = true; }
    }
    headword = headword.normalize('NFC'); // the "- Original:" fields are NFD

    const text = sanitizeForIngest(bodyRaw)
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ') // spaces/tabs ONLY — never \s (the corpus scar)
      .replace(/^---\s*$/gm, '') // trailing entry separator, if the split left one
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (text.length === 0) {
      throw new Error(`FAIL CLOSED: ${filename}: "${heading}" body is empty — parse failure, stop`);
    }
    out.push({ headword, strong, text, repaired });
  }
  return out;
}

export function parseThayers(dir: string): ThayerParse {
  const files = readdirSync(dir).filter((f) => /^\d+.*\.md$/.test(f)).sort();
  if (files.length === 0) throw new Error(`FAIL CLOSED: ${dir}: no numbered book/*.md files — wrong directory or missing archive`);

  const parsed: (Parsed & { file: string; ordinal: number })[] = [];
  for (const f of files) {
    parsed.push(...parseFile(f, readFileSync(path.join(dir, f), 'utf8')).map((p, i) => ({ ...p, file: f, ordinal: i + 1 })));
  }

  const seenStrong = new Set<string>();
  const records: ThayerRecord[] = [];
  const noStrong: { key: string }[] = [];
  const stubs: { key: string }[] = [];
  const repaired: { key: string }[] = [];
  const junkHeadwords: { key: string }[] = [];
  let greekHeadwords = 0;
  for (const p of parsed) {
    if (GREEK.test(p.headword)) greekHeadwords++;
    let key: string;
    if (p.strong !== null) {
      if (seenStrong.has(p.strong)) throw new Error(`FAIL CLOSED: duplicate Strong's id G${p.strong} ("${p.headword}") — format drift, stop`);
      seenStrong.add(p.strong);
      key = `G${p.strong} ${p.headword}`;
    } else {
      key = `thayer:${p.file}:${p.ordinal} ${p.headword}`;
      noStrong.push({ key });
    }
    if (p.text.length < 20) stubs.push({ key }); // cross-reference stubs ("ἔπω, see εἶπον.") — kept, keyed, counted
    if (p.repaired) repaired.push({ key });
    else if (!GREEK.test(p.headword)) junkHeadwords.push({ key });
    records.push({ key, text: p.text });
  }

  const keys = new Set(records.map((r) => r.key));
  if (keys.size !== records.length) {
    throw new Error(`FAIL CLOSED: ${records.length - keys.size} duplicate keys — stop`);
  }
  const greekRate = records.length === 0 ? 0 : greekHeadwords / records.length;
  if (greekRate < MIN_GREEK_HEADWORD_RATE) {
    throw new Error(
      `FAIL CLOSED: only ${(greekRate * 100).toFixed(1)}% of headwords contain Greek script (< ${MIN_GREEK_HEADWORD_RATE * 100}%) — ` +
        'the OCR failure mode was 0%; a structured Thayer is ~all-Greek. Do not use this output',
    );
  }
  if (records.length < ENTRY_FLOOR) {
    throw new Error(`FAIL CLOSED: only ${records.length} entries (< ${ENTRY_FLOOR}) — parse failure, do not use this output`);
  }
  return { records, strongKeyed: records.length - noStrong.length, noStrong, stubs, repaired, junkHeadwords, greekHeadwords };
}

function main() {
  const dir = arg('--dir') ?? 'data/raw/github/thayers/book';
  const outPath = arg('--out') ?? 'data/raw/github/thayers/thayers.jsonl';

  const { records, strongKeyed, noStrong, stubs, repaired, junkHeadwords, greekHeadwords } = parseThayers(dir);

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, records.map((r) => JSON.stringify(r)).join('\n') + '\n');

  console.log(
    `thayers-lexicon → ${records.length} entries (${strongKeyed} Strong-keyed, ${noStrong.length} without Strong's mapping ` +
      `[counted, keyed thayer:], ${stubs.length} cross-reference stubs [kept, counted], ` +
      `${repaired.length} markup-repaired headwords, ${junkHeadwords.length} unrepaired junk headwords [kept verbatim, counted], ` +
      `${((greekHeadwords / records.length) * 100).toFixed(1)}% Greek headwords) → ${outPath}`,
  );
  for (const n of noStrong.slice(0, 10)) console.log(`  no-strong: ${n.key}`);
  for (const s of stubs) console.log(`  stub: ${s.key}`);
  for (const r of repaired) console.log(`  repaired: ${r.key}`);
  for (const j of junkHeadwords) console.log(`  junk-headword: ${j.key}`);
  for (const r of [records[0], records[Math.floor(records.length / 2)], records[records.length - 1]]) {
    if (!r) continue;
    console.log(`  sample ${r.key}  ${r.text.slice(0, 110).replace(/\n/g, ' ¶ ')}`);
  }
}

if (process.argv[1] && /adapter-thayers/.test(process.argv[1])) {
  try {
    main();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
