// Re-point ONE register work from the SERVED flat embeddings store into the
// sources/sections model by RE-USING its existing vectors 1:1 (Path A,
// docs/MIGRATION_DESIGN.md §1) — the register-work variant of
// migrate-sections-slice.ts (which slices commentary by metadata author).
// No re-embedding: section_embeddings copies embeddings.embedding verbatim
// (model_slug='bge-large-en-v1.5'), so DeepInfra cost is $0.
//
//   npx tsx src/ingest/repoint-sections-work.ts --source=wheatley-poems [--dry]
//
// Register writers (register-writer.ts) fill the flat store and the sources
// row but write NO sections; this tool is the bridge the Book Reader needs.
// Filter: metadata->>'work' = slug. Section heading: metadata->>'heading'
// (falling back to "<title> — chunk N"). Section body: embeddings.content with
// the composed-in heading line stripped — register-writer composes
// `heading\nbody`, and its chunker can space-join the heading to the first
// sentence (even collapsing a whitespace run inside it), so all three prefix
// forms are stripped; continuation chunks carry no heading and stay whole.
// Order: the writer's source_id "type:slug:N[.M]" parsed NUMERICALLY (section
// N, chunk M) — a plain text sort would put section 10 before 2. Additive +
// idempotent: deletes + reinserts the work's sections (children first),
// re-runnable. Never writes sources (status stays as the writers left it) and
// never writes section_anchors (register verse anchors live in the static
// reader corpus). Guards: NEON_BRANCH must be dev|test (same source as
// DATABASE_URL) and the DB host must be the dev endpoint (ep-tiny-hat).

import pg from 'pg';
import { readFileSync, existsSync } from 'fs';
import { assertDevOnlyTarget } from './dev-only-target.mjs';
import { assertReingestable } from './reingest-guard.js';
import { attributionBoundaryHold } from './register-writer.js';

const MODEL_SLUG = 'bge-large-en-v1.5'; // ADR-005, matches embeddings.metadata.model

