// Suetonius, "The Lives of the Twelve Caesars" (Thomson 1796, rev. Forester
// 1855) — Gutenberg #6400 → historian-contract JSONL ({path, content}) for
// ingest-historian.ts. Historians are deliberately EXCLUDED from the adapter
// loop (adapter-loop.ts:96-99 — they ride the sections write-contract, not
// the register store), so the gutenberg fetch machinery is reused but the
// sectioning and the ingest are the historian path's.
//
//   npx tsx src/ingest/gutenberg-suetonius.ts \
//     --txt=data/raw/gutenberg/6400.txt --out=data/raw/gutenberg/suetonius.jsonl
//
// Edition verified by READING the title page and the editor's preface
// (2026-09-07): "The Translation of Alexander Thomson, M.D. Revised and
// corrected by T. Forester, Esq., A.M." and "Of the English translations,
// that of Dr. Alexander Thomson, published in 1796, has been made the basis
// of the present."
//
// Scope: the TWELVE CAESARS only (the volume's own part I). The bundled
// Lives of the Grammarians, Rhetoricians and Poets (the volume's parts
// II-III) and the collected FOOTNOTES block are excluded — translator/editor
// apparatus and separate works, recorded in the manifest note.
//
// Structure (surveyed on the file): all 12 lives open with an ALL-CAPS
// heading ("CAIUS JULIUS CASAR." … "TITUS FLAVIUS DOMITIANUS." — Vespasian
// is "T. FLAVIUS …", Titus "TITUS FLAVIUS …"). Between each life and the
// next heading the etext interleaves the EDITOR'S literary summary of the
// reign (Thomson/Forester's review of the reign's authors — Vesuvius,
// Pliny's Natural History, etc.), marked off by a "* * *" separator line.
// Those summaries are non-authorial apparatus: each life's slice TRUNCATES
// at its first separator line. Chapters are the source's own roman-numeral
// paragraphs ("I.", "II.", … restarting per life), sometimes carrying a
// parenthetical page ref prefix ("(466) III.").
//
// Apparatus removed as non-content: bare numeric footnote markers [3] and
// Forester's parenthetical section cross-refs (71). Bracketed TEXT
// ("[the 13th of September]") is translator content and stays.
//
// FAIL CLOSED: any of the 12 headings missing or out of order, a life
// with <3 chapters, or <300 chapters total throws.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { stripBoilerplate } from './adapter-gutenberg.js';

const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

const CHAPTER_FLOOR = 300;

interface HistNode { path: string[]; content: string }

// [heading text in the etext, display name] in document order.
const LIVES: Array<{ heading: string; name: string }> = [
  { heading: 'CAIUS JULIUS CASAR.', name: 'Julius Caesar' },
  { heading: 'D. OCTAVIUS CAESAR AUGUSTUS.', name: 'Augustus' },
  { heading: 'TIBERIUS NERO CAESAR.', name: 'Tiberius' },
  { heading: 'CAIUS CAESAR CALIGULA.', name: 'Caligula' },
  { heading: 'TIBERIUS CLAUDIUS DRUSUS CAESAR.', name: 'Claudius' },
  { heading: 'NERO CLAUDIUS CAESAR.', name: 'Nero' },
  { heading: 'SERGIUS SULPICIUS GALBA.', name: 'Galba' },
  { heading: 'A.  SALVIUS OTHO.', name: 'Otho' },
  { heading: 'AULUS VITELLIUS.', name: 'Vitellius' },
  { heading: 'T. FLAVIUS VESPASIANUS AUGUSTUS.', name: 'Vespasian' },
  { heading: 'TITUS FLAVIUS VESPASIANUS AUGUSTUS.', name: 'Titus' },
  { heading: 'TITUS FLAVIUS DOMITIANUS.', name: 'Domitian' },
];

// Roman numerals I–CI (the longest life, Augustus, has 101 chapters).
const ROMAN = '(?:C|XC|X?L|L?X{0,3})(?:IX|IV|V?I{0,3})?';
const SEPARATOR = /^[ \t]*\*[ \t]*(\*[ \t]*){4,}$/m;
// The editor's essay after JULIUS is the one boundary in the volume with no
// "* * *" separator; it opens with this exact line (verified on the etext).
const JULIUS_ESSAY = '(56) [104] The termination of the civil war';

