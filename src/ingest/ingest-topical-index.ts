// Ingest the topical-index register: Nave's Topical Bible, Torrey's New
// Topical Textbook (source_type 'topical_index'), and Daily Light on the
// Daily Path ('devotional') — plus the OpenBible.info topic curation
// ('topical_index', CC BY). Writes through register-writer (sections +
// anchors[0] + flat embeddings + sources row, status per publish flag), then
// a post-pass this script owns: the FULL ordered ref expansion into
// `topical_entries` and the remaining `section_anchors` rows (the writer
// stores only anchors[0]; a topical entry's whole value is its many refs).
//
//   npx tsx src/ingest/ingest-topical-index.ts --dry-run          (no DB)
//   npx tsx src/ingest/ingest-topical-index.ts [--only=<slug>]    (dev only)
//
// Work metadata is INLINE (the ingest-sermon.ts precedent), not manifest
// entries: ingest/sources.config.json is the adapter loop's file and is
// mid-edit by a concurrent session; these works ingest as STAGED and their
// manifest entries land with the publish decision. The license gate's DB leg
// checks PUBLISHED rows only, so a staged self-contained ingest is inside
// the rules; publishing without the manifest entry is not.
//
// Thompson Chain (TCR) is deliberately ABSENT: its PD basis is CrossWire's
// own unverified 1934-non-renewal claim and Kirkbride actively publishes the
// work. Decoded under data/raw/topical for the record; not ingested until
// the claim is independently verified (fail closed on licensing).
//
// FAIL CLOSED: any scan failure outside a work's pinned KNOWN_BAD list —
// exact tokens, source-edition misprints, counted — fails the whole work,
// and structural floors (entry counts measured at decode time) catch a
// truncated or double-parsed source before anything is written.

import { readFileSync } from 'node:fs';
import { parseRef } from '../bible/ref-parse.js';
import { scanTopicalRefs, type ScannedRef } from './topical-refs.js';
import { writeRegisterWork, assertDevBranch, type RegisterSection, type RegisterWork } from './register-writer.js';

const arg = (f: string) => process.argv.find((a) => a.startsWith(`${f}=`))?.slice(f.length + 1);
const has = (f: string) => process.argv.includes(f);

interface TopicalEntry { ordinal: number; label: string | null; start: number; end: number }
interface ParsedSection { heading: string; body: string; entries: TopicalEntry[] }
interface ParsedWork { sections: ParsedSection[]; failures: string[] }

// ── shared: label extraction ────────────────────────────────────────────────
// A ref's label is its own line's leading text; a ref-only line inherits the
// nearest preceding line that carried text but no refs (Torrey/TCR print the
// sub-heading on its own line above the ref list). Leading list markers
// ("→ - . ( ) 1." etc.) are stripped; the words are the author's, verbatim.

const stripMarker = (s: string): string =>
  s.replace(/^[\s→\-–—.•(]+(\d+[.)]\s*)?/u, '').replace(/[\s:;,]+$/u, '').trim();

function entriesFromBody(body: string): { entries: TopicalEntry[]; failures: string[] } {
  const { refs, failures } = scanTopicalRefs(body);
  const lineStarts: number[] = [0];
  for (let i = 0; i < body.length; i++) if (body[i] === '\n') lineStarts.push(i + 1);
  const lineOf = (idx: number): number => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid]! <= idx) lo = mid; else hi = mid - 1; }
    return lo;
  };
  const lineText = (n: number): string =>
    body.slice(lineStarts[n]!, n + 1 < lineStarts.length ? lineStarts[n + 1]! - 1 : body.length);

  const refsByLine = new Map<number, ScannedRef[]>();
  for (const r of refs) {
    const n = lineOf(r.index);
    (refsByLine.get(n) ?? refsByLine.set(n, []).get(n)!).push(r);
  }

  const entries: TopicalEntry[] = [];
  let ordinal = 0;
  for (const [n, lineRefs] of [...refsByLine.entries()].sort((a, b) => a[0] - b[0])) {
    const firstRefCol = Math.min(...lineRefs.map((r) => r.index)) - lineStarts[n]!;
    let label = stripMarker(lineText(n).slice(0, firstRefCol));
    if (!label) {
      for (let up = n - 1; up >= 0 && n - up <= 4; up--) {
        if (refsByLine.has(up)) break;
        const t = stripMarker(lineText(up));
        if (t) { label = t; break; }
      }
    }
    for (const r of lineRefs.sort((a, b) => a.index - b.index)) {
      entries.push({ ordinal: ++ordinal, label: label ? label.slice(0, 200) : null, start: r.verseIdStart, end: r.verseIdEnd });
    }
  }
  return { entries, failures: failures.map((f) => f.token) };
}

