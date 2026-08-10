// archive.org Ryle "Expository Thoughts" profile — the first build under
// ADR-110's Fork A/B rulings (2026-08-08).
//
//   npx tsx src/ingest/adapter-archive-ryle.ts \
//     --slug=ryle-expository-matthew \
//     --identifier=expositorythough01ryle --cross=expositorythoug04rylegoog
//
// FORK A (the fresh-work text-match proof): a fresh OCR ingest proves it is the
// claimed PD edition by cross-copy containment — 3-gram shingle hashes of each
// parsed section must appear in a SECOND, independent scan of the same edition
// at or above the CALIBRATED threshold (29.1%, midpoint of the measured gap:
// same-edition p10 40.7% vs different-work max 17.5%; evidence
// docs/evidence/p40-prep-2026-08-08/archive-crosscopy-calibration-2026-08-08.txt).
// The title-page guard runs first — two nights were once lost matching
// Ryle-on-JOHN against Ryle-on-LUKE.
//
// FORK B (staged-only): this profile, like the thayers profile, writes NO
// database rows. Output is a JSONL of verse-anchored entries plus a validation
// report; staging is a separate, later step, and publishing requires the
// alignment validation pass a human signs.
//
// FAIL CLOSED (throw with a precise, quotable reason — the quarantine record):
//   - the two scans do not title-guard as the same gospel
//   - fewer sections than the floor (structure not recognized)
//   - any parsed range outside the gospel's real verse counts (misread roman
//     numerals attribute words to the wrong verse — the one thing this product
//     must never do)
//   - fewer than 90% of sections cross-validated at the calibrated threshold
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fetchArchiveDjvu } from './adapter-archive.js';
import { sanitizeForIngest } from './content-sanity.js';
import {
  shingleHashSetOcr,
  containment,
  titleGuardAgrees,
  type Gospel,
} from './resource-textmatch.js';
import { encodeVerseId, isStructurallyValidVerseId } from '../../web/src/bible/verse-id.js';
import { BOOKS } from '../../web/src/bible/books.js';

/** Midpoint of the measured same-edition/different-work gap (see header). */
export const CALIBRATED_SECTION_THRESHOLD = 0.291;
/** Fraction of parsed sections that must cross-validate. */
const CROSS_VALIDATED_FLOOR = 0.9;
/** Structure floors — a full single-Gospel volume, not a fragment. */
const MIN_SECTIONS = 50;
const MIN_CHAPTERS = 20;

const GOSPEL_BOOK: Record<Gospel, number> = { MATTHEW: 40, MARK: 41, LUKE: 42, JOHN: 43 };

function romanToInt(r: string): number | null {
  const s = r.toUpperCase().replace(/L(?=L|$)/g, 'I'); // "Ill" → "III" OCR heuristic
  const map: Record<string, number> = { I: 1, V: 5, X: 10 };
  let total = 0;
  let prev = 0;
  for (const ch of s.split('').reverse()) {
    const v = map[ch];
    if (v === undefined) return null;
    if (v < prev) total -= v;
    else { total += v; prev = v; }
  }
  return total >= 1 && total <= 28 ? total : null;
}

export interface RyleSection {
  chapter: number;
  vStart: number;
  vEnd: number;
  text: string;
}

/** Parse a Ryle gospel scan into passage sections keyed "chapter:vStart".
 *  Header shape: `MATTHEW  I.  1—17.` on its own line; running headers
 *  (`MATTHEW,  CHAP.  I.`) carry no verse range and never match. A header
 *  followed by <200 chars of body is the TOC entry, skipped. */
