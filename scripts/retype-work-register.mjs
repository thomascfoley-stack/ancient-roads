#!/usr/bin/env node
// RETYPE A WORK'S REGISTER — change source_type on a work's sources row AND its flat
// embedding rows, in one transaction, with a pre-write snapshot.
//
//   node scripts/retype-work-register.mjs --slug=<slug> --to=<source_type>          dry-run
//   node scripts/retype-work-register.mjs --slug=<slug> --to=<source_type> --apply   writes
//
// WHY THIS EXISTS. routing.ts states the rule: "THE SURFACE A ROW REACHES IS ITS REGISTER,
// not its slug." The lanes are source_type predicates —
//   SERMON_CORPUS_FILTER    (served AND source_type = 'sermon')
//   THEOLOGY_CORPUS_FILTER  (served AND source_type IN ('theology','confession'))
// consumed by retrieve.ts via retrieveRegisterLane. No slug list appears in either. So moving
// a work between lanes IS a source_type change, and there was no tool for it: publish-flip
// writes `status` and `served`, register-label-embeddings writes metadata.work.
//
// NO INDEX WORK IS NEEDED and that is a property of the schema, not an assumption: both
// idx_embeddings_served_sermon and idx_embeddings_served_theology already exist (migration
// 044) and are PARTIAL indexes keyed on this column, so rows leave one and enter the other on
// UPDATE. Adding the slug to a SERVED_*_WORKS list instead would have changed the FTS
// partial-index predicate and required a rebuild migration — red-proofed 2026-08-16, see
// commit d264abc.
//
// GUARDS, in order: the shared target guard (dev is free; anything else needs BOTH
// CUTOVER_ALLOW=1 and an exactly-declared CUTOVER_EXPECT_HOST); the target source_type must
// satisfy the embeddings CHECK constraint, which is read FROM THE DATABASE rather than
// hand-listed here; the work must exist; and the snapshot is written BEFORE COMMIT so the
// inverse is always available even if the process dies mid-transaction.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertCutoverTarget, hostOf } from './lib/target-guard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const apply = process.argv.includes('--apply');
const slug = arg('slug');
const to = arg('to');

if (!slug || !to) {
  console.error('usage: --slug=<slug> --to=<source_type> [--apply]');
  process.exit(2);
}

function urlFromEnv() {
  if (process.env.CUTOVER_DATABASE_URL) return process.env.CUTOVER_DATABASE_URL;
  if (process.env.DATABASE_URL_UNPOOLED) return process.env.DATABASE_URL_UNPOOLED;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const t = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  const m = t.match(/^DATABASE_URL_UNPOOLED=(.*)$/m) ?? t.match(/^DATABASE_URL=(.*)$/m);
  return m?.[1]?.trim().replace(/^["']|["']$/g, '');
}

const url = urlFromEnv();
const host = assertCutoverTarget(url, {
  allow: process.env.CUTOVER_ALLOW === '1' || process.env.MIGRATE_ALLOW_PROD === '1',
  declared: process.env.CUTOVER_EXPECT_HOST,
  what: 'retype target',
});

const c = new pg.Client({ connectionString: url });
await c.connect();

const { rows: [role] } = await c.query('SELECT current_user AS role');
console.log(`retype-work-register — target ${host} (credentials redacted)`);
console.log(`role         ${role.role} (asserted at the server)`);
console.log(`slug         ${slug}`);
console.log(`to           ${to}`);
console.log(`mode         ${apply ? 'APPLY (writes)' : 'DRY RUN (no writes)'}`);

// The allowed set comes from the CHECK constraint itself — a hand-typed list here would be
// this repo's most frequent defect class (MASTER.md watchlist, artefact 1).
const { rows: [chk] } = await c.query(
  `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conname = 'embeddings_source_type_check'`);
if (!chk) throw new Error('STOP: embeddings_source_type_check not found — cannot validate --to');
if (!new RegExp(`'${to.replace(/'/g, "''")}'`).test(chk.def)) {
  throw new Error(`STOP: source_type '${to}' is not admitted by embeddings_source_type_check.\n  ${chk.def}`);
}

const { rows: [src] } = await c.query(
  'SELECT id, slug, source_type, status FROM sources WHERE slug = $1', [slug]);
if (!src) throw new Error(`STOP: no sources row for slug '${slug}'`);

const { rows: [before] } = await c.query(
  `SELECT count(*)::int AS flat,
          count(*) FILTER (WHERE source_type = $2)::int AS already,
          count(*) FILTER (WHERE served)::int AS served
     FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = $1`, [slug, to]);

console.log(`\nsources row  id=${src.id} status=${src.status} source_type=${src.source_type}`);
console.log(`flat rows    ${before.flat} keyed to this work (${before.served} served, ${before.already} already '${to}')`);

if (src.source_type === to && before.already === before.flat) {
  console.log(`\nNo change needed — already '${to}' on both surfaces.`);
  await c.end();
  process.exit(0);
}

if (!apply) {
  console.log(`\nDRY RUN — would set source_type '${src.source_type}' -> '${to}' on 1 sources row and ${before.flat - before.already} flat row(s).`);
  console.log('Re-run with --apply to write.');
  await c.end();
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const snapPath = path.join(ROOT, 'docs/evidence/corpus-copy', `retype-pre-snapshot-${slug}-${stamp}.json`);

await c.query('BEGIN');
try {
  // Snapshot the EXACT prior state, per row, before anything changes. Written to disk before
  // COMMIT so a crash between here and commit still leaves the inverse on disk.
  const { rows: priorFlat } = await c.query(
    `SELECT id, source_type FROM embeddings
      WHERE user_id IS NULL AND metadata->>'work' = $1 ORDER BY id`, [slug]);
  fs.mkdirSync(path.dirname(snapPath), { recursive: true });
  fs.writeFileSync(snapPath, JSON.stringify({
    slug, host, takenAt: new Date().toISOString(),
    sources: { id: src.id, source_type: src.source_type },
    embeddings: priorFlat,
  }, null, 2));
  console.log(`\nsnapshot     ${path.relative(ROOT, snapPath)} (1 sources row + ${priorFlat.length} flat rows, written before COMMIT)`);

  const s = await c.query('UPDATE sources SET source_type = $2 WHERE slug = $1', [slug, to]);
  const e = await c.query(
    `UPDATE embeddings SET source_type = $2
      WHERE user_id IS NULL AND metadata->>'work' = $1 AND source_type IS DISTINCT FROM $2`,
    [slug, to]);
  await c.query('COMMIT');
  console.log(`sources      ${s.rowCount} row(s) -> '${to}'`);
  console.log(`embeddings   ${e.rowCount} row(s) -> '${to}'`);
} catch (err) {
  await c.query('ROLLBACK');
  console.error('ROLLED BACK —', err.message);
  await c.end();
  process.exit(1);
}

const { rows: [after] } = await c.query(
  `SELECT count(*) FILTER (WHERE source_type = $2)::int AS now_to,
          count(*)::int AS flat
     FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = $1`, [slug, to]);
console.log(`\nOK — ${slug} is '${to}' on ${after.now_to}/${after.flat} flat rows and its sources row.`);
console.log(`Reverse with: node scripts/retype-work-register.mjs --slug=${slug} --to=${src.source_type} --apply`);
await c.end();
