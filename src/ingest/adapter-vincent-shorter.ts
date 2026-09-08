// Thomas Vincent, "An Explanation of the Assembly's Shorter Catechism" —
// catechism-anchored splitter (manifest slug vincent-t-shorter-catechism).
//
//   npx tsx src/ingest/adapter-vincent-shorter.ts \
//     --txt=data/raw/archive/explanationofass00vinc_djvu.txt \
//     --out=data/raw/archive/vincent-t-shorter-catechism.jsonl
//
// Source: archive.org scan explanationofass00vinc (NYPL). Edition verified by
// READING the title page (2026-09-08): "AN EXPLANATION OF THE ASSEMBLY'S
// SHORTER CATECHISM BY THE REV. THOMAS VINCENT. PHILADELPHIA: PRESBYTERIAN
// BOARD OF PUBLICATION. NO. 265 CHESTNUT STREET." — no date printed;
// cataloged 1854 (archive.org metadata, corroborated). Author died 1678;
// PD. NOT Marvin R. Vincent (vincent-word-studies) — different person.
//
// ── Why this adapter exists ────────────────────────────────────────────────
// The edition prints the catechism questions AND Vincent's own sub-questions
// in an identical restarting "Q. N." format (Q. 1 … Q. 13 under catechism
// Q. 2, then Q. 1 … again under Q. 3), so no numbering-only rule can segment
// it — this is why the work was parked in the 2026-09-07 wave. The splitter
// below is anchored on the one invariant backbone: the Westminster Shorter
// Catechism's own 107 questions, in fixed text and order (WSC_QUESTIONS
// below, from the neutral reference at
// https://en.wikisource.org/wiki/Westminster_Shorter_Catechism — the 1647
// text is PD; only the question lines are used, as segmentation anchors).
// Vincent's exposition between two consecutive anchors is that question's
// body.
//
// ── Anchor rule (all fail-closed; bars pre-registered, not tuned) ──────────
// For k = 1..107, scan FORWARD from the previous anchor for a line that
// opens a Q-marker (OCR-tolerant: "Q.", "Q,", "^.", "O.", "Question", with
// up to one short junk token before it) and:
//   - its number parses and EQUALS k  → accept at trigram-Dice ≥ 0.55 vs the
//     canonical question k, OR
//   - its number is OCR-garbled (unparseable) → accept only at ≥ 0.85
//     (no number corroboration; a higher bar), counted as a weak anchor.
// First clearing candidate wins; none → abort naming k (missing anchor).
// Forward-only scanning makes out-of-order anchors abort by construction.
// Bars measured on the pinned file (2026-09-08): min accepted numbered
// similarity 0.600 (Q34), garbled-number anchors exactly two — Q66 1.000,
// Q68 0.864; max similarity among REJECTED (wrong-text) candidates 0.326.
// Match rate floor: 107/107 — anything less aborts. Observed: 107/107.
//
// Guards: ≤ 3 weak (garbled-number) anchors; every section body ≥ 80 chars
// (observed min 107 — the "Which is the Nth commandment?" recitals carry no
// sub-questions in this edition, so tiny bodies are the true shape); the
// author's dedication ("TO THE MASTERS AND GOVERNORS OF FAMILIES …",
// signature "T. VINCENT") is included as one front section; the publisher's
// Advertisement and the two commendatory epistles (signed by Mayo, Hicks,
// Veal, West, Lawrence, Chester, Sharp et al. — NOT Vincent) are excluded;
// body ends at "THE END." (NYPL library footer cut).
//
// Mechanical typography only: EOL-hyphen rejoin (beza precedent) and running
// head / signature-mark stripping ("N EXPLANATION OF THE", "EXPLANATION OF
// TH^ SHORTER CATECHISM.", "SHORTER CATECHISM. N", "N *"). OCR text is
// otherwise left exactly as scanned.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