export function sectionizeRyle(text: string, gospel: Gospel): RyleSection[] {
  const header = new RegExp(`^\\s*${gospel}\\s+([IVXLl]{1,6})\\.?\\s+(\\d{1,2})\\s*[-—.]\\s*(\\d{1,2})\\.?\\s*$`);
  const out: RyleSection[] = [];
  const seen = new Set<string>();
  let cur: { chapter: number; vStart: number; vEnd: number } | null = null;
  let body: string[] = [];
  const flush = () => {
    const text = body.join('\n').trim();
    if (cur && text.length >= 200) {
      const key = `${cur.chapter}:${cur.vStart}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ ...cur, text: sanitizeForIngest(text) });
      }
    }
  };
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(header);
    if (m) {
      flush();
      const chapter = romanToInt(m[1]!);
      cur = chapter === null ? null : { chapter, vStart: Number(m[2]), vEnd: Number(m[3]) };
      body = [];
    } else if (cur) {
      body.push(line);
    }
  }
  flush();
  return out;
}

const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

async function main() {
  const slug = arg('--slug');
  const identifier = arg('--identifier');
  const cross = arg('--cross');
  if (!slug || !identifier || !cross) {
    throw new Error('usage: adapter-archive-ryle.ts --slug=<slug> --identifier=<archive id> --cross=<archive id of a SECOND scan>');
  }
  const cacheDir = path.join('data/raw/archive', slug);
  const primary = await fetchArchiveDjvu(identifier, cacheDir);
  const partner = await fetchArchiveDjvu(cross, cacheDir);

  // ── the title-page guard, before any number means anything ───────────────
  const guard = titleGuardAgrees(primary, partner);
  if (!guard.ok || !guard.a) {
    throw new Error(`title-page guard: scans do not agree on the work (${JSON.stringify(guard)}). Matching nothing.`);
  }
  const gospel = guard.a.gospel;
  const book = GOSPEL_BOOK[gospel];
  const bookRow = BOOKS.find((b) => b.bookNum === book);
  if (!bookRow) throw new Error(`no canonical book row for ${gospel}`);
  console.log(`work: ${gospel} (book ${book}, ${bookRow.chapterCount} chapters) — guard agrees`);

  // ── structure: parse the passage sections ────────────────────────────────
  const sections = sectionizeRyle(primary, gospel);
  const chapters = new Set(sections.map((s) => s.chapter));
  if (sections.length < MIN_SECTIONS) {
    throw new Error(`only ${sections.length} sections parsed (< ${MIN_SECTIONS}) — structure not recognized`);
  }
  if (chapters.size < MIN_CHAPTERS) {
    throw new Error(`sections span only ${chapters.size} chapters (< ${MIN_CHAPTERS}) — a fragment, not a volume`);
  }

  // ── every range must be REAL verses — a misread roman attributes one
  // author's words to the wrong verse; fail the whole work, never guess ──────
  const bad = sections.filter((s) =>
    s.chapter < 1 || s.chapter > bookRow.chapterCount ||
    s.vStart < 1 || s.vEnd < s.vStart ||
    !isStructurallyValidVerseId(encodeVerseId({ book, chapter: s.chapter, verse: s.vStart })) ||
    !isStructurallyValidVerseId(encodeVerseId({ book, chapter: s.chapter, verse: s.vEnd })),
  );
  if (bad.length > 0) {
    throw new Error(`${bad.length} section(s) parse to impossible verses (e.g. ch ${bad[0]!.chapter} v${bad[0]!.vStart}-${bad[0]!.vEnd}) — refusing to attribute on a broken parse`);
  }

  // ── FORK A: cross-copy validation at the calibrated threshold ────────────
  const partnerSections = sectionizeRyle(partner, gospel);
  const partnerBy = new Map(partnerSections.map((s) => [`${s.chapter}:${s.vStart}`, s]));
  const partnerAll = shingleHashSetOcr(partner);
  let validated = 0;
  const scores: number[] = [];
  const failures: string[] = [];
  for (const s of sections) {
    const key = `${s.chapter}:${s.vStart}`;
    const mine = shingleHashSetOcr(s.text);
    const twin = partnerBy.get(key);
    // FORK A asks a ONE-directional question: is MY section present in the
    // second scan? min(both directions) punishes chunk-size asymmetry — the
    // partner merging several of our sections into one (a missed header) is
    // not evidence of a different edition. Measured on 12:1: 86.4% one-way vs
    // 13.2% reverse on a 46k-char merged twin. Prefer the paired section;
    // fall back to the whole partner scan (a header mangled on one side must
    // not sink a genuine section).
    const score = Math.max(
      twin ? containment(mine, shingleHashSetOcr(twin.text)) : 0,
      containment(mine, partnerAll),
    );
    scores.push(score);
    if (score >= CALIBRATED_SECTION_THRESHOLD) validated++;
    else if (failures.length < 8) failures.push(`${key}=${(100 * score).toFixed(1)}%`);
  }
  scores.sort((a, b) => a - b);
  const median = scores[Math.floor(scores.length / 2)]!;
  const rate = validated / sections.length;
  console.log(`cross-copy: ${validated}/${sections.length} sections ≥ ${(100 * CALIBRATED_SECTION_THRESHOLD).toFixed(1)}% (median ${(100 * median).toFixed(1)}%)`);
  if (rate < CROSS_VALIDATED_FLOOR) {
    throw new Error(`cross-copy validation ${(100 * rate).toFixed(1)}% < ${(100 * CROSS_VALIDATED_FLOOR)}% floor — this scan does not prove itself against the second copy. Lowest: ${failures.join(', ')}`);
  }

  // ── emit: JSONL + report, NO database writes (Fork B: staged comes later) ─
  const jsonlPath = path.join(cacheDir, `${slug}.jsonl`);
  const lines = sections.map((s) => JSON.stringify({
    key: `${gospel.toLowerCase()}-${s.chapter}-${s.vStart}-${s.vEnd}`,
    verseIdStart: encodeVerseId({ book, chapter: s.chapter, verse: s.vStart }),
    verseIdEnd: encodeVerseId({ book, chapter: s.chapter, verse: s.vEnd }),
    text: s.text,
  }));
  writeFileSync(jsonlPath, lines.join('\n') + '\n');
  const report = {
    slug, identifier, cross, gospel,
    sections: sections.length,
    chapters: chapters.size,
    crossValidatedPct: Number((100 * rate).toFixed(1)),
    medianContainmentPct: Number((100 * median).toFixed(1)),
    thresholdPct: 100 * CALIBRATED_SECTION_THRESHOLD,
    output: jsonlPath,
  };
  writeFileSync(path.join(cacheDir, `${slug}.report.json`), JSON.stringify(report, null, 2));
  console.log(`OK — ${sections.length} sections across ${chapters.size} chapters, cross-validated ${report.crossValidatedPct}%. JSONL: ${jsonlPath}`);
  console.log('Fork B: NO database writes. Staging is a later step; publish needs the alignment validation pass a human signs.');
}

if (process.argv[1] && /adapter-archive-ryle/.test(process.argv[1])) {
  main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
