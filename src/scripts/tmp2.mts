import pg from 'pg';
import { mintNeonConnectionString, DEFAULT_NEON_PROJECT } from '../../scripts/lib/neon-connection.mjs';
const url = mintNeonConnectionString({ branch: 'production', role: 'app_runtime', project: DEFAULT_NEON_PROJECT, apiKey: process.env.NEON_API_KEY! });
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: true } });
await c.connect(); await c.query('BEGIN'); await c.query('SET TRANSACTION READ ONLY');
for (const t of ['notes', 'highlights', 'bookmarks']) {
  const r = await c.query<{ n: number; s: number }>(`SELECT count(*)::int n, count(section_id)::int s FROM ${t}`);
  console.log(`${t}: ${r.rows[0]!.n} rows, ${r.rows[0]!.s} with section_id`);
}
const idx = await c.query<{ t: string; i: string; d: string }>(
  `SELECT tablename t, indexname i, indexdef d FROM pg_indexes WHERE tablename IN ('notes','highlights','bookmarks') AND indexdef ILIKE '%section_id%' ORDER BY 1,2`);
console.log('--- indexes mentioning section_id ---');
for (const r of idx.rows) console.log(`  ${r.t}.${r.i}: ${r.d.replace(/^CREATE.*USING /, '')}`);
const fk = await c.query<{ c: string; t: string; d: string }>(
  `SELECT conname c, conrelid::regclass::text t, pg_get_constraintdef(oid) d FROM pg_constraint
    WHERE confrelid = 'sections'::regclass ORDER BY 2`);
console.log('--- FKs referencing sections ---');
for (const r of fk.rows) console.log(`  ${r.t}: ${r.d}`);
await c.query('ROLLBACK'); await c.end();
