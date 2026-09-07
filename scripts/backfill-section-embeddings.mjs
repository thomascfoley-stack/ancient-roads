#!/usr/bin/env node
/**
 * PHASE 2 SECTION-EMBEDDINGS BACKFILL — corpus-backlog plan, EMBEDDINGS_DESIGN D1 option (b),
 * owner directive 2026-08-13. A real per-section embed pass over every published work that has
 * sections but ZERO section_embeddings rows (discovered by query, never hardcoded).
 *
 * D1(b) contract: ONE vector per section (PK (section_id, model_slug)); the body is embedded
 * WHOLE up to the model's 512-token window. NOTE: DeepInfra REJECTS over-window inputs with a
 * 400 rather than truncating them (measured on dev 2026-08-13), so the accepted D1(b)
 * truncation is applied client-side: embed input is the body's leading ≤1800 chars (EMBED_MAX,
 * the same bound ingest sends per chunk — src/ingest/ingest-sermon.ts:28). Recorded in the log.
 * MODEL_SLUG matches the existing convention ('bge-large-en-v1.5', constant lives at
 * src/ingest/ingest-sermon.ts:29; D2 consolidation is a different workstream).
 *
 * Discipline (same as scripts/phase1-kill-work.mjs):
 *   - --env=dev|prod REQUIRED; endpoint asserted BEFORE connecting (prod requires ep-odd-fog
 *     in the host, read from ~/.neon_prod_url; dev refuses it, read from root .env.local
 *     DATABASE_URL_UNPOOLED || DATABASE_URL). No secret is ever printed.
 *   - Dry-run by default: per-work census + estimated token spend. --apply writes.
 *   - Idempotent: only sections LACKING a vector for this model_slug are embedded, and inserts
 *     are ON CONFLICT (section_id, model_slug) DO NOTHING — re-running fills failed batches.
 *
 *   node scripts/backfill-section-embeddings.mjs --env=dev           # dry-run census
 *   node scripts/backfill-section-embeddings.mjs --env=dev --apply   # embed + write
 *   node scripts/backfill-section-embeddings.mjs --env=dev --only=<slug> [--apply]
 *
 * --only=<slug> (added 2026-09-07, corpus-coverage Track C): scopes the whole run to ONE
 * named work and drops the status='published' requirement — register-path ingests stage
 * works (status='staged'), and gate R1 coverage-sections counts staged sections too, so a
 * freshly staged slug needs this fill before the gate can hold its baseline. Without --only
 * the behaviour is identical to the owner-directive original. --env=dev also honors a
 * DATABASE_URL already exported in the environment (the dev/prod host asserts below still
 * guard); the .env.local fallback chain is unchanged.
 */
import { readFileSync, createWriteStream, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';

const PROD_ENDPOINT = 'ep-odd-fog';
// Short form stored in section_embeddings.model_slug — must match the existing convention.
// The constant lives at src/ingest/ingest-sermon.ts:29 (MODEL_SLUG).
const MODEL_SLUG = 'bge-large-en-v1.5';
const MODEL_API_ID = 'BAAI/bge-large-en-v1.5'; // DeepInfra API id (1024-dim)
const BATCH = 64;
const PAGE = 256; // sections fetched per keyset page (multiple of BATCH)
const MAX_TRIES = 3;
// D1(b) truncation, client-side: DeepInfra does NOT truncate over-window inputs — it REJECTS
// them with a 400 (measured on dev 2026-08-13: "maximum input length of 512 tokens"). The
// D1(b) premise ("API will truncate") therefore has to be implemented by the runner: embed
// input is capped at EMBED_MAX chars, the same bound ingest itself sends per chunk
// (src/ingest/ingest-sermon.ts:28). One vector per section, from the body's leading ≤1800 chars.
const EMBED_MAX = 1800;

function arg(name) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
}
const ENV = arg('env');
const ONLY = arg('only');
const APPLY = process.argv.includes('--apply');
if (!ENV || !['dev', 'prod'].includes(ENV)) {
  console.error('Usage: node scripts/backfill-section-embeddings.mjs --env=dev|prod [--only=<slug>] [--apply]');
  process.exit(1);
}

