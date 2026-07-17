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
import { parseRef } from '../bible/ref-parse.js';
import { writeRegisterWork, chunkWhole, type RegisterWork, type RegisterSection } from './register-writer.js';

const CACHE = 'data/raw/ccel';
const MIN_UNITS = 3;
// Preferred div type per work (finest natural unit); fallback scan order otherwise.
const UNIT_TYPE_ORDER = ['Hymn', 'Sermon', 'Poem', 'chapter', 'section', 'Chapter', 'Section', 'part'];

export interface CcelWorkResult { slug: string; units: number; anchored: number; embedded: number; skipped: boolean; reason?: string }

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
function thmlText(frag: string): string {
  return frag
    .replace(/<l\b[^>]*>/gi, '').replace(/<\/l>/gi, '\n')
    .replace(/<verse\b[^>]*>/gi, '').replace(/<\/verse>/gi, '\n')
    .replace(/<note\b[\s\S]*?<\/note>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&#\d+;/g, ' ')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').replace(/^\s+|\s+$/gm, '')
    .trim();
}

// The first scripRef in a unit → verse anchor. Prefer osisRef (Bible:Gen.3.9),
// fall back to the passage attr / element text through parseRef.
function unitAnchor(unitXml: string): { verseIdStart: number; verseIdEnd: number } | null {
  const m = unitXml.match(/<scripRef\b[^>]*>/i);
  if (!m) return null;
  const tag = m[0];
  const osis = tag.match(/osisRef="(?:Bible:)?([A-Za-z0-9]+)\.(\d+)\.(\d+)/i);
  const passage = tag.match(/passage="([^"]+)"/i);
  const ref = osis ? `${osis[1]} ${osis[2]}:${osis[3]}` : passage?.[1];
  if (!ref) return null;
  const o = parseRef(ref.toLowerCase().replace(/^([1-3])\s*/, '$1 '));
  const r = o.ok ? o.ref.ranges[0] : undefined;
  return r ? { verseIdStart: r.start, verseIdEnd: r.end } : null;
}

// A "Psalm 23: The Lord's my shepherd" style title (metrical psalters) → an
// anchor to that psalm, when the unit carries no scripRef. Book 19 (Psalms).
function titleAnchor(heading?: string): { verseIdStart: number; verseIdEnd: number } | null {
  const m = heading?.match(/\bPsalm\s+(\d{1,3})\b/i);
  if (!m) return null;
  const ps = Number(m[1]);
  if (ps < 1 || ps > 150) return null;
  return { verseIdStart: 19_000_000 + ps * 1000 + 1, verseIdEnd: 19_000_000 + ps * 1000 + 999 };
}

// Pick the div selector (type= OR class=) that yields the most units — CCEL works
// vary: Olney uses type="Hymn", the Scottish Psalter uses class="hymn".
function chooseUnitSelector(xml: string): { attr: 'type' | 'class'; value: string } | null {
  let best: { attr: 'type' | 'class'; value: string } | null = null, bestN = MIN_UNITS - 1;
  for (const attr of ['type', 'class'] as const) {
    for (const t of UNIT_TYPE_ORDER) {
      const n = (xml.match(new RegExp(`<div[1-4]\\s[^>]*${attr}="${t}"`, 'gi')) ?? []).length;
      if (n > bestN) { best = { attr, value: t }; bestN = n; }
    }
  }
  return best;
}

export function buildCcelSections(xml: string): RegisterSection[] {
  const sel = chooseUnitSelector(xml);
  if (!sel) return [];
  const out: RegisterSection[] = [];
  let m: RegExpExecArray | null;
  const full = new RegExp(`(<div[1-4]\\s[^>]*${sel.attr}="${sel.value}"[^>]*>)([\\s\\S]*?)</div[1-4]>`, 'gi');
  while ((m = full.exec(xml))) {
    const openTag = m[1]!;
    const inner = m[2]!;
    const titleAttr = openTag.match(/\btitle="([^"]*)"/i)?.[1];
    const headTag = inner.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1];
    const heading = (titleAttr || (headTag ? thmlText(headTag) : undefined) || '').replace(/\s+/g, ' ').trim() || undefined;
    const anchor = unitAnchor(inner) ?? titleAnchor(heading);
    const body = thmlText(inner);
    if (body.length < 40) continue; // skip empty/structural shells
    out.push({ heading, body, anchors: anchor ? [anchor] : undefined });
  }
  return out;
}

