// Matthew Poole, Annotations upon the Holy Bible — EEBO-TCP CC0 transcription parser.
//
//   npx tsx src/ingest/poole-tcp.ts --xml=data/raw/poole/A55363.xml --out=data/raw/poole/poole-vol1.jsonl
//
// Source: Text Creation Partnership keyboarded editions A55363 (Vol I, Genesis–
// Isaiah, 1685) and A55368 (Vol II, Jeremiah–Revelation, continuation by "certain
// judicious and learned divines"), github.com/textcreationpartnership. License is
// IN the TEI header: "available for reuse, according to the terms of Creative
// Commons 0 1.0 Universal" — CC0, verified 2026-07-16. NOT OCR: keyboarded, but
// Phase-I quality (~7 <gap reason="illegible"> per 1,000 words on the damaged
// microfilm). Gaps are preserved honestly as ⟨…⟩ lacuna markers, never guessed.
//
// Structure (verified on Ruth 1): <div type="book"><head>RUTH.</head> …
// <head>CHAP. I.</head> <p>…verse 1…</p> <p n="2">…</p> — each verse is a <p>
// whose n attribute is the verse number (first verse of a chapter may omit n).
// The KJV verse text is the <p>'s own text (NOT stored — we want the commentary);
// Poole's annotations are the <note place="bottom"> children; margin notes are
// textual apparatus (Heb. readings, cross-refs) and are skipped for entry bodies.

import { readFileSync, writeFileSync } from 'node:fs';
import { loadKjvCanon } from './sword-zverse.js';

const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

const BOOK_NAMES: Record<string, number> = {
  GENESIS: 1, EXODUS: 2, LEVITICUS: 3, NUMBERS: 4, DEUTERONOMIE: 5, DEUTERONOMY: 5,
  JOSHUA: 6, JUDGES: 7, RUTH: 8, 'I. SAMUEL': 9, 'II. SAMUEL': 10, 'I. KINGS': 11, 'II. KINGS': 12,
  'I CHRONICLES': 13, 'II CHRONICLES': 14, 'I. CHRONICLES': 13, 'II. CHRONICLES': 14,
  EZRA: 15, NEHEMIAH: 16, ESTHER: 17, JOB: 18, PSALMS: 19, PROVERBS: 20, ECCLESIASTES: 21,
  CANTICLES: 22, ISAIAH: 23, JEREMIAH: 24, LAMENTATIONS: 25, EZEKIEL: 26, DANIEL: 27,
  HOSEA: 28, JOEL: 29, AMOS: 30, OBADIAH: 31, JONAH: 32, MICAH: 33, NAHUM: 34,
  HABAKKUK: 35, ZEPHANIAH: 36, HAGGAI: 37, ZECHARIAH: 38, MALACHI: 39,
  MATTHEW: 40, MARK: 41, LUKE: 42, JOHN: 43, ACTS: 44, ROMANS: 45,
  'I CORINTHIANS': 46, 'II CORINTHIANS': 47, 'I. CORINTHIANS': 46, 'II. CORINTHIANS': 47,
  GALATIANS: 48, EPHESIANS: 49, PHILIPPIANS: 50, COLOSSIANS: 51,
  'I THESSALONIANS': 52, 'II THESSALONIANS': 53, 'I. THESSALONIANS': 52, 'II. THESSALONIANS': 53,
  'I TIMOTHY': 54, 'II TIMOTHY': 55, 'I. TIMOTHY': 54, 'II. TIMOTHY': 55,
  TITUS: 56, PHILEMON: 57, HEBREWS: 58, JAMES: 59,
  'I PETER': 60, 'II PETER': 61, 'I. PETER': 60, 'II. PETER': 61,
  'I JOHN': 62, 'II JOHN': 63, 'III JOHN': 64, 'I. JOHN': 62, 'II. JOHN': 63, 'III. JOHN': 64,
  JUDE: 65, REVELATION: 66,
};

