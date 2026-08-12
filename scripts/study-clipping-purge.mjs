// Flow D ops job (docs/STUDY_DOCS_DESIGN.md Flow D; build task 1.8): when a work is
// quarantined after users have clipped from it, PURGE the stored quotes — `quote = NULL,
// cleared_at = now()`, attribution and reference keys kept — so every affected block becomes a
// tombstone as a DATA STATE, not merely a render decision. And because the keys survive,
// REHYDRATE re-snapshots a re-licensed work's clippings from the corpus (quarantine is not a
// one-way door, design Flow D.4).
//
// This is an OPS tool, not an app path: it crosses user boundaries by design (a licensing
// purge hits every user's clippings from the work), so it connects as the owner role the
// operator supplies — RLS does not scope it, the explicit filters below do.
//
// SAFETY RAILS, in order:
//   - DRY-RUN IS THE DEFAULT, and it is not a lookalike: the REAL update statement runs inside
//     a transaction and the mode only decides COMMIT vs ROLLBACK. The dry-run's row count is
//     exactly what --execute would have written, by construction.
//   - A FILTER IS REQUIRED (--slug, --source-ids, or --section-ids). There is no "purge
//     everything" invocation.
//   - TARGET GUARD: same rule as db/apply-migration.mjs — localhost, a known dev endpoint, or
//     an endpoint declared by exact id (PURGE_TARGET_ENDPOINT=ep-…). Production is refused
//     unless PURGE_ALLOW_PROD=1, and anything touching production requires the owner's
//     explicit go, every time (AGENTS.md rule 7) — the flag records that the gate was passed
//     deliberately, it does not replace the human.
//   - Rehydration re-runs the SERVING predicates inside the UPDATE itself (published +
//     provenance-clean for sections; served + corpus + provenance-clean for embeddings, lowest
//     clean chunk) — a work that is not actually re-servable rehydrates nothing. Fail closed.
//
// USAGE
//   node scripts/study-clipping-purge.mjs --slug <work-slug>                  # dry-run purge
//   node scripts/study-clipping-purge.mjs --slug <work-slug> --execute
//   node scripts/study-clipping-purge.mjs --source-ids a,b --section-ids 1,2  # explicit keys
//   node scripts/study-clipping-purge.mjs --mode rehydrate --slug <work-slug> [--execute]
//
// NOTE on --slug scope: it matches blocks by their stored work_slug. Ask-surface clippings
// whose embeddings row carried no `metadata->>'work'` have work_slug NULL and are NOT matched
// by --slug — purge those by --source-ids. The dry-run prints what it found; read it.

import pg from 'pg';
import { isAuditAllowedHost } from './lib/target-guard.mjs';
// The ONE canonical forbidden-aggregator list (ADR-008) — imported, never re-typed; a second
// copy is the watchlist's hand-maintained-set defect. Plain .mjs so this runs under bare node.
import { FORBIDDEN_PROVENANCE_DOMAINS } from '../src/ingest/forbidden-provenance.mjs';