// The 107 Westminster Shorter Catechism questions, fixed text and order —
// the segmentation backbone. PD (1647). Reference: en.wikisource.org
// /wiki/Westminster_Shorter_Catechism (read 2026-09-08).
export const WSC_QUESTIONS: readonly string[] = [
  'What is the chief end of man?',
  'What rule hath God given to direct us how we may glorify and enjoy him?',
  'What do the Scriptures principally teach?',
  'What is God?',
  'Are there more Gods than one?',
  'How many persons are there in the Godhead?',
  'What are the decrees of God?',
  'How doth God execute his decrees?',
  'What is the work of creation?',
  'How did God create man?',
  "What are God's works of providence?",
  'What special act of providence did God exercise toward man in the estate wherein he was created?',
  'Did our first parents continue in the estate wherein they were created?',
  'What is sin?',
  'What was the sin whereby our first parents fell from the estate wherein they were created?',
  "Did all mankind fall in Adam's first transgression?",
  'Into what estate did the fall bring mankind?',
  'Wherein consists the sinfulness of that estate whereinto man fell?',
  'What is the misery of that estate whereinto man fell?',
  'Did God leave all mankind to perish in the estate of sin and misery?',
  "Who is the Redeemer of God's elect?",
  'How did Christ, being the Son of God, become man?',
  'What offices doth Christ execute as our Redeemer?',
  'How doth Christ execute the office of a prophet?',
  'How doth Christ execute the office of a priest?',
  'How doth Christ execute the office of a king?',
  "Wherein did Christ's humiliation consist?",
  "Wherein consisteth Christ's exaltation?",
  'How are we made partakers of the redemption purchased by Christ?',
  'How doth the Spirit apply to us the redemption purchased by Christ?',
  'What is effectual calling?',
  'What benefits do they that are effectually called partake of in this life?',
  'What is justification?',
  'What is adoption?',
  'What is sanctification?',
  'What are the benefits which in this life do accompany or flow from justification, adoption, and sanctification?',
  'What benefits do believers receive from Christ at death?',
  'What benefits do believers receive from Christ at the resurrection?',
  'What is the duty which God requireth of man?',
  'What did God at first reveal to man for the rule of his obedience?',
  'Wherein is the moral law summarily comprehended?',
  'What is the sum of the ten commandments?',
  'What is the preface to the ten commandments?',
  'What doth the preface to the ten commandments teach us?',
  'Which is the first commandment?',
  'What is required in the first commandment?',
  'What is forbidden in the first commandment?',
  'What are we specially taught by these words, "before me," in the first commandment?',
  'Which is the second commandment?',
  'What is required in the second commandment?',
  'What is forbidden in the second commandment?',
  'What are the reasons annexed to the second commandment?',
  'Which is the third commandment?',
  'What is required in the third commandment?',
  'What is forbidden in the third commandment?',
  'What is the reason annexed to the third commandment?',
  'Which is the fourth commandment?',
  'What is required in the fourth commandment?',
  'Which day of the seven hath God appointed to be the weekly sabbath?',
  'How is the sabbath to be sanctified?',
  'What is forbidden in the fourth commandment?',
  'What are the reasons annexed to the fourth commandment?',
  'Which is the fifth commandment?',
  'What is required in the fifth commandment?',
  'What is forbidden in the fifth commandment?',
  'What is the reason annexed to the fifth commandment?',
  'Which is the sixth commandment?',
  'What is required in the sixth commandment?',
  'What is forbidden in the sixth commandment?',
  'Which is the seventh commandment?',
  'What is required in the seventh commandment?',
  'What is forbidden in the seventh commandment?',
  'Which is the eighth commandment?',
  'What is required in the eighth commandment?',
  'What is forbidden in the eighth commandment?',
  'Which is the ninth commandment?',
  'What is required in the ninth commandment?',
  'What is forbidden in the ninth commandment?',
  'Which is the tenth commandment?',
  'What is required in the tenth commandment?',
  'What is forbidden in the tenth commandment?',
  'Is any man able perfectly to keep the commandments of God?',
  'Are all transgressions of the law equally heinous?',
  'What doth every sin deserve?',
  'What doth God require of us, that we may escape his wrath and curse, due to us for sin?',
  'What is faith in Jesus Christ?',
  'What is repentance unto life?',
  'What are the outward and ordinary means whereby Christ communicateth to us the benefits of redemption?',
  'How is the Word made effectual to salvation?',
  'How is the Word to be read and heard, that it may become effectual to salvation?',
  'How do the sacraments become effectual means of salvation?',
  'What is a sacrament?',
  'Which are the sacraments of the New Testament?',
  'What is Baptism?',
  'To whom is Baptism to be administered?',
  "What is the Lord's Supper?",
  "What is required for the worthy receiving of the Lord's Supper?",
  'What is prayer?',
  'What rule hath God given for our direction in prayer?',
  "What doth the preface of the Lord's Prayer teach us?",
  'What do we pray for in the first petition?',
  'What do we pray for in the second petition?',
  'What do we pray for in the third petition?',
  'What do we pray for in the fourth petition?',
  'What do we pray for in the fifth petition?',
  'What do we pray for in the sixth petition?',
  "What doth the conclusion of the Lord's Prayer teach us?",
];