// One embeddings row (metadata.work, in writer source_id order) => one
// section. Vectors stay in SQL and are never round-tripped through JS.
const STAGE_SELECT = `
  SELECT row_number() OVER (ORDER BY
             split_part(split_part(e.source_id, ':', 3), '.', 1)::int,
             COALESCE((e.metadata->>'chunk_index')::int,
               NULLIF(split_part(split_part(e.source_id, ':', 3), '.', 2), '')::int, 1),
             e.source_id) AS ordinal,
         e.metadata->>'heading' AS heading,
         -- Strip the composed heading from CHUNK 1 ONLY. The writer composes
         -- "heading + newline + body" and chunks sequentially, so the heading
         -- can only begin the first chunk; on continuation chunks (.2+) a
         -- recurring refrain / title line is body text and must stay
         -- (fresh-audit 2026-07-19: arms firing on continuation chunks
         -- silently deleted legit body).
         CASE
           WHEN NULLIF(e.metadata->>'heading', '') IS NULL THEN e.content
           WHEN COALESCE(NULLIF(split_part(split_part(e.source_id, ':', 3), '.', 2), ''), '1') <> '1' THEN e.content
           WHEN starts_with(e.content, e.metadata->>'heading' || chr(10))
             THEN substr(e.content, char_length(e.metadata->>'heading') + 2)
           WHEN starts_with(e.content, e.metadata->>'heading')
             THEN ltrim(substr(e.content, char_length(e.metadata->>'heading') + 1))
           WHEN starts_with(e.content, regexp_replace(e.metadata->>'heading', '\\s+', ' ', 'g'))
             THEN ltrim(substr(e.content, char_length(regexp_replace(e.metadata->>'heading', '\\s+', ' ', 'g')) + 1))
           ELSE e.content
         END AS body,
         e.embedding AS embedding
  FROM embeddings e
  WHERE e.user_id IS NULL AND e.metadata->>'work' = $1`;

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
  const slug = argValue('--source');
  if (!slug) throw new Error('usage: npx tsx src/ingest/repoint-sections-work.ts --source=<slug> [--dry]');
  const dry = process.argv.includes('--dry');

  const dbUrl = localEnv('DATABASE_URL_UNPOOLED') ?? localEnv('DATABASE_URL');
  if (!dbUrl) throw new Error('owner DATABASE_URL is required (neondb_owner — writes the new tables)');
  // Fail closed unless the branch label (from the SAME source as the URL) is
  // dev|test AND the URL points at the dev endpoint — the label alone is
  // self-attested (register-writer.ts, A6 audit).
  const fromProcessEnv = Boolean(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);
  const branch = fromProcessEnv ? process.env.NEON_BRANCH : localEnv('NEON_BRANCH');
  // One shared guard for every destructive writer (2026-08-02 deep audit, C5).
  assertDevOnlyTarget(dbUrl, branch, 'the section repoint (it DELETEs a work sections)');
  let dbHost: string;
  try {
    dbHost = new URL(dbUrl.replace(/^"|"$/g, '')).host;
  } catch (e) {
    throw new Error(`STOP: DATABASE_URL is not a parseable URL — cannot verify the dev endpoint (${(e as Error).message})`);
  }
  if (!dbHost.includes('ep-tiny-hat')) throw new Error(`STOP: DATABASE_URL host "${dbHost}" is not the dev branch (expected ep-tiny-hat)`);
  console.log(`db host: ${dbHost} (credentials redacted)`);

  const client = new pg.Client({ connectionString: dbUrl.replace(/^"|"$/g, ''), ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    // The sources row is the register writer's — READ it, never write it
    // (published stays published, staged stays staged).
    const { rows: srcRows } = await client.query<{ id: string; title: string; status: string; author: string }>(
      `SELECT id, title, status, author FROM sources WHERE slug=$1`,
      [slug],
    );
    const src = srcRows[0];
    if (!src) throw new Error(`no sources row for slug "${slug}" — the register writer declares it; this tool only re-points`);
    const sourcePk = src.id;
    const headingBase = src.title || 'Untitled';

    const { rows: prior } = await client.query<{ sections: number; embeddings: number; anchors: number }>(
      `SELECT (SELECT count(*) FROM sections WHERE source_id=$1)::int AS sections,
              (SELECT count(*) FROM section_embeddings se JOIN sections s ON s.id=se.section_id WHERE s.source_id=$1)::int AS embeddings,
              (SELECT count(*) FROM section_anchors sa JOIN sections s ON s.id=sa.section_id WHERE s.source_id=$1)::int AS anchors`,
      [sourcePk],
    );

    if (dry) {
      const { rows: staged } = await client.query<{ ordinal: number; heading: string | null; body: string }>(
        `SELECT ordinal::int, heading, body FROM (${STAGE_SELECT}) t ORDER BY ordinal`,
        [slug],
      );
      console.log('='.repeat(66));
      console.log(`RE-POINT PLAN — ${src.title} (slug=${slug}, source_id=${sourcePk}, status=${src.status}) — DRY RUN, nothing written`);
      console.log('='.repeat(66));
      console.log(`  input embeddings (work="${slug}"): ${staged.length}`);
      console.log(`  existing sections to replace:      ${prior[0]!.sections}`);
      console.log(`  existing section_embeddings:       ${prior[0]!.embeddings}`);
      console.log(`  existing section_anchors:          ${prior[0]!.anchors}`);
      for (const s of staged.slice(0, 2)) {
        console.log(`  §${s.ordinal} heading="${s.heading ?? `${headingBase} — chunk ${s.ordinal}`}"`);
        console.log(`     body: ${s.body.slice(0, 140).replace(/\n/g, '\\n')}${s.body.length > 140 ? '…' : ''}`);
      }
      if (staged.length === 0) {
        console.log('\n✗ no embeddings matched — a real run would abort');
        process.exitCode = 1;
      }
      return;
    }

    await client.query('BEGIN');

    // M22 (found by derivation, not by the audit — its list named three writers and the tree
    // holds five). Inside the transaction, on a row locked FOR UPDATE, so a publish flip cannot
    // land between the check and the DELETE below; and it refuses when user annotations anchor
    // into the work rather than letting the FK raise 23503 partway through (M21).
    await assertReingestable(client, slug, 'the section repoint');

    // ADR-029 attribution boundary (deep-audit H-2 — every sections writer, not
    // only the CCEL adapter). Sweeps the STAGED rows (detector's head+tail window)
    // after the guard and BEFORE any DELETE, so a held work keeps its prior
    // sections — nothing deleted, reason recorded. Strong findings only; weak
    // ride along as a report (owner decision #4 open).
    {
      const sweepSql = (dir: 'ASC' | 'DESC') =>
        client.query<{ heading: string | null; body: string }>(
          `SELECT heading, body FROM (${STAGE_SELECT}) t ORDER BY ordinal ${dir} LIMIT 12`, [slug]);
      const head = (await sweepSql('ASC')).rows;
      const tail = (await sweepSql('DESC')).rows.reverse();
      const boundary = attributionBoundaryHold(
        [...head, ...tail].map((r) => ({ heading: r.heading ?? undefined, body: r.body })),
        src.author,
      );
      // the catch below rolls the transaction back — nothing has been deleted
      if (boundary.held) throw new Error(boundary.reason ?? 'held — non-authorial matter');
      if (boundary.matter.weak > 0) console.log(`  ${slug}: ${boundary.matter.weak} weak non-authorial finding(s) reported (not held): ${JSON.stringify(boundary.matter.kinds)}`);
    }

    // 1. Idempotency: clear any prior rows for this source (children first).
    await client.query(`DELETE FROM section_embeddings se USING sections s WHERE se.section_id=s.id AND s.source_id=$1`, [sourcePk]);
    await client.query(`DELETE FROM section_anchors sa USING sections s WHERE sa.section_id=s.id AND s.source_id=$1`, [sourcePk]);
    await client.query(`DELETE FROM sections WHERE source_id=$1`, [sourcePk]);

    // 2. No vector-carrying temp stage — a rows+vectors temp table exhausts
    //    temp_buffers on works past ~10k rows ("no empty local buffer available").
    //    Direct INSERT…SELECT from the STAGE_SELECT subquery instead; the window
    //    ordinal is recomputed per statement, and STAGE_SELECT's ORDER BY ends in
    //    a unique source_id tiebreak, so every computation is identical. Vectors
    //    stream table→table in the final insert, never staged in local buffers.
    //    (STAGE_SELECT's work param is $1; shift it when embedded after other params.)
    const stageSql = (param: string) => STAGE_SELECT.replace('$1', () => param);
    const { rows: staged } = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM (${STAGE_SELECT}) t`, [slug]);
    const stagedCount = staged[0]!.n;
    if (stagedCount === 0) throw new Error(`no embeddings matched work "${slug}" — nothing to re-point`);

    // 3. sections <- staged text; 4. section_embeddings <- REUSED vectors.
    await client.query(
      `INSERT INTO sections (source_id, ordinal, heading, body)
       SELECT $1, ordinal, COALESCE(NULLIF(heading, ''), $2 || ' — chunk ' || ordinal), body FROM (${stageSql('$3')}) t`,
      [sourcePk, headingBase, slug],
    );
    await client.query(
      `INSERT INTO section_embeddings (section_id, model_slug, embedding)
       SELECT s.id, $2, t.embedding FROM sections s JOIN (${stageSql('$3')}) t ON t.ordinal = s.ordinal WHERE s.source_id=$1
       ON CONFLICT (section_id, model_slug) DO NOTHING`,
      [sourcePk, MODEL_SLUG, slug],
    );

    const { rows: c } = await client.query<{ sections: string; embeddings: string }>(
      `SELECT (SELECT count(*) FROM sections WHERE source_id=$1) AS sections,
              (SELECT count(*) FROM section_embeddings se JOIN sections s ON s.id=se.section_id WHERE s.source_id=$1) AS embeddings`,
      [sourcePk],
    );

    await client.query('COMMIT');

    console.log('='.repeat(66));
    console.log(`RE-POINT WORK — ${src.title} (slug=${slug}, source_id=${sourcePk}, status=${src.status} — unchanged)`);
    console.log('='.repeat(66));
    console.log(`  matched embeddings (work="${slug}"): ${stagedCount}`);
    console.log(`  sections inserted:                            ${c[0]!.sections}`);
    console.log(`  section_embeddings (reused, model=${MODEL_SLUG}): ${c[0]!.embeddings}`);
    console.log(`  prior rows replaced: sections=${prior[0]!.sections} section_embeddings=${prior[0]!.embeddings} section_anchors=${prior[0]!.anchors} (anchors deleted per FK; this tool writes none)`);
    const ok = c[0]!.sections === c[0]!.embeddings && Number(c[0]!.sections) === stagedCount;
    console.log(ok
      ? '\n✓ 1:1 — sections == section_embeddings == matched embeddings.'
      : '\n✗ count mismatch — investigate before relying on this work.');
    if (!ok) process.exitCode = 1;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
