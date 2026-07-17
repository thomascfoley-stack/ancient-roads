// pnpm gate:ingest — THE single ingestion gate entrypoint (workorder 2026-07-16).
//
// Wires the gates that already existed as scattered modules into one runnable
// check, CALLING them (license-manifest, licensing, legal-corpus, content-sanity,
// resource-textmatch, check-corpus-coverage, verse-key-gate) — never re-inlining
// their rules. Ordered by reversibility: the irreversible gates (license,
// provenance, must-not-serve — you cannot un-serve copyrighted text) run first
// and fail the run even if every reversible gate is green.
//
//   pnpm gate:ingest                                  corpus mode: full sweep
//   pnpm gate:ingest -- --work=<id> --jsonl=<f.jsonl> [--match-author=<name>]
//                                                     per-work mode: adds
//                                                     count-parity, per-work verse
//                                                     keys, sanity + text-match
//                                                     for the incoming work
//
// Read-only: no gate writes to the DB. Exit 0 = every gate green.

import pg from 'pg';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { validateManifest, forbiddenProvenanceDomain } from './license-manifest.js';
import { collapseByAuthor, collapseOffenders, COLLAPSE_MAX, MIN_ENTRIES, type KeyedEntry } from './verse-key-gate.js';
import { hasQuoteBreakingEntities } from './content-sanity.js';
import { shingleSet, classify, type MatchClass } from './resource-textmatch.js';
import { checkCommentary, checkSections } from './check-corpus-coverage.js';
import {
  MUST_NOT_SERVE_AUTHORS,
  isMustNotServeAuthor,
  isPublishedCommentaryEntry,
  LEGAL_COMMENTARY_ENTRIES_PREDICATE,
} from '../../web/src/lib/legal-corpus';
import { translationShipDecision } from '../../web/src/lib/licensing';

const CORPUS_DIR = 'web/public/commentaries';
const BIBLE_DIR = 'web/public/bible';
const MANIFEST_PATH = 'ingest/sources.config.json';
const SANITY_SAMPLE = 500;
const TEXT_MATCH_MIN_REPAIR_PCT = 70; // measured floor: real PD editions shingle-match ≥78–99 (Chrysostom/Augustine runs)

function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const p = 'web/.env.local';
  if (!existsSync(p)) return undefined;
  return readFileSync(p, 'utf-8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}
const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

// Deterministic sampling (reproducible red/green evidence across runs).
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface StaticEntry {
  author: string;
  sourceUrl: string;
  verseStart: number;
  verseEnd: number;
  chapter: number;
  book: number;
  text: string;
}

interface GateResult { gate: string; tier: 'irreversible' | 'reversible'; ok: boolean; skipped?: string; detail: string }
const results: GateResult[] = [];
const record = (gate: string, tier: GateResult['tier'], ok: boolean, detail: string, skipped?: string) =>
  results.push({ gate, tier, ok, detail, ...(skipped ? { skipped } : {}) });

// ── static corpus walk (one pass feeds provenance, must-not-serve, verse-key, parity, sanity) ──
function* walkStaticEntries(): Generator<StaticEntry> {
  if (!existsSync(CORPUS_DIR)) return;
  for (const bookSlug of readdirSync(CORPUS_DIR).sort()) {
    const dir = path.join(CORPUS_DIR, bookSlug);
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir).sort()) {
      if (!f.endsWith('.json') || f === '_manifest.json') continue;
      let j: { book?: number; chapter?: number; entries?: Array<Partial<StaticEntry> & { text?: string }> };
      try { j = JSON.parse(readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
      if (!j || !Array.isArray(j.entries) || typeof j.chapter !== 'number' || typeof j.book !== 'number') continue;
      for (const e of j.entries) {
        yield {
          author: e.author ?? '',
          sourceUrl: e.sourceUrl ?? '',
          verseStart: e.verseStart ?? 0,
          verseEnd: e.verseEnd ?? 0,
          chapter: j.chapter,
          book: j.book,
          text: e.text ?? '',
        };
      }
    }
  }
}

interface WorkVerse { author: string; verseId: number; content: string }
const decodeVerseId = (v: number) => ({ book: Math.floor(v / 1e6), chapter: Math.floor((v % 1e6) / 1000), verse: v % 1000 });

function loadJsonl(p: string): WorkVerse[] {
  return readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as WorkVerse);
}