const ANCHOR_COUNT = 107;
const SIM_NUMBERED = 0.55; // number corroborates the text match
const SIM_GARBLED = 0.85; // number OCR-garbled: text match must stand alone
const MAX_GARBLED_ANCHORS = 3;
const MIN_SECTION_CHARS = 80;

export interface VincentRecord { key: string; text: string }
interface Anchor { k: number; line: number; sim: number; garbled: boolean }

// Running heads / signature marks — edition furniture, not text. The page
// number prefix is OCR-garbled in some heads (observed: "DO EXPLANATION OF
// THE" for "60 …", "•106 …", "I 20 …", "B22 …", "156 " …", "l3l"/"813" page
// numbers) so it is up to two short tokens; a trailing "." or "*" rides some
// ("…THE.", "…THE*"). The all-caps "EXPLANATION OF THE" / "SHORTER
// CATECHISM." shapes cannot occur in content lines.
const HEAD_RES = [
  /^\s*(?:\S{1,4}\s+){0,2}EXPLANATION\s+O[F P]\s+THE[.*]?\s*$/, // "20 EXPLANATION OF THE" and OCR variants
  /^\s*(?:\S{1,4}\s+){0,2}EXPLANATION\s+O[F P]\s+TH\S*\s+SHORTER\s+CATECHISM\.?\s*$/, // full-width head
  /^\s*SHORTER\s+CATECHISM\.?\s*\S{0,4}\s*$/, // "SHORTER CATECHISM. 223" (page no. may be OCR-garbled or absent)
  /^\s*\d{1,2}\s+\*\s*$/, // signature mark "31 *"
];

// Q-marker: OCR renders "Q." as Q/q/O/^ + . , ; — up to one short junk token
// before it (observed: "t  Q.  11."). Group 1 = number token, 2 = text.
const Q_MARKER = /^\s*(?:\S{1,3}\s+)?(?:[QqO^]\s*[.,;]|Question)\s*(\S{1,4})\s*[.,]\s*(.*\S)\s*$/;

