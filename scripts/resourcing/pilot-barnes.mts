// Re-sourcing pipeline step 3 — the barnes-notes pilot (docs/RESOURCING_PLAN.md §3,
// corpus-backlog decisions #4b/#5). DEV ONLY.
//
//   npx tsx scripts/resourcing/pilot-barnes.mts --env=dev                       # dry-run (default)
//   npx tsx scripts/resourcing/pilot-barnes.mts --env=dev --apply               # repairs + re-embeds on dev
//
// Per staged section of `barnes-notes`, the match test (match-test.mts) decides:
//   MATCH (incl. truncated) → provenance-repair: keep body + section_embeddings,
//                             set sections.source_url to the permitted source. $0.
//   DIFFER                  → replace body with the permitted text + re-embed
//                             (DeepInfra BAAI/bge-large-en-v1.5, pinned).
//   NO-SOURCE               → module has no text for that chapter → leave
//                             quarantined, report.
//
// MATCH UNIT = CHAPTER. The stored NT sections are ~800-char chunks all anchored
// at the chapter's first verse (measured 2026-08-13: 5 chunks on Matt 1:1), and
// the OT sections are one ~5000-char section per chapter — while the CrossWire
// module is per-verse. So both sides are aggregated to chapter text and compared
// once per chapter; every section of the chapter inherits the chapter verdict.
// DIFFER re-slices the permitted chapter text across the chapter's existing
// sections proportionally to their current lengths (word-boundary aligned) — the
// stored chunking policy is preserved; no sections are created, deleted, or
// re-ordinalled (RESOURCING_PLAN §4: section identities are stable).
//
// The sources ROW stays `staged` — the publish flip is a later owner-gated step.
// sources.provenance is only rewritten when EVERY section of the work repaired
// clean (zero differ, zero no-source); a partial repair must not launder the
// work-level provenance.
//
// Endpoint assertion: refuses any host containing ep-odd-fog (case-insensitive)
// and anything not on the dev allow-list. Connection URL comes from the root
// .env.local and is never printed. Dry-run is the default and writes nothing.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { hostOf, isDevHost, isProdHost } from '../lib/target-guard.mjs';
import { compareTexts, isRepairable, MATCH_THRESHOLD, type CompareResult } from './match-test.mjs';

const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);
const APPLY = process.argv.includes('--apply');

const SLUG = arg('--slug') ?? 'barnes-notes';
const JSONL = arg('--jsonl') ?? 'data/raw/sword/barnes.jsonl';
const EVIDENCE_DIR = arg('--evidence-dir') ?? 'docs/evidence/resourcing';
const PERMITTED_URL = arg('--permitted-url') ?? 'https://crosswire.org/sword/modules/ModInfo.jsp?modName=Barnes';
const PERMITTED_EDITION = "Barnes' New Testament Notes (CrossWire SWORD module Barnes, ThML, v1.1)";
const MODEL = 'BAAI/bge-large-en-v1.5';
const MODEL_SLUG = 'bge-large-en-v1.5';
const EMBED_BATCH = 64;

// ── env / target assertion ───────────────────────────────────────────────────
function envFrom(file: string, key: string): string | undefined {
  try {
    return readFileSync(file, 'utf8').match(new RegExp(`^${key}="?([^"\n]*)"?$`, 'm'))?.[1];
  } catch { return undefined; }
}

function assertDevOnly(): string {
  if (arg('--env') !== 'dev') throw new Error("usage requires --env=dev — this pilot writes to dev only; there is no prod path here");
  const url = envFrom('.env.local', 'DATABASE_URL_UNPOOLED') ?? envFrom('.env.local', 'DATABASE_URL');
  if (!url) throw new Error('no DATABASE_URL in root .env.local');
  const host = hostOf(url);
  if (host.includes('ep-odd-fog') || isProdHost(url)) throw new Error(`REFUSING: target host is production (${host.split('.')[0]}…)`);
  if (!isDevHost(url)) throw new Error(`REFUSING: target host ${host.split('.')[0]}… is not on the dev allow-list`);
  return url;
}

