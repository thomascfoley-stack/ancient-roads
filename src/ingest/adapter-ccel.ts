// ccel adapter (INGESTION_ADAPTERS.md §2). CCEL text is PD; CCEL's ThML MARKUP is
// commercially restricted → we extract the text, strip ThML, and re-provenance to
// the underlying PD print edition (recorded in the manifest). We fetch the ThML
// XML (not the cache .txt) specifically because it carries <scripRef osisRef> —
// the SOURCE'S OWN machine-readable verse anchor, a fact we can trust rather than
// guessing from prose.
//
//   npx tsx src/ingest/adapter-ccel.ts --slug=olney-hymns [--no-write]
//
// Chunk on the work's own divisions (div{1,2,3} type=Hymn|Sermon|section|chapter),
// finest meaningful type present. Heading = the div's title attr / first heading
// tag. Anchor = the first scripRef in the unit (osisRef or passage text →
// parseRef). Fail closed: a work whose fetch 404s or yields <MIN_UNITS units
// quarantines rather than ingesting a blob.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { assertNotQuarantined } from './license-manifest.js';
import { parseRef } from '../bible/ref-parse.js';
import { BOOKS } from '../bible/books.js';
// The id-range expansion moved to source-artifact-urls.mjs so the ARCHIVER expands it identically.
// Two copies of "which documents make up this work" is how an archive preserves 62 of 63 and
// reports success.
import { expandCcelIdPattern } from './source-artifact-urls.mjs';
import { writeRegisterWork, type RegisterWork, type RegisterSection } from './register-writer.js';
import { DETECTOR_VERSION, sweepWorkMatter } from '../../scripts/lib/front-matter-detector.mjs';

const CACHE = 'data/raw/ccel';
const MIN_UNITS = 3;
// Preferred div type per work (finest natural unit); fallback scan order otherwise.
const UNIT_TYPE_ORDER = ['Hymn', 'Sermon', 'Poem', 'chapter', 'section', 'Chapter', 'Section', 'part'];

export interface CcelWorkResult { slug: string; units: number; anchored: number; embedded: number; skipped: boolean; reason?: string; matter?: { strong: number; weak: number; kinds: Record<string, number> } }

// ── ADR-029 per-work attribution boundary (the durable repair) ───────────────
// Addendum 1: "the adapter fix is the repair and must land before any further CCEL
// ingest." Addendum 2: the class is ANY non-authorial matter, not only composite volumes.
// So after a work's sections are built and before anything is written, the work goes
// through the SAME detector the publish-side scan uses (sweepWorkMatter — head AND tail,
// author-aware). A work with a STRONG finding is HELD: not written, not staged, reason
// recorded — the human reads it and re-slices, exactly as ADR-029's origen remedy
// prescribes. NOTHING is trimmed or deleted by ordinal (ADR-029 rule 2 rejects ordinal
// surgery): the boundary holds the whole work or passes it whole. Weak findings ride
// along in the result as a report (owner decision #4 on gating strength is open).
export function attributionBoundaryHold(
  sections: RegisterSection[],
  author: string,
): { held: boolean; reason: string | null; matter: { strong: number; weak: number; kinds: Record<string, number> } } {
  const sweep = sweepWorkMatter(sections, { author });
  const strong = sweep.findings.filter((f) => f.strength === 'strong');
  const matter = { strong: strong.length, weak: sweep.findings.length - strong.length, kinds: sweep.byKind };
  if (strong.length === 0) return { held: false, reason: null, matter };
  const first = strong[0]!;
  const desc = `unit ${first.index + 1}/${sections.length} (${first.position}) [${first.kind}] ${JSON.stringify(first.evidence?.slice(0, 70))}`;
  return {
    held: true,
    reason:
      `held — non-authorial matter (ADR-029, detector ${DETECTOR_VERSION}): ${strong.length} strong finding(s); first: ${desc}` +
      (first.reason ? ` — ${first.reason}` : '') +
      '. The work is NOT written; read the flagged units and re-slice with per-work attribution. No ordinal trim performed.',
    matter,
  };
}