function parseNum(tok: string): number | null {
  // tolerate OCR noise inside the digits (observed: "4:2" for 42)
  if (!/^[\d:.]{1,4}$/.test(tok)) return null;
  const d = tok.replace(/\D/g, '');
  return d ? parseInt(d, 10) : null;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function trigrams(s: string): Set<string> {
  const t = new Set<string>();
  for (let i = 0; i + 3 <= s.length; i++) t.add(s.slice(i, i + 3));
  return t;
}

function dice(a: string, b: string): number {
  const ta = trigrams(a), tb = trigrams(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  return (2 * inter) / (ta.size + tb.size);
}

// The candidate's question text: the marker line plus its wrapped
// continuation lines (running heads already stripped), stopping at the
// "A." answer line. Blank lines are skipped (page breaks interrupt wraps).
function candidateText(lines: string[], i: number): string {
  const parts = [lines[i]!.match(Q_MARKER)![2]!];
  let consumed = 0;
  for (let j = i + 1; j < lines.length && consumed < 8 && parts.join(' ').length < 400; j++) {
    const l = lines[j]!.trim();
    if (/^A\s*[.,]/.test(l)) break;
    if (l) { parts.push(l); consumed++; }
  }
  return parts.join(' ');
}

export function convert(body: string, questions: readonly string[] = WSC_QUESTIONS): VincentRecord[] {
  if (questions.length !== ANCHOR_COUNT) {
    throw new Error(`FAIL CLOSED: anchor list has ${questions.length} questions, expected ${ANCHOR_COUNT} — backbone corrupt`);
  }
  // Order matters: strip running heads BEFORE the EOL-hyphen rejoin — a head
  // interrupted mid-word ("…apostol- \nSHORTER CATECHISM. 29 \nical…") and
  // dehyphenating first fused the head into the content word (measured).
  // This OCR renders every line-break hyphen as "- \n" (1,449 occurrences,
  // zero bare "-\n"); after head removal the two halves sit across blank
  // lines, so the rejoin spans newlines. Typography only.
  const withoutHeads = body.split('\n').filter((l) => !HEAD_RES.some((r) => r.test(l)));
  const lines = withoutHeads.join('\n').replace(/-\s*\r?\n\s*/g, '').split('\n');
  const nq = questions.map(norm);

  // ── the anchor scan: 107 anchors, in order, forward-only ─────────────────
  const anchors: Anchor[] = [];
  let cursor = 0;
  for (let k = 1; k <= ANCHOR_COUNT; k++) {
    let found: Anchor | null = null;
    for (let i = cursor; i < lines.length; i++) {
      const m = lines[i]!.match(Q_MARKER);
      if (!m) continue;
      const num = parseNum(m[1]!);
      if (num !== null && num !== k) continue;
      const cand = norm(candidateText(lines, i));
      const sim = dice(nq[k - 1]!, cand.slice(0, Math.ceil(nq[k - 1]!.length * 1.35)));
      const bar = num === k ? SIM_NUMBERED : SIM_GARBLED;
      if (sim >= bar) { found = { k, line: i, sim, garbled: num === null }; break; }
    }
    if (!found) {
      throw new Error(
        `FAIL CLOSED: anchor ${k} ("${questions[k - 1]!.slice(0, 60)}…") not found after line ${cursor} ` +
        `(bar ${SIM_NUMBERED}/${SIM_GARBLED}) — anchor sequence broken, refusing to guess`,
      );
    }
    anchors.push(found);
    cursor = found.line + 1;
  }
  const garbled = anchors.filter((a) => a.garbled);
  if (garbled.length > MAX_GARBLED_ANCHORS) {
    throw new Error(`FAIL CLOSED: ${garbled.length} garbled-number anchors (> ${MAX_GARBLED_ANCHORS}) — OCR drift beyond the measured shape`);
  }

  // ── boundaries: dedication, back-matter cut ──────────────────────────────
  const dedAt = lines.findIndex((l) => /^\s*TO\s+THE\s+MASTERS\s+AND\s+GOVERNORS\s+OF\s+FAMILIES/.test(l));
  if (dedAt < 0 || dedAt >= anchors[0]!.line) {
    throw new Error('FAIL CLOSED: author dedication heading ("TO THE MASTERS AND GOVERNORS OF FAMILIES") not found before anchor 1');
  }
  const bookHeadAt = lines.findIndex((l, i) => i > dedAt && i < anchors[0]!.line && /^\s*AN\s+EXPLANATION\s*$/.test(l));
  if (bookHeadAt < 0) throw new Error('FAIL CLOSED: book heading ("AN EXPLANATION") not found between dedication and anchor 1 — structure drift');
  const endAt = lines.findIndex((l, i) => i > anchors[ANCHOR_COUNT - 1]!.line && /^\s*THE\s+END\.?\s*$/.test(l));
  if (endAt < 0) throw new Error('FAIL CLOSED: back-matter cut "THE END." not found after anchor 107 — incomplete scan');

  const clean = (seg: string[]) =>
    seg.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  const records: VincentRecord[] = [];
  const dedication = clean(lines.slice(dedAt, bookHeadAt));
  if (!/T\.?\s+VINCENT/i.test(dedication)) {
    throw new Error('FAIL CLOSED: dedication lacks the "T. VINCENT" signature — attribution boundary unclear');
  }
  records.push({ key: 'To the Masters and Governors of Families (dedication)', text: dedication });

  for (let a = 0; a < anchors.length; a++) {
    const from = anchors[a]!.line;
    const to = a + 1 < anchors.length ? anchors[a + 1]!.line : endAt;
    const text = clean(lines.slice(from, to));
    if (text.length < MIN_SECTION_CHARS) {
      throw new Error(`FAIL CLOSED: section Q.${anchors[a]!.k} body ${text.length} chars (< ${MIN_SECTION_CHARS}) — incomplete parse`);
    }
    records.push({ key: `Q. ${anchors[a]!.k}. ${questions[a]!}`, text });
  }

  const minSim = Math.min(...anchors.map((a) => a.sim));
  console.error(
    `anchors: ${anchors.length}/${ANCHOR_COUNT} matched in order (floor ${ANCHOR_COUNT}/${ANCHOR_COUNT}); ` +
    `garbled-number: ${garbled.map((g) => `Q${g.k}@${g.sim.toFixed(2)}`).join(', ') || 'none'}; ` +
    `min sim ${minSim.toFixed(3)} (bars ${SIM_NUMBERED}/${SIM_GARBLED})`,
  );
  return records;
}

function main() {
  const txtPath = arg('--txt');
  const outPath = arg('--out');
  if (!txtPath || !outPath) throw new Error('usage: adapter-vincent-shorter.ts --txt=<f> --out=<f>');
  const records = convert(readFileSync(txtPath, 'utf8'));
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(`vincent-t-shorter-catechism → ${records.length} sections → ${outPath}`);
}

if (process.argv[1] && /adapter-vincent-shorter/.test(process.argv[1])) {
  try {
    main();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
