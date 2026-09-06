// gutenberg adapter (INGESTION_ADAPTERS.md §3). Fetch a PD ebook by id, strip the
// Gutenberg license boilerplate (everything outside *** START *** … *** END ***),
// isolate the sacred section where a book mixes sacred + secular, split into the
// work's own units (poems/hymns), and verse-anchor a unit when it carries a
// Scripture epigraph. Text-only. Output feeds register-writer.writeRegisterWork.
//
//   npx tsx src/ingest/adapter-gutenberg.ts --slug=keble-christian-year [--no-write]
//
// Per-work structure is genuinely idiosyncratic (Keble = epigraph poems, Herrick =
// Noble Numbers inside Hesperides, Watts = numbered hymns), so a small per-slug
// PROFILE drives isolation + unit splitting; the shared machinery (boilerplate
// strip, epigraph→anchor, chunking) is common. Fail closed: a work whose profile
// yields <MIN_UNITS units aborts (structure not recognized) rather than ingesting a
// single blob.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { assertNotQuarantined } from './license-manifest.js';
import { scanReferences } from '../bible/ref-parse.js';
import { writeRegisterWork, type RegisterWork, type RegisterSection } from './register-writer.js';

const CACHE = 'data/raw/gutenberg';
const MIN_UNITS = 5; // fewer than this ⇒ we failed to find the work's structure

interface Profile {
  // isolate the sacred region: [startMarker, endMarker] (inclusive of start, exclusive of end); omit ⇒ whole body
  sacred?: { start?: RegExp; end?: RegExp };
  // split the sacred region into units; default = blank-line-separated blocks
  splitUnits?: (region: string) => string[];
  // section-scoped selection for a MIXED sacred/secular volume (below) —
  // takes precedence over sacred/splitUnits when present
  sections?: ScopedSpec;
  // pull a title/heading from a unit (first non-empty line by default)
  register: 'hymn' | 'poetry' | 'prose';
  paraphrase?: boolean;
}

// ── section-scoped selection (mixed sacred/secular volumes) ──
// Twice on 2026-07-17 (A6) a whole-volume parse served SECULAR poems under a
// sacred title: Grierson's Donne vol I as "Divine Poems", Pollard's Hesperides
// & Noble Numbers as "Noble Numbers". The sacred{start,end} markers could not
// say "the section of the book with this name": they match anywhere in the
// body, so a title-page or preface mention can satisfy them, and they say
// nothing about what the region must CONTAIN. A mixed volume therefore
// declares its own contents instead:
//   - scope markers match as WHOLE LINES only, so a mid-sentence preface
//     mention ("his sacred poems or _Noble Numbers_") can never satisfy them;
//   - the work's own section list is walked IN ORDER and every declared
//     section must be found — a missing one ABORTS the ingest (structure
//     drift) rather than silently widening the scope;
//   - numbered works (Pollard's Noble Numbers) declare the expected number
//     sequence, including any gap in the edition's own numeration.
export interface ScopedSection {
  match: RegExp; // the section's heading line, matched against single lines
  marker?: boolean; // a group heading ("HOLY SONNETS.") — a boundary, not a section
  children?: {
    // numbered sub-poems under one heading (Donne's Holy Sonnets I.–XIX.);
    // group 1 of pattern captures the numeral
    pattern: RegExp;
    heading: (numeral: string, firstLine: string) => string;
  };
}
export interface ScopedSpec {
  scope: { start: RegExp; end?: RegExp; endNext?: RegExp }; // endNext: first non-blank line after the end line must also match (disambiguates a bare "POEMS" heading)
  contents?: ScopedSection[]; // explicit ordered contents (Grierson's Donne)
  numbered?: { pattern: RegExp; first: number; last: number; expectMissing?: number[] }; // numbered poems (Pollard's Noble Numbers)
  stripApparatus?: boolean; // drop bracketed […] editorial-note blocks inside units (Grierson's critical apparatus is not poem text)
  epigraphs?: false; // the edition prints NO Scripture epigraphs for these poems — any epigraphAnchor hit is a false positive from 17th-c. spelling (Donne's "To the Lady Magdalen Herbert" anchored Isaiah 5:1-999)
}

