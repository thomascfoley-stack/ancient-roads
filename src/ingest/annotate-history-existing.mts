// Phase 3 — genre-history annotate: anchors + verbatim periods + vectors over EXISTING sections.
//
//   DATABASE_URL=<owner> ANNOTATE_ALLOW_HOST=<endpoint id> \
//     npx tsx src/ingest/annotate-history-existing.mts --slug=schaff-npnf202 [--apply]
//
// For works ALREADY serving on another shelf (npnf202/203: father register) that the owner ruled
// INTO history scope by genre. RE-INGESTING would duplicate live sections; this tool deletes and
// rewrites NOTHING that serves — it only ADDS:
//   * section_history_anchors   (gazetteer × VERBATIM presence — ingest-historian's own rule)
//   * sections.period_*         (verbatim HEADING forms only, filled only where NULL)
//   * section_embeddings        (only for sections lacking vectors)
//   * history_embeddings        (staged, served=false — serving stays behind the owner gate)
//
// OVERSIZED EXISTING SECTIONS: father-pipeline sections were never chunked to the embed budget.
// A section over the budget embeds its LEADING 1,500 chars (len/3 estimate ≤500 tokens — the
// SAME conservative rule chunkBody enforces after the Bede 513-token 400). REPRESENTATION ONLY:
// the stored body is untouched and the excerpt gate always reads the real body. This deliberately
// differs from ingest-historian's embedded-whole contract, which owns works it chunked itself.
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { HISTORY_GAZETTEER } from './history-gazetteer.js';
import { verbatimPeriod } from './ingest-historian.js';

const arg = (n: string): string | undefined => process.argv.find((a) => a.startsWith(`${n}=`))?.slice(n.length + 1);
const slug = arg('--slug');
const apply = process.argv.includes('--apply');
if (!slug) { console.error('usage: annotate-history-existing.mts --slug=<slug> [--apply]'); process.exit(2); }

function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const m = new RegExp(`^${name}="?([^"\\n]+)"?$`, 'm').exec(readFileSync('web/.env.local', 'utf8'));
    return m?.[1];
  } catch { return undefined; }
}
const url = (process.env.DATABASE_URL ?? '').replace(/^"|"$/g, '');
if (!url) { console.error('STOP: DATABASE_URL required (env only — never a dotfile fallback for a WRITER).'); process.exit(2); }
const host = new URL(url.replace(/^postgres(ql)?:/, 'http:')).hostname.split('.')[0];
const declared = process.env.ANNOTATE_ALLOW_HOST;
// EXACT equality, not startsWith: every Neon endpoint begins "ep-", so a prefix
// match let ANNOTATE_ALLOW_HOST=ep authorize every endpoint including
// production. Declaring the endpoint means typing the whole endpoint id.
if (!declared || host !== declared) {
  console.error(`STOP: target is ${host} but ANNOTATE_ALLOW_HOST=${declared ?? '(unset)'} — declare the FULL endpoint id deliberately, per occasion.`);
  process.exit(2);
}
const key = localEnv('DEEPINFRA_API_KEY');
if (!key) { console.error('STOP: DEEPINFRA_API_KEY required'); process.exit(2); }

const EMBED_WINDOW = 1500; // chars; len/3 ≤ 500 tokens — the post-Bede conservative rule
const MODEL_SLUG = 'bge-large-en-v1.5';