function clean(text: string): string {
  return text
    .replace(/\[\d+\]/g, '') // bare footnote markers — the notes themselves are excluded
    .replace(/\(\d+\)/g, '') // Forester's section cross-references
    .replace(/^[ \t]*\*[ \t]*(\*[ \t]*){4,}$/gm, ' ') // "* * *" separators
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function splitLives(body: string): Array<{ name: string; text: string }> {
  // Locate the 12 headings in order, then truncate each life at its first
  // "* * *" separator — everything past it is the editor's literary summary
  // of the reign (non-authorial apparatus), not Suetonius.
  const bounds: Array<{ name: string; at: number }> = [];
  let cursor = 0;
  for (const life of LIVES) {
    const at = body.indexOf(life.heading, cursor);
    if (at < 0) throw new Error(`FAIL CLOSED: heading "${life.heading}" not found after offset ${cursor} — structure drift`);
    bounds.push({ name: life.name, at });
    cursor = at + life.heading.length;
  }
  const end = body.indexOf('LIVES OF EMINENT GRAMMARIANS', cursor);
  if (end < 0) throw new Error('FAIL CLOSED: end of the Caesars (Grammarians heading) not found');

  const lives: Array<{ name: string; text: string }> = [];
  for (let i = 0; i < bounds.length; i++) {
    const from = bounds[i]!.at;
    let to = i + 1 < bounds.length ? bounds[i + 1]!.at : end;
    const sepMatch = body.slice(from, to).match(SEPARATOR);
    if (sepMatch && sepMatch.index !== undefined) to = from + sepMatch.index;
    if (bounds[i]!.name === 'Julius Caesar') {
      const essay = body.indexOf(JULIUS_ESSAY, from);
      if (essay < 0 || essay >= to) throw new Error('FAIL CLOSED: Julius essay boundary not found — structure drift');
      to = Math.min(to, essay);
    }
    lives.push({ name: bounds[i]!.name, text: body.slice(from, to) });
  }
  return lives;
}

export function splitChapters(lifeName: string, lifeText: string): HistNode[] {
  // Chapter numerals open a paragraph: "I.  Julius Caesar, the Divine…",
  // sometimes with a parenthetical page-ref prefix: "(466) III.  While yet…".
  const marker = new RegExp(`^(?:\\(\\d+\\)\\s*)?(${ROMAN})\\.\\s{1,3}`, 'gm');
  const cuts: number[] = [];
  for (const m of lifeText.matchAll(marker)) cuts.push(m.index!);

  const segments: string[] = [];
  if (cuts.length === 0) {
    segments.push(lifeText);
  } else {
    segments.push(lifeText.slice(0, cuts[0]!)); // heading residue
    for (let i = 0; i < cuts.length; i++) {
      segments.push(lifeText.slice(cuts[i]!, i + 1 < cuts.length ? cuts[i + 1]! : lifeText.length));
    }
  }

  const nodes: HistNode[] = [];
  for (const seg of segments) {
    // Drop the chapter numeral (and any page-ref prefix); heading residue
    // ("CAIUS JULIUS CASAR.") falls to the 100-char floor.
    const text = clean(seg.replace(new RegExp(`^(?:\\(\\d+\\)\\s*)?(${ROMAN})\\.\\s{1,3}`), ''));
    if (text.length < 100) continue;
    nodes.push({
      path: ['The Lives of the Twelve Caesars', lifeName, `Chapter ${nodes.length + 1}`],
      content: text,
    });
  }
  if (nodes.length < 3) {
    throw new Error(`FAIL CLOSED: ${lifeName} yielded only ${nodes.length} chapters — structure drift`);
  }
  return nodes;
}

function main() {
  const txtPath = arg('--txt') ?? 'data/raw/gutenberg/6400.txt';
  const outPath = arg('--out') ?? 'data/raw/gutenberg/suetonius.jsonl';
  const body = stripBoilerplate(readFileSync(txtPath, 'utf8'));

  const nodes: HistNode[] = [];
  for (const life of splitLives(body)) {
    const chapters = splitChapters(life.name, life.text);
    nodes.push(...chapters);
    console.log(`${life.name}: ${chapters.length} chapters`);
  }
  if (nodes.length < CHAPTER_FLOOR) {
    throw new Error(`FAIL CLOSED: only ${nodes.length} chapters (< ${CHAPTER_FLOOR}) — incomplete parse`);
  }
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, nodes.map((n) => JSON.stringify(n)).join('\n') + '\n');
  console.log(`suetonius-twelve-caesars → ${nodes.length} chapters → ${outPath}`);
}

if (process.argv[1] && /gutenberg-suetonius/.test(process.argv[1])) {
  try {
    main();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