// ── romanised Scripture epigraph → verse anchor ──
const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };
function romanToInt(s: string): number | null {
  let n = 0; const t = s.toLowerCase();
  for (let i = 0; i < t.length; i++) { const c = ROMAN[t[i]!]; if (!c) return null; const nx = ROMAN[t[i + 1]!] ?? 0; n += c < nx ? -c : c; }
  return n || null;
}
// "_Genesis_ xxvii. 34" / "Lament. iii. 22, 23" → "Genesis 27:34" so scanReferences parses it.
function romaniseEpigraph(text: string): string {
  return text
    .replace(/_/g, '')
    .replace(/\b([1-3]?\s?[A-Za-z]{3,}\.?)\s+([ivxlc]{1,6})\.\s*(\d{1,3})/g, (m, book, rom, verse) => {
      const c = romanToInt(rom as string);
      return c ? `${(book as string).replace(/\.$/, '')} ${c}:${verse}` : (m as string);
    });
}

// The first parseable Scripture ref in the unit's head (epigraphs sit at the top).
function epigraphAnchor(unit: string): { verseIdStart: number; verseIdEnd: number } | null {
  const head = unit.split('\n').slice(0, 6).join(' ');
  const refs = scanReferences(romaniseEpigraph(head));
  const r = refs[0]?.ranges[0];
  return r ? { verseIdStart: r.start, verseIdEnd: r.end } : null;
}

// ── heading-line splitting ──
// Some PD editions separate poems with SINGLE blank lines only (PG #77809
// Rossetti Verses: 1024 single-blank runs, one triple-newline in the whole
// body), which defeats defaultSplit's blank-gap heuristic and yields one blob.
// Those editions mark each poem with a standalone TITLE LINE instead: an
// ALL-CAPS line ("ADVENT SUNDAY.") or a quoted Scripture epigraph ("“Thou,
// God, seest me.”"), always blank-surrounded — in-poem refrains and quoted
// speech sit flush against verse lines and fail that test.
interface HeadingSplitOpts {
  caps?: boolean; // ALL-CAPS title lines ("THE PULLEY.")
  quoted?: boolean; // standalone “…” epigraph-title lines
  junk?: RegExp; // running heads / page numbers, dropped before splitting
}
const ROMAN_LINE = /^[IVXLC]+$/; // bare stanza/sonnet numerals are NOT titles
function splitAtHeadingLines(region: string, opts: HeadingSplitOpts): string[] {
  // collapse OCR double-spacing ("A broken  Altar") before any pattern runs
  const all = region.replace(/[ \t]{2,}/g, ' ').split('\n').map((l) => l.trim());
  const lines = opts.junk ? all.filter((l) => !opts.junk!.test(l)) : all;
  const isBlank = (i: number): boolean => i < 0 || i >= lines.length || lines[i] === '';
  const isHeading = (i: number): boolean => {
    const l = lines[i]!;
    if (!l || l.length > 80 || !isBlank(i - 1) || !isBlank(i + 1)) return false;
    if (opts.quoted && /^“[^”]+”$/.test(l)) return true;
    if (!opts.caps) return false;
    // lowercase roman-numeral tokens and digits are title furniture, not prose
    // ("COLOSSIANS iii. 3." is a Temple poem title) — strip before the case
    // test. "hi" is the stock OCR misread of "iii" (temple00herb_0 line 4384).
    const t = l.replace(/\b(?:[ivxlc]+|hi)\b/g, '').replace(/\d+/g, '');
    const letters = t.replace(/[^A-Za-z]/g, '');
    return /\.$/.test(l) && !/[a-z]/.test(t) && letters.length >= 3 && !ROMAN_LINE.test(letters);
  };
  const units: string[] = [];
  let cur: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isHeading(i)) {
      const u = cur.join('\n').trim();
      if (u) units.push(u);
      cur = [];
    }
    cur.push(lines[i]!);
  }
  const last = cur.join('\n').trim();
  if (last) units.push(last);
  return units;
}

