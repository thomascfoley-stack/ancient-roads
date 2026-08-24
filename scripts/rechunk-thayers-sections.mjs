#!/usr/bin/env node
/**
 * W-THAYER — Re-chunk the oversized Thayer's sections to the D1(b) convention and re-embed.
 * Swarm closeout order 2026-08-22 (docs/pm/orders/2026-08-22-autonomous-swarm-closeout.md §6,
 * W-THAYER step 2). Slug-scoped to thayers-lexicon; this script is ALSO the prod replay
 * artifact cited by the owner-return packet — the same --env flag discipline as
 * scripts/backfill-section-embeddings.mjs, whose embed path it mirrors.
 *
 * THE DEFECT (filed 2026-08-21 lexicon quality pass; measured in
 * docs/evidence/thayers-source-verification.md): Thayer's sections are unchunked, bodies up to
 * 34,598 chars, while the corpus convention is D1(b) — ONE vector per section, computed on the
 * BARE BODY's leading ≤1,800 chars (EMBED_MAX, the bound ingest itself sends per chunk —
 * src/ingest/ingest-sermon.ts:28), with adaptive shrink for inputs that still tokenize past
 * the model's 512-token window (DeepInfra REJECTS over-window inputs with a 400; measured on
 * dev 2026-08-13). Sections over EMBED_MAX are exactly the population whose stored vector can
 * silently be a different vintage (heading-prefixed, or a different shrink cut).
 *
 * Discipline (same as backfill-section-embeddings.mjs / the suppression scripts):
 *   - --env=dev|prod REQUIRED; endpoint asserted BEFORE connecting (prod requires ep-odd-fog
 *     in the host, read from ~/.neon_prod_url; dev refuses it, read from root .env.local
 *     DATABASE_URL_UNPOOLED || DATABASE_URL). No secret is ever printed.
 *   - Dry-run by default: census + estimated token spend. --apply writes.
 *   - Fail-closed census: the oversized population must match --expect (default 484, measured
 *     on dev 2026-08-23). A moved population means the premise moved; re-verify, don't write.
 *   - Convergent + resumable: vectors are REGENERABLE from text; re-running rewrites the same
 *     convention. Upsert is ON CONFLICT (section_id, model_slug) DO UPDATE.
 *
 *   node scripts/rechunk-thayers-sections.mjs --env=dev           # dry-run census
 *   node scripts/rechunk-thayers-sections.mjs --env=dev --apply   # re-chunk + re-embed + write
 */
import { readFileSync, createWriteStream, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';

const PROD_ENDPOINT = 'ep-odd-fog';
const SLUG = 'thayers-lexicon';
const MODEL_SLUG = 'bge-large-en-v1.5'; // short form on section_embeddings.model_slug
const MODEL_API_ID = 'BAAI/bge-large-en-v1.5'; // DeepInfra API id (1024-dim)
const BATCH = 64;
const MAX_TRIES = 3;
// D1(b) truncation, client-side — identical constants to backfill-section-embeddings.mjs.
const EMBED_MAX = 1800;

function arg(name) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
}
const ENV = arg('env');
const APPLY = process.argv.includes('--apply');
const EXPECT = Number(arg('expect') ?? 484); // oversized population measured on dev 2026-08-23
if (!ENV || !['dev', 'prod'].includes(ENV)) {
  console.error('Usage: node scripts/rechunk-thayers-sections.mjs --env=dev|prod [--apply] [--expect=N]');
  process.exit(1);
}