export async function acquireCcel(entry: Record<string, unknown>, opts: { write: boolean; publish?: boolean } = { write: true }): Promise<CcelWorkResult> {
  const prov = entry.provenance as Record<string, unknown>;
  const acq = prov.acquire as { ccel_ids?: string[]; ccel_id_pattern?: string; ccel_author?: string };
  // resolve the id list
  let ids: string[] = [];
  if (acq.ccel_ids) ids = acq.ccel_ids;
  else if (acq.ccel_id_pattern) {
    const m = acq.ccel_id_pattern.match(/^(.*)\{(\d+)\.\.(\d+)\}(.*)$/);
    if (m) { const [, pre, a, b, post] = m; const pad = a!.length; for (let i = Number(a); i <= Number(b); i++) ids.push(`${pre}${String(i).padStart(pad, '0')}${post}`); }
    else ids = [acq.ccel_id_pattern];
  } else if (acq.ccel_author) {
    // author-page enumeration is a separate network step; not attempted in this pass — escalate
    return { slug: entry.slug as string, units: 0, anchored: 0, embedded: 0, skipped: true, reason: `ccel_author enumeration not implemented (${acq.ccel_author})` };
  }

  const allSections: RegisterSection[] = [];
  for (const id of ids) {
    const xml = await fetchCcelXml(id);
    if (!xml) return { slug: entry.slug as string, units: 0, anchored: 0, embedded: 0, skipped: true, reason: `fetch failed / not ThML: ${id}` };
    allSections.push(...buildCcelSections(xml));
  }
  // chunk any over-budget section whole (register-writer also chunks; keep sections cohesive)
  const sections: RegisterSection[] = [];
  for (const s of allSections) {
    const chunks = chunkWhole(s.heading ? `${s.heading}\n${s.body}` : s.body);
    if (chunks.length === 1) sections.push(s);
    else chunks.forEach((c, i) => sections.push({ heading: s.heading ? `${s.heading} (${i + 1}/${chunks.length})` : undefined, body: c, anchors: i === 0 ? s.anchors : undefined }));
  }
  if (sections.length < MIN_UNITS) return { slug: entry.slug as string, units: sections.length, anchored: 0, embedded: 0, skipped: true, reason: `only ${sections.length} units — structure not recognized` };

  const anchored = sections.filter((s) => s.anchors).length;
  if (!opts.write) return { slug: entry.slug as string, units: sections.length, anchored, embedded: 0, skipped: false };

  const registerMap: Record<string, 'hymn' | 'poetry'> = { hymn: 'hymn', poetry: 'poetry' };
  const st = entry.source_type as string;
  const work: RegisterWork = {
    slug: entry.slug as string, title: entry.title as string, author: entry.author as string,
    authorDied: entry.author_died as number | undefined, year: (entry.year_written as number) ?? (prov.year as number),
    sourceType: st, register: registerMap[st] ?? 'prose', tradition: entry.tradition as string, era: entry.era as string,
    license: entry.license as string, url: prov.url as string, edition: (prov.edition as string) ?? '', publish: opts.publish ?? (entry.serve !== false),
    // metrical psalters are PARAPHRASE-voice (never rendered as Scripture)
    paraphrase: (entry.paraphrase as boolean | undefined) ?? /psalter|metrical.*psalm/i.test(entry.slug as string),
    sections,
  };
  const res = await writeRegisterWork(work);
  return { slug: entry.slug as string, units: sections.length, anchored, embedded: res.embedded, skipped: false };
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