// Vol II heads are full early-modern titles ("THE SECOND EPISTLE GENERAL OF
// PETER", "THE GOSPEL ACCORDING TO S. MATTHEW") — resolve by keyword + ordinal.
function resolveBookName(rawName: string): number | undefined {
  const direct = BOOK_NAMES[rawName];
  if (direct) return direct;
  const t = ` ${rawName.toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const ord = / THIRD | III /.test(t) ? 3 : / SECOND | II /.test(t) ? 2 : / FIRST | I /.test(t) ? 1 : 0;
  const has = (w: string) => t.includes(` ${w} `);
  if (has('REVELATION')) return 66;
  if (has('JUDE')) return 65;
  if (has('LAMENTATIONS')) return 25;
  if (has('JOHN')) {
    // "THE FIRST EPISTLE OF ST. JOHN" → epistles by ordinal; a bare "S T. JOHN"
    // (the Gospel head — the print splits "ST.") has no EPISTLE keyword → gospel.
    if (has('EPISTLE')) return ord === 3 ? 64 : ord === 2 ? 63 : 62;
    return 43;
  }
  if (has('PETER')) return ord === 2 ? 61 : 60;
  if (has('JAMES')) return 59;
  if (has('HEBREWS')) return 58;
  if (has('PHILEMON')) return 57;
  if (has('TITUS')) return 56;
  if (has('TIMOTHY')) return ord === 2 ? 55 : 54;
  if (has('THESSALONIANS')) return ord === 2 ? 53 : 52;
  if (has('COLOSSIANS')) return 51;
  if (has('PHILIPPIANS')) return 50;
  if (has('EPHESIANS')) return 49;
  if (has('GALATIANS')) return 48;
  if (has('CORINTHIANS')) return ord === 2 ? 47 : 46;
  if (has('ROMANS')) return 45;
  if (has('ACTS')) return 44;
  if (has('LUKE')) return 42;
  if (has('MARK')) return 41;
  if (has('MATTHEW')) return 40;
  return undefined;
}

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
function romanToInt(s: string): number | null {
  let n = 0;
  const u = s.toUpperCase();
  for (let i = 0; i < u.length; i++) {
    const c = ROMAN[u[i]!];
    if (!c) return null;
    const nx = ROMAN[u[i + 1]!] ?? 0;
    n += c < nx ? -c : c;
  }
  return n || null;
}

// Normalize a TEI fragment to readable text: join EOL hyphens, mark gaps as
// honest lacunae, strip remaining tags, decode the few entities TCP uses.
function teiText(frag: string): string {
  return frag
    .replace(/<g ref="char:EOLhyphen"\/>\s*/g, '')
    .replace(/<gap[^>]*>.*?<\/gap>/gs, ' ⟨…⟩ ')
    .replace(/<gap[^>]*\/>/g, ' ⟨…⟩ ')
    .replace(/<g ref="char:punc">.*?<\/g>/gs, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface PooleEntry { author: string; verseId: number; verseEnd: number; content: string }

export function parsePooleVolume(xml: string): { entries: PooleEntry[]; report: string[] } {
  const entries: PooleEntry[] = [];
  const report: string[] = [];
  // Vol I marks books <div type="book">; Vol II (the posthumous continuation,
  // A55368) marks them <div type="biblical_commentary">.
  const bookRe = /<div type="(?:book|biblical_commentary)"[^>]*>/g;
  const bookStarts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = bookRe.exec(xml))) bookStarts.push(m.index);

  for (let b = 0; b < bookStarts.length; b++) {
    const seg = xml.slice(bookStarts[b]!, bookStarts[b + 1] ?? xml.length);
    const headM = seg.match(/<head[^>]*>(.*?)<\/head>/s);
    if (!headM) continue;
    const rawName = teiText(headM[1]!).replace(/^ANNOTATIONS ON /i, '').replace(/[.]+$/, '').trim().toUpperCase();
    const book = resolveBookName(rawName);
    if (!book) { report.push(`UNMAPPED BOOK HEAD: "${rawName}" — skipped, fail loud`); continue; }

    // Chapter heads: "CHAP. I." (Psalms: "PSAL. I." / "PSALM I."). The print is
    // dirty — "PSAL, V.", "CHAP ▪ XXVIII." — so match on the NORMALIZED head text.
    const chapStarts: Array<{ idx: number; ch: number; inferred?: boolean }> = [];
    for (const hm of seg.matchAll(/<head[^>]*>([\s\S]*?)<\/head>/g)) {
      const h = teiText(hm[1]!);
      const cm = h.match(/^(?:CHAP|PSAL(?:M)?)[.,]?\s+([IVXLC]+|\d+)[.,]?/i);
      if (!cm) continue;
      const raw = cm[1]!;
      const ch = /^\d+$/.test(raw) ? Number(raw) : romanToInt(raw);
      if (ch) chapStarts.push({ idx: hm.index!, ch });
    }
    // Single-chapter books (Obadiah, Philemon, 2–3 John) print NO chapter head:
    // the whole book div is chapter 1.
    if (chapStarts.length === 0 && /<p(?:\s+n="\d+")?>/.test(seg)) {
      const argEnd = seg.indexOf('</argument>');
      chapStarts.push({ idx: argEnd >= 0 ? argEnd : headM.index! + headM[0]!.length, ch: 1, inferred: true });
    }
    // Some books print no "CHAP. I." at all (Judges, 1 Chronicles, Ecclesiastes):
    // the first chapter's verse paragraphs sit between the ARGUMENT and the first
    // numbered head. If the first detected head is ch>1 and verse paragraphs exist
    // before it, insert an implicit chapter-1 boundary after the argument.
    if (chapStarts.length > 0 && chapStarts[0]!.ch > 1) {
      const argEnd = seg.indexOf('</argument>');
      const startIdx = argEnd >= 0 ? argEnd : headM.index! + headM[0]!.length;
      if (/<p(?:\s+n="\d+")?>/.test(seg.slice(startIdx, chapStarts[0]!.idx))) {
        chapStarts.unshift({ idx: startIdx, ch: 1, inferred: true });
      }
    }
    // A damaged/absent chapter head would silently fold that chapter's verses into
    // the PREVIOUS chapter — a misalignment this corpus can never ship. Detect the
    // verse-number RESET (<p n="…"> jumping back to ~1) inside a chapter segment
    // and infer a boundary at chapter+1; every inference is reported.
    let inferred = 0;
    for (let c = 0; c < chapStarts.length; c++) {
      const { idx, ch } = chapStarts[c]!;
      const endIdx = chapStarts[c + 1]?.idx ?? seg.length;
      const chSeg = seg.slice(idx, endIdx);
      let lastVerse = 0;
      for (const pm of chSeg.matchAll(/<p\s+n="(\d+)"/g)) {
        const v = Number(pm[1]);
        if (v <= 2 && lastVerse >= v + 3) {
          const nextCh = chapStarts[c + 1]?.ch;
          const inferredCh = ch + 1;
          if (nextCh === undefined || inferredCh < nextCh) {
            chapStarts.splice(c + 1, 0, { idx: idx + pm.index!, ch: inferredCh, inferred: true });
            inferred++;
          }
          break; // re-scan continues from the inserted boundary on the next loop pass
        }
        lastVerse = v;
      }
    }
    let nEntries = 0;
    for (let c = 0; c < chapStarts.length; c++) {
      const { idx, ch } = chapStarts[c]!;
      const chSeg = seg.slice(idx, chapStarts[c + 1]?.idx ?? seg.length);
      // verse paragraphs: <p n="V"> …; a <p> with no n directly after the head = verse 1
      const pRe = /<p(?:\s+n="(\d+)")?>([\s\S]*?)<\/p>/g;
      let pm: RegExpExecArray | null;
      let impliedVerse = 1;
      while ((pm = pRe.exec(chSeg))) {
        const verse = pm[1] ? Number(pm[1]) : impliedVerse;
        impliedVerse = verse + 1;
        if (!verse || verse > 200) continue;
        const notes = [...pm[2]!.matchAll(/<note[^>]*place="bottom"[^>]*>([\s\S]*?)<\/note>/g)]
          .map((n) => teiText(n[1]!)).filter((t) => t.length > 0);
        if (notes.length === 0) continue;
        entries.push({
          author: 'Matthew Poole',
          verseId: book * 1_000_000 + ch * 1_000 + verse,
          verseEnd: book * 1_000_000 + ch * 1_000 + verse,
          content: notes.join(' '),
        });
        nEntries++;
      }
    }
    report.push(`${rawName} (book ${book}): ${chapStarts.length} chapters (${inferred} inferred from verse-reset), ${nEntries} verse entries`);
  }
  return { entries, report };
}

function main() {
  const xmlPath = arg('--xml');
  const outPath = arg('--out');
  if (!xmlPath || !outPath) throw new Error('usage: poole-tcp.ts --xml=<A55363.xml> --out=<f.jsonl>');
  const xml = readFileSync(xmlPath, 'utf8');
  // License gate at the parser mouth — the CC0 grant must be present in THIS file.
  // (The human-readable phrase wraps across lines, so match the canonical deed URL.)
  if (!xml.includes('creativecommons.org/publicdomain/zero/1.0')) {
    throw new Error('FAIL CLOSED: CC0 grant not found in the TEI header — do not parse');
  }
  const { entries, report } = parsePooleVolume(xml);
  for (const r of report) console.log(' ', r);

  // Canon validation — fail closed on misalignment, don't ship it. An entry whose
  // (chapter, verse) doesn't exist in the KJV canon, or a duplicate verseId, is
  // evidence of a wrong boundary; those entries are DROPPED and counted, and the
  // whole parse aborts if they exceed 1% (that's structure failure, not noise).
  const canon = new Map(loadKjvCanon().map((b) => [b.book, b.verses]));
  const seen = new Set<number>();
  const clean: typeof entries = [];
  let outOfCanon = 0, dupes = 0;
  for (const e of entries) {
    const book = Math.floor(e.verseId / 1e6), ch = Math.floor((e.verseId % 1e6) / 1000), v = e.verseId % 1000;
    const chapters = canon.get(book);
    if (!chapters || ch < 1 || ch > chapters.length || v < 1 || v > chapters[ch - 1]!) { outOfCanon++; continue; }
    if (seen.has(e.verseId)) { dupes++; continue; }
    seen.add(e.verseId);
    clean.push(e);
  }
  const dropped = outOfCanon + dupes;
  console.log(`canon validation: ${clean.length} clean · ${outOfCanon} out-of-canon · ${dupes} duplicate verseIds (dropped ${((100 * dropped) / entries.length).toFixed(2)}%)`);
  if (dropped / entries.length > 0.01) {
    throw new Error(`FAIL CLOSED: ${dropped} misaligned entries (>1%) — structural parse failure, do not ship`);
  }
  writeFileSync(outPath, clean.map((e) => JSON.stringify(e)).join('\n') + '\n');
  const gaps = clean.filter((e) => e.content.includes('⟨…⟩')).length;
  console.log(`TOTAL: ${clean.length} entries → ${outPath} (${gaps} entries carry ⟨…⟩ lacunae, ${((100 * gaps) / clean.length).toFixed(1)}%)`);
}

if (process.argv[1] && /poole-tcp/.test(process.argv[1])) main();
