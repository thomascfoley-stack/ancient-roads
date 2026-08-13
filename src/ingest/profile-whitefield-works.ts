// whitefield-works sermon-segmentation profile (corpus-backlog Phase 4).
//
// The manifest entry (ingest/sources.config.json, acquire.adapter "gutenberg",
// ebook_id 68976) names ONLY Vol 1 of the 1771 Dilly edition — and Vol 1
// contains zero sermons (Advertisement + 497 letters). That is why the A6 run
// of 2026-07-18 quarantined the entry: "no clean sermon-boundary markers". The
// sermons of the 1771 Works live in Vols 5–6 (SERMON I–LIX, 59 sermons, each
// with a scripture motto); Vols 1–4 are letters, journals-adjacent pieces, and
// the polemical tracts.
//
// All six volumes are on Project Gutenberg as clean PD text (verified
// 2026-08-13, gutendex): vol 1 #68976, vol 2 #71140, vol 3 #73012,
// vol 4 #73267, vol 5 #77034, vol 6 #77041. The profile is therefore
// VOLUME-PARAMETERIZED: the same detector runs over every volume; vols 1–4
// yield zero sermons by construction (that absence IS the negative control),
// vols 5–6 yield the 59 sermons.
//
// Sermon boundary rule (body of vols 5–6):
//   - a standalone, blank-surrounded heading line  SERMON <ROMAN>.
//   - title lines (may wrap over several lines, may carry a "Preached at…"
//     subtitle) up to the stated-ref line,
//   - a stated-ref line  BOOK <roman-chapter>. <verses>.  — variants seen in
//     the edition: "PSALM, cvii. 30, 31." (comma after book), verse lists
//     ("ECCLESIASTES iv. 9, 10, 11, 12."), figure-dash ranges ("MATTHEW iv.
//     1‒11."), a roman-numeral verse ("ECCLESIASTES xii. I."), an open range
//     ("MATTHEW viii. 23, to the End."), and a footnote dagger
//     ("MATTHEW xxvi. 75.¹"),
//   - the italic motto paragraph and the prose body, ending at the next SERMON
//     heading or the volume end marker ("END of the FIFTH VOLUME." / "FINIS.").
//
// Output shape follows the sermon register (ingest-sermon.ts): heading
// "<Title> — <normalized stated ref>", one RegisterSection per sermon
// (register-writer chunks at REGISTER_EMBED_MAX for the flat store), the
// stated ref as the section's verse anchor. Letters, tracts, the Orphan-House
// account, prefaces, and the CONTENTS pages are never emitted as sections.
//
// This module is pure (no I/O beyond the shared fetchers): the CLI in
// ingest-whitefield-works.ts prints the dry-run report and is the only writer.

import { parseRef } from '../bible/ref-parse.js';
import { fetchGutenberg, stripBoilerplate } from './adapter-gutenberg.js';
import type { RegisterSection } from './register-writer.js';

export interface Volume { vol: number; ebookId: number }
// The 1771 Dilly edition on PG. Vol 1 is the id the manifest names.
export const VOLUMES: Volume[] = [
  { vol: 1, ebookId: 68976 },
  { vol: 2, ebookId: 71140 },
  { vol: 3, ebookId: 73012 },
  { vol: 4, ebookId: 73267 },
  { vol: 5, ebookId: 77034 },
  { vol: 6, ebookId: 77041 },
];
export const EXPECTED_SERMONS = 59; // SERMON I–LIX across vols 5–6, per the volumes' own CONTENTS pages

// ── boundary patterns ──
// Standalone body heading. The CONTENTS pages list "⭘ SERMON I. <title…>"
// inline, so they never match; vol 4's tract "...in ANSWER to his SERMON,
// ENTITULED FREE-GRACE" is a wrapped multi-line heading, never standalone.
const SERMON_HEADING = /^\s*SERMON\s+([IVXLCDM]+)\.\s*$/;
// Stated-ref line, matched loosely and normalized afterwards. ALL-CAPS book
// (optionally numbered), roman chapter, then a verse spec we parse ourselves.
const STATED_REF = /^\s*((?:[1-3]\s+)?[A-Z][A-Z]+),?\.?\s+([ivxlc]+)\.\s+(.+?)\s*[¹²³⁴†‡*♦]*\.?\s*$/;
// Non-sermon units, for the negative control only (never emitted).
const LETTER_HEADING = /^\s*LETTER\s+♦?\[?[IVXLCDM]+\.?\]?\.\s*$/;
const VOL_END = /^\s*(END of the (FIFTH|SIXTH) VOLUME\.|FINIS\.)\s*$/;

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
export function romanToInt(s: string): number | null {
  let n = 0;
  const t = s.toLowerCase();
  for (let i = 0; i < t.length; i++) {
    const c = ROMAN[t[i]!];
    if (!c) return null;
    const nx = ROMAN[t[i + 1]!] ?? 0;
    n += c < nx ? -c : c;
  }
  return n || null;
}