export const PROFILES: Record<string, Profile> = {
  'keble-christian-year': {
    sacred: { start: /\nMORNING\.?\n|\nDEDICATION\.?\n/, end: /\*\*\* END OF/ },
    register: 'poetry',
  },
  'donne-divine-poems': {
    // Grierson 1912 vol I (PG #48688) mixes Songs and Sonnets, Elegies,
    // Satyres and prose with the Divine Poems. Scope: the "DIVINE POEMS."
    // part-heading (whole line; the ToC's indented, period-less "  DIVINE
    // POEMS" cannot match) to "ELEGIES UPON THE AUTHOR" (commendatory verse
    // by OTHER hands — not Donne's divine poems). Contents are the volume's
    // own list for the section: the two dedication poems, La Corona's seven
    // linked sonnets, the nineteen Holy Sonnets (children of the italic
    // sub-heading), and the twelve later divine poems, in Grierson's order.
    sections: {
      scope: { start: /^DIVINE POEMS\.$/, end: /^ELEGIES UPON THE AUTHOR$/ },
      stripApparatus: true,
      epigraphs: false,
      contents: [
        { match: /^To _E\._ of _D\._ with six holy Sonnets/ },
        { match: /^_To the Lady Magdalen Herbert: of St\. Mary Magdalen\._$/ },
        { match: /^HOLY SONNETS\.$/, marker: true },
        { match: /^_La Corona\._$/ },
        { match: /^ANNVNCIATION\.$/ },
        { match: /^NATIVITIE\.$/ },
        { match: /^TEMPLE\.$/ },
        { match: /^CRVCIFYING\.$/ },
        { match: /^RESVRRECTION\.$/ },
        { match: /^ASCENTION\.$/ },
        {
          match: /^_Holy Sonnets\._$/,
          children: {
            pattern: /^([IVX]+)\.$/,
            heading: (num, first) => `${num}. ${first}`,
          },
        },
        { match: /^_The Crosse\._$/ },
        { match: /^_Resurrection, imperfect\._$/ },
        { match: /^_The Annuntiation and Passion\._$/ },
        { match: /^_Goodfriday_, 1613\. _Riding Westward\._$/ },
        { match: /^THE LITANIE\.$/ },
        { match: /^_Vpon the translation of the Psalmes by Sir_ Philip Sydney,$/ },
        { match: /^_Ode: Of our Sense of Sinne\._$/ },
        { match: /^_To M\^\{r\}_ Tilman _after he had taken orders\._$/ },
        { match: /^_A Hymne to Christ, at the Authors last going into Germany\._$/ },
        { match: /^_The Lamentations of Ieremy, for the most part according to$/ },
        { match: /^_Hymne to God my God, in my sicknesse\._$/ },
        { match: /^_A Hymne to God the Father:_$/ },
        { match: /^_To Christ\._$/ },
      ],
    },
    register: 'poetry',
  },
  'herrick-noble-numbers': {
    // Pollard 1891 (PG #22421) prints BOTH of Herrick's 1648 volumes: the
    // secular Hesperides (poems 1-1130 across vols I-II of this edition) and
    // the sacred Noble Numbers. The 2026-07-17 run's start marker matched a
    // title-page/preface mention and swept Hesperides in. Scope: the whole
    // line " HIS NOBLE NUMBERS:" (the part-title where the poems begin) to
    // the appendix "POEMS / NOT INCLUDED IN _HESPERIDES_." Units are the
    // edition's own numbered poems 1-271; 268 is skipped in Pollard's
    // numeration (the number is absent from the book, not a dropped poem).
    sections: {
      scope: { start: /^ HIS NOBLE NUMBERS:$/, end: /^POEMS$/, endNext: /^NOT INCLUDED IN _HESPERIDES_\.$/ },
      numbered: { pattern: /^(\d{1,3})\. (.+)$/, first: 1, last: 271, expectMissing: [268] },
    },
    register: 'poetry',
  },
  // Dobell's 1903 ed. appends "THE POEMS OF WILLIAM STRODE" (a DIFFERENT poet)
  // as an appendix — end before it so Strode's verse never serves under Traherne
  // (A6 line-by-line 2026-07-17). The memoir/title-page front matter is caught
  // by GUT_MATTER.
  'traherne-poems': { sacred: { end: /\n\s*THE POEMS OF WILLIAM STRODE/ }, register: 'poetry' },
  'milton-poetical-works': { register: 'poetry' },
  'rossetti-verses': {
    // PG #77809 (1894 ed.) uses single blank lines everywhere → defaultSplit
    // returned 1 unit. Split at title lines: ALL-CAPS feast-day titles and
    // quoted Scripture-epigraph titles. Start past the title page at the
    // half-title "VERSES." line.
    sacred: { start: /\nVERSES\.\n/ },
    splitUnits: (r) => splitAtHeadingLines(r, { caps: true, quoted: true }),
    register: 'poetry',
  },
  'herbert-temple': {
    // archive.org temple00herb_0 (Cassell's National Library, 1887, modern
    // spelling — PG has NO edition of The Temple; Grosart 1876 is a long-s
    // facsimile whose OCR is corrupt). Skip Morley's introduction (start at
    // The Church Porch); stop before the back-matter patent-medicine ads
    // (first ad block opens "CROSBY'S"). Junk: "THE TEMPLE." running heads
    // and bare page numbers.
    sacred: { start: /THE\s+CHURCH\s+PORCH\./, end: /\n\s*CROSBY/ },
    splitUnits: (r) => splitAtHeadingLines(r, { caps: true, junk: /^(?:THE TEMPLE[ .,]*|\d{1,3})$/ }),
    register: 'poetry',
  },
  'hopkins-poems': { register: 'poetry' },
  'tennyson-in-memoriam': { register: 'poetry' },
  'dante-divine-comedy': { register: 'poetry' },
  'wheatley-poems': { register: 'poetry' },
  'watts-hymns': { register: 'hymn' },
  'watts-psalms': { register: 'hymn', paraphrase: true }, // metrical psalms — PARAPHRASE voice
  'newman-apologia': {
    // PG #22088 (1890 Longmans ed. of the 1864 Apologia). The work proper is
    // the five chapters between the part-title "MY RELIGIOUS OPINIONS." (a
    // unique whole line) and "NOTES." — Notes A–G, the saints' calendar, the
    // approbation letters and the publisher catalog are back matter; the 1865
    // Preface is front matter (the shared GUT_MATTER filter drops it anyway).
    // The CONTENTS list carries bare "CHAPTER I.".. lines too, but they sit
    // BEFORE the scope start and cannot pre-match. Each chapter heading is the
    // edition's own two-line pair ("CHAPTER I." / "HISTORY OF MY RELIGIOUS
    // OPINIONS TO THE YEAR 1833."); the title line opens the body as printed.
    sections: {
      scope: { start: /^MY RELIGIOUS OPINIONS\.$/, end: /^NOTES\.$/ },
      contents: [
        { match: /^CHAPTER I\.$/ },
        { match: /^CHAPTER II\.$/ },
        { match: /^CHAPTER III\.$/ },
        { match: /^CHAPTER IV\.$/ },
        { match: /^CHAPTER V\.$/ },
      ],
    },
    register: 'prose',
  },
};

