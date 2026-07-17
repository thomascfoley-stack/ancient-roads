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
import { scanReferences } from '../bible/ref-parse.js';
import { writeRegisterWork, type RegisterWork, type RegisterSection } from './register-writer.js';

const CACHE = 'data/raw/gutenberg';
const MIN_UNITS = 5; // fewer than this ⇒ we failed to find the work's structure

interface Profile {
  // isolate the sacred region: [startMarker, endMarker] (inclusive of start, exclusive of end); omit ⇒ whole body
  sacred?: { start?: RegExp; end?: RegExp };
  // split the sacred region into units; default = blank-line-separated blocks
  splitUnits?: (region: string) => string[];
  // pull a title/heading from a unit (first non-empty line by default)
  register: 'hymn' | 'poetry';
  paraphrase?: boolean;
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
  'donne-divine-poems': { register: 'poetry' },
  'herrick-noble-numbers': {
    sacred: { start: /NOBLE NUMBERS|HIS NOBLE NUMBERS/, end: /\*\*\* END OF/ },
    register: 'poetry',
  },
  'traherne-poems': { register: 'poetry' },
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

export function buildSections(body: string, profile: Profile): RegisterSection[] {
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
  return units.map((unit) => {
    const lines = unit.split('\n').map((l) => l.trim()).filter(Boolean);
    const heading = lines[0]?.slice(0, 120);
    const anchor = epigraphAnchor(unit);
    return {
      heading,
      // body EXCLUDES the heading line (register-writer composes heading\nbody —
      // including it duplicated every unit's first line, A6 audit) and KEEPS
      // line breaks: collapsing \s+ to spaces flattened poem structure.
      body: lines.slice(1).join('\n').trim() || lines.join('\n').trim(),
      anchors: anchor ? [anchor] : undefined,
    } satisfies RegisterSection;
  }).filter((s) => s.body.length >= 40);
}

export async function acquireGutenberg(entry: Record<string, unknown>, opts: { write: boolean; publish?: boolean } = { write: true }): Promise<{ sections: number; anchored: number; embedded: number }> {
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
    url: prov.url as string, edition: (prov.edition as string) ?? '', publish: opts.publish ?? true,
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