export async function fetchCcelXml(ccelId: string): Promise<string | null> {
  mkdirSync(CACHE, { recursive: true });
  const safe = ccelId.replace(/\//g, '_');
  const cached = `${CACHE}/${safe}.xml`;
  if (existsSync(cached)) return readFileSync(cached, 'utf8');
  const author = ccelId.split('/')[0];
  const url = `https://www.ccel.org/ccel/${ccelId}.xml`;
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) return null;
  const xml = await res.text();
  // Guard: reject the HTML reader/landing page (bramley/carols served one). ThML
  // is identified by NUMBERED divs (div1/2/3) or ThML-specific tags — NOT a bare
  // <div>, which every HTML page has.
  if (!/<ThML\b|<div[1-4]\b|<scripRef\b|<hymn\b|<verse\b/i.test(xml)) return null;
  void author;
  writeFileSync(cached, xml);
  return xml;
}

// Strip ThML/markup to readable text; keep line breaks for verse <l>.
export function thmlText(frag: string): string {
  return frag
    .replace(/<l\b[^>]*>/gi, '').replace(/<\/l>/gi, '\n')
    .replace(/<verse\b[^>]*>/gi, '').replace(/<\/verse>/gi, '\n')
    .replace(/<note\b[\s\S]*?<\/note>/gi, ' ')
    // KEEP the display text, drop only the tag. The previous rule deleted the whole element on
    // the theory that scripRefs are marginal annotations whose text is debris — true of a margin
    // note, false of most real CCEL usage, and measurable either way. Over the 876 cached works
    // (135,464 scripRefs sampled): 21% sit inside an open paren, so removing them left `( )` on the
    // page; 78% sit in running prose, so removing them left the sentence without its object
    // ("He is mentioned in ."). `unitAnchor` still reads the ATTRIBUTES for the verse anchor — that
    // is a separate consumer and is unaffected by what the body text keeps.
    .replace(/<scripRef\b[^>]*>([\s\S]*?)<\/scripRef>/gi, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘').replace(/&rdquo;/g, '”').replace(/&ldquo;/g, '“')
    // Trim SPACES/TABS at line edges only — NEVER \s, whose multiline $ match
    // swallows whole \n\n runs and fuses words across line breaks (the corpus
    // scar of 2026-07-17: "his bloodFar better things").
    .replace(/[ \t]+/g, ' ')
    .replace(/^[ \t]+|[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// The first scripRef in a unit → verse anchor. Prefer osisRef (Bible:Gen.3.9),
// fall back to the passage attr / element text through parseRef. An osisRef may
// be a RANGE (Bible:Song.1.1-Song.1.17): the old 3-part match took "Song.1.1"
// and anchored a 17-verse unit to its first verse (jamieson-jfb, measured
// 2026-08-12 — every Song chapter unit anchored to verse 1 only).
function unitAnchor(unitXml: string): { verseIdStart: number; verseIdEnd: number } | null {
  const m = unitXml.match(/<scripRef\b[^>]*>/i);
  if (!m) return null;
  const tag = m[0];
  const osis = tag.match(/osisRef="(?:Bible:)?([A-Za-z0-9]+)\.(\d+)\.(\d+)(?:-(?:Bible:)?[A-Za-z0-9]+\.(\d+)\.(\d+))?/i);
  const passage = tag.match(/passage="([^"]+)"/i);
  const candidates: string[] = [];
  if (osis) candidates.push(osis[5] ? `${osis[1]} ${osis[2]}:${osis[3]}-${osis[4]}:${osis[5]}` : `${osis[1]} ${osis[2]}:${osis[3]}`);
  if (passage) candidates.push(passage[1]!);
  for (const ref of candidates) {
    const o = parseRef(ref.toLowerCase().replace(/^([1-3])\s*/, '$1 '));
    const r = o.ok ? o.ref.ranges[0] : undefined;
    if (r) return { verseIdStart: r.start, verseIdEnd: r.end };
  }
  return null;
}

// A "Psalm 23: …" or "Psalm XXIII" style title (metrical psalters, the Treasury
// of David) → an anchor to that psalm, when the unit carries no scripRef.
const ROMAN_MAP: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };
function romanVal(s: string): number | null {
  let n = 0; const t = s.toLowerCase();
  for (let i = 0; i < t.length; i++) { const c = ROMAN_MAP[t[i]!]; if (!c) return null; const nx = ROMAN_MAP[t[i + 1]!] ?? 0; n += c < nx ? -c : c; }
  return n || null;
}
function titleAnchor(heading?: string): { verseIdStart: number; verseIdEnd: number } | null {
  const m = heading?.match(/\bPsalms?\s+(\d{1,3}|[IVXLCivxlc]{1,8})\b/);
  if (!m) return null;
  const raw = m[1]!;
  const ps = /^\d+$/.test(raw) ? Number(raw) : romanVal(raw);
  if (!ps || ps < 1 || ps > 150) return null;
  return { verseIdStart: 19_000_000 + ps * 1000 + 1, verseIdEnd: 19_000_000 + ps * 1000 + 999 };
}

// A work with a DECLARED primary book (acquire.primary_book, e.g. gill-song → 'sng')
// anchors by the work's OWN unit headings — "Chapter 1 Verse 1" — because a
// single-book commentary's first scripRef is usually a CROSS-REFERENCE, not the
// text under exposition (measured on gill-song 2026-08-12: 105 of 107 first-
// scripRef anchors landed off-book — Psalms, John, 1 Kings — a false-attribution
// sweep across the whole canon). Heading anchors win; a scripRef anchor is kept
// only when it lands ON the declared book; anything else is honestly unanchored.
function primaryBookAnchor(heading: string | undefined, bookNum: number): { verseIdStart: number; verseIdEnd: number } | null {
  const m = heading?.match(/\bChapter\s+(\d{1,3})(?:\s+Verses?\s+(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?)?/i);
  if (!m) return null;
  const ch = Number(m[1]);
  if (!ch || ch > 999) return null;
  const base = bookNum * 1_000_000 + ch * 1000;
  if (m[2] == null) return { verseIdStart: base + 1, verseIdEnd: base + 999 }; // chapter unit: sentinel end, same pattern as titleAnchor
  const v = Number(m[2]);
  const vEnd = m[3] != null ? Number(m[3]) : v;
  if (!v || vEnd < v) return null;
  return { verseIdStart: base + v, verseIdEnd: base + vEnd };
}
function onDeclaredBook(a: { verseIdStart: number; verseIdEnd: number } | null, bookNum: number): typeof a {
  return a && Math.floor(a.verseIdStart / 1_000_000) === bookNum ? a : null;
}

// Pick the div selector (type= OR class=) that yields the most units — CCEL works
// vary: Olney uses type="Hymn", the Scottish Psalter uses class="hymn". Works with
// NO typed/classed divs (Treasury of David: bare <div2 title="Psalm I">) fall back
// to the div LEVEL with the most title-bearing divs. minUnits is the per-work floor
// (acquire.min_units, default MIN_UNITS): 38 cached works are ONE genuine discourse
// in a single div1 (law-clergy 271k chars, kronstadt-christlife 1.4M), which the
// default 3-unit floor refuses even though the parse is correct — register-writer
// chunks the big bodies, so a single giant unit is safe (triage 2026-09-06).
function chooseUnitSelector(xml: string, minUnits = MIN_UNITS): { attr: 'type' | 'class'; value: string } | { level: string } | null {
  let best: { attr: 'type' | 'class'; value: string } | null = null, bestN = minUnits - 1;
  for (const attr of ['type', 'class'] as const) {
    for (const t of UNIT_TYPE_ORDER) {
      const n = (xml.match(new RegExp(`<div[1-4]\\s[^>]*${attr}="${t}"`, 'gi')) ?? []).length;
      if (n > bestN) { best = { attr, value: t }; bestN = n; }
    }
  }
  if (best) return best;
  let bestLevel: string | null = null; let bestLevelN = minUnits - 1;
  for (const lvl of ['div2', 'div3', 'div1']) {
    const n = (xml.match(new RegExp(`<${lvl}\\s[^>]*title="[^"]`, 'gi')) ?? []).length;
    if (n > bestLevelN) { bestLevel = lvl; bestLevelN = n; }
  }
  return bestLevel ? { level: bestLevel } : null;
}

// Front/back-matter titles that are never content units — applied on EVERY
// selector path (NPNF volumes carry "Index of Subjects" / "Greek Words and
// Phrases" back-matter as typed divs too, and 212 such chunks reached the
// served pool in Chrysostom alone before this filter was universal).
const MATTER_RE = /^(title pages?|preface|introduction|index(es)? (of|to)|indexes$|index$|contents|table of|dedication|advertisement|to the reader|appendix|copyright|greek words|hebrew words|bibliograph)/i;

// Optional per-work unit filter from the manifest (acquire.heading_filter, a
// regex source): only units whose heading matches are kept. Used to scope a
// work to the section the manifest actually claims (e.g. scottish-psalter-1650
// → ^Psalm — the CCEL file appends the 1781 Translations & Paraphrases, which
// must not ride under the 1650 Psalter's attribution).
// Optional per-work acquire profile (from the manifest entry):
//   minUnits   — per-work unit floor (acquire.min_units), default MIN_UNITS.
//   matterAllow — regex source (acquire.matter_allow): a heading MATTER_RE would
//     drop is kept when it matches. charnock-nat-regen's whole 331k-char discourse
//     is nested inside a div1 titled "Title Page" (triage 2026-09-06); without the
//     override MATTER_RE refuses the book even at min_units=1. When the override
//     fires, the unit's own h-tag ("Discourse of the Nature of Regeneration")
//     becomes the heading — serving "Title Page" as a section heading would be
//     the front-matter bug the filter exists to prevent.
export interface CcelAcquireProfile { minUnits?: number; matterAllow?: string }
export function buildCcelSections(xml: string, headingFilter?: string, primaryBook?: number, profile?: CcelAcquireProfile): RegisterSection[] {
  const sel = chooseUnitSelector(xml, profile?.minUnits ?? MIN_UNITS);
  if (!sel) return [];
  const matterAllow = profile?.matterAllow ? new RegExp(profile.matterAllow, 'i') : null;
  const out: RegisterSection[] = [];
  let m: RegExpExecArray | null;
  // Fallback mode: capture from each title-bearing div to the NEXT title-bearing
  // div at ANY level (not just the same level) — stopping only at the same level
  // drops every deeper/shallower sibling's span in mixed-level works and bleeds
  // text under the wrong heading (A6 audit, 2026-07-17).
  // Typed path: close on the SAME div level via a backreference (\2 = the
  // matched "divN"), NOT the first </div[1-4]> of any level. The old any-level
  // close truncated every unit that contains a nested child div at the child's
  // close, silently dropping ~2.7M chars from served works (Owen digressions,
  // the entire Trent canons + Longer Catechism in schaff-creeds) — A6 line-by-
  // line audit, 2026-07-17. Same-typed units never nest, so lazy-to-same-close
  // is exact. Fallback (title) path keeps its lookahead-to-next-title (the
  // earlier A6 mixed-level fix).
  const isFallback = 'level' in sel;
  const full = isFallback
    ? /(<div[1-4]\s[^>]*title="[^"]+"[^>]*>)([\s\S]*?)(?=<div[1-4]\s[^>]*title="|$)/gi
    : new RegExp(`(<(div[1-4])\\s[^>]*${sel.attr}="${sel.value}"[^>]*>)([\\s\\S]*?)</\\2>`, 'gi');
  while ((m = full.exec(xml))) {
    const openTag = m[1]!;
    const inner = (isFallback ? m[2] : m[3])!;
    const titleAttr = openTag.match(/\btitle="([^"]*)"/i)?.[1];
    const headTag = inner.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1];
    let heading = (titleAttr || (headTag ? thmlText(headTag) : undefined) || '').replace(/\s+/g, ' ').trim() || undefined;
    if (heading && MATTER_RE.test(heading)) {
      if (!(matterAllow && matterAllow.test(heading))) continue; // front/back matter, any path
      // matter-allowed (nat-regen's "Title Page"): the div's own h-tag is the real title
      if (headTag) heading = thmlText(headTag).replace(/\s+/g, ' ').trim() || heading;
    }
    const anchor = primaryBook
      ? primaryBookAnchor(heading, primaryBook) ?? onDeclaredBook(unitAnchor(inner), primaryBook)
      : unitAnchor(inner) ?? titleAnchor(heading);
    const body = thmlText(inner);
    if (body.length < 40) continue; // skip empty/structural shells
    if (headingFilter && !(heading && new RegExp(headingFilter, 'i').test(heading))) continue;
    out.push({ heading, body, anchors: anchor ? [anchor] : undefined });
  }
  return out;
}

// ccel_author enumeration: the author page lists work hrefs /ccel/{author}/{id}.
// Enumerate candidate ids, dedupe, cap; each id is then fetched as ThML (the
// non-ThML guard quarantines anything that isn't a real book file).
export async function enumerateCcelAuthor(author: string, cap = 40): Promise<string[]> {
  const res = await fetch(`https://www.ccel.org/ccel/${author}`, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) return [];
  const html = await res.text();
  const ids = new Set<string>();
  for (const m of html.matchAll(new RegExp(`/ccel/${author}/([a-z0-9_]+)(?:\\.|/|")`, 'gi'))) {
    const id = m[1]!.toLowerCase();
    if (['index', 'about', 'author'].includes(id)) continue;
    ids.add(`${author}/${id}`);
    if (ids.size >= cap) break;
  }
  return [...ids];
}

export async function acquireCcel(entry: Record<string, unknown>, opts: { write: boolean; publish?: boolean } = { write: true }): Promise<CcelWorkResult> {
  // D2 (DEEP_SWEEP.md): quarantine is enforced at the MOUTH, before any fetch, parse or
  // write — the historian/sermon line, which this path was missing entirely.
  assertNotQuarantined(entry);
  const prov = entry.provenance as Record<string, unknown>;
  const acq = prov.acquire as { ccel_ids?: string[]; ccel_id_pattern?: string; ccel_author?: string; min_units?: number; matter_allow?: string };
  // resolve the id list
  let ids: string[] = [];
  if (acq.ccel_ids) ids = acq.ccel_ids;
  else if (acq.ccel_id_pattern) {
    // [] means "not a brace range", which the manifest uses for a single literal id.
    const expanded = expandCcelIdPattern(acq.ccel_id_pattern);
    ids = expanded.length > 0 ? expanded : [acq.ccel_id_pattern];
  } else if (acq.ccel_author) {
    ids = await enumerateCcelAuthor(acq.ccel_author);
    if (ids.length === 0) return { slug: entry.slug as string, units: 0, anchored: 0, embedded: 0, skipped: true, reason: `author page enumeration empty (${acq.ccel_author})` };
  }

  // Author enumeration OVER-collects (indexes, bios, "works" landing pages) that
  // legitimately parse to 0 sections — those are noise to skip, not a fail. A
  // named/explicit volume yielding 0 IS a real structure problem → fail closed
  // (A6 line-by-line 2026-07-17 tightened empty-volume handling; the resume then
  // quarantined flavel/edwards on enumeration noise — this restores the
  // distinction). Guard: if >50% of enumerated volumes are empty, the parser
  // itself is suspect → fail.
  const enumerated = !acq.ccel_ids && !acq.ccel_id_pattern && !!acq.ccel_author;
  // Declared primary book (acquire.primary_book, a bible slug like 'sng') switches
  // anchoring to the work's own headings — see primaryBookAnchor above.
  const pbSlug = (acq as { primary_book?: string }).primary_book;
  const primaryBook = pbSlug ? BOOKS.findIndex((b) => b.slug === pbSlug) + 1 : undefined;
  if (pbSlug && !primaryBook) return { slug: entry.slug as string, units: 0, anchored: 0, embedded: 0, skipped: true, reason: `unknown primary_book slug: ${pbSlug}` };
  // Per-work acquire profile (see CcelAcquireProfile): min_units defaults to
  // MIN_UNITS — a work WITHOUT the profile gates exactly as before.
  const minUnits = typeof acq.min_units === 'number' && acq.min_units >= 1 ? Math.floor(acq.min_units) : MIN_UNITS;
  const profile: CcelAcquireProfile = { minUnits, matterAllow: acq.matter_allow };
  const allSections: RegisterSection[] = [];
  const emptyIds: string[] = [];
  for (const id of ids) {
    const xml = await fetchCcelXml(id);
    if (!xml) { if (enumerated) { emptyIds.push(`${id}(no-thml)`); continue; } return { slug: entry.slug as string, units: 0, anchored: 0, embedded: 0, skipped: true, reason: `fetch failed / not ThML: ${id}` }; }
    const secs = buildCcelSections(xml, (acq as { heading_filter?: string }).heading_filter, primaryBook || undefined, profile);
    if (secs.length === 0) emptyIds.push(id);
    allSections.push(...secs);
  }
  if (emptyIds.length > 0 && !enumerated) {
    return { slug: entry.slug as string, units: allSections.length, anchored: 0, embedded: 0, skipped: true, reason: `${emptyIds.length}/${ids.length} named volumes parsed to 0 sections — structure not recognized: ${emptyIds.join(',')}` };
  }
  if (enumerated) {
    if (emptyIds.length > ids.length * 0.5) return { slug: entry.slug as string, units: allSections.length, anchored: 0, embedded: 0, skipped: true, reason: `${emptyIds.length}/${ids.length} enumerated volumes empty (>50%) — parser suspect` };
    if (emptyIds.length > 0) console.log(`  ${entry.slug as string}: skipped ${emptyIds.length} non-content enumerated page(s): ${emptyIds.slice(0, 6).join(', ')}`);
  }
  // NO pre-chunking here: register-writer chunks heading+body once, at word
  // boundaries. The old pre-chunk pass re-prefixed headings ("(2/2)") and made
  // register-writer chunk the already-chunked text a second time (A6 audit).
  const sections = allSections;
  if (sections.length < minUnits) return { slug: entry.slug as string, units: sections.length, anchored: 0, embedded: 0, skipped: true, reason: `only ${sections.length} units — structure not recognized` };

  const anchored = sections.filter((s) => s.anchors).length;
  // ADR-029 attribution boundary — runs before ANY write, and also in --no-write planning
  // so a dry run shows the hold the real run would take.
  const boundary = attributionBoundaryHold(sections, entry.author as string);
  if (boundary.held) return { slug: entry.slug as string, units: sections.length, anchored, embedded: 0, skipped: true, reason: boundary.reason ?? undefined, matter: boundary.matter };
  if (boundary.matter.weak > 0) console.log(`  ${entry.slug as string}: ${boundary.matter.weak} weak non-authorial finding(s) reported (not held): ${JSON.stringify(boundary.matter.kinds)}`);
  if (!opts.write) return { slug: entry.slug as string, units: sections.length, anchored, embedded: 0, skipped: false, matter: boundary.matter.weak > 0 ? boundary.matter : undefined };

  const registerMap: Record<string, 'hymn' | 'poetry'> = { hymn: 'hymn', poetry: 'poetry' };
  const st = entry.source_type as string;
  const work: RegisterWork = {
    slug: entry.slug as string, title: entry.title as string, author: entry.author as string,
    authorDied: entry.author_died as number | undefined, year: (entry.year_written as number) ?? (prov.year as number),
    sourceType: st, register: registerMap[st] ?? 'prose', tradition: entry.tradition as string, era: entry.era as string,
    license: entry.license as string, url: prov.url as string, edition: (prov.edition as string) ?? '', publish: opts.publish ?? (entry.serve !== false),
    genre: entry.genre as string | undefined, // history-scope genre rides the manifest into sources.provenance
    // metrical psalters are PARAPHRASE-voice (never rendered as Scripture)
    paraphrase: (entry.paraphrase as boolean | undefined) ?? /psalter|metrical.*psalm/i.test(entry.slug as string),
    sections,
  };
  const res = await writeRegisterWork(work);
  return { slug: entry.slug as string, units: sections.length, anchored, embedded: res.embedded, skipped: false, matter: boundary.matter.weak > 0 ? boundary.matter : undefined };
}

if (process.argv[1] && /adapter-ccel/.test(process.argv[1])) {
  const slug = process.argv.find((a) => a.startsWith('--slug='))?.slice(7);
  const write = !process.argv.includes('--no-write');
  const manifest = JSON.parse(readFileSync('ingest/sources.config.json', 'utf8')) as Array<Record<string, unknown>>;
  const entry = manifest.find((e) => e.slug === slug);
  if (!entry) throw new Error(`no manifest entry ${slug}`);
  const r = await acquireCcel(entry, { write });
  console.log(JSON.stringify(r));
}
