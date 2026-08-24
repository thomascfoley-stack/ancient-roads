// QUERY LOG — what people actually asked and searched, newest first, across BOTH outcome
// tables: ask_outcomes (116, /ask) and search_outcomes (129, the five search surfaces).
//
// This is the owner's read side of the "we need to see all of that" directive (2026-08-23).
// Both tables are INSERT-only for app_runtime by RLS policy, so this runs as the OWNER role
// from a terminal — it can never work through the runtime credential, by design.
//
// READ-ONLY. It measures; it never writes.
//
//   DATABASE_URL=<owner-url> npx tsx scripts/query-log.mts [--limit 50] [--since 2026-08-20] [--surface ask|works|commentaries|library|my_works|history]
//
// Prod is prod: reading it still takes the owner's explicit go (AGENTS.md rule 7) — the URL
// does not leave the terminal, and nothing here caches or re-serves what it prints.

import pg from 'pg';

const url = (process.env.DATABASE_URL ?? '').replace(/^"|"$/g, '');
if (!url) {
  console.error('DATABASE_URL (owner role) required');
  process.exit(1);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const limitRaw = Number(arg('limit') ?? '50');
const limit = Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 1000 ? limitRaw : 50;
const since = arg('since'); // bound as a parameter below — never interpolated
const surface = arg('surface');

const c = new pg.Client({ connectionString: url });
await c.connect();
try {
  // One UNION view over both logs. ask rows carry their verdict as `detail`; search rows
  // carry their surface's params JSON. Column shapes are aligned by explicit casts.
  const { rows } = await c.query(
    `SELECT * FROM (
       SELECT created_at, 'ask'::text AS surface, user_id, query,
              jsonb_array_length(retrieved) AS results, verdict AS detail, latency_ms
       FROM ask_outcomes
       UNION ALL
       SELECT created_at, surface, user_id, query,
              result_count AS results, params::text AS detail, latency_ms
       FROM search_outcomes
     ) q
     WHERE ($1::timestamptz IS NULL OR created_at >= $1)
       AND ($2::text IS NULL OR surface = $2)
     ORDER BY created_at DESC
     LIMIT $3`,
    [since ?? null, surface ?? null, limit],
  );
  if (rows.length === 0) {
    console.log('no rows (empty log, or filters matched nothing)');
  }
  for (const r of rows) {
    const ts = new Date(r.created_at).toISOString().replace('T', ' ').slice(0, 19);
    const who = r.user_id ? String(r.user_id).slice(0, 12) : 'anon';
    const detail = r.detail && r.detail !== '{}' ? `  ${r.detail}` : '';
    console.log(`${ts}  ${String(r.surface).padEnd(12)} ${who.padEnd(12)} ${String(r.results).padStart(4)}r ${String(r.latency_ms).padStart(6)}ms  ${JSON.stringify(r.query)}${detail}`);
  }
  console.error(`\n${rows.length} row(s) shown (limit ${limit}${since ? `, since ${since}` : ''}${surface ? `, surface ${surface}` : ''})`);
} finally {
  await c.end();
}
