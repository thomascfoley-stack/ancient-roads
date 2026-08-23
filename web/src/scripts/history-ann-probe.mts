// W-ANN measurement harness — ANN post-filter recall collapse in the history vector lane.
// Order: docs/pm/orders/2026-08-22-autonomous-swarm-closeout.md §7 (W-ANN).
//
//   cd web && NODE_OPTIONS=--conditions=react-server node --env-file=.env.local ../node_modules/tsx/dist/cli.mjs src/scripts/history-ann-probe.mts <info|shipped|fix>
//   (the condition flag is required: deepinfra.ts imports `server-only`, which throws without it)
//
// READ-ONLY. Runs the SHIPPED KNN-leg SQL shape (history-search-db.ts) against dev and counts
// returned rows per probe, alongside an EXACT in-scope top-50 (no index) proving whether
// in-scope neighbours exist at all. `shipped` = current code (ef_search=120, no iterative_scan);
// `fix` = the pre-registered candidate (ef_search=120 + hnsw.iterative_scan=relaxed_order),
// executed as the same set_config-in-transaction pattern the fix ships — the harness never
// edits library code, so the RED and GREEN numbers come from one probe set and one embedder.
import { getDb } from '../lib/db.js';
import { embedQuery } from '../lib/teacher/deepinfra.js';

const mode = process.argv[2] ?? 'info';
if (!['info', 'shipped', 'fix'].includes(mode)) {
  console.error('usage: history-ann-probe.mts <info|shipped|fix>');
  process.exit(2);
}

// The pre-registered W-ANN probe set (see docs/evidence/swarm-2026-08-22/w-ann/PRE-REG.md).
// Text-only church-history queries: no entity-vocabulary reliance, no period parse — the
// vector leg is the leg under test. Content plausibly covered by the served historian corpus.
const PROBES: string[] = [
  'the fall of Jerusalem in 70 AD',
  'the destruction of the second temple',
  'the siege of Masada',
  'the martyrdom of early Christians under Nero',
  'the conversion of Constantine',
  'the council of Nicaea and the Arian controversy',
  'the edict of Milan',
  'monasticism in the Egyptian desert',
  'the sack of Rome by the Visigoths',
  'Augustine of Hippo and his conversion',
  'the persecution of Christians under Diocletian',
  'the siege of Jerusalem by Titus',
];

const SCOPE = `he.served AND src.status = 'published' AND src.source_type = 'historian'`;

const sql = getDb();

if (mode === 'info') {
  const [ver] = (await sql.query(`SHOW server_version`)) as { server_version: string }[];
  const [ext] = (await sql.query(
    `SELECT extversion FROM pg_extension WHERE extname = 'vector'`,
  )) as { extversion: string }[];
  const [counts] = (await sql.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE served)::int AS served
       FROM history_embeddings`,
  )) as { total: number; served: number }[];
  const [inScope] = (await sql.query(
    `SELECT count(*)::int AS rows, count(DISTINCT src.id)::int AS works
       FROM history_embeddings he
       JOIN sections s ON s.id = he.section_id
       JOIN sources src ON src.id = s.source_id
      WHERE ${SCOPE}`,
  )) as { rows: number; works: number }[];
  const idx = (await sql.query(
    `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'history_embeddings'`,
  )) as { indexname: string; indexdef: string }[];
  console.log(`server_version=${ver?.server_version} pgvector=${ext?.extversion}`);
  console.log(`history_embeddings total=${counts?.total} served=${counts?.served}`);
  console.log(`in-scope (served AND published AND historian): rows=${inScope?.rows} works=${inScope?.works}`);
  for (const i of idx) console.log(`index: ${i.indexname} :: ${i.indexdef}`);
  process.exit(0);
}

const ef = '120';
const iterative = mode === 'fix';
console.log(`mode=${mode} ef_search=${ef} iterative_scan=${iterative ? 'relaxed_order' : '(default strict)'} probes=${PROBES.length}`);
console.log('query | knn_rows | knn_ms | exact_in_scope_top50 | exact_max_cosine');

for (const q of PROBES) {
  const vec = JSON.stringify(await embedQuery(q));
  const txn: ReturnType<typeof sql>[] = [sql`SELECT set_config('hnsw.ef_search', ${ef}, true)`];
  if (iterative) txn.push(sql`SELECT set_config('hnsw.iterative_scan', 'relaxed_order', true)`);
  const t0 = performance.now();
  const res = await sql.transaction([
    ...txn,
    sql.query(
      `SELECT he.section_id, 1 - (he.embedding <=> $1::vector) AS cosine
         FROM history_embeddings he
         JOIN sections s ON s.id = he.section_id
         JOIN sources src ON src.id = s.source_id
        WHERE ${SCOPE} ORDER BY he.embedding <=> $1::vector LIMIT 50`,
      [vec],
    ),
  ]);
  const knnMs = Math.round(performance.now() - t0);
  const knnRows = (res[res.length - 1] as unknown[]).length;
  // Exact (seq-scan) in-scope top-50: the ground truth the ANN leg approximates. Index scans
  // disabled in-transaction so the ORDER BY is exact, never the HNSW approximation under test.
  const exactRes = await sql.transaction([
    sql`SELECT set_config('enable_indexscan', 'off', true)`,
    sql`SELECT set_config('enable_bitmapscan', 'off', true)`,
    sql.query(
      `SELECT 1 - (he.embedding <=> $1::vector) AS cosine
         FROM history_embeddings he
         JOIN sections s ON s.id = he.section_id
         JOIN sources src ON src.id = s.source_id
        WHERE ${SCOPE} ORDER BY he.embedding <=> $1::vector LIMIT 50`,
      [vec],
    ),
  ]);
  const exact = exactRes[2] as { cosine: number }[];
  const exactRows = exact.length;
  const exactMax = exactRows ? Number((exact[0] as { cosine: number }).cosine).toFixed(3) : '-';
  console.log(`${JSON.stringify(q)} | ${knnRows} | ${knnMs} | ${exactRows} | ${exactMax}`);
}
process.exit(0);