function parseArgs(argv) {
  const args = { mode: 'purge', execute: false, slug: null, sourceIds: [], sectionIds: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--execute') args.execute = true;
    else if (a === '--mode') args.mode = argv[++i];
    else if (a === '--slug') args.slug = argv[++i];
    else if (a === '--source-ids') args.sourceIds = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--section-ids') {
      args.sectionIds = (argv[++i] ?? '').split(',').map((s) => Number(s.trim())).filter((n) => Number.isSafeInteger(n) && n > 0);
    } else {
      console.error(`unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

const args = parseArgs(process.argv);
if (args.mode !== 'purge' && args.mode !== 'rehydrate') {
  console.error("--mode must be 'purge' or 'rehydrate'");
  process.exit(1);
}
if (!args.slug && args.sourceIds.length === 0 && args.sectionIds.length === 0) {
  console.error('a filter is required: --slug <work-slug>, --source-ids a,b, and/or --section-ids 1,2');
  console.error('(there is deliberately no way to run this against every clipping at once)');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL (owner role) is required — this tool never reads env files on its own');
  process.exit(1);
}
if (process.env.PURGE_ALLOW_PROD !== '1') {
  let allowed = false;
  try {
    allowed = isAuditAllowedHost(url, process.env.PURGE_TARGET_ENDPOINT);
  } catch {
    allowed = false;
  }
  if (!allowed) {
    console.error(
      '✗ REFUSE: DATABASE_URL is not localhost, not a known dev endpoint, and not declared.\n' +
        '  Declare a dev branch by exact endpoint id: PURGE_TARGET_ENDPOINT=ep-xxxx-yyyy-zzzz\n' +
        '  A deliberate production run additionally requires PURGE_ALLOW_PROD=1 and the owner at the terminal.',
    );
    process.exit(1);
  }
}

// The shared block filter, as SQL + params starting at $1: live clipping rows matching the
// operator's keys. Purge additionally requires a live quote; rehydrate the opposite.
function blockFilter(startAt) {
  const clauses = [];
  const params = [];
  let n = startAt;
  if (args.slug) {
    clauses.push(`b.work_slug = $${n++}`);
    params.push(args.slug);
  }
  if (args.sourceIds.length > 0) {
    clauses.push(`b.source_id = ANY($${n++}::text[])`);
    params.push(args.sourceIds);
  }
  if (args.sectionIds.length > 0) {
    clauses.push(`b.section_id = ANY($${n++}::bigint[])`);
    params.push(args.sectionIds);
  }
  return { sql: `(${clauses.join(' OR ')})`, params };
}

const PROVENANCE_BELT_SECTIONS = `(s.source_url IS NULL OR NOT EXISTS (
    SELECT 1 FROM unnest($FORB::text[]) d WHERE lower(s.source_url) LIKE '%' || d || '%'))`;
const PROVENANCE_BELT_EMBEDDINGS = `(e.metadata->>'sourceUrl' IS NULL OR NOT EXISTS (
    SELECT 1 FROM unnest($FORB::text[]) d WHERE lower(e.metadata->>'sourceUrl') LIKE '%' || d || '%'))`;

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  const who = await client.query('select current_user');
  console.log(`connected as ${who.rows[0].current_user} · mode=${args.mode} · ${args.execute ? 'EXECUTE' : 'DRY-RUN (rolled back)'}`);

  await client.query('BEGIN');
  let statements;
  if (args.mode === 'purge') {
    const f = blockFilter(1);
    statements = [
      {
        label: 'purge quotes (tombstone data state; keys and attribution kept)',
        sql: `UPDATE study_blocks b
              SET quote = NULL, cleared_at = now(), updated_at = now()
              WHERE b.kind = 'clipping' AND b.deleted_at IS NULL AND b.quote IS NOT NULL
                AND ${f.sql}
              RETURNING b.id, b.work_slug, b.source_id, b.section_id`,
        params: f.params,
      },
    ];
  } else {
    // Rehydrate, one statement per key leg; each re-runs the serving predicate in-statement.
    const fSection = blockFilter(2);
    const fSource = blockFilter(2);
    statements = [
      {
        label: 'rehydrate section-keyed clippings (published + provenance-clean only)',
        sql: `UPDATE study_blocks b
              SET quote = s.body, cleared_at = NULL, updated_at = now()
              FROM sections s JOIN sources src ON src.id = s.source_id
              WHERE b.kind = 'clipping' AND b.deleted_at IS NULL
                AND b.cleared_at IS NOT NULL AND b.quote IS NULL
                AND b.section_id = s.id
                AND ${fSection.sql}
                AND src.status = 'published'
                AND ${PROVENANCE_BELT_SECTIONS.replaceAll('$FORB', '$1')}
              RETURNING b.id, b.work_slug, b.section_id`,
        params: [FORBIDDEN_PROVENANCE_DOMAINS, ...fSection.params],
      },
      {
        label: 'rehydrate source-keyed clippings (served, lowest clean chunk)',
        sql: `UPDATE study_blocks b
              SET quote = e.content, cleared_at = NULL, updated_at = now()
              FROM (
                SELECT DISTINCT ON (e.source_id) e.source_id, e.content
                FROM embeddings e
                WHERE (e.source_type, e.source_id) IN (
                        SELECT split_part(b2.source_id, ':', 1), b2.source_id
                        FROM study_blocks b2
                        WHERE b2.kind = 'clipping' AND b2.deleted_at IS NULL
                          AND b2.cleared_at IS NOT NULL AND b2.quote IS NULL AND b2.source_id IS NOT NULL)
                  AND e.user_id IS NULL AND e.served
                  AND e.metadata->>'author' IS NOT NULL
                  AND ${PROVENANCE_BELT_EMBEDDINGS.replaceAll('$FORB', '$1')}
                ORDER BY e.source_id, e.chunk_index
              ) e
              WHERE b.kind = 'clipping' AND b.deleted_at IS NULL
                AND b.cleared_at IS NOT NULL AND b.quote IS NULL
                -- a both-keyed block rehydrates from its section (its snapshot store of
                -- record, design §2.2); this leg takes the source_id-only rows
                AND b.section_id IS NULL
                AND b.source_id = e.source_id
                AND ${fSource.sql}
              RETURNING b.id, b.work_slug, b.source_id`,
        params: [FORBIDDEN_PROVENANCE_DOMAINS, ...fSource.params],
      },
    ];
  }

  let total = 0;
  for (const st of statements) {
    const res = await client.query(st.sql, st.params);
    total += res.rowCount ?? 0;
    console.log(`\n${st.label}: ${res.rowCount} block(s)`);
    for (const row of res.rows.slice(0, 20)) {
      console.log(`  ${row.id}  slug=${row.work_slug ?? '—'}  source_id=${row.source_id ?? '—'}  section_id=${row.section_id ?? '—'}`);
    }
    if ((res.rowCount ?? 0) > 20) console.log(`  … and ${res.rowCount - 20} more`);
  }

  if (args.execute) {
    await client.query('COMMIT');
    console.log(`\nCOMMITTED: ${total} block(s) ${args.mode === 'purge' ? 'tombstoned' : 'rehydrated'}.`);
  } else {
    await client.query('ROLLBACK');
    console.log(`\nDRY-RUN: rolled back. ${total} block(s) would be ${args.mode === 'purge' ? 'tombstoned' : 'rehydrated'}; re-run with --execute to apply.`);
  }
} catch (e) {
  try { await client.query('ROLLBACK'); } catch { /* connection may already be gone */ }
  console.error(`✗ ${args.mode} failed (rolled back): ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
