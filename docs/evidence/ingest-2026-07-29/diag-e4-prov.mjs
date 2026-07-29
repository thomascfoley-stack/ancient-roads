// DIAGNOSTIC (read-only): how mixed is each E4-sliced work's flat pool, by provenance?
// Uses the SAME host-aware predicate as the ratchet (forbiddenProvenanceDomain).
import pg from 'pg';
import fs from 'node:fs';

const FORBIDDEN = ['biblehub.com', 'studylight.org', 'historicalchristian.faith'];
function host(u) { try { return new URL(String(u).includes('://') ? u : `https://${u}`).hostname.toLowerCase(); } catch { return null; } }
function forbiddenDomain(u) {
  if (typeof u !== 'string' || u.trim() === '') return null;
  const h = host(u.trim()); if (h === null) return null;
  for (const d of FORBIDDEN) if (h === d || h.endsWith(`.${d}`)) return d;
  return null;
}

const url = fs.readFileSync(process.env.LAB_URL_FILE, 'utf8').trim();
const manifest = JSON.parse(fs.readFileSync('ingest/sources.config.json', 'utf8'));
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, statement_timeout: 600_000, query_timeout: 600_000 });
await c.connect();

// author -> [manifest entries claiming it]
const byAuthor = new Map();
for (const e of manifest) {
  const a = e.backfill?.match_author; if (!a) continue;
  if (!byAuthor.has(a)) byAuthor.set(a, []);
  byAuthor.get(a).push(e);
}

console.log('=== A. author -> manifest entries (E2 labels by the FIRST match; E4 slices EVERY non-quarantined one) ===');
for (const [a, es] of byAuthor) {
  if (es.length > 1) console.log(`  COLLISION  "${a}" -> ${es.map((e) => `${e.id}${e.quarantine ? ' (QUARANTINED)' : ''}`).join(' , ')}`);
}

console.log('\n=== B. per-work flat pool provenance mix (the E4 selection set) ===');
const rows = [];
for (const [a, es] of byAuthor) {
  const r = await c.query(
    `SELECT metadata->>'sourceUrl' AS u, count(*)::int AS n
       FROM embeddings WHERE user_id IS NULL AND source_type='commentary' AND metadata->>'author' = $1
      GROUP BY 1`, [a]);
  let total = 0, bad = 0; const hosts = new Map();
  for (const x of r.rows) {
    total += x.n;
    const d = forbiddenDomain(x.u);
    if (d) bad += x.n;
    const h = x.u ? (host(x.u) ?? '(unparseable)') : '(null sourceUrl)';
    hosts.set(h, (hosts.get(h) ?? 0) + x.n);
  }
  rows.push({ author: a, entries: es, total, bad, hosts });
}
rows.sort((x, y) => y.bad - x.bad);
for (const r of rows) {
  if (r.total === 0) continue;
  const slugs = r.entries.filter((e) => !e.quarantine).map((e) => e.slug ?? e.id);
  const pct = r.total ? ((r.bad / r.total) * 100).toFixed(1) : '0.0';
  console.log(`\n  "${r.author}"  total=${r.total}  forbidden=${r.bad} (${pct}%)  -> sliced into: ${slugs.length ? slugs.join(', ') : '(none — all quarantined)'}`);
  for (const [h, n] of [...r.hosts].sort((a, b) => b[1] - a[1])) console.log(`      ${String(n).padStart(6)}  ${h}`);
  for (const e of r.entries) console.log(`      manifest ${e.id}: provenance ${e.provenance?.url}${e.quarantine ? '  [QUARANTINED]' : ''}`);
}

console.log('\n=== C. totals ===');
const t = rows.reduce((s, r) => s + r.total, 0), b = rows.reduce((s, r) => s + r.bad, 0);
const sliceable = rows.filter((r) => r.entries.some((e) => !e.quarantine));
console.log(`  flat rows matched by any match_author: ${t}, of which forbidden-provenance: ${b}`);
console.log(`  forbidden rows that E4 WOULD COPY into sections (non-quarantined targets only): ${sliceable.reduce((s, r) => s + r.bad, 0)}`);
const totalForbidden = (await c.query(
  `SELECT count(*)::int n FROM embeddings WHERE user_id IS NULL AND (metadata->>'sourceUrl' ILIKE '%biblehub%' OR metadata->>'sourceUrl' ILIKE '%studylight%' OR metadata->>'sourceUrl' ILIKE '%historicalchristian%')`)).rows[0].n;
console.log(`  forbidden-provenance rows in the whole served pool (the G6 ratchet number): ${totalForbidden}`);

await c.end();