export function stripBoilerplate(raw: string): string {
  const t = raw.replace(/\r\n/g, '\n');
  const s = t.match(/\*\*\* START OF [^\n]*\*\*\*/);
  const e = t.match(/\*\*\* END OF [^\n]*\*\*\*/);
  return t.slice(s ? s.index! + s[0].length : 0, e ? e.index! : t.length);
}

function defaultSplit(region: string): string[] {
  // blank-line-separated blocks, keeping only substantial ones (poems/hymns)
  return region.split(/\n\s*\n\s*\n+/).map((b) => b.trim()).filter((b) => b.length > 120);
}

// archive.org plain-text fetch (works with no PG edition, e.g. herbert-temple).
// Same shape as fetchGutenberg: cache-first, PD text only. The _djvu.txt is the
// full-text OCR the details page serves.
const ARCHIVE_CACHE = 'data/raw/archive';
export async function fetchArchiveText(identifier: string): Promise<string> {
  mkdirSync(ARCHIVE_CACHE, { recursive: true });
  const cached = `${ARCHIVE_CACHE}/${identifier}_djvu.txt`;
  if (existsSync(cached)) return readFileSync(cached, 'utf8');
  const url = `https://archive.org/download/${identifier}/${identifier}_djvu.txt`;
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`archive.org ${identifier}: HTTP ${res.status}`);
  const txt = await res.text();
  writeFileSync(cached, txt);
  return txt;
}