// ── per-work parsers ────────────────────────────────────────────────────────

const loadJsonl = (p: string): Array<{ key: string; text: string }> =>
  readFileSync(p, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { key: string; text: string });

function parseLdWork(jsonl: string): ParsedWork {
  const sections: ParsedSection[] = [];
  const failures: string[] = [];
  for (const e of loadJsonl(jsonl)) {
    const { entries, failures: f } = entriesFromBody(e.text);
    failures.push(...f.map((t) => `[${e.key}] ${t}`));
    sections.push({ heading: e.key, body: e.text, entries });
  }
  return { sections, failures };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parseDaily(jsonl: string): ParsedWork {
  const sections: ParsedSection[] = [];
  const failures: string[] = [];
  for (const e of loadJsonl(jsonl)) {
    const m = /^(\d\d)\.(\d\d)$/.exec(e.key);
    if (!m) { failures.push(`[${e.key}] key is not MM.DD`); continue; }
    const monthName = MONTHS[Number(m[1]) - 1];
    if (!monthName) { failures.push(`[${e.key}] month out of range`); continue; }
    const dayLabel = `${monthName} ${Number(m[2])}`;
    const halves = e.text.split(/^Evening:\s*$/m);
    const morning = (halves[0] ?? '').replace(/^Morning:\s*$/m, '').trim();
    const evening = (halves[1] ?? '').trim();
    if (!morning || !evening) { failures.push(`[${e.key}] missing Morning/Evening half`); continue; }
    for (const [half, text] of [['Morning', morning], ['Evening', evening]] as const) {
      const { entries, failures: f } = entriesFromBody(text);
      failures.push(...f.map((t) => `[${e.key} ${half}] ${t}`));
      sections.push({
        heading: `${dayLabel} — ${half}`,
        body: text,
        entries: entries.map((en) => ({ ...en, label: half })),
      });
    }
  }
  return { sections, failures };
}

// OpenBible topic-scores.txt: TSV Topic \t OSIS \t score, one row per curated
// passage, ordered by score within a topic. OSIS refs ("Exod.20.1-Exod.20.26")
// are STRUCTURED — transformed to "Exod 20:1" and resolved through parseRef so
// book identity still has one home. Zero verse text in the file (the CC BY
// covers exactly this curation; ESV text never enters).
function parseOpenBible(tsv: string): ParsedWork {
  const failures: string[] = [];
  const byTopic = new Map<string, Array<{ osis: string; start: number; end: number; display: string }>>();

  const osisPoint = (p: string): { id: number; display: string } | null => {
    const parts = p.split('.');
    if (parts.length !== 3) return null;
    const [book, ch, vs] = parts as [string, string, string];
    const r = parseRef(`${book} ${ch}:${vs}`);
    if (!r.ok) return null;
    const range = r.ref.ranges[0];
    if (!range) return null;
    return { id: range.start, display: `${r.ref.book.name} ${ch}:${vs}` };
  };

  for (const line of readFileSync(tsv, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('Topic\t')) continue;
    const [topic, osis] = line.split('\t');
    if (!topic || !osis) continue;
    const [fromRaw, toRaw] = osis.split('-');
    const from = osisPoint(fromRaw ?? '');
    const to = toRaw ? osisPoint(toRaw) : from;
    if (!from || !to) { failures.push(`[${topic}] ${osis}`); continue; }
    const list = byTopic.get(topic) ?? byTopic.set(topic, []).get(topic)!;
    list.push({ osis, start: from.id, end: to.id, display: toRaw ? `${from.display}–${to.display}` : from.display });
  }

  const sections: ParsedSection[] = [];
  for (const [topic, rows] of byTopic) {
    sections.push({
      heading: topic,
      body: rows.map((r) => r.display).join('; '),
      entries: rows.map((r, i) => ({ ordinal: i + 1, label: null, start: r.start, end: r.end })),
    });
  }
  return { sections, failures };
}

// ── the works ───────────────────────────────────────────────────────────────

interface WorkDef {
  slug: string;
  parse: () => ParsedWork;
  meta: Omit<RegisterWork, 'sections' | 'publish' | 'slug'>;
  knownBad: string[];   // pinned source-edition misprints, exact tokens
  floor: number;        // minimum section count (measured at decode time)
}

const WORKS: WorkDef[] = [
  {
    slug: 'naves-topical-bible',
    parse: () => parseLdWork('data/raw/topical/nave.jsonl'),
    floor: 4800,
    knownBad: [],
    meta: {
      title: "Nave's Topical Bible", author: 'Orville J. Nave', authorDied: 1917, year: 1897,
      sourceType: 'topical_index', register: 'prose', tradition: 'methodist', era: 'modern',
      license: 'Public Domain',
      url: 'https://crosswire.org/sword/modules/ModInfo.jsp?modName=Nave',
      edition: 'CrossWire SWORD module Nave 3.0 (zLD/TEI, from ccel.org XML); sha256 of Nave.zip in data/raw/topical/CHECKSUMS.sha256',
    },
  },
  {
    slug: 'torreys-topical-textbook',
    parse: () => parseLdWork('data/raw/topical/torrey.jsonl'),
    floor: 620,
    // Source-edition misprints, verified against the module bytes 2026-08-02:
    // Obadiah/Philemon cited with impossible chapters, one backwards range.
    // Never corrected by hand — a guessed correction is an interpretive act.
    knownBad: ['Ob 3:2', 'Ob 3:7', 'Ge 36:31-29', 'Phm 3:2'],
    meta: {
      title: "The New Topical Textbook", author: 'R. A. Torrey', authorDied: 1928, year: 1897,
      sourceType: 'topical_index', register: 'prose', tradition: 'evangelical', era: 'modern',
      license: 'Public Domain',
      url: 'https://crosswire.org/sword/modules/ModInfo.jsp?modName=Torrey',
      edition: 'CrossWire SWORD module Torrey 1.3 (RawLD/ThML); sha256 of Torrey.zip in data/raw/topical/CHECKSUMS.sha256',
    },
  },
  {
    slug: 'daily-light',
    parse: () => parseDaily('data/raw/topical/daily.jsonl'),
    floor: 730,
    knownBad: [],
    meta: {
      title: 'Daily Light on the Daily Path', author: 'Jonathan Bagster', authorDied: 1890, year: 1875,
      sourceType: 'devotional', register: 'prose', tradition: 'nonconformist', era: 'modern',
      license: 'Public Domain',
      url: 'https://crosswire.org/sword/modules/ModInfo.jsp?modName=Daily',
      edition: 'CrossWire SWORD module Daily 1.0 (RawLD/ThML); KJV compilation; sha256 of Daily.zip in data/raw/topical/CHECKSUMS.sha256',
    },
  },
  {
    slug: 'openbible-topics',
    parse: () => parseOpenBible('data/raw/topical/x-openbible/topic-scores.txt'),
    floor: 6500,
    knownBad: [],
    meta: {
      title: 'OpenBible.info Topical Bible (topic curation)', author: 'OpenBible.info', year: 2026,
      sourceType: 'topical_index', register: 'prose', tradition: 'reference', era: 'modern',
      license: 'CC BY',
      attribution: 'Topic-to-passage curation © OpenBible.info, CC BY (openbible.info/topics)',
      url: 'https://www.openbible.info/topics/',
      edition: 'topic-scores.txt dated 2026-07-27 (references only, no verse text); sha256 of topic-scores.zip in data/raw/topical/CHECKSUMS.sha256',
    },
  },
];

// ── post-pass: topical_entries + the anchors register-writer does not write ──

async function writeExpansion(slug: string, parsed: ParsedWork): Promise<void> {
  const { default: pg } = await import('pg');
  const { dbUrl } = assertDevBranch();
  const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    const { rows } = await db.query<{ id: string; ordinal: number }>(
      `SELECT s.id, s.ordinal FROM sections s JOIN sources src ON src.id = s.source_id WHERE src.slug = $1`, [slug]);
    const idByOrdinal = new Map(rows.map((r) => [r.ordinal, r.id]));

    // Idempotent re-run: a prior interrupted post-pass leaves partial
    // expansion rows; sweep them and rewrite from the parse.
    await db.query(
      `DELETE FROM topical_entries WHERE section_id IN
         (SELECT s.id FROM sections s JOIN sources src ON src.id = s.source_id WHERE src.slug = $1)`, [slug]);

    let entriesWritten = 0;
    let anchorsWritten = 0;
    for (let si = 0; si < parsed.sections.length; si++) {
      const section = parsed.sections[si]!;
      const sectionId = idByOrdinal.get(si + 1);
      if (!sectionId) throw new Error(`${slug}: section ordinal ${si + 1} missing from the shelf — writer/post-pass drift`);
      if (section.entries.length === 0) continue;

      for (let i = 0; i < section.entries.length; i += 500) {
        const batch = section.entries.slice(i, i + 500);
        const params: unknown[] = [];
        const tuples = batch.map((e, j) => {
          const p = j * 5;
          params.push(sectionId, e.ordinal, e.label, e.start, e.end);
          return `($${p + 1}::bigint, $${p + 2}::int, $${p + 3}::text, $${p + 4}::int, $${p + 5}::int)`;
        });
        const r = await db.query(
          `INSERT INTO topical_entries (section_id, ordinal, label, verse_id_start, verse_id_end)
           VALUES ${tuples.join(',')} ON CONFLICT (section_id, ordinal) DO NOTHING`, params);
        entriesWritten += r.rowCount ?? 0;
      }

      // anchors[0] was written by register-writer; the rest land here so the
      // on-range retrieval legs see every passage a topic classifies.
      // section_anchors' PK is (section_id, verse_id_start) — a topic citing
      // the same start verse twice (Nave does, under different subtopics) is
      // ONE anchor row; the full duplicate story lives in topical_entries.
      const seen = new Set<number>();
      const rest = section.entries.filter((e) => {
        if (seen.has(e.start)) return false;
        seen.add(e.start);
        return true;
      }).slice(1);
      for (let i = 0; i < rest.length; i += 500) {
        const batch = rest.slice(i, i + 500);
        const params: unknown[] = [];
        const tuples = batch.map((e, j) => {
          const p = j * 3;
          params.push(sectionId, e.start, e.end);
          return `($${p + 1}::bigint, $${p + 2}::int, $${p + 3}::int)`;
        });
        const r = await db.query(
          `INSERT INTO section_anchors (section_id, verse_id_start, verse_id_end)
           VALUES ${tuples.join(',')}
           ON CONFLICT (section_id, verse_id_start) DO NOTHING`, params);
        anchorsWritten += r.rowCount ?? 0;
      }
    }
    console.log(`  → ${slug}: ${entriesWritten} topical entries, ${anchorsWritten} additional anchors`);
  } finally {
    await db.end();
  }
}

