// Backfill ONE source from commentary_entries/embeddings into the sources/sections
// model by RE-POINTING its existing vectors (Path A, docs/MIGRATION_DESIGN.md §1).
// No re-embedding: section_embeddings reuses embeddings.embedding verbatim, so
// coverage stays 0 and DeepInfra cost is $0.
//
//   npx tsx src/ingest/migrate-sections-slice.ts [--source=barnes-notes]
//
// Additive + idempotent: creates nothing in the legacy tables, re-runnable
// (deletes + reinserts this source's sections). Requires migration 006 applied
// and neondb_owner (writes the new tables). Retrieval is unaffected (dual-read
// until cutover). Row identity/verse fields come from embeddings.metadata, so the
// source_id key format stays owned solely by source-id.ts (never re-parsed here).

import pg from 'pg';
import { readFileSync, existsSync } from 'fs';

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
  backfill?: { match_author?: string };
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

  const dbUrl = localEnv('DATABASE_URL_UNPOOLED') ?? localEnv('DATABASE_URL');
  if (!dbUrl) throw new Error('owner DATABASE_URL is required (neondb_owner — writes the new tables)');
  const client = new pg.Client({ connectionString: dbUrl.replace(/^"|"$/g, ''), ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await client.query('BEGIN');

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

    // 2. Idempotency: clear any prior rows for this source (children first).
    await client.query(`DELETE FROM section_embeddings se USING sections s WHERE se.section_id=s.id AND s.source_id=$1`, [sourcePk]);
    await client.query(`DELETE FROM section_anchors sa USING sections s WHERE sa.section_id=s.id AND s.source_id=$1`, [sourcePk]);
    await client.query(`DELETE FROM sections WHERE source_id=$1`, [sourcePk]);

    // 3. Stage the source's embeddings with a stable ordinal. One embeddings row
    //    (source_id, chunk_index) => one section (MIGRATION_DESIGN §5.1). Verse
    //    range + text come straight from embeddings (metadata/content); vectors
    //    stay in SQL and are never round-tripped through JS.
    await client.query(
      `CREATE TEMP TABLE _stage ON COMMIT DROP AS
         SELECT row_number() OVER (ORDER BY (e.metadata->>'verseId')::int, e.source_id, e.chunk_index) AS ordinal,
                e.content                        AS body,
                (e.metadata->>'verseId')::int    AS vstart,
                (e.metadata->>'verseEnd')::int   AS vend,
                e.embedding                      AS embedding
         FROM embeddings e
         WHERE e.user_id IS NULL AND e.source_type='commentary'
           AND e.metadata->>'author' = $1`,
      [matchAuthor],
    );
    const { rows: staged } = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM _stage`);
    const stagedCount = staged[0]!.n;
    if (stagedCount === 0) throw new Error(`no embeddings matched author "${matchAuthor}" — nothing to migrate`);

    // 4. sections <- staged text; 5. anchors <- verse range; 6. section_embeddings <- REUSED vectors.
    await client.query(`INSERT INTO sections (source_id, ordinal, body) SELECT $1, ordinal, body FROM _stage`, [sourcePk]);
    await client.query(
      `INSERT INTO section_anchors (section_id, verse_id_start, verse_id_end)
       SELECT s.id, st.vstart, st.vend FROM sections s JOIN _stage st ON st.ordinal = s.ordinal WHERE s.source_id=$1`,
      [sourcePk],
    );
    await client.query(
      `INSERT INTO section_embeddings (section_id, model_slug, embedding)
       SELECT s.id, $2, st.embedding FROM sections s JOIN _stage st ON st.ordinal = s.ordinal WHERE s.source_id=$1`,
      [sourcePk, MODEL_SLUG],
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
    console.log(`  matched embeddings (author="${matchAuthor}"): ${stagedCount}`);
    console.log(`  sections inserted:                            ${c[0]!.sections}`);
    console.log(`  section_anchors inserted:                     ${c[0]!.anchors}`);
    console.log(`  section_embeddings (reused, model=${MODEL_SLUG}): ${c[0]!.embeddings}`);
    const ok = c[0]!.sections === c[0]!.embeddings && Number(c[0]!.sections) === stagedCount;
    console.log(ok
      ? '\n✓ 1:1:1 — sections == section_embeddings == matched embeddings. Coverage will be 0.'
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
