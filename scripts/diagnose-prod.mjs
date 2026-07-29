/**
 * PROD DIAGNOSTIC — READ ONLY. No writes, no DDL, no secrets printed.
 *
 * Answers, in seconds, the questions we have been guessing at for a week:
 *   1. What does the teacher ACTUALLY serve?  (9 authors? OT/NT split?)
 *   2. Can the >=2-voices product guarantee even be MET by this corpus?
 *   3. The verse-key bug: how bad, per author?
 *   4. Are the indexes real, and does the planner USE them?
 *   5. The base-pool starvation: does asking for 50 legal rows return 50?
 *   6. Did last night's migrations (010 REVOKE, 011 FTS rebuild) actually land?
 *   7. The embed coverage gap: entries vs vectors.
 *
 * Run:  node scripts/diagnose-prod.mjs
 */
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

// --- env (never printed) ---
const raw = readFileSync(new URL('../web/.env.local', import.meta.url), 'utf8');
const env = Object.fromEntries(
  raw.split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const OWNER = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
const APP = env.APP_DATABASE_URL || OWNER;
if (!OWNER) { console.error('No DATABASE_URL in web/.env.local'); process.exit(1); }

const hr = (t) => console.log('\n' + '='.repeat(78) + '\n' + t + '\n' + '='.repeat(78));
const rows = async (c, sql, params = []) => (await c.query(sql, params)).rows;
const table = (r) => { if (!r.length) return console.log('  (none)'); console.table(r); };

const conn = (url) => new Client({ connectionString: url, ssl: { rejectUnauthorized: true } });

const main = async () => {
  const db = conn(OWNER);
  await db.connect();

  // The teacher's filter, verbatim from web/src/lib/teacher/routing.ts.
  // If this has drifted, EVERY number below is wrong — check it first.
  const LEGAL = `(
      metadata->>'author' IN ('John Gill','Jamieson, Fausset & Brown','Adam Clarke','Matthew Henry')
   OR (metadata->>'author' = 'John Chrysostom' AND (metadata->>'verseId')::int / 1000000 IN (40,43,44))
   OR (metadata->>'author' = 'Augustine of Hippo' AND (metadata->>'verseId')::int / 1000000 IN (19,43))
   OR (metadata->>'author' IN ('Albert Barnes','John Wesley','John Calvin')
       AND metadata->>'sourceUrl' ILIKE '%crosswire%')
  )`;

  hr('1. WHAT THE TEACHER ACTUALLY SERVES  (the 9-author claim)');
  table(await rows(db, `
    SELECT metadata->>'author' AS author,
           count(*) AS vectors,
           count(*) FILTER (WHERE (metadata->>'verseId')::int / 1000000 <= 39) AS ot,
           count(*) FILTER (WHERE (metadata->>'verseId')::int / 1000000 >= 40) AS nt,
           count(DISTINCT (metadata->>'verseId')::int / 1000000) AS books
    FROM embeddings
    WHERE user_id IS NULL AND source_type='commentary' AND ${LEGAL}
    GROUP BY 1 ORDER BY 2 DESC`));

  hr('2. CAN THE >=2-VOICES GUARANTEE BE MET?  (per chapter, legal corpus)');
  table(await rows(db, `
    WITH per_ch AS (
      SELECT (metadata->>'verseId')::int / 1000 AS ch,
             count(DISTINCT metadata->>'author') AS voices
      FROM embeddings
      WHERE user_id IS NULL AND source_type='commentary' AND ${LEGAL}
      GROUP BY 1)
    SELECT voices AS distinct_legal_authors,
           count(*) AS chapters,
           round(100.0*count(*)/sum(count(*)) OVER (), 1) AS pct
    FROM per_ch GROUP BY 1 ORDER BY 1`));
  table(await rows(db, `
    WITH per_ch AS (
      SELECT (metadata->>'verseId')::int / 1000 AS ch, count(DISTINCT metadata->>'author') AS v
      FROM embeddings WHERE user_id IS NULL AND source_type='commentary' AND ${LEGAL} GROUP BY 1)
    SELECT count(*) FILTER (WHERE v < 2) AS chapters_below_guarantee,
           count(*) AS chapters_with_any_coverage,
           1189 - count(*) AS chapters_with_ZERO_coverage
    FROM per_ch`));

  hr('3. THE VERSE-KEY BUG  (commentary_entries — search/reader corpus)');
  table(await rows(db, `
    SELECT author,
           count(*) AS entries,
           count(*) FILTER (WHERE verse_start = verse_end AND verse_start = chapter) AS collapsed,
           round(100.0 * count(*) FILTER (WHERE verse_start = verse_end AND verse_start = chapter)
                 / count(*), 1) AS pct_collapsed
    FROM commentary_entries GROUP BY 1 HAVING count(*) >= 2000
    ORDER BY 4 DESC, 2 DESC LIMIT 25`));

  hr('4. INDEXES — do they exist, and what are they?');
  table(await rows(db, `
    SELECT indexname, substring(indexdef from 1 for 110) AS def
    FROM pg_indexes
    WHERE tablename IN ('embeddings','commentary_entries') ORDER BY tablename, indexname`));

  hr('5. DOES THE PLANNER USE THE FTS INDEX?  (migration 011 — the rebuild)');
  const plan = await rows(db, `
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT id FROM commentary_entries
    WHERE tsv @@ websearch_to_tsquery('english','God')
      AND (author IN ('John Gill','Jamieson, Fausset & Brown','Adam Clarke','Matthew Henry',
                      'Barnes'' Notes','Albert Barnes','John Wesley','John Calvin')
           OR (author='John Chrysostom' AND book IN (40,43,44))
           OR (author='Augustine of Hippo' AND book IN (19,43)))
    LIMIT 20`);
  plan.forEach((r) => console.log('  ' + r['QUERY PLAN']));
  console.log('\n  >>> Look for "idx_commentary_fts_legal". If it says "idx_commentary_fts"');
  console.log('  >>> (the FULL index) the partial index is DEAD and search is slow again.');

  hr('6. BASE-POOL STARVATION  (ask for 50 legal rows — do you get 50?)');
  const v = await rows(db, `SELECT embedding::text AS e FROM embeddings
                            WHERE user_id IS NULL AND source_type='commentary' LIMIT 1`);
  const t0 = Date.now();
  const pool = await rows(db, `
    SELECT source_id FROM embeddings
    WHERE user_id IS NULL AND source_type='commentary' AND ${LEGAL}
    ORDER BY embedding <=> $1::vector LIMIT 50`, [v[0].e]);
  console.log(`  requested 50 -> got ${pool.length}   (${Date.now() - t0}ms)`);
  console.log('  >>> If < 50: HNSW post-filter starvation. This is THE recall bug.');
  console.log('  >>> licensing.test.ts:56 already recorded this returning 0, and nobody named it.');

  hr('7. COVERAGE GAP — entries vs vectors');
  const e = await rows(db, `SELECT count(*) n FROM commentary_entries WHERE length(body) >= 100`);
  const b = await rows(db, `SELECT count(*) n FROM embeddings WHERE user_id IS NULL AND source_type='commentary'`);
  console.log(`  commentary_entries (>=100 chars): ${Number(e[0].n).toLocaleString()}`);
  console.log(`  embeddings (commentary vectors) : ${Number(b[0].n).toLocaleString()}`);
  console.log('  >>> The gap is the source_id collapse (entry_index omitted). The coverage');
  console.log('  >>> checker uses the SAME collapsing key, so it reports gap = 0. It is blind.');

  hr('8. EMBEDDED CONTENT LENGTH  (the truncation question, settled)');
  table(await rows(db, `
    SELECT metadata->>'author' AS author,
           count(*) AS n,
           percentile_disc(0.5) WITHIN GROUP (ORDER BY length(content)) AS p50_stored,
           max(length(content)) AS max_stored
    FROM embeddings WHERE user_id IS NULL AND source_type='commentary' AND ${LEGAL}
    GROUP BY 1 ORDER BY 3 DESC`));
  console.log('  >>> NOTE: `content` is the STORED body. The VECTOR was built from');
  console.log('  >>> cleanBody.slice(0, 1000). This column CANNOT tell you what the embedder saw.');
  console.log('  >>> That confusion cost us a night. Naming it here so nobody repeats it.');

  hr('9. LAST NIGHT\'S MIGRATIONS — did they land?');
  table(await rows(db, `
    SELECT table_name, privilege_type
    FROM information_schema.role_table_grants
    WHERE grantee='app_runtime'
      AND table_name IN ('commentary_entries','sources','sections','embeddings')
    ORDER BY 1,2`));
  console.log('  >>> Migration 010 REVOKEd INSERT/UPDATE/DELETE on the corpus tables.');
  console.log('  >>> If you see anything but SELECT on commentary_entries/sources/sections, it did NOT land.');

  await db.end();

  hr('10. ROLE CHECK — is the app connecting as least-privilege?');
  const app = conn(APP);
  await app.connect();
  table(await rows(app, `SELECT current_user,
    (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypasses_rls`));
  console.log('  >>> MUST be app_runtime / false. If it is the owner, RLS is INERT.');
  await app.end();

  console.log('\nDone. Read-only. Nothing was written.\n');
};

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