async function main() {
  const jsonlPath = arg('--jsonl');
  const workId = arg('--work');
  const perWork = !!jsonlPath;
  const work = perWork ? loadJsonl(jsonlPath!) : [];
  const matchAuthor = arg('--match-author') ?? work[0]?.author ?? '';

  const dbUrl = (localEnv('DATABASE_URL') ?? localEnv('DATABASE_URL_UNPOOLED'))!;
  const dbHost = dbUrl.match(/@([a-z0-9.-]+)/)?.[1] ?? '(unknown)';
  const branch = localEnv('NEON_BRANCH') ?? '(unset)';
  console.log('═'.repeat(72));
  console.log(`GATE:INGEST — ${perWork ? `per-work "${workId ?? matchAuthor}" (${work.length} verses)` : 'full corpus sweep'}`);
  console.log(`DB: ${dbHost}  (NEON_BRANCH=${branch})  [read-only]`);
  console.log('═'.repeat(72));

  const db = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await db.connect();

  try {
    // ════ TIER 1 — IRREVERSIBLE (license / provenance / must-not-serve) ════

    // [L1] License manifest (Gate B core) — license-manifest.validateManifest.
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as unknown;
    const violations = validateManifest(manifest);
    record('L1 license-manifest', 'irreversible', violations.length === 0,
      violations.length === 0 ? `manifest clean (${(manifest as unknown[]).length} entries)` : violations.map((v) => `${v.id}: ${v.reason}`).join(' · '));

    // [L2] Bible translations under web/public/bible — the exact scar: the old gate
    // checked commentaries/ but not bible/, and four copyrighted translations shipped.
    // licensing.translationShipDecision is block-by-default (no record ⇒ deny).
    if (existsSync(BIBLE_DIR)) {
      const bad: string[] = [];
      for (const id of readdirSync(BIBLE_DIR).sort()) {
        if (!statSync(path.join(BIBLE_DIR, id)).isDirectory()) continue;
        const d = translationShipDecision(id);
        if (!d.ship) bad.push(`${id}: ${d.reason}`);
      }
      record('L2 translation-license', 'irreversible', bad.length === 0,
        bad.length === 0 ? 'every web/public/bible/<id> has a shipping license record' : bad.join(' · '));
    } else {
      record('L2 translation-license', 'irreversible', true, 'no web/public/bible dir in this tree', 'no-dir');
    }

    // Walk the static corpus once; feed L3/L5/R2/R3/R4.
    const authorCounts = new Map<string, number>();       // non-empty text (FTS-eligible), per author
    const keyed: KeyedEntry[] = [];
    const servedForbidden = new Map<string, number>();     // served author -> forbidden-provenance count
    const mustNotServeHits = new Map<string, number>();
    const sample: StaticEntry[] = [];
    const rng = mulberry32(0xa17c0de);
    const storedChapters = new Map<string, string[]>();    // "book:chapter" -> texts (match author only)
    let staticTotal = 0;
    for (const e of walkStaticEntries()) {
      staticTotal++;
      if (e.text.trim()) authorCounts.set(e.author, (authorCounts.get(e.author) ?? 0) + 1);
      keyed.push({ author: e.author, verseStart: e.verseStart, verseEnd: e.verseEnd, chapter: e.chapter });
      const served = isPublishedCommentaryEntry({ author: e.author, book: e.book });
      if (served && forbiddenProvenanceDomain(e.sourceUrl)) {
        servedForbidden.set(e.author, (servedForbidden.get(e.author) ?? 0) + 1);
      }
      if (served && isMustNotServeAuthor(e.author)) {
        mustNotServeHits.set(e.author, (mustNotServeHits.get(e.author) ?? 0) + 1);
      }
      // reservoir sample for the sanity gate
      if (sample.length < SANITY_SAMPLE) sample.push(e);
      else { const i = Math.floor(rng() * staticTotal); if (i < SANITY_SAMPLE) sample[i] = e; }
      if (perWork && e.author === matchAuthor && e.text.trim()) {
        const k = `${e.book}:${e.chapter}`;
        const list = storedChapters.get(k) ?? [];
        list.push(e.text);
        storedChapters.set(k, list);
      }
    }

    // [L3] Served provenance — no SERVED entry from a forbidden aggregator
    // (legal-corpus.isPublishedCommentaryEntry × license-manifest.forbiddenProvenanceDomain).
    const sfList = [...servedForbidden.entries()].map(([a, n]) => `${a}: ${n.toLocaleString()} entries`);
    record('L3 served-provenance', 'irreversible', servedForbidden.size === 0,
      servedForbidden.size === 0 ? `0 served entries with forbidden provenance (of ${staticTotal.toLocaleString()} static)` : sfList.join(' · '));

    // [L4] Sources table — a staged/published (non-quarantined) source whose
    // provenance is a forbidden aggregator is publish-ELIGIBLE with dirty provenance.
    const { rows: srcRows } = await db.query<{ slug: string; status: string; url: string | null }>(
      `SELECT slug, status, provenance->>'url' AS url FROM sources WHERE status <> 'quarantined'`,
    );
    const dirtySources = srcRows.filter((r) => forbiddenProvenanceDomain(r.url ?? undefined));
    record('L4 staged-source-provenance', 'irreversible', dirtySources.length === 0,
      dirtySources.length === 0
        ? `${srcRows.length} non-quarantined sources, provenance clean`
        : dirtySources.map((r) => `${r.slug} [${r.status}] → ${r.url}`).join(' · '));

    // [L5] MUST_NOT_SERVE — static (book-aware serve check) + DB legal predicate.
    const { rows: mnsDb } = await db.query<{ author: string; n: string }>(
      `SELECT author, count(*) n FROM commentary_entries
        WHERE ${LEGAL_COMMENTARY_ENTRIES_PREDICATE} AND author = ANY($1)
        GROUP BY author`,
      [[...MUST_NOT_SERVE_AUTHORS]],
    );
    const mnsBad = [
      ...[...mustNotServeHits.entries()].map(([a, n]) => `static: ${a} (${n})`),
      ...mnsDb.map((r) => `db: ${r.author} (${r.n})`),
    ];
    record('L5 must-not-serve', 'irreversible', mnsBad.length === 0,
      mnsBad.length === 0 ? `none of ${MUST_NOT_SERVE_AUTHORS.length} banned authors reachable from a served path` : mnsBad.join(' · '));

    // ════ TIER 2 — REVERSIBLE (coverage / verse keys / parity / sanity / text-match) ════

    // [R1] Coverage — check-corpus-coverage, both targets (module call, not re-run as CLI).
    const cov = await checkCommentary(db);
    record('R1 coverage-commentary', 'reversible', cov.missing === 0, `${cov.missing} eligible source_ids un-embedded`);
    const covS = await checkSections(db);
    record('R1 coverage-sections', 'reversible', covS.missing === 0, `${covS.missing} staged sections un-embedded`);

    // [R2] Verse-key distribution (verse-key-gate module = the §3 rule).
    if (perWork) {
      const entries = work.map((w) => {
        const d = decodeVerseId(w.verseId);
        return { author: w.author, verseStart: d.verse, verseEnd: d.verse, chapter: d.chapter };
      });
      const [stat] = collapseByAuthor(entries);
      const ok = !!stat && stat.rate < COLLAPSE_MAX;
      record('R2 verse-keys(work)', 'reversible', ok,
        stat ? `${stat.author}: ${(100 * stat.rate).toFixed(1)}% collapsed (n=${stat.n}, max ${100 * COLLAPSE_MAX}%)` : 'empty work');
    }
    const offenders = collapseOffenders(collapseByAuthor(keyed));
    record('R2 verse-keys(corpus)', 'reversible', offenders.length === 0,
      offenders.length === 0
        ? `no author ≥${MIN_ENTRIES} entries collapses ≥${100 * COLLAPSE_MAX}%`
        : offenders.map((o) => `${o.author} ${(100 * o.rate).toFixed(1)}% (n=${o.n})`).join(' · '));

    // [R3] Count parity — the same work must have the same size everywhere it exists.
    //  corpus mode: static (FTS-eligible) vs commentary_entries per author, AND
    //  each non-quarantined `sources` work vs its static entry count.
    //  per-work mode: decoded JSONL vs rows already in commentary_entries for the author.
    const { rows: dbAuthors } = await db.query<{ author: string; n: string }>(
      `SELECT author, count(*) n FROM commentary_entries GROUP BY author`,
    );
    const dbCount = new Map(dbAuthors.map((r) => [r.author, Number(r.n)]));
    const parityBad: string[] = [];
    for (const [a, n] of authorCounts) {
      const d = dbCount.get(a) ?? 0;
      if (d !== n) parityBad.push(`${a}: static ${n.toLocaleString()} ≠ db ${d.toLocaleString()}`);
    }
    for (const [a, d] of dbCount) if (!authorCounts.has(a)) parityBad.push(`${a}: db-only (${d.toLocaleString()} rows, 0 static)`);
    record('R3 count-parity(static↔db)', 'reversible', parityBad.length === 0,
      parityBad.length === 0 ? `${authorCounts.size} authors, static ↔ commentary_entries counts equal` : parityBad.slice(0, 8).join(' · ') + (parityBad.length > 8 ? ` · +${parityBad.length - 8} more` : ''));

    const cfg = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Array<{ id: string; slug: string; backfill?: { match_author?: string } }>;
    const { rows: secCounts } = await db.query<{ slug: string; status: string; n: string }>(
      `SELECT src.slug, src.status, count(s.id) n FROM sources src LEFT JOIN sections s ON s.source_id = src.id
        WHERE src.status <> 'quarantined' GROUP BY src.slug, src.status`,
    );
    const pilotBad: string[] = [];
    for (const s of secCounts) {
      const entry = cfg.find((c) => c.slug === s.slug);
      const author = entry?.backfill?.match_author;
      if (!author) continue;
      const staticN = authorCounts.get(author) ?? 0;
      const staged = Number(s.n);
      if (staged !== staticN) pilotBad.push(`${s.slug} [${s.status}]: ${staged.toLocaleString()} sections staged vs ${staticN.toLocaleString()} static entries for "${author}"`);
    }
    record('R3 count-parity(staged work)', 'reversible', pilotBad.length === 0,
      pilotBad.length === 0 ? 'every non-quarantined staged work matches its corpus size' : pilotBad.join(' · '));

    if (perWork) {
      const dbN = dbCount.get(matchAuthor) ?? 0;
      record('R3 count-parity(work)', 'reversible', true,
        `incoming ${work.length.toLocaleString()} verses; commentary_entries currently has ${dbN.toLocaleString()} rows for "${matchAuthor}" (informational until ingested — re-run post-ingest for the parity check)`);
    }

    // [R4] Sampled content sanity — content-sanity.hasQuoteBreakingEntities + structure.
    const sanityPool: Array<{ where: string; text: string; vs: number; ve: number; ch: number }> = perWork
      ? work.filter((_, i) => work.length <= SANITY_SAMPLE || i % Math.ceil(work.length / SANITY_SAMPLE) === 0)
          .map((w) => { const d = decodeVerseId(w.verseId); return { where: `verseId ${w.verseId}`, text: w.content, vs: d.verse, ve: d.verse, ch: d.chapter }; })
      : sample.map((e) => ({ where: `${e.author} b${e.book} c${e.chapter}`, text: e.text, vs: e.verseStart, ve: e.verseEnd, ch: e.chapter }));
    const sanityBad: string[] = [];
    for (const s of sanityPool) {
      if (!s.text.trim()) sanityBad.push(`${s.where}: empty text`);
      else if (hasQuoteBreakingEntities(s.text)) sanityBad.push(`${s.where}: quote-breaking HTML entity`);
      else if (/<\/?[a-z][^>]*>/i.test(s.text)) sanityBad.push(`${s.where}: residual HTML tag`);
      if (!(s.vs >= 1 && s.ve >= s.vs && s.ve <= 200 && s.ch >= 1)) sanityBad.push(`${s.where}: insane keys v${s.vs}-${s.ve} ch${s.ch}`);
    }
    record('R4 content-sanity(sampled)', 'reversible', sanityBad.length === 0,
      sanityBad.length === 0 ? `${sanityPool.length} sampled entries clean (entities/tags/keys)` : sanityBad.slice(0, 6).join(' · ') + (sanityBad.length > 6 ? ` · +${sanityBad.length - 6} more` : ''));

    // [R5] Text-match (harness-wired) — incoming PD text vs what we already store for
    // the work, at CHAPTER grain (collapsed legacy keys can't align per-verse), using
    // resource-textmatch shingles. Detects wrong-edition before anything ingests.
    if (perWork) {
      if (storedChapters.size === 0) {
        record('R5 text-match(work)', 'reversible', true,
          `no stored text for "${matchAuthor}" — first ingest; the JSONL is the PD reference itself`, 'first-ingest');
      } else {
        const srcChapters = new Map<string, string[]>();
        for (const w of work) {
          const d = decodeVerseId(w.verseId);
          const k = `${d.book}:${d.chapter}`;
          const list = srcChapters.get(k) ?? [];
          list.push(w.content);
          srcChapters.set(k, list);
        }
        const tally: Record<MatchClass, number> = { match: 0, truncated: 0, differ: 0 };
        let compared = 0;
        for (const [k, texts] of srcChapters) {
          const stored = storedChapters.get(k);
          if (!stored) continue;
          compared++;
          tally[classify(shingleSet(stored.join(' ')), shingleSet(texts.join(' ')))]++;
        }
        const repairPctV = compared ? (100 * (tally.match + tally.truncated)) / compared : 0;
        const ok = compared === 0 || repairPctV >= TEXT_MATCH_MIN_REPAIR_PCT;
        record('R5 text-match(work)', 'reversible', ok,
          `${compared} chapters compared: ${tally.match} match / ${tally.truncated} truncated / ${tally.differ} differ → repair ${repairPctV.toFixed(1)}% (floor ${TEXT_MATCH_MIN_REPAIR_PCT}%)${tally.differ > compared * 0.3 ? ' — >30% differ: WRONG-EDITION ALARM, escalate' : ''}`);
      }
    }
  } finally {
    await db.end();
  }

  // ── scoreboard ──
  console.log('─'.repeat(72));
  let redIrreversible = 0, redReversible = 0;
  for (const r of results) {
    const mark = r.ok ? (r.skipped ? '○' : '✓') : '✗';
    console.log(`  ${mark} [${r.tier === 'irreversible' ? 'IRREV' : 'rev  '}] ${r.gate.padEnd(28)} ${r.detail}`);
    if (!r.ok) {
      if (r.tier === 'irreversible') redIrreversible++;
      else redReversible++;
    }
  }
  console.log('─'.repeat(72));
  const red = redIrreversible + redReversible;
  if (red > 0) {
    console.error(`✗ GATE:INGEST RED — ${redIrreversible} irreversible + ${redReversible} reversible gate(s) failing.`);
    console.error('  Nothing may be published. Staged content stays staged/quarantined until green.');
    process.exitCode = 1;
  } else {
    console.log('✓ GATE:INGEST GREEN — every gate passed. Publish remains a hard human gate.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
