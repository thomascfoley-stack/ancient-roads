import pg from 'pg';
import { LEGAL_CORPUS_FILTER } from '../../../web/src/lib/teacher/routing';
import { mintNeonConnectionString, DEFAULT_NEON_PROJECT } from '../../../scripts/lib/neon-connection.mjs';
import { FORBIDDEN_PROVENANCE_DOMAINS as D } from '../../ingest/forbidden-provenance.mjs';
const c = new pg.Client({ connectionString: mintNeonConnectionString({ branch: 'production', role: 'app_runtime', project: DEFAULT_NEON_PROJECT, apiKey: process.env.NEON_API_KEY! }), ssl: { rejectUnauthorized: true } });
await c.connect(); await c.query('BEGIN'); await c.query('SET TRANSACTION READ ONLY');
const total = (await c.query<{ n: number }>('SELECT count(*)::int n FROM embeddings')).rows[0]!.n;
console.log(`embeddings rows: ${total.toLocaleString()}`);
const r = await c.query<{ author: string; host: string; n: number; forbidden: boolean }>(
  `SELECT metadata->>'author' AS author,
          COALESCE(NULLIF(substring(metadata->>'sourceUrl' from '^(?:[a-z]+://)?([^/?#]+)'), ''), '(empty)') AS host,
          count(*)::int AS n,
          bool_or(EXISTS (SELECT 1 FROM unnest($1::text[]) d WHERE lower(metadata->>'sourceUrl') LIKE '%' || d || '%')) AS forbidden
     FROM embeddings WHERE ${LEGAL_CORPUS_FILTER}
    GROUP BY 1,2 ORDER BY 3 DESC`, [D]);
let bad = 0;
console.log('\nADMITTED BY LEGAL_CORPUS_FILTER — author x provenance host');
for (const x of r.rows) { if (x.forbidden) bad += x.n; console.log(`  ${String(x.n).padStart(7)}  ${(x.author ?? '(null)').padEnd(32)} ${x.host}${x.forbidden ? '   FORBIDDEN' : ''}`); }
const tot = r.rows.reduce((n, x) => n + x.n, 0);
console.log(`  ${String(tot).padStart(7)}  TOTAL ADMITTED   (${bad.toLocaleString()} forbidden)`);
await c.query('ROLLBACK'); await c.end();
