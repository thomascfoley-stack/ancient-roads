// Backfill ONE source from commentary_entries/embeddings into the sources/sections
// model by RE-POINTING its existing vectors (Path A, docs/MIGRATION_DESIGN.md §1).
// No re-embedding: section_embeddings reuses embeddings.embedding verbatim, so
// coverage stays 0 and DeepInfra cost is $0.
//
//   npx tsx src/ingest/migrate-sections-slice.ts [--source=barnes-notes]
//
// Additive + idempotent: creates nothing in the legacy tables, re-runnable
// (deletes + reinserts this source's sections). Requires migrations 006 AND 031
// applied and neondb_owner (writes the new tables). Retrieval is unaffected
// (dual-read until cutover). Row identity/verse fields come from
// embeddings.metadata, so the source_id key format stays owned solely by
// source-id.ts (never re-parsed here).
//
// PROVENANCE (docs/SECTION_PROVENANCE_DESIGN.md, R1–R3). The flat pool is selected
// by AUTHOR, but the manifest entry's declared provenance and the pool's real
// per-row provenance can disagree — measured on a fresh prod fork 2026-07-28:
// 6,257 rows whose sourceUrl is a forbidden aggregator sat in pools whose manifest
// entries declare crosswire/TCP. Copying them under those sources erases the only
// signal (laundering). So:
//   R1  every section carries embeddings.metadata->>'sourceUrl' into
//       sections.source_url, row for row, through the same window-ordinal join as
//       the body and vector;
//   R2  if the pool contains forbidden rows and the manifest declares no policy,
//       this script ABORTS before writing anything;
//   R3  the policy lives in the manifest: backfill.forbidden_provenance =
//       "exclude" (slice only clean rows; the exclusion is counted on the sources
//       row) | "skip" (write nothing at all). Either requires
//       backfill.forbidden_provenance_reason. Neither declares the work
//       legitimate — quarantine-vs-re-source stays an owner call.

import pg from 'pg';
import { readFileSync, existsSync } from 'fs';
import { forbiddenProvenanceDomain, FORBIDDEN_PROVENANCE_DOMAINS } from './license-manifest';
import { assertDevOnlyTarget } from './dev-only-target.mjs';
import { assertReingestable } from './reingest-guard.js';

const MODEL_SLUG = 'bge-large-en-v1.5'; // ADR-005, matches embeddings.metadata.model

interface Provenance { url: string; edition: string; year: number | string; [k: string]: unknown }
interface ConfigEntry {
  id: string;
  slug: string;
  title: string;
  author: string;
  author_died?: number;
  year_written?: number;
  source_type: string;
  tradition: string;
  era: string;
  license: string;
  provenance: Provenance;
  backfill?: {
    match_author?: string;
    forbidden_provenance?: 'exclude' | 'skip';
    forbidden_provenance_reason?: string;
  };
}

