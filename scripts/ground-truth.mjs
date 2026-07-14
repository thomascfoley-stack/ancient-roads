/**
 * GROUND TRUTH — READ ONLY. Phase 1 of THE LONG NIGHT.
 *
 * Not a diagnostic of unknowns (that's diagnose-prod.mjs). This is a CLAIM AUDIT:
 * every factual assertion the repo makes about the RUNNING SYSTEM, checked against
 * production. Each row: claim · source(file:line) · expected · actual · VERIFIED?
 * Every FAIL is a finding — this repo has a documented habit of docs that lie.
 *
 * No writes, no DDL, no secrets printed.  Run: node scripts/ground-truth.mjs
 */
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const raw = readFileSync(new URL('../web/.env.local', import.meta.url), 'utf8');
const env = Object.fromEntries(
  raw.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const OWNER = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
const APP = env.APP_DATABASE_URL || OWNER;
if (!OWNER) { console.error('No DATABASE_URL'); process.exit(1); }
const conn = (url) => new Client({ connectionString: url, ssl: { rejectUnauthorized: true } });
const q = async (c, sql, p = []) => (await c.query(sql, p)).rows;

const LEGAL = `(metadata->>'author' IN ('John Gill','Jamieson, Fausset & Brown','Adam Clarke','Matthew Henry')
   OR (metadata->>'author'='John Chrysostom' AND (metadata->>'verseId')::int/1000000 IN (40,43,44))
   OR (metadata->>'author'='Augustine of Hippo' AND (metadata->>'verseId')::int/1000000 IN (19,43))
   OR (metadata->>'author' IN ('Albert Barnes','John Wesley','John Calvin') AND metadata->>'sourceUrl' ILIKE '%crosswire%'))`;

const results = [];
const check = (claim, source, expected, actual, pass) =>
  results.push({ claim, source, expected: String(expected), actual: String(actual), verified: pass ? 'YES' : 'NO ✗' });

const main = async () => {
  const db = conn(OWNER); await db.connect();
  const app = conn(APP); await app.connect();

  // 1. "we serve 9 authors"
  const a = await q(db, `SELECT count(DISTINCT metadata->>'author')::int n FROM embeddings WHERE user_id IS NULL AND source_type='commentary' AND ${LEGAL}`);
  check('Teacher serves exactly 9 legal authors', 'CLAUDE.md:2-axes / routing.ts:31', 9, a[0].n, a[0].n === 9);

  // 2. vector index is HNSW, not ivfflat (schema.sql was stale)
  const idx = await q(db, `SELECT indexname, indexdef FROM pg_indexes WHERE tablename='embeddings'`);
  const hasHnsw = idx.some((r) => /hnsw/i.test(r.indexdef));
  const hasIvf = idx.some((r) => /ivfflat/i.test(r.indexdef));
  check('Prod vector index is HNSW (not ivfflat)', 'ADR-018 / schema.sql', 'hnsw present, ivfflat absent', `hnsw=${hasHnsw} ivfflat=${hasIvf}`, hasHnsw && !hasIvf);

  // 3. partial legal HNSW index (migration 012) exists AND valid
  const lh = await q(db, `SELECT c.relname, i.indisvalid FROM pg_class c JOIN pg_index i ON i.indexrelid=c.oid WHERE c.relname='idx_embeddings_vector_legal'`);
  check('Partial legal HNSW index applied + valid (mig 012)', 'WORKLOG §1 2026-07-14', 'exists, indisvalid=t', lh.length ? `exists, valid=${lh[0].indisvalid}` : 'MISSING', lh.length === 1 && lh[0].indisvalid === true);

  // 4. partial legal FTS index (migration 009/011) exists
  const fi = await q(db, `SELECT indexname FROM pg_indexes WHERE tablename='commentary_entries' AND indexname='idx_commentary_fts_legal'`);
  check('Partial legal FTS index exists (mig 009/011)', 'ROADMAP QUEUE#3 §2', 'exists', fi.length ? 'exists' : 'MISSING', fi.length === 1);

  // 5. app_runtime SELECT-only on corpus (migration 010 REVOKE). embeddings IS the servable
  // corpus (190,635 rows, ALL user_id IS NULL — zero user rows), so a write grant there is a
  // least-privilege gap on the most integrity-critical table, not a user-data necessity.
  const g = await q(db, `SELECT table_name, string_agg(privilege_type,',' ORDER BY privilege_type) privs FROM information_schema.role_table_grants WHERE grantee='app_runtime' AND table_name IN ('commentary_entries','sources','sections','embeddings') GROUP BY 1 ORDER BY 1`);
  const writeGrants = g.filter((r) => /INSERT|UPDATE|DELETE/.test(r.privs));
  check('app_runtime SELECT-only on ALL corpus tables incl. embeddings', 'ROADMAP / diagnose §9 / CLAUDE Security', 'SELECT only', writeGrants.length ? writeGrants.map((r) => `${r.table_name}:{${r.privs}}`).join(' | ') : 'SELECT-only on all', writeGrants.length === 0);

  // 6. base pool: ask 50 legal -> 50 (pool fix). The ef GUC MUST be set inside an
  // explicit transaction — a bare `SET LOCAL` on an auto-commit connection is a no-op
  // (this is exactly what legalBasePool's sql.transaction() wrapper defends against;
  // an earlier version of THIS check set it outside a txn and false-reported 40).
  const v = await q(db, `SELECT embedding::text e FROM embeddings WHERE user_id IS NULL AND source_type='commentary' AND ${LEGAL} ORDER BY source_id LIMIT 1`);
  await db.query('BEGIN');
  await db.query(`SET LOCAL hnsw.ef_search=64`);
  const pool = await q(db, `SELECT source_id FROM embeddings WHERE user_id IS NULL AND source_type='commentary' AND ${LEGAL} ORDER BY embedding <=> $1::vector LIMIT 50`, [v[0].e]);
  await db.query('COMMIT');
  check('legalBasePool(50) returns 50 (starvation fixed)', 'WORKLOG §3 2026-07-14', 50, pool.length, pool.length === 50);

  // 7 & 8. corpus sizes
  const ce = await q(db, `SELECT count(*)::int n FROM commentary_entries`);
  check('commentary_entries ~371k', 'ENGINEERING.md:18', '~371,000', ce[0].n.toLocaleString(), ce[0].n > 300000);
  const ev = await q(db, `SELECT count(*)::int n FROM embeddings WHERE user_id IS NULL AND source_type='commentary'`);
  check('commentary embeddings ~190,635', 'MIGRATION_DESIGN.md:6', '~190,635', ev[0].n.toLocaleString(), ev[0].n > 150000);

  // 9 & 10. sources/sections pilot (Barnes)
  const sc = await q(db, `SELECT count(*)::int n FROM sources`);
  check('sources table = 2 rows (partial pilot)', 'MIGRATION_DESIGN.md:6', 2, sc[0].n, sc[0].n === 2);
  let secN = 'n/a', anchN = 'n/a', semN = 'n/a', barnesOk = false;
  try {
    const sec = await q(db, `SELECT count(*)::int n FROM sections`);
    const anch = await q(db, `SELECT count(*)::int n FROM section_anchors`);
    const sem = await q(db, `SELECT count(*)::int n FROM section_embeddings`);
    secN = sec[0].n; anchN = anch[0].n; semN = sem[0].n;
    barnesOk = secN === anchN && anchN === semN;
  } catch (e) { secN = 'ERR:' + e.message; }
  check('Barnes pilot: sections=anchors=section_embeddings', 'ROADMAP 07-09', 'all equal (1,300)', `sec=${secN} anch=${anchN} sem=${semN}`, barnesOk);

  // 11. Bible relational schema in prod? docs/SCHEMA.md describes translations/verses/books
  // tables. Reality: none exist — Bible text is 22 static JSON dirs in web/public/bible/.
  // The "22 translations" COUNT is right; the "in a prod DB schema" framing is not.
  let trExists = true;
  try { await q(db, `SELECT 1 FROM translations LIMIT 1`); } catch { trExists = false; }
  check('Bible relational schema (translations/verses) exists in prod', 'docs/SCHEMA.md / ENGINEERING.md:18', 'tables exist', trExists ? 'exists' : 'NO tables — served from 22 static JSON dirs', trExists);

  // 12. app connects as least-privilege, RLS not bypassed
  const who = await q(app, `SELECT current_user u, (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) bypass`);
  check('App connects as app_runtime, RLS not bypassed', 'CLAUDE.md Security / SECURITY.md', 'app_runtime / bypass=false', `${who[0].u} / bypass=${who[0].bypass}`, who[0].u === 'app_runtime' && who[0].bypass === false);

  // 16. "Gospels-only embedding" (ENGINEERING:18) — contradiction check: distinct books embedded
  const bk = await q(db, `SELECT count(DISTINCT (metadata->>'verseId')::int/1000000)::int n FROM embeddings WHERE user_id IS NULL AND source_type='commentary' AND ${LEGAL}`);
  check('"retrieval blocker = Gospels-only embedding" (STALE?)', 'ENGINEERING.md:18', 'books >> 4 → claim stale', `${bk[0].n} distinct books in legal corpus`, bk[0].n > 4 /* pass = claim is stale/false */);

  await db.end(); await app.end();

  // emit markdown
  console.log('\n| # | Claim | Source | Expected | Actual | Verified |');
  console.log('|---|---|---|---|---|---|');
  results.forEach((r, i) => console.log(`| ${i + 1} | ${r.claim} | \`${r.source}\` | ${r.expected} | ${r.actual} | ${r.verified} |`));
  const fails = results.filter((r) => r.verified !== 'YES');
  console.log(`\n${fails.length} FINDING(S): ${fails.map((r) => r.claim).join(' · ') || 'none'}`);
};
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