async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'BAAI/bge-large-en-v1.5', input: texts, encoding_format: 'float' }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`embed ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();
try {
  const src = (await db.query<{ id: string; source_type: string }>(
    `SELECT id, source_type FROM sources WHERE slug=$1`, [slug])).rows[0];
  if (!src) { console.error(`STOP: no sources row for ${slug} on ${host}`); process.exit(1); }

  const secs = (await db.query<{ id: string; heading: string | null; body: string; period_start_year: number | null }>(
    `SELECT s.id, s.heading, s.body, s.period_start_year FROM sections s WHERE s.source_id=$1 ORDER BY s.unit_ordinal`,
    [src.id])).rows;

  // plan the three additions
  const anchors: { sectionId: string; slug: string; label: string; kind: string }[] = [];
  for (const s of secs) {
    const hay = `${s.heading ?? ''}\n${s.body}`;
    for (const e of HISTORY_GAZETTEER) {
      const labels = [e.label, ...(e.aliases ?? [])];
      if (labels.some((l) => new RegExp(`\\b${l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(hay))) {
        anchors.push({ sectionId: s.id, slug: e.slug, label: e.label, kind: e.kind });
      }
    }
  }
  const periods = secs
    .map((s) => ({ id: s.id, p: s.period_start_year === null && s.heading ? verbatimPeriod(s.heading) : null }))
    .filter((x) => x.p !== null);
  const noVec = (await db.query<{ id: string }>(
    `SELECT s.id FROM sections s WHERE s.source_id=$1
       AND NOT EXISTS (SELECT 1 FROM section_embeddings se WHERE se.section_id=s.id)`, [src.id])).rows;

  console.log(`annotate ${slug} @ ${host} [${src.source_type}] — ${secs.length} sections`);
  console.log(`  plan: +${anchors.length} anchors · ${periods.length} heading periods · embed ${noVec.length} sections (window ${EMBED_WINDOW})`);
  if (!apply) { console.log('  dry-run — nothing written. Re-run with --apply.'); process.exit(0); }

  await db.query('BEGIN');
  await db.query(
    `DELETE FROM section_history_anchors WHERE section_id IN (SELECT id FROM sections WHERE source_id=$1)`,
    [src.id]); // idempotent re-annotate: anchors are DERIVED rows, rebuildable, never user data
  for (let i = 0; i < anchors.length; i += 500) {
    const b = anchors.slice(i, i + 500);
    const vals: string[] = []; const params: unknown[] = [];
    b.forEach((a, j) => { vals.push(`($${j * 4 + 1},$${j * 4 + 2},$${j * 4 + 3},$${j * 4 + 4})`);
      params.push(a.sectionId, a.kind, a.slug, a.label); });
    await db.query(`INSERT INTO section_history_anchors (section_id, kind, entity_slug, entity_label) VALUES ${vals.join(',')}`, params);
  }
  for (const x of periods) {
    await db.query(`UPDATE sections SET period_start_year=$2, period_end_year=$3 WHERE id=$1 AND period_start_year IS NULL`,
      [x.id, x.p!.start, x.p!.end]);
  }
  const byId = new Map(secs.map((s) => [s.id, s.body]));
  for (let i = 0; i < noVec.length; i += 48) {
    const batch = noVec.slice(i, i + 48);
    const vecs = await embedBatch(batch.map((r) => (byId.get(r.id) ?? '').slice(0, EMBED_WINDOW)));
    const vals: string[] = []; const params: unknown[] = [];
    batch.forEach((r, j) => { vals.push(`($${j * 3 + 1},$${j * 3 + 2},$${j * 3 + 3}::vector)`);
      params.push(r.id, MODEL_SLUG, JSON.stringify(vecs[j])); });
    await db.query(`INSERT INTO section_embeddings (section_id, model_slug, embedding) VALUES ${vals.join(',')} ON CONFLICT DO NOTHING`, params);
    process.stdout.write(`\r  embedded ${Math.min(i + 48, noVec.length)}/${noVec.length}`);
  }
  if (noVec.length) console.log();
  await db.query(`INSERT INTO history_embeddings (section_id, embedding, model_slug, served)
      SELECT se.section_id, se.embedding, se.model_slug, false FROM section_embeddings se
       JOIN sections s ON s.id=se.section_id WHERE s.source_id=$1
      ON CONFLICT (section_id) DO NOTHING`, [src.id]);
  await db.query('COMMIT');
  const v = (await db.query<{ n: string }>(
    `SELECT count(*)::int n FROM history_embeddings he JOIN sections s ON s.id=he.section_id WHERE s.source_id=$1`,
    [src.id])).rows[0];
  console.log(`  OK — history vectors for ${slug}: ${v.n} (all served=false; serving is the owner gate)`);
} catch (e) {
  await db.query('ROLLBACK').catch(() => {});
  console.error(`FAILED (rolled back): ${(e as Error).message}`);
  process.exit(1);
} finally { await db.end(); }
