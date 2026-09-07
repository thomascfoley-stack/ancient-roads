// Theodore Beza, "A briefe and piththie summe of the Christian faith" (trans.
// Robert Fills) — EEBO-TCP Phase I parser (manifest slug beza-christian-faith).
//
//   npx tsx src/ingest/adapter-beza-tcp.ts \
//     --xml=data/raw/github/eebo-tcp/A68595.xml --out=data/raw/github/eebo-tcp/beza.jsonl
//
// Source: textcreationpartnership/A68595 (STC 2007, ESTC S101755), github
// pinned file SHA256 recorded in the manifest entry. Licence is IN the TEI
// header <availability>: "available for reuse, according to the terms of
// Creative Commons 0 1.0 Universal" — CC0, read 2026-09-07. Keyboarded
// transcription, not OCR.
//
// EDITION TRAP: the candidate card said "1563". The TEI header <editionStmt>
// says 1565 and the transcribed title page (read, not grepped) is the 1565
// Serll/Harrison printing translated "out of Frenche by R.F." — Robert Fills.
// The manifest records Fills 1565, not the card's 1563.
//
// Structure (surveyed on the file): front matter (title_page, preface,
// dedication, printer_to_the_reader — NON-AUTHORIAL or translator apparatus,
// excluded), then treatise(1) = the Confession (51 <head>-delimited articles:
// "Of the trinitie. The first point." …), 15 <div type="subsection"> = the
// Confutation topics ("Of penance", "Of the Supper", … — several nesting
// dozens of their own <head>s), one conclusion, and treatise(2) = "Another
// briefe confession of fayth" (continuous, one head). Every content div is
// split at <head> boundaries; group heads with no body of their own ride as
// key prefixes. → 154 sections (min 156 / mean 2,267 / max 24,828 chars —
// register-writer chunks bodies at the 1,200-char embed budget).
//
// Typography: long-s (ſ → s, 1,346 occurrences) is normalized — a mechanical
// typography fix for retrieval, not a content edit; u/v and early-modern
// spelling are left exactly as keyboarded. <gap> illegibles become ⟨…⟩
// lacuna markers (poole-tcp precedent), never guessed. <note>/<ref> inner
// text is kept — the marginal citations are the content.
//
// FAIL CLOSED: fewer than 60 sections, any section under 40 chars, or a
// treatise boundary mismatch throws.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sanitizeForIngest } from './content-sanity.js';

const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

const SECTION_FLOOR = 60;
const MIN_SECTION_CHARS = 40;

export interface BezaRecord { key: string; text: string }

function teiToText(xml: string): string {
  return sanitizeForIngest(
    xml
      .replace(/<g ref="char:EOL(?:un)?hyphen"\/>/g, '') // word split across a line/page break — rejoin (2,141 + 102 occurrences)
      .replace(/<g ref="char:[^"]*"\/>/g, '') // cmbAbbrStroke / punc / leaf glyphs — the marker is not text
      .replace(/<pb\b[^>]*\/>/g, ' ')
      .replace(/<gap\b[^>]*\/>/g, ' ⟨…⟩ ')
      .replace(/<\/p>/g, '\n\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/ſ/g, 's') // long-s → s: typography, not content
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function headText(headXml: string): string {
  return teiToText(headXml).replace(/\s+/g, ' ').replace(/^¶\s*/, '').trim();
}

export function parseBeza(xml: string): BezaRecord[] {
  const bodyStart = xml.indexOf('<body');
  if (bodyStart < 0) throw new Error('FAIL CLOSED: no <body> — wrong file?');
  const body = xml.slice(bodyStart);

  // Top-level divs of interest, in document order.
  const divRe = /<div type="(treatise|subsection|conclusion)"[^>]*>/g;
  const marks: Array<{ type: string; start: number }> = [];
  for (const m of body.matchAll(divRe)) marks.push({ type: m[1]!, start: m.index! });
  if (marks.length !== 18) {
    throw new Error(`FAIL CLOSED: expected 18 top-level content divs (2 treatise + 15 subsection + 1 conclusion), found ${marks.length}`);
  }

  const records: BezaRecord[] = [];
  const push = (key: string, text: string) => {
    if (key.length === 0) throw new Error('FAIL CLOSED: empty section head');
    if (text.length < MIN_SECTION_CHARS) {
      throw new Error(`FAIL CLOSED: section "${key.slice(0, 60)}" stripped to ${text.length} chars`);
    }
    records.push({ key, text });
  };

  for (let i = 0; i < marks.length; i++) {
    const { type, start } = marks[i]!;
    const end = i + 1 < marks.length ? marks[i + 1]!.start : body.indexOf('</body>', start);
    const div = body.slice(start, end);

    // Every content div splits at its <head> boundaries; several subsections
    // nest dozens of heads (the Confutation's long articles). Heads come in
    // two tiers — GROUP heads ("Of the trinitie. The first point.") carry no
    // body of their own and ride as a prefix on the following sections' keys
    // ("… The fourth point. — The firste article of the person of the holye
    // Ghoſte."), which is how the printed work's own contents read.
    const headRe = /<head>([\s\S]*?)<\/head>/g;
    const heads: Array<{ head: string; at: number; after: number }> = [];
    for (const m of div.matchAll(headRe)) heads.push({ head: headText(m[1]!), at: m.index!, after: m.index! + m[0].length });
    if (heads.length === 0) {
      push(`${type} ${i}`, teiToText(div));
      continue;
    }
    let group: string | null = null;
    for (let h = 0; h < heads.length; h++) {
      const text = teiToText(div.slice(heads[h]!.after, h + 1 < heads.length ? heads[h + 1]!.at : div.length));
      if (text.length < MIN_SECTION_CHARS) { group = heads[h]!.head; continue; }
      push(group !== null ? `${group} — ${heads[h]!.head}` : heads[h]!.head, text);
    }
  }

  const keys = new Set(records.map((r) => r.key));
  if (keys.size !== records.length) {
    throw new Error(`FAIL CLOSED: ${records.length - keys.size} duplicate section heads`);
  }
  if (records.length < SECTION_FLOOR) {
    throw new Error(`FAIL CLOSED: only ${records.length} sections (< ${SECTION_FLOOR}) — parse failure, do not use this output`);
  }
  return records;
}

function main() {
  const xmlPath = arg('--xml') ?? 'data/raw/github/eebo-tcp/A68595.xml';
  const outPath = arg('--out') ?? 'data/raw/github/eebo-tcp/beza.jsonl';
  const records = parseBeza(readFileSync(xmlPath, 'utf8'));
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(`beza-christian-faith → ${records.length} sections → ${outPath}`);
  for (const r of [records[0], records[Math.floor(records.length / 2)], records[records.length - 1]]) {
    if (r) console.log(`  sample ${r.key.slice(0, 70)}  ${r.text.slice(0, 80)}`);
  }
}

if (process.argv[1] && /adapter-beza-tcp/.test(process.argv[1])) {
  try {
    main();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