function loadUrl() {
  if (ENV === 'prod') return readFileSync(join(homedir(), '.neon_prod_url'), 'utf8').trim();
  for (const p of ['../.env.local', '../web/.env.local']) {
    try {
      const raw = readFileSync(new URL(p, import.meta.url), 'utf8');
      const m = raw.match(/^DATABASE_URL_UNPOOLED=(.+)$/m) || raw.match(/^DATABASE_URL=(.+)$/m);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    } catch { /* try next */ }
  }
  console.error('No DATABASE_URL found for dev.'); process.exit(1);
}
function loadDeepInfraKey() {
  try {
    const raw = readFileSync(new URL('../web/.env.local', import.meta.url), 'utf8');
    const m = raw.match(/^DEEPINFRA_API_KEY=(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch { /* fall through */ }
  console.error('No DEEPINFRA_API_KEY in web/.env.local.'); process.exit(1);
}

const url = loadUrl();
const host = new URL(url).host;
if (ENV === 'prod' && !host.includes(PROD_ENDPOINT)) { console.error(`ABORT: --env=prod but host is ${host}`); process.exit(1); }
if (ENV === 'dev' && host.includes(PROD_ENDPOINT)) { console.error(`ABORT: --env=dev but host is prod (${host})`); process.exit(1); }

// ── run log: tee stdout to the workstream evidence dir ──
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const logDir = new URL('../docs/evidence/swarm-2026-08-22/w-thayer/', import.meta.url).pathname;
mkdirSync(logDir, { recursive: true });
const logPath = join(logDir, `rechunk-${ENV}-${APPLY ? 'apply' : 'dry-run'}-${ts}.log`);
const logStream = createWriteStream(logPath);
function log(line = '') {
  console.log(line);
  logStream.write(line + '\n');
}

log(`W-THAYER re-chunk oversized ${SLUG} sections → D1(b) bare body, leading ≤${EMBED_MAX} chars`);
log(`target: ${ENV} (${host}) · mode: ${APPLY ? 'APPLY' : 'DRY-RUN'} · model: ${MODEL_API_ID} (stored slug '${MODEL_SLUG}')`);
log(`evidence log: ${logPath}`);

const client = new Client({ connectionString: url });
await client.connect();

// ── census: the oversized population (fail-closed on drift) ──
const census = (await client.query(
  `SELECT count(*)::int AS n, max(length(sec.body))::int AS max_body,
          coalesce(sum(length(sec.body)), 0)::bigint AS chars,
          count(*) FILTER (WHERE se.section_id IS NULL)::int AS lacking_vector
     FROM sections sec JOIN sources s ON s.id = sec.source_id
     LEFT JOIN section_embeddings se ON se.section_id = sec.id AND se.model_slug = $2
    WHERE s.slug = $1 AND length(sec.body) > $3`,
  [SLUG, MODEL_SLUG, EMBED_MAX])).rows[0];

log('');
log(`oversized sections (body > ${EMBED_MAX} chars) on ${SLUG}: ${census.n} (max body ${census.max_body} chars; lacking '${MODEL_SLUG}' vector: ${census.lacking_vector})`);
if (census.n !== EXPECT) {
  log(`STOP: oversized population is ${census.n}, expected ${EXPECT} — the premise moved; re-verify before writing (override only with an explicit --expect=N after re-measuring).`);
  await client.end(); logStream.end();
  process.exit(1);
}
const estTokens = Math.round((Number(census.chars) / census.n) > EMBED_MAX ? census.n * (EMBED_MAX / 4) : Number(census.chars) / 4);
log(`estimated spend: ~${estTokens.toLocaleString('en-US')} tokens (~$${(estTokens / 1e6 * 0.01).toFixed(4)} at $0.01/M)`);

if (!APPLY) {
  log('');
  log('DRY-RUN — nothing written. Re-run with --apply to re-chunk + re-embed.');
  await client.end(); logStream.end();
  process.exit(0);
}

const key = loadDeepInfraKey();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let truncated = 0;

async function embedBatch(rows, tries = MAX_TRIES) {
  const input = rows.map((r) => {
    if (r.body.length > EMBED_MAX) { truncated += 1; return r.body.slice(0, EMBED_MAX); }
    return r.body;
  });
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: MODEL_API_ID, input, encoding_format: 'float' }),
        signal: AbortSignal.timeout(90_000),
      });
      if (res.ok) return ((await res.json()).data).map((d) => d.embedding);
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === tries) {
        const body = (await res.text().catch(() => '')).slice(0, 200);
        throw Object.assign(new Error(`embed ${res.status} ${body}`), { retryable });
      }
      const wait = attempt * 5000;
      log(`    429/5xx (status ${res.status}) — retry ${attempt}/${tries} after ${wait}ms`);
      await sleep(wait);
    } catch (e) {
      if (e.retryable === false) throw e;
      if (attempt === tries) throw e;
      const wait = attempt * 5000;
      log(`    request error (${e.message}) — retry ${attempt}/${tries} after ${wait}ms`);
      await sleep(wait);
    }
  }
  throw new Error('unreachable');
}

// Upsert — unlike the backfill's DO NOTHING (fill), this is a RE-CHUNK: existing vectors for
// the oversized population are rewritten to the D1(b) convention. Convergent: the vector is a
// pure function of the section's own text.
async function upsertBatch(rows, vecs) {
  const params = [];
  const tuples = rows.map((r, j) => {
    params.push(r.id, MODEL_SLUG, JSON.stringify(vecs[j]));
    return `($${j * 3 + 1},$${j * 3 + 2},$${j * 3 + 3}::vector)`;
  });
  await client.query(
    `INSERT INTO section_embeddings (section_id, model_slug, embedding) VALUES ${tuples.join(',')}
     ON CONFLICT (section_id, model_slug) DO UPDATE SET embedding = EXCLUDED.embedding`, params);
}