function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const p = 'web/.env.local';
  if (!existsSync(p)) return undefined;
  return readFileSync(p, 'utf-8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}

function argValue(flag: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit?.slice(flag.length + 1);
}

async function main() {
  const wantId = argValue('--source') ?? 'barnes-notes';

  const manifestPath = 'ingest/sources.config.json';
  if (!existsSync(manifestPath)) throw new Error(`${manifestPath} not found`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as ConfigEntry[];
  const entry = manifest.find((e) => e.id === wantId);
  if (!entry) throw new Error(`source "${wantId}" not in ${manifestPath}`);

  const matchAuthor = entry.backfill?.match_author;
  if (!matchAuthor) throw new Error(`source "${wantId}" has no backfill.match_author (the author string in embeddings.metadata)`);

  // R3: validate the declared policy BEFORE touching the database. A policy without a
  // recorded reason is a ruling nobody can audit; an unknown value is a typo that would
  // otherwise silently take the abort path and read as a data problem.
  const policy = entry.backfill?.forbidden_provenance;
  if (policy !== undefined && policy !== 'exclude' && policy !== 'skip') {
    throw new Error(`source "${wantId}": backfill.forbidden_provenance="${String(policy)}" is not "exclude" | "skip"`);
  }
  if (policy !== undefined && !entry.backfill?.forbidden_provenance_reason?.trim()) {
    throw new Error(`source "${wantId}": backfill.forbidden_provenance="${policy}" requires a non-empty backfill.forbidden_provenance_reason`);
  }

  // R3 "skip": do not create or refresh the source at all; write NOTHING. The runner
  // (cutover-e4-slice-all) records it as an expected skip. Exit here — before any
  // connection — so a skip can never half-write.
  if (policy === 'skip') {
    console.log(`SKIP (declared) — ${entry.title} (${wantId}): backfill.forbidden_provenance="skip"`);
    console.log(`  reason: ${entry.backfill!.forbidden_provenance_reason}`);
    console.log('  nothing written; the ruling on this work (quarantine or re-source) is the owner\'s.');
    return;
  }

  const dbUrl = localEnv('DATABASE_URL_UNPOOLED') ?? localEnv('DATABASE_URL');
  if (!dbUrl) throw new Error('owner DATABASE_URL is required (neondb_owner — writes the new tables)');
  // This script had NO target guard of any kind, and it DELETEs sections/anchors/embeddings for a
  // source before re-inserting (2026-08-02 deep audit, C5). Every guard lived in the OPTIONAL
  // wrapper scripts/cutover-e4-slice-all.mjs, which injects MIGRATE_ALLOW_PROD=1 CUTOVER_ALLOW=1 —
  // so running `pnpm migrate:sections-slice` directly with a prod URL rewrote a published work's
  // sections with no refusal. Six works are now published; that is no longer a dev-only mistake.
  assertDevOnlyTarget(
    dbUrl,
    process.env.DATABASE_URL ? process.env.NEON_BRANCH : localEnv('NEON_BRANCH'),
    'the section re-slice (it DELETEs and re-inserts the work sections)',
  );
  const client = new pg.Client({ connectionString: dbUrl.replace(/^"|"$/g, ''), ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await client.query('BEGIN');

    // M22b: this file NEVER had a published-work check — and it is the script that wrote all
    // 72,863 production sections, exposed as `pnpm migrate:sections-slice`, deleting every section
    // of the slug it re-slices. Inside the transaction, on a row locked FOR UPDATE, so a publish
    // flip cannot land between the check and the DELETE below. Also refuses when user annotations
    // anchor into the work (M21) instead of letting the FK raise 23503 mid-transaction.
    await assertReingestable(client, entry.slug, 'the section re-slice');

    // R1 preflight: the provenance column must exist before any row is copied. Failing
    // closed here (not skipping the copy of source_url) is the point — a slice that ran
    // without 031 would recreate the laundering path this file exists to close.
    const hasCol = await client.query<{ ok: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_name='sections' AND column_name='source_url') AS ok`,
    );
    if (!hasCol.rows[0]!.ok) {
      throw new Error('sections.source_url does not exist — apply db/migrations/031_sections_source_url.sql before slicing');
    }

    // R2: measure the pool's REAL per-row provenance before writing anything. Coarse SQL
    // pre-filter + exact host-aware re-check, the same two-step b2-remove-forbidden-
    // provenance uses, so this counts EXACTLY what the ratchet counts. NULL sourceUrl is
    // clean (the helloao works carry none).
    const LIKE_PATTERNS = FORBIDDEN_PROVENANCE_DOMAINS.map((d) => `%${d}%`);
    const { rows: poolRows } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM embeddings e
        WHERE e.user_id IS NULL AND e.source_type='commentary' AND e.metadata->>'author' = $1`,
      [matchAuthor],
    );
    const poolCount = poolRows[0]!.n;
    if (poolCount === 0) throw new Error(`no embeddings matched author "${matchAuthor}" — nothing to migrate`);

    const { rows: candRows } = await client.query<{ id: string; url: string }>(
      `SELECT e.id, e.metadata->>'sourceUrl' AS url FROM embeddings e
        WHERE e.user_id IS NULL AND e.source_type='commentary' AND e.metadata->>'author' = $1
          AND e.metadata->>'sourceUrl' ILIKE ANY($2)`,
      [matchAuthor, LIKE_PATTERNS],
    );
    const forbidden = candRows.filter((r) => forbiddenProvenanceDomain(r.url) !== null);
    const forbiddenDomains = [...new Set(forbidden.map((r) => forbiddenProvenanceDomain(r.url)!))].sort();

    if (forbidden.length > 0 && policy === undefined) {
      throw new Error(
        `REFUSE (provenance): ${forbidden.length} of ${poolCount} flat rows for "${wantId}" carry forbidden-aggregator ` +
        `provenance (${forbiddenDomains.join(', ')}) and the manifest declares no policy. Copying them would land ` +
        `aggregator text under this source's clean provenance record with no row-level signal. Two legal fixes, one ` +
        `line each in ${manifestPath}: backfill.forbidden_provenance="exclude" (slice only the clean rows, exclusion ` +
        `counted on the sources row) or "skip" (write nothing) — both with forbidden_provenance_reason. Neither ` +
        `declares the work legitimate; quarantine-vs-re-source is the owner's ruling.`,
      );
    }
    if (policy === 'exclude' && poolCount - forbidden.length === 0) {
      throw new Error(
        `source "${wantId}": forbidden_provenance="exclude" would exclude ALL ${poolCount} rows — nothing clean remains. ` +
        `Use "skip" instead (an all-forbidden pool is a mislabeled manifest entry, not a mixed one).`,
      );
    }
    const excludedIds = policy === 'exclude' ? forbidden.map((r) => r.id) : [];
    const excludedCount = excludedIds.length;
    if (policy === 'exclude') {
      console.log(`provenance policy "exclude": ${excludedCount} of ${poolCount} rows excluded (${forbiddenDomains.join(', ') || 'none present'})`);
    }

    // 1. Upsert the source row from the reviewed config (license + provenance = Gate B).
    const { rows: srcRows } = await client.query<{ id: string }>(
      `INSERT INTO sources
         (slug, title, author, author_died, year_written, source_type, tradition, era, language, license, provenance, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'en',$9,$10::jsonb,'staged')
       ON CONFLICT (slug) DO UPDATE SET
         title=EXCLUDED.title, author=EXCLUDED.author, author_died=EXCLUDED.author_died,
         year_written=EXCLUDED.year_written, source_type=EXCLUDED.source_type,
         tradition=EXCLUDED.tradition, era=EXCLUDED.era, license=EXCLUDED.license,
         provenance=EXCLUDED.provenance
       RETURNING id`,
      [entry.slug, entry.title, entry.author, entry.author_died ?? null, entry.year_written ?? null,
        entry.source_type, entry.tradition, entry.era, entry.license, JSON.stringify(entry.provenance)],
    );
    const sourcePk = srcRows[0]!.id;

    // R3: an "exclude" slice records what it excluded ON the sources row, in the store's
    // own key (ADR-029 addendum 2) — so the store can prove its own composition instead
    // of the absence being read as cleanliness. Recorded even when 0, as evidence the
    // policy ran.
    if (policy === 'exclude') {
      await client.query(
        `UPDATE sources SET provenance = provenance || $2::jsonb WHERE id = $1`,
        [sourcePk, JSON.stringify({
          excluded_forbidden_rows: excludedCount,
          excluded_forbidden_domains: forbiddenDomains,
          excluded_forbidden_reason: entry.backfill!.forbidden_provenance_reason,
        })],
      );
    }

    // 2. Idempotency: clear any prior rows for this source (children first).
    await client.query(`DELETE FROM section_embeddings se USING sections s WHERE se.section_id=s.id AND s.source_id=$1`, [sourcePk]);
    await client.query(`DELETE FROM section_anchors sa USING sections s WHERE sa.section_id=s.id AND s.source_id=$1`, [sourcePk]);
    await client.query(`DELETE FROM sections WHERE source_id=$1`, [sourcePk]);

    // 3. sections/anchors/embeddings via direct INSERT…SELECT — NO temp stage.
    //    Staging rows+vectors in a temp table exhausts temp_buffers on works
    //    past ~10k rows ("no empty local buffer available" on K&D, 23k rows).
    //    The window ordinal is recomputed per statement; the ORDER BY ends in
    //    unique tiebreakers, so every computation is identical. Vectors stream
    //    table→table in the final insert — never staged in local buffers.
    //    (SRC_FILTER takes its params explicitly — PG rejects a query that uses
    //    $2 without $1 present.) The exclusion is by EXACT id — the ids the
    //    host-aware predicate flagged — never by re-running an ILIKE that could
    //    disagree with it. An empty id array excludes nothing. Every statement
    //    carries the same exclusion, so the window ordinals stay aligned 1:1:1.
    const SRC_FILTER = (author: string, ids: string) =>
      `FROM embeddings e WHERE e.user_id IS NULL AND e.source_type='commentary' AND e.metadata->>'author' = ${author} AND NOT (e.id = ANY(${ids}::uuid[]))`;
    const ORDINAL = `row_number() OVER (ORDER BY (e.metadata->>'verseId')::int, e.source_id, e.chunk_index)`;
    const { rows: staged } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n ${SRC_FILTER('$1', '$2')}`, [matchAuthor, excludedIds]);
    const stagedCount = staged[0]!.n;
    if (stagedCount === 0) throw new Error(`no embeddings matched author "${matchAuthor}" after exclusion — nothing to migrate`);

    // 4. sections <- text + row-level provenance (R1); 5. anchors <- verse range;
    // 6. section_embeddings <- REUSED vectors.
    await client.query(
      `INSERT INTO sections (source_id, ordinal, body, source_url)
       SELECT $1, ${ORDINAL}, e.content, e.metadata->>'sourceUrl' ${SRC_FILTER('$2', '$3')}`,
      [sourcePk, matchAuthor, excludedIds],
    );
    await client.query(
      `INSERT INTO section_anchors (section_id, verse_id_start, verse_id_end)
       SELECT s.id, n.vstart, n.vend FROM sections s
       JOIN (SELECT ${ORDINAL} AS ordinal, (e.metadata->>'verseId')::int AS vstart, (e.metadata->>'verseEnd')::int AS vend ${SRC_FILTER('$2', '$3')}) n
         ON n.ordinal = s.ordinal
       WHERE s.source_id = $1`,
      [sourcePk, matchAuthor, excludedIds],
    );
    await client.query(
      `INSERT INTO section_embeddings (section_id, model_slug, embedding)
       SELECT s.id, $4, n.embedding FROM sections s
       JOIN (SELECT ${ORDINAL} AS ordinal, e.embedding ${SRC_FILTER('$2', '$3')}) n
         ON n.ordinal = s.ordinal
       WHERE s.source_id = $1`,
      [sourcePk, matchAuthor, excludedIds, MODEL_SLUG],
    );

    const { rows: c } = await client.query<{ sections: string; anchors: string; embeddings: string }>(
      `SELECT (SELECT count(*) FROM sections WHERE source_id=$1) AS sections,
              (SELECT count(*) FROM section_anchors sa JOIN sections s ON s.id=sa.section_id WHERE s.source_id=$1) AS anchors,
              (SELECT count(*) FROM section_embeddings se JOIN sections s ON s.id=se.section_id WHERE s.source_id=$1) AS embeddings`,
      [sourcePk],
    );

    await client.query('COMMIT');

    console.log('='.repeat(66));
    console.log(`RE-POINT SLICE — ${entry.title} (source_id=${sourcePk}, status=staged)`);
    console.log('='.repeat(66));
    console.log(`  flat pool (author="${matchAuthor}"):            ${poolCount}`);
    console.log(`  excluded (forbidden provenance, declared):     ${excludedCount}${excludedCount > 0 ? ` (${forbiddenDomains.join(', ')})` : ''}`);
    console.log(`  sections inserted:                            ${c[0]!.sections}`);
    console.log(`  section_anchors inserted:                     ${c[0]!.anchors}`);
    console.log(`  section_embeddings (reused, model=${MODEL_SLUG}): ${c[0]!.embeddings}`);
    // Postcondition RESTATED (SECTION_PROVENANCE_DESIGN §5): it was
    // `sections == flat pool`; it is now `sections + excluded == flat pool`, with the
    // exclusion measured and printed. A silent inequality is still an abort.
    const ok = c[0]!.sections === c[0]!.embeddings && Number(c[0]!.sections) + excludedCount === poolCount;
    console.log(ok
      ? `\n✓ sections == section_embeddings, and sections + excluded == flat pool (${c[0]!.sections} + ${excludedCount} == ${poolCount}). Coverage will be 0.`
      : '\n✗ count mismatch — investigate before publishing.');
    if (!ok) process.exitCode = 1;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