function loadUrl() {
  if (ENV === 'prod') return readFileSync(join(homedir(), '.neon_prod_url'), 'utf8').trim();
  // Track C: an exported DATABASE_URL (e.g. the dev owner credential) wins over the
  // .env.local chain; the host asserts below still refuse a prod endpoint under --env=dev.
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL.trim();
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

// ── run log: tee stdout to docs/evidence/embeddings-backfill/<env>-run-<ts>.log ──
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const logDir = new URL('../docs/evidence/embeddings-backfill/', import.meta.url).pathname;
mkdirSync(logDir, { recursive: true });
const logPath = join(logDir, `${ENV}-run-${ts}.log`);
const logStream = createWriteStream(logPath);
function log(line = '') {
  console.log(line);
  logStream.write(line + '\n');
}

log(`target: ${ENV} (${host}) · mode: ${APPLY ? 'APPLY' : 'DRY-RUN'} · model: ${MODEL_API_ID} (stored slug '${MODEL_SLUG}')`);
log(`D1(b) note: ONE vector per section. DeepInfra REJECTS over-window inputs with a 400 (it does not`);
log(`truncate — measured on dev 2026-08-13), so D1(b)'s accepted truncation is done client-side:`);
log(`embed input is the body's leading ≤${EMBED_MAX} chars (EMBED_MAX, the bound ingest itself sends per chunk).`);
log(`Sections still over-window at ${EMBED_MAX} chars (dense non-English text tokenizes >512 tokens) are`);
log(`shrunk adaptively per-section from the API's reported token count until they fit; each is logged.`);

const client = new Client({ connectionString: url });
await client.connect();

// ── discovery: published works that have sections but ZERO section_embeddings ──
// --only=<slug>: scope to the one named work, any status (register-path works stage).
const works = ONLY
  ? (await client.query(`
  SELECT s.id, s.slug, s.source_type,
         count(sec.id)::int AS sections,
         coalesce(sum(length(sec.body)), 0)::bigint AS chars
    FROM sources s
    JOIN sections sec ON sec.source_id = s.id
   WHERE s.slug = $1
   GROUP BY s.id, s.slug, s.source_type
   ORDER BY s.source_type, s.slug`, [ONLY])).rows
  : (await client.query(`
  SELECT s.id, s.slug, s.source_type,
         count(sec.id)::int AS sections,
         coalesce(sum(length(sec.body)), 0)::bigint AS chars
    FROM sources s
    JOIN sections sec ON sec.source_id = s.id
   WHERE s.status = 'published'
     AND NOT EXISTS (
           SELECT 1 FROM sections x
            JOIN section_embeddings se ON se.section_id = x.id
           WHERE x.source_id = s.id)
   GROUP BY s.id, s.slug, s.source_type
   ORDER BY s.source_type, s.slug`)).rows;

const zeroVectorWorksBefore = (await client.query(`
  SELECT count(*)::int AS n
    FROM sources s
   WHERE s.status = 'published'
     AND EXISTS (SELECT 1 FROM sections x WHERE x.source_id = s.id)
     AND NOT EXISTS (
           SELECT 1 FROM sections x
            JOIN section_embeddings se ON se.section_id = x.id
           WHERE x.source_id = s.id)`)).rows[0].n;

// per-work: sections lacking a vector for THIS model (on first run: all of them)
const sourceIds = works.map((w) => w.id);
const lacking = new Map();
if (sourceIds.length > 0) {
  const { rows } = await client.query(`
    SELECT sec.source_id, count(*)::int AS n, coalesce(sum(length(sec.body)), 0)::bigint AS chars
      FROM sections sec
     WHERE sec.source_id = ANY($1)
       AND NOT EXISTS (SELECT 1 FROM section_embeddings se
                        WHERE se.section_id = sec.id AND se.model_slug = $2)
     GROUP BY sec.source_id`, [sourceIds, MODEL_SLUG]);
  for (const r of rows) lacking.set(r.source_id, { n: r.n, chars: Number(r.chars) });
}

const byType = {};
let totalSections = 0, totalLacking = 0, totalChars = 0;
log('');
log(`works discovered (published, have sections, ZERO section_embeddings): ${works.length}`);
for (const w of works) {
  const l = lacking.get(w.id) ?? { n: 0, chars: 0 };
  const estTokens = Math.round(l.chars / 4);
  byType[w.source_type] = (byType[w.source_type] ?? 0) + 1;
  totalSections += w.sections; totalLacking += l.n; totalChars += l.chars;
  log(`  ${w.source_type}/${w.slug}: sections=${w.sections} lacking_vectors=${l.n} est_tokens=${estTokens.toLocaleString('en-US')}`);
}
log('');
log(`works by type: ${Object.entries(byType).map(([t, n]) => `${t}=${n}`).join(', ')}`);
log(`totals: works=${works.length} sections=${totalSections} lacking_vectors=${totalLacking} chars=${totalChars} est_tokens=${Math.round(totalChars / 4).toLocaleString('en-US')}`);
log(`published works with sections but zero section_embeddings (BEFORE): ${zeroVectorWorksBefore}`);

if (!APPLY) {
  log('');
  log(`DRY-RUN — estimated spend ${Math.round(totalChars / 4).toLocaleString('en-US')} tokens (~$${(totalChars / 4 / 1e6 * 0.01).toFixed(3)} at $0.01/M). Re-run with --apply to embed.`);
  await client.end();
  logStream.end();
  process.exit(0);
}

if (totalLacking === 0) {
  log('Census note: no zero-embedding work has lacking sections (partial-fill top-up may still apply below).');
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
      if (e.retryable === false) throw e; // non-retryable HTTP status
      if (attempt === tries) throw e;     // network/timeout exhausted
      const wait = attempt * 5000;
      log(`    request error (${e.message}) — retry ${attempt}/${tries} after ${wait}ms`);
      await sleep(wait);
    }
  }
  throw new Error('unreachable');
}