let embedded = 0;
const failedSections = [];
const t0 = Date.now();
// Over-window handling identical to backfill-section-embeddings.mjs: bisect a 400ing batch to
// the offender, then shrink that single input to fit the window from the API's reported count.
const OVER_WINDOW = /You passed (\d+) input tokens/;

async function embedSingleAdaptive(r, reportedTokens) {
  let limit = Math.max(100, Math.floor(Math.min(r.body.length, EMBED_MAX) * 500 / reportedTokens));
  // The API's reported token count saturates near 513 for very long inputs, so the chars×500/N
  // estimate alone can stall just under the window — enforce a geometric floor on each step
  // (×0.7) as well; 8 steps reaches 100 chars even from EMBED_MAX.
  for (let shrink = 0; shrink < 8; shrink++) {
    try {
      const vecs = await embedBatch([{ id: r.id, body: r.body.slice(0, limit) }]);
      await upsertBatch([r], vecs);
      embedded += 1; truncated += 1;
      log(`    section id=${r.id} embedded with input truncated to ${limit}/${r.body.length} chars (D1(b) over-window shrink)`);
      return;
    } catch (e) {
      const m = OVER_WINDOW.exec(e.message);
      if (!m) { failedSections.push({ id: r.id, error: e.message }); log(`    section id=${r.id} FAILED: ${e.message}`); return; }
      limit = Math.max(100, Math.min(Math.floor(limit * 0.7), Math.floor(limit * 500 / Number(m[1]))));
    }
  }
  failedSections.push({ id: r.id, error: 'over-window after 8 adaptive shrinks' });
  log(`    section id=${r.id} FAILED: over-window after 8 adaptive shrinks`);
}

async function embedRows(rows) {
  try {
    const vecs = await embedBatch(rows);
    if (vecs.length !== rows.length) throw new Error(`embed count mismatch ${vecs.length} != ${rows.length}`);
    await upsertBatch(rows, vecs);
    embedded += rows.length;
  } catch (e) {
    const m = OVER_WINDOW.exec(e.message);
    if (m && rows.length > 1) {
      const mid = Math.ceil(rows.length / 2);
      await embedRows(rows.slice(0, mid));
      await embedRows(rows.slice(mid));
    } else if (m) {
      await embedSingleAdaptive(rows[0], Number(m[1]));
    } else {
      failedSections.push(...rows.map((r) => ({ id: r.id, error: e.message })));
      log(`    batch of ${rows.length} FAILED (${e.message}) — re-runnable`);
    }
  }
}

let cursor = 0;
for (;;) {
  const { rows: page } = await client.query(
    `SELECT sec.id, sec.body
       FROM sections sec JOIN sources s ON s.id = sec.source_id
      WHERE s.slug = $1 AND length(sec.body) > $2 AND sec.id > $3
      ORDER BY sec.id LIMIT 256`, [SLUG, EMBED_MAX, cursor]);
  if (page.length === 0) break;
  cursor = page[page.length - 1].id;
  for (let i = 0; i < page.length; i += BATCH) {
    await embedRows(page.slice(i, i + BATCH));
  }
  log(`  progress: embedded=${embedded}/${census.n} failed=${failedSections.length} elapsed=${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

// ── verify inside the run: coverage + a pairing probe on the rewritten population ──
const after = (await client.query(
  `SELECT count(*)::int AS n, count(se.section_id)::int AS with_vector
     FROM sections sec JOIN sources s ON s.id = sec.source_id
     LEFT JOIN section_embeddings se ON se.section_id = sec.id AND se.model_slug = $2
    WHERE s.slug = $1 AND length(sec.body) > $3`,
  [SLUG, MODEL_SLUG, EMBED_MAX])).rows[0];

log('');
log(`DONE on ${ENV} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
log(`sections re-chunked + re-embedded: ${embedded}/${census.n} · failed: ${failedSections.length} · over-window inputs adaptively shrunk: ~${truncated}`);
log(`oversized-section vector coverage AFTER: ${after.with_vector}/${after.n}`);
if (failedSections.length > 0) {
  log('failed section ids (re-runnable):');
  for (const f of failedSections) log(`  id=${f.id}: ${f.error}`);
}
await client.end();
logStream.end();
process.exit(failedSections.length > 0 ? 2 : 0);