// ── main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const only = arg('--only');
  const dryRun = has('--dry-run');
  // --post-only: rerun ONLY the expansion post-pass for a work whose
  // writeRegisterWork already completed (an interrupted post-pass must not
  // cost a full re-embed).
  const postOnly = arg('--post-only');
  const works = only ? WORKS.filter((w) => w.slug === only) : WORKS;
  if (works.length === 0) throw new Error(`no work named "${only}" (have: ${WORKS.map((w) => w.slug).join(', ')})`);

  if (postOnly) {
    const def = WORKS.find((w) => w.slug === postOnly);
    if (!def) throw new Error(`no work named "${postOnly}"`);
    await writeExpansion(def.slug, def.parse());
    return;
  }

  let failed = false;
  for (const def of works) {
    const parsed = def.parse();
    const unexpected = parsed.failures.filter((f) => !def.knownBad.some((k) => f.endsWith(k)));
    const totalRefs = parsed.sections.reduce((n, s) => n + s.entries.length, 0);
    const anchored = parsed.sections.filter((s) => s.entries.length > 0).length;
    console.log(`${def.slug}: ${parsed.sections.length} sections (${anchored} anchored), ${totalRefs} refs, ` +
      `${parsed.failures.length} scan failure(s) [${def.knownBad.length} pinned]`);

    if (parsed.sections.length < def.floor) {
      console.error(`  ✗ FLOOR: ${parsed.sections.length} < ${def.floor} sections — treat as parse failure`);
      failed = true; continue;
    }
    if (unexpected.length > 0) {
      console.error(`  ✗ ${unexpected.length} UNPINNED failure(s):`);
      for (const f of unexpected.slice(0, 20)) console.error(`     ${f}`);
      failed = true; continue;
    }
    if (dryRun) continue;

    const work: RegisterWork = {
      ...def.meta,
      slug: def.slug,
      publish: false, // publish is the owner's gate, never this script's
      sections: parsed.sections.map((s): RegisterSection => ({
        heading: s.heading,
        body: s.body,
        anchors: s.entries.length > 0
          ? [{ verseIdStart: s.entries[0]!.start, verseIdEnd: s.entries[0]!.end }]
          : undefined,
      })),
    };
    const { embedded } = await writeRegisterWork(work);
    console.log(`  → ${def.slug}: ${embedded} flat rows embedded`);
    await writeExpansion(def.slug, parsed);
  }
  if (failed) process.exit(1);
}

main().catch((e) => { console.error('FAILED:', (e as Error).message); process.exit(1); });