export interface Sermon {
  vol: number;
  numeral: string; // edition's own sermon number, I–LIX
  title: string;
  statedRefRaw: string; // as printed, e.g. "PSALM, cvii. 30, 31."
  statedRef: string; // normalized, e.g. "Psalm 107:30-31"
  anchors: Array<{ verseIdStart: number; verseIdEnd: number }>;
  body: string; // motto paragraph + prose, heading excluded
  openRange: boolean; // "…, to the End." — anchored on the first verse only
}

// Normalize the verse spec of a stated-ref line: "10, 11" → [10, 11],
// "1‒6" → [1, 6], "I" → [1], "23, to the End" → [23] + openRange.
function parseVerseSpec(spec: string): { verses: number[]; openRange: boolean } | null {
  const cleaned = spec.replace(/[¹²³⁴†‡*♦]/g, '').replace(/\.\s*$/, '').trim();
  const openRange = /,\s*to the End\.?$/i.test(cleaned);
  const core = openRange ? cleaned.replace(/,\s*to the End\.?$/i, '') : cleaned;
  const verses: number[] = [];
  for (const tok of core.split(/\s*[-–‒,]\s*/)) {
    if (!tok) continue;
    const v = /^\d+$/.test(tok) ? Number(tok) : /^[IVXLC]+$/.test(tok) ? romanToInt(tok) : null;
    if (!v) return null;
    verses.push(v);
  }
  return verses.length ? { verses, openRange } : null;
}

const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\w/g, (c) => c.toUpperCase());

// Segment ONE volume's plain text into sermons. Volumes with no sermons
// (1–4) return []. Throws if a SERMON heading has no parseable stated ref
// within its title window — structure not recognized, fail closed.
export function segmentVolume(vol: number, rawText: string): Sermon[] {
  const body = stripBoilerplate(rawText);
  const lines = body.split('\n');
  const heads: number[] = [];
  for (let i = 0; i < lines.length; i++) if (SERMON_HEADING.test(lines[i]!)) heads.push(i);
  const out: Sermon[] = [];
  for (let h = 0; h < heads.length; h++) {
    const start = heads[h]!;
    const numeral = lines[start]!.trim().match(SERMON_HEADING)![1]!;
    let end = h + 1 < heads.length ? heads[h + 1]! : lines.length;
    for (let i = start + 1; i < end; i++) if (VOL_END.test(lines[i]!)) { end = i; break; }
    // Title = the first blank-line-bounded block after the heading (wraps over
    // several lines; a "Preached at…" subtitle is its own block and stays in
    // the body). The stated-ref line usually follows the title block directly,
    // but SERMON XXVI carries a whole dedication letter ("To the INHABITANTS of
    // SAVANNAH… GEORGE WHITEFIELD.") between title and motto, so the ref
    // search window is wide. Everything between title block and sermon end is
    // body — dedication, motto, prose — minus the ref line itself, which the
    // heading and anchor already represent.
    let refAt = -1;
    let refM: RegExpMatchArray | null = null;
    const titleLines: string[] = [];
    let i = start + 1;
    while (i < end && !lines[i]!.trim()) i++;
    for (; i < end; i++) {
      const l = lines[i]!.trim();
      if (!l) break; // end of the title block
      const m = l.match(STATED_REF);
      if (m && romanToInt(m[2]!) && parseVerseSpec(m[3]!)) { refAt = i; refM = m; break; }
      titleLines.push(l);
    }
    const titleEnd = i;
    if (refAt < 0) {
      for (let j = titleEnd + 1; j < Math.min(titleEnd + 120, end); j++) {
        const m = lines[j]!.trim().match(STATED_REF);
        if (m && romanToInt(m[2]!) && parseVerseSpec(m[3]!)) { refAt = j; refM = m; break; }
      }
    }
    if (refAt < 0 || !refM) throw new Error(`vol ${vol} SERMON ${numeral}: no parseable stated ref after the title block — structure not recognized`);
    const { verses, openRange } = parseVerseSpec(refM[3]!)!;
    const book = `${refM[1]!.trim()} ${romanToInt(refM[2]!)}`;
    const vStart = verses[0]!;
    const vEnd = openRange ? vStart : verses[verses.length - 1]!;
    const statedRef = `${titleCase(book)}:${vStart}${vEnd > vStart ? `-${vEnd}` : ''}`;
    const parsed = parseRef(statedRef.toLowerCase());
    if (!parsed.ok) throw new Error(`vol ${vol} SERMON ${numeral}: stated ref "${statedRef}" failed to parse: ${parsed.reason}`);
    const bodyLines = lines.slice(titleEnd + 1, end).filter((_, k) => titleEnd + 1 + k !== refAt);
    const sermonBody = bodyLines.join('\n').replace(/[ \t]{2,}/g, ' ').trim();
    out.push({
      vol, numeral,
      title: titleLines.join(' ').replace(/[ \t]{2,}/g, ' ').replace(/[|_]/g, ''),
      statedRefRaw: lines[refAt]!.trim(),
      statedRef,
      anchors: parsed.ref.ranges.map((r) => ({ verseIdStart: r.start, verseIdEnd: r.end })),
      body: sermonBody,
      openRange,
    });
  }
  return out;
}