async function insertBatch(rows, vecs) {
  const params = [];
  const tuples = rows.map((r, j) => {
    params.push(r.id, MODEL_SLUG, JSON.stringify(vecs[j]));
    return `($${j * 3 + 1},$${j * 3 + 2},$${j * 3 + 3}::vector)`;
  });
  await client.query(
    `INSERT INTO section_embeddings (section_id, model_slug, embedding) VALUES ${tuples.join(',')}
     ON CONFLICT (section_id, model_slug) DO NOTHING`, params);
}

let embedded = 0, failedBatches = 0;
const failedSections = [];
const t0 = Date.now();
// Fill target: EVERY published work's sections lacking a vector for this model — a superset of
// the zero-embedding works in the census, so a work left partially filled by an interrupted run
// (it then has >0 embeddings and drops out of the discovery set) is still finished on re-run.
// --only=<slug>: the same count scoped to the named work, any status.
const totalToFill = (await client.query(`
  SELECT count(*)::int AS n
    FROM sections sec
    JOIN sources s ON s.id = sec.source_id
   WHERE ${ONLY ? 's.slug = $2' : "s.status = 'published'"}
     AND NOT EXISTS (SELECT 1 FROM section_embeddings se
                      WHERE se.section_id = sec.id AND se.model_slug = $1)`,
  ONLY ? [MODEL_SLUG, ONLY] : [MODEL_SLUG])).rows[0].n;