export async function fetchGutenberg(ebookId: number): Promise<string> {
  mkdirSync(CACHE, { recursive: true });
  const cached = `${CACHE}/${ebookId}.txt`;
  if (existsSync(cached)) return readFileSync(cached, 'utf8');
  for (const url of [`https://www.gutenberg.org/cache/epub/${ebookId}/pg${ebookId}.txt`, `https://www.gutenberg.org/files/${ebookId}/${ebookId}-0.txt`]) {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (res.ok) { const txt = await res.text(); writeFileSync(cached, txt); return txt; }
  }
  throw new Error(`gutenberg ${ebookId}: no plain-text file found`);
}

// Front/back matter a PG ebook carries around the actual work — served under the
// author's name if not filtered (A6 line-by-line audit 2026-07-17: Moxon's
// bookseller catalog under Tennyson, modern Transcriber's Notes under Watts/
// Milton, Dobell's memoir + William Strode's poem under Traherne, Bridges'
// apparatus under Hopkins, and worst — watts-hymns' back-matter "A TABLE of the
// Scriptures that are Turned into Verse." carried a Scripture epigraph, so it
// verse-ANCHORED into the reader at Genesis 3 / Luke 2 as an Isaac Watts entry).
// CCEL grew MATTER_RE for exactly this class; gutenberg never had the equivalent.
const GUT_MATTER_HEADING = /^(transcriber|contents|table of|a table|list of books|index|preface|dedication|to the reader|footnotes?|notes\b|errata|colophon|appendix|glossary|memoir|introduction|editor|advertisement|title page|by the same|works by|also by|published by|price\b)/i;
// Content markers of a publisher catalog / transcriber apparatus (matches even
// when the first line is an innocuous title).
const GUT_MATTER_BODY = /(published by|price\s+\d|\bcloth\b.{0,12}(morocco|bound|gilt)|this project gutenberg|project gutenberg|transcriber'?s? note|in the (first|second|third|fourth) book\.)/i;
function isGutMatter(heading: string | undefined, body: string): boolean {
  return (!!heading && GUT_MATTER_HEADING.test(heading)) || GUT_MATTER_BODY.test(`${heading ?? ''}\n${body}`.slice(0, 400));
}

const TITLE_TERMINATOR = /[.:]_?$/; // ".", "._", ":", ":_" — a Grierson title's closing mark
function cleanHeading(line: string): string {
  return line.replace(/_/g, '').replace(/\s+/g, ' ').trim();
}
// Drop Grierson's bracketed critical-apparatus blocks ("    [La Corona.
// _1633-69_ …]"), which can span several lines; a block opens with '[' and
// closes at the first line ending in ']'.
function stripApparatusLines(lines: string[]): string[] {
  const out: string[] = [];
  let inNote = false;
  for (const l of lines) {
    const t = l.trim();
    if (inNote) { if (t.endsWith(']')) inNote = false; continue; }
    if (t.startsWith('[')) { if (!t.endsWith(']')) inNote = true; continue; }
    out.push(l);
  }
  return out;
}

export interface ScopedResult {
  sections: RegisterSection[];
  scopeStart: number; // char offset of the scope start line in the stripped body
  scopeEnd: number; // char offset of the scope end line (or body length)
  filtered: Array<{ heading: string; reason: string }>; // declared units dropped by the shared filters — inspectable, never silent
}

export function scopedSections(body: string, spec: ScopedSpec): ScopedResult {
  const lines = body.split('\n');
  const offsets: number[] = [];
  {
    let pos = 0;
    for (const l of lines) { offsets.push(pos); pos += l.length + 1; }
  }
  let startLine = -1;
  for (let i = 0; i < lines.length; i++) if (spec.scope.start.test(lines[i]!)) { startLine = i; break; }
  if (startLine < 0) throw new Error(`FAIL CLOSED: scope start ${spec.scope.start} not found as a whole line`);
  let endLine = lines.length;
  if (spec.scope.end) {
    for (let i = startLine + 1; i < lines.length; i++) {
      if (!spec.scope.end.test(lines[i]!)) continue;
      if (spec.scope.endNext) {
        const nxt = lines.slice(i + 1).find((l) => l.trim() !== '');
        if (!nxt || !spec.scope.endNext.test(nxt)) continue;
      }
      endLine = i;
      break;
    }
    if (endLine === lines.length) throw new Error(`FAIL CLOSED: scope end ${spec.scope.end} not found after the start line`);
  }
  const scopeLines = lines.slice(startLine + 1, endLine);

  const filtered: ScopedResult['filtered'] = [];
  // Shared finish: heading off the first line(s), apparatus stripped, the same
  // matter/length filters and epigraph anchor as the legacy path. A declared
  // unit that fails a filter is REPORTED, not silently dropped.
  const finish = (heading: string | undefined, unitLines: string[], out: RegisterSection[]): void => {
    const kept = (spec.stripApparatus ? stripApparatusLines(unitLines) : unitLines)
      .map((l) => l.trim()).filter(Boolean);
    const bodyText = kept.join('\n').trim();
    if (isGutMatter(heading, bodyText)) { filtered.push({ heading: heading ?? '(none)', reason: 'front/back matter' }); return; }
    if (bodyText.length < 40) { filtered.push({ heading: heading ?? '(none)', reason: `body ${bodyText.length} chars (<40)` }); return; }
    const anchor = spec.epigraphs === false ? null : epigraphAnchor(`${heading ?? ''}\n${bodyText}`);
    out.push({ heading, body: bodyText, anchors: anchor ? [anchor] : undefined });
  };

  const sections: RegisterSection[] = [];
  if (spec.contents) {
    // Walk the declared contents IN ORDER; each entry's heading line must be
    // found at or after the previous one. A miss is structure drift — abort.
    const bounds: Array<{ line: number; entry: ScopedSection }> = [];
    let cursor = 0;
    for (const entry of spec.contents) {
      let at = -1;
      for (let i = cursor; i < scopeLines.length; i++) {
        if (entry.match.test(scopeLines[i]!)) { at = i; break; }
      }
      if (at < 0) throw new Error(`FAIL CLOSED: declared section ${entry.match} not found in scope — structure drift`);
      bounds.push({ line: at, entry });
      cursor = at + 1;
    }
    for (let b = 0; b < bounds.length; b++) {
      const { line, entry } = bounds[b]!;
      const next = b + 1 < bounds.length ? bounds[b + 1]!.line : scopeLines.length;
      if (entry.marker) continue;
      // Multi-line titles: a heading line without a closing mark continues on
      // the following flush line(s) ("_Vpon the translation of the Psalmes by
      // Sir_ Philip Sydney," / "_and the Countesse of Pembroke his Sister._").
      const headLines = [scopeLines[line]!];
      while (!TITLE_TERMINATOR.test(headLines[headLines.length - 1]!.trim()) && headLines.length <= 2) {
        const nxt = scopeLines[line + headLines.length];
        if (nxt === undefined || !nxt.trim() || nxt.trim().length > 75) break;
        headLines.push(nxt);
      }
      const inner = scopeLines.slice(line + headLines.length, next);
      if (entry.children) {
        // Numbered sub-poems under one heading: split at each numeral line;
        // text before the first numeral (rare) stays under the parent title.
        const kids: Array<{ num: string; line: number }> = [];
        for (let i = 0; i < inner.length; i++) {
          const m = inner[i]!.match(entry.children.pattern);
          if (m) kids.push({ num: m[1]!, line: i });
        }
        if (kids.length === 0) throw new Error(`FAIL CLOSED: no children (${entry.children.pattern}) under ${entry.match}`);
        const pre = inner.slice(0, kids[0]!.line).join('\n').trim();
        if (pre.length >= 40) finish(cleanHeading(scopeLines[line]!), inner.slice(0, kids[0]!.line), sections);
        for (let k = 0; k < kids.length; k++) {
          const kLines = inner.slice(kids[k]!.line + 1, k + 1 < kids.length ? kids[k + 1]!.line : inner.length);
          const firstIdx = kLines.findIndex((l) => l.trim());
          const firstLine = cleanHeading(firstIdx >= 0 ? kLines[firstIdx]! : '');
          // The heading folds in the first verse line ("XIV. Batter my
          // heart…"), so the body starts AFTER it — heading\nbody composes
          // the whole sonnet, same convention as the legacy path (a
          // duplicated first line was the A6 defect).
          finish(entry.children.heading(kids[k]!.num, firstLine), kLines.filter((_, i) => i !== firstIdx), sections);
        }
      } else {
        finish(cleanHeading(headLines.join(' ')), inner, sections);
      }
    }
  } else if (spec.numbered) {
    const { pattern, first, last, expectMissing = [] } = spec.numbered;
    const units: Array<{ num: number; title: string; line: number }> = [];
    for (let i = 0; i < scopeLines.length; i++) {
      const m = scopeLines[i]!.match(pattern);
      if (m) units.push({ num: Number(m[1]), title: m[2]!, line: i });
    }
    // The edition's own numeration is the contents list: the found sequence
    // must equal first..last with exactly the declared gaps — no more, no less.
    const seen = new Set(units.map((u) => u.num));
    const missing: number[] = [];
    for (let n = first; n <= last; n++) if (!seen.has(n)) missing.push(n);
    const extra = units.filter((u) => u.num < first || u.num > last).map((u) => u.num);
    const dupes = [...seen].filter((n) => units.filter((u) => u.num === n).length > 1);
    const unexpected = missing.filter((n) => !expectMissing.includes(n));
    const unaccounted = expectMissing.filter((n) => seen.has(n));
    if (unexpected.length || extra.length || dupes.length || unaccounted.length) {
      throw new Error(`FAIL CLOSED: numbered sequence drift — missing ${JSON.stringify(unexpected)}, extra ${JSON.stringify(extra)}, dupes ${JSON.stringify(dupes)}, declared-gap-but-present ${JSON.stringify(unaccounted)}`);
    }
    for (let u = 0; u < units.length; u++) {
      const kLines = scopeLines.slice(units[u]!.line + 1, u + 1 < units.length ? units[u + 1]!.line : scopeLines.length);
      finish(`${units[u]!.num}. ${cleanHeading(units[u]!.title)}`, kLines, sections);
    }
  } else {
    throw new Error('FAIL CLOSED: scoped spec declares neither contents nor numbered units');
  }
  return { sections, scopeStart: offsets[startLine]!, scopeEnd: endLine < lines.length ? offsets[endLine]! : body.length, filtered };
}

export function buildSections(body: string, profile: Profile): RegisterSection[] {
  if (profile.sections) return scopedSections(body, profile.sections).sections;
  let region = body;
  if (profile.sacred?.start) {
    const m = region.match(profile.sacred.start);
    if (m) region = region.slice(m.index!);
  }
  if (profile.sacred?.end) {
    const m = region.match(profile.sacred.end);
    if (m) region = region.slice(0, m.index!);
  }
  const units = (profile.splitUnits ?? defaultSplit)(region);
  const out: RegisterSection[] = [];
  for (const unit of units) {
    const lines = unit.split('\n').map((l) => l.trim()).filter(Boolean);
    const heading = lines[0]?.slice(0, 120);
    // body EXCLUDES the heading line (register-writer composes heading\nbody —
    // including it duplicated every unit's first line, A6 audit) and KEEPS line
    // breaks: collapsing \s+ to spaces flattened poem structure.
    const bodyText = lines.slice(1).join('\n').trim() || lines.join('\n').trim();
    if (isGutMatter(heading, bodyText)) continue; // never serve front/back matter
    if (bodyText.length < 40) continue;
    const anchor = epigraphAnchor(unit);
    out.push({ heading, body: bodyText, anchors: anchor ? [anchor] : undefined });
  }
  return out;
}

export async function acquireGutenberg(entry: Record<string, unknown>, opts: { write: boolean; publish?: boolean } = { write: true }): Promise<{ sections: number; anchored: number; embedded: number }> {
  // D2 (DEEP_SWEEP.md): quarantine is enforced at the MOUTH, before any fetch, parse or
  // write — the historian/sermon line, which this path was missing entirely.
  assertNotQuarantined(entry);
  const prov = entry.provenance as Record<string, unknown>;
  const acq = prov.acquire as { ebook_id?: number; archive_id?: string };
  const profile = PROFILES[entry.slug as string];
  if (!profile) throw new Error(`no gutenberg profile for ${entry.slug as string}`);
  if (acq.archive_id === undefined && typeof acq.ebook_id !== 'number') throw new Error(`${entry.slug as string}: acquire needs ebook_id or archive_id`);
  const raw = acq.archive_id !== undefined ? await fetchArchiveText(acq.archive_id) : await fetchGutenberg(acq.ebook_id!);
  const body = stripBoilerplate(raw);
  const sections = buildSections(body, profile);
  if (sections.length < MIN_UNITS) throw new Error(`FAIL CLOSED: ${entry.slug as string} yielded ${sections.length} units (<${MIN_UNITS}) — structure not recognized`);
  const anchored = sections.filter((s) => s.anchors).length;
  if (!opts.write) return { sections: sections.length, anchored, embedded: 0 };

  const work: RegisterWork = {
    slug: entry.slug as string, title: entry.title as string, author: entry.author as string,
    authorDied: entry.author_died as number | undefined, year: (entry.year_written as number) ?? (prov.year as number),
    sourceType: entry.source_type as string, register: profile.register, tradition: entry.tradition as string,
    era: entry.era as string, license: entry.license as string, paraphrase: profile.paraphrase,
    // publish default RESPECTS the manifest serve flag (a direct CLI run of a
    // serve:false / quarantined work must NOT publish — A6 line-by-line
    // 2026-07-17; was `?? true`, which published quarantined works). The loop
    // always passes opts.publish explicitly from the SERVED allowlist.
    url: prov.url as string, edition: (prov.edition as string) ?? '', publish: opts.publish ?? (entry.serve !== false),
    sections,
  };
  const res = await writeRegisterWork(work);
  return { sections: sections.length, anchored, embedded: res.embedded };
}

if (process.argv[1] && /adapter-gutenberg/.test(process.argv[1])) {
  const slug = process.argv.find((a) => a.startsWith('--slug='))?.slice(7);
  const write = !process.argv.includes('--no-write');
  const manifest = JSON.parse(readFileSync('ingest/sources.config.json', 'utf8')) as Array<Record<string, unknown>>;
  const entry = manifest.find((e) => e.slug === slug);
  if (!entry) throw new Error(`no manifest entry ${slug}`);
  const r = await acquireGutenberg(entry, { write });
  console.log(`${slug}: ${r.sections} sections, ${r.anchored} verse-anchored, ${r.embedded} embedded`);
}