// ── negative-control detectors (never emitted as sections) ──
export function countLetters(rawText: string): number {
  const body = stripBoilerplate(rawText);
  return body.split('\n').filter((l) => LETTER_HEADING.test(l)).length;
}
// Vol 4's "INDEX TO THE TRACTS" entries end in a standalone "page N" line.
export function tractIndexEntries(rawText: string): string[] {
  const body = stripBoilerplate(rawText);
  const m = body.match(/INDEX\s*\n\s*TO THE\s*\n\s*TRACTS\./);
  if (!m) return [];
  const block = body.slice(m.index!);
  const entries: string[] = [];
  let cur: string[] = [];
  for (const l of block.split('\n')) {
    const t = l.trim().replace(/\|/g, '');
    if (/^page\s+\d+\.?$/.test(t)) {
      const e = cur.join(' ').replace(/[ \t]{2,}/g, ' ').replace(/^[_ ]+|[_ ]+$/g, '').trim();
      if (e) entries.push(e);
      cur = [];
    } else if (t && !/^INDEX|TO THE|TRACTS\.$/.test(t)) cur.push(t);
  }
  return entries;
}

// CONTENTS-page sermon titles ("⭘ SERMON I. <title>") — the expected list the
// detected sermons are checked against. Titles may wrap; we keep first-line
// text only (enough to name them; the numeral sequence is the strict check).
export function tocSermons(rawText: string): Array<{ numeral: string; title: string }> {
  const body = stripBoilerplate(rawText);
  const out: Array<{ numeral: string; title: string }> = [];
  for (const l of body.split('\n')) {
    const m = l.trim().match(/^⭘\s*[♦*]?SERMON\s+([IVXLCDM]+)\.\s*(.+)$/);
    if (m) out.push({ numeral: m[1]!, title: m[2]!.replace(/[|_]/g, '').trim() });
  }
  return out;
}

export interface SegmentationResult {
  sermons: Sermon[];
  sections: RegisterSection[];
  perVolume: Array<{ vol: number; ebookId: number; sermons: number; letters: number; tracts: string[]; toc: Array<{ numeral: string; title: string }> }>;
}

export async function segmentWhitefieldWorks(): Promise<SegmentationResult> {
  const perVolume: SegmentationResult['perVolume'] = [];
  const sermons: Sermon[] = [];
  for (const { vol, ebookId } of VOLUMES) {
    const raw = await fetchGutenberg(ebookId);
    const found = segmentVolume(vol, raw);
    perVolume.push({ vol, ebookId, sermons: found.length, letters: countLetters(raw), tracts: vol === 4 ? tractIndexEntries(raw) : [], toc: tocSermons(raw) });
    sermons.push(...found);
  }
  // Fail closed on a broken sequence: the edition numbers its sermons I–LIX
  // contiguously across vols 5–6; anything else means a boundary was missed
  // or invented.
  const seq = sermons.map((s) => romanToInt(s.numeral)!);
  for (let i = 0; i < seq.length; i++) {
    if (seq[i] !== i + 1) throw new Error(`FAIL CLOSED: sermon sequence broken at position ${i + 1} (got SERMON ${sermons[i]!.numeral}) — boundary detection unreliable`);
  }
  if (sermons.length !== EXPECTED_SERMONS) throw new Error(`FAIL CLOSED: ${sermons.length} sermons detected, expected ${EXPECTED_SERMONS} per the CONTENTS pages`);
  const sections: RegisterSection[] = sermons.map((s) => ({
    heading: `${s.title} — ${s.statedRef}`,
    body: s.body,
    anchors: s.anchors.slice(0, 1),
  }));
  return { sermons, sections, perVolume };
}