log(`sections to fill this run (${ONLY ? `slug=${ONLY}` : 'all published works'}, lacking '${MODEL_SLUG}'): ${totalToFill}`);
if (totalToFill === 0) {
  log('Nothing to embed — every section in scope already has a vector for this model.');
  await client.end(); logStream.end(); process.exit(0);
}
// Over-window handling: DeepInfra 400s name the offending token count ("You passed N input
// tokens"). A batch 400 does not say WHICH input is over, so bisect until the offender is
// isolated, then shrink that single input to fit the window (limit × 500/N per probe) — only
// genuinely over-window sections are truncated; everything else is embedded whole (≤EMBED_MAX).
const OVER_WINDOW = /You passed (\d+) input tokens/;

async function embedSingleAdaptive(r, reportedTokens) {
  let limit = Math.max(100, Math.floor(Math.min(r.body.length, EMBED_MAX) * 500 / reportedTokens));
  // The API's reported token count saturates near 513 for very long inputs, so the chars×500/N
  // estimate alone can stall just under the window — enforce a geometric floor on each step
  // (×0.7) as well; 8 steps reaches 100 chars even from EMBED_MAX.
  for (let shrink = 0; shrink < 8; shrink++) {
    try {
      const vecs = await embedBatch([{ id: r.id, body: r.body.slice(0, limit) }]);
      await insertBatch([r], vecs);
      embedded += 1; truncated += 1;
      log(`    section id=${r.id} embedded with input truncated to ${limit}/${r.body.length} chars (D1(b))`);
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
    await insertBatch(rows, vecs);
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
      // non-over-window failure (429/5xx exhausted, network, count mismatch): record and move on
      failedBatches += 1;
      log(`    batch of ${rows.length} FAILED (${e.message}) — sections recorded as failed, re-fillable on re-run`);
      for (const r of rows) failedSections.push({ id: r.id, error: e.message });
    }
  }
}

let cursor = 0;
for (;;) {
  // keyset page over sections that still lack a vector (published works, or --only's slug)
  const { rows: page } = await client.query(`
    SELECT sec.id, sec.body
      FROM sections sec
      JOIN sources s ON s.id = sec.source_id
     WHERE ${ONLY ? 's.slug = $3' : "s.status = 'published'"}
       AND sec.id > $1
       AND NOT EXISTS (SELECT 1 FROM section_embeddings se
                        WHERE se.section_id = sec.id AND se.model_slug = $2)
     ORDER BY sec.id
     LIMIT ${PAGE}`, ONLY ? [cursor, MODEL_SLUG, ONLY] : [cursor, MODEL_SLUG]);
  if (page.length === 0) break;
  cursor = page[page.length - 1].id;

  for (let i = 0; i < page.length; i += BATCH) {
    const batch = page.slice(i, i + BATCH);
    const before = embedded;
    await embedRows(batch);
    if (embedded % (BATCH * 10) < BATCH && embedded !== before) {
      log(`  progress: embedded=${embedded}/${totalToFill} failed_sections=${failedSections.length} elapsed=${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  }
}

const zeroVectorWorksAfter = (await client.query(`
  SELECT count(*)::int AS n
    FROM sources s
   WHERE s.status = 'published'
     AND EXISTS (SELECT 1 FROM sections x WHERE x.source_id = s.id)
     AND NOT EXISTS (
           SELECT 1 FROM sections x
            JOIN section_embeddings se ON se.section_id = x.id
           WHERE x.source_id = s.id)`)).rows[0].n;

log('');
log(`DONE on ${ENV} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
log(`sections embedded: ${embedded} · batches with failures: ${failedBatches} · sections failed: ${failedSections.length} · over-window inputs truncated to ${EMBED_MAX} chars (D1(b)): ~${truncated}`);
if (failedSections.length > 0) {
  log(`failed section ids (re-fillable by re-running this script):`);
  for (const f of failedSections) log(`  id=${f.id}: ${f.error}`);
}
log(`published works with sections but zero section_embeddings: BEFORE=${zeroVectorWorksBefore} AFTER=${zeroVectorWorksAfter}`);
await client.end();
logStream.end();
process.exit(failedSections.length > 0 ? 2 : 0);