// ── DeepInfra embeddings (DIFFER path only) ─────────────────────────────────
// 90s timeout, retry on 429/5xx with backoff. bge-large caps at 512 tokens; the
// batch API fails wholesale if any text exceeds, so slice ~1200 chars and, on
// batch failure, re-embed singly with adaptive shortening (same discipline as
// src/ingest/ingest-sword-commentaries.mts).
function makeEmbedder(apiKey: string) {
  async function embedRaw(texts: string[], attempt = 0): Promise<number[][]> {
    const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: MODEL, input: texts, encoding_format: 'float' }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      if ((res.status === 429 || res.status >= 500) && attempt < 4) {
        await new Promise((r) => setTimeout(r, 2_000 * 2 ** attempt));
        return embedRaw(texts, attempt + 1);
      }
      throw new Error(`embed HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    return ((await res.json()) as { data: { embedding: number[] }[] }).data.map((d) => d.embedding);
  }
  return async function embedBatch(texts: string[]): Promise<number[][]> {
    try {
      return await embedRaw(texts.map((t) => t.slice(0, 1200)));
    } catch {
      const out: number[][] = [];
      for (const t of texts) {
        let len = 1200; let vec: number[] | null = null;
        while (len >= 200) {
          try { vec = (await embedRaw([t.slice(0, len)]))[0]!; break; } catch { len = Math.floor(len * 0.7); }
        }
        out.push(vec ?? []);
      }
      return out;
    }
  };
}

// ── types + chapter aggregation ─────────────────────────────────────────────
interface StoredSection { id: number; ordinal: number; body: string; sourceUrl: string | null; verseIdStart: number }
interface ModuleEntry { author: string; verseId: number; verseEnd: number; content: string }

const chapterKey = (verseId: number) => Math.floor(verseId / 1000);

interface ChapterVerdict {
  chapter: number;
  sections: StoredSection[];
  verdict: 'match' | 'truncated' | 'differ' | 'no-source';
  cmp: CompareResult | null;
  permittedText: string | null;
}

/** Re-slice `text` into `n` chunks proportional to `weights` (current body
 *  lengths), breaking on word boundaries. Deterministic — a re-run after a
 *  DIFFER repair compares the same slices back to the source and matches. */
function reslice(text: string, weights: number[]): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const out: string[] = [];
  let at = 0;
  for (let i = 0; i < weights.length; i++) {
    const target = i === weights.length - 1
      ? words.length
      : Math.min(words.length, at + Math.max(1, Math.round((weights[i]! / total) * words.length)));
    out.push(words.slice(at, target).join(' '));
    at = target;
  }
  return out;
}

async function main() {
  const url = assertDevOnly();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const verdictLog = path.join(EVIDENCE_DIR, `barnes-pilot${APPLY ? '' : '-dryrun'}-${ts}.jsonl`);
  const summaryLog = path.join(EVIDENCE_DIR, `barnes-pilot${APPLY ? '' : '-dryrun'}-summary-${ts}.json`);

  // permitted source: decoded module per-verse entries → chapter text
  const moduleEntries: ModuleEntry[] = readFileSync(JSONL, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const permittedByChapter = new Map<number, string>();
  for (const e of moduleEntries) {
    const k = chapterKey(e.verseId);
    permittedByChapter.set(k, (permittedByChapter.get(k) ?? '') + ' ' + e.content);
  }
  const moduleBooks = new Set(moduleEntries.map((e) => Math.floor(e.verseId / 1e6)));
  console.log(`permitted source: ${moduleEntries.length} entries, ${permittedByChapter.size} chapters, books ${[...moduleBooks].sort((a, b) => a - b).join(',')}`);

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const srcRow = (await client.query(
    `SELECT id, slug, status, provenance FROM sources WHERE slug = $1`, [SLUG])).rows[0];
  if (!srcRow) throw new Error(`no sources row for slug ${SLUG}`);
  console.log(`source: slug=${srcRow.slug} status=${srcRow.status} (stays staged — publish flip is owner-gated, not this script)`);

  const sections: StoredSection[] = (await client.query(
    `SELECT s.id, s.ordinal, s.body, s.source_url AS "sourceUrl", sa.verse_id_start AS "verseIdStart"
     FROM sections s
     JOIN section_anchors sa ON sa.section_id = s.id
     WHERE s.source_id = $1 ORDER BY s.ordinal`, [srcRow.id])).rows;
  console.log(`staged sections: ${sections.length}`);

  // group stored sections by chapter (ordinal order preserved)
  const byChapter = new Map<number, StoredSection[]>();
  for (const s of sections) {
    const k = chapterKey(s.verseIdStart);
    if (!byChapter.has(k)) byChapter.set(k, []);
    byChapter.get(k)!.push(s);
  }

  // the match test, per chapter
  const chapters: ChapterVerdict[] = [];
  for (const [k, secs] of [...byChapter.entries()].sort((a, b) => a[0] - b[0])) {
    const permitted = permittedByChapter.get(k)?.trim() || null;
    if (!permitted) {
      chapters.push({ chapter: k, sections: secs, verdict: 'no-source', cmp: null, permittedText: null });
      continue;
    }
    const storedText = secs.map((s) => s.body).join(' ');
    const cmp = compareTexts(storedText, permitted);
    chapters.push({ chapter: k, sections: secs, verdict: cmp.verdict, cmp, permittedText: permitted });
  }

  const tally = { match: 0, truncated: 0, differ: 0, 'no-source': 0 };
  const chapterTally = { match: 0, truncated: 0, differ: 0, 'no-source': 0 };
  for (const c of chapters) {
    chapterTally[c.verdict]++;
    tally[c.verdict] += c.sections.length;
  }
  console.log(`\nverdicts (chapters): match=${chapterTally.match} truncated=${chapterTally.truncated} differ=${chapterTally.differ} no-source=${chapterTally['no-source']}`);
  console.log(`verdicts (sections): match=${tally.match} truncated=${tally.truncated} differ=${tally.differ} no-source=${tally['no-source']}`);

  const verdictLines: string[] = [];
  for (const c of chapters) {
    for (const s of c.sections) {
      verdictLines.push(JSON.stringify({
        sectionId: s.id, ordinal: s.ordinal, chapter: c.chapter, verseIdStart: s.verseIdStart,
        verdict: c.verdict, unit: 'chapter', threshold: MATCH_THRESHOLD,
        jaccard: c.cmp ? +c.cmp.jaccard.toFixed(4) : null,
        containment: c.cmp ? +c.cmp.containment.toFixed(4) : null,
        shingleContainment: c.cmp?.shingleContainment ?? null,
        orderContainment: c.cmp?.orderContainment ?? null,
        guardFired: c.cmp?.guardFired ?? null,
        bodyLen: s.body.length,
      }));
    }
  }
  writeFileSync(verdictLog, verdictLines.join('\n') + '\n');
  console.log(`verdict log: ${verdictLog}`);

  const differChapters = chapters.filter((c) => c.verdict === 'differ');
  if (differChapters.length) {
    console.log(`\ndiffer chapters (first 10):`);
    for (const c of differChapters.slice(0, 10)) {
      const b = Math.floor(c.chapter / 1000), ch = c.chapter % 1000;
      console.log(`  b${b} ch${ch}: jaccard=${c.cmp!.jaccard.toFixed(3)} containment=${c.cmp!.containment.toFixed(3)} shingle=${c.cmp!.shingleContainment?.toFixed(3)} order=${c.cmp!.orderContainment?.toFixed(3)} guard=${c.cmp!.guardFired ?? '-'}`);
    }
  }

  const summary: Record<string, unknown> = {
    ts, env: 'dev', slug: SLUG, apply: APPLY,
    permitted: { url: PERMITTED_URL, edition: PERMITTED_EDITION, moduleJsonl: JSONL, entries: moduleEntries.length },
    sections: sections.length,
    sectionVerdicts: tally, chapterVerdicts: chapterTally,
  };

  if (!APPLY) {
    console.log('\nDRY-RUN — no writes. Re-run with --apply to repair on dev.');
    writeFileSync(summaryLog, JSON.stringify(summary, null, 2) + '\n');
    console.log(`summary: ${summaryLog}`);
    await client.end();
    return;
  }

  // ── --apply: repairs + re-embeds, batched transactions ──
  const apiKey = envFrom('web/.env.local', 'DEEPINFRA_API_KEY');
  const repairable = chapters.filter((c) => isRepairable(c.cmp!));
  const changed = { provenanceRepaired: 0, differReplaced: 0, embeddingsWritten: 0, charsEmbedded: 0 };

  // MATCH path: provenance-repair only (keep body + vectors). Idempotent via
  // IS DISTINCT FROM — a second --apply changes nothing.
  const repairIds = repairable.flatMap((c) => c.sections.map((s) => s.id));
  for (let i = 0; i < repairIds.length; i += 500) {
    const ids = repairIds.slice(i, i + 500);
    await client.query('BEGIN');
    try {
      const r = await client.query(
        `UPDATE sections SET source_url = $1 WHERE id = ANY($2::bigint[]) AND source_url IS DISTINCT FROM $1`,
        [PERMITTED_URL, ids]);
      await client.query('COMMIT');
      changed.provenanceRepaired += r.rowCount ?? 0;
    } catch (e) { await client.query('ROLLBACK'); throw e; }
  }
  console.log(`provenance-repaired (source_url set, rows actually changed): ${changed.provenanceRepaired}`);

  // DIFFER path: replace bodies (re-sliced permitted text) + re-embed.
  if (differChapters.length) {
    if (!apiKey) throw new Error('DIFFER chapters exist but no DEEPINFRA_API_KEY in web/.env.local — refusing to replace bodies without re-embedding');
    const embedBatch = makeEmbedder(apiKey);
    for (const c of differChapters) {
      const bodies = reslice(c.permittedText!, c.sections.map((s) => s.body.length));
      const vecs: number[][] = [];
      for (let i = 0; i < bodies.length; i += EMBED_BATCH) {
        vecs.push(...await embedBatch(bodies.slice(i, i + EMBED_BATCH)));
      }
      await client.query('BEGIN');
      try {
        for (let i = 0; i < c.sections.length; i++) {
          const vec = vecs[i]!;
          if (vec.length !== 1024) throw new Error(`embed dim ${vec.length} != 1024 for section ${c.sections[i]!.id} — aborting chapter`);
          await client.query(
            `UPDATE sections SET body = $2, source_url = $3 WHERE id = $1`,
            [c.sections[i]!.id, bodies[i]!, PERMITTED_URL]);
          await client.query(
            `INSERT INTO section_embeddings (section_id, model_slug, embedding) VALUES ($1, $2, $3::vector)
             ON CONFLICT (section_id, model_slug) DO UPDATE SET embedding = EXCLUDED.embedding`,
            [c.sections[i]!.id, MODEL_SLUG, JSON.stringify(vec)]);
        }
        await client.query('COMMIT');
        changed.differReplaced += c.sections.length;
        changed.embeddingsWritten += c.sections.length;
        changed.charsEmbedded += bodies.reduce((a, b) => a + b.length, 0);
      } catch (e) { await client.query('ROLLBACK'); throw e; }
    }
    console.log(`differ-replaced: ${changed.differReplaced} sections re-embedded (${changed.charsEmbedded} chars ≈ ${Math.round(changed.charsEmbedded / 4)} tokens)`);
  }

  // Work-level provenance: only when the repair is COMPLETE (no differ — those
  // were re-sliced, and no no-source chapters left behind).
  if (tally['no-source'] === 0 && tally.differ === 0) {
    const newProv = {
      url: PERMITTED_URL, edition: PERMITTED_EDITION, year: 1834,
      license_ref: 'module .conf DistributionLicense=Public Domain, verified via scripts/resourcing/fetch-crosswire.mts',
      retrieved_at: ts, resourced_from: 'biblehub (ADR-008) → CrossWire SWORD per RESOURCING_PLAN §3 match test',
    };
    await client.query(`UPDATE sources SET provenance = $2 WHERE id = $1`, [srcRow.id, JSON.stringify(newProv)]);
    console.log('sources.provenance updated to the permitted source (status untouched: still staged)');
    summary.sourcesProvenanceUpdated = true;
  } else {
    console.log(`sources.provenance NOT touched — repair incomplete (no-source=${tally['no-source']}, differ=${tally.differ}); work-level provenance must not launder unrepaired chapters`);
    summary.sourcesProvenanceUpdated = false;
  }

  Object.assign(summary, { changed });
  writeFileSync(summaryLog, JSON.stringify(summary, null, 2) + '\n');
  console.log(`summary: ${summaryLog}`);
  await client.end();
}

main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
