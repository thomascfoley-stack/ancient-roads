#!/usr/bin/env node
/**
 * PROVE MIGRATION 039 CHANGED THE MECHANISM AND NOT ONE ANSWER.
 *
 *   node scripts/verify-served-backfill.mjs                 # verify
 *   node scripts/verify-served-backfill.mjs --red-proof     # prove the verifier can fail
 *
 * Migration 039 replaces four hand-typed slug lists with a materialized `embeddings.served`
 * boolean. Its entire safety claim is one sentence: *the set of rows the product serves is
 * identical before and after*. This is the check that could fail, and it is deliberately NOT a
 * recomputation of the migration's own UPDATE — it evaluates the FOUR SHIPPED FILTERS as they are
 * written in routing.ts and diffs their row-id set against `served = true`.
 *
 * WHY THAT DISTINCTION IS THE WHOLE POINT. If this script re-derived the served set from the same
 * SQL the migration used, it would be an algebraic identity: `x = x`, green forever, proving
 * nothing. This repo has shipped that shape before and named it (THE_LOOP.md; MASTER.md's
 * "red-proofs seeding a copy of the predicate"). So the expected set is READ OUT OF routing.ts at
 * runtime — parsed from the module's own exported constants — and if someone edits routing.ts
 * without re-running the backfill, this goes red naming the drift. A hand-typed second copy of
 * the filters in this file would reintroduce artefact 1 in the guard itself.
 *
 * FOUR THINGS ARE ASSERTED, and only the first is about equality:
 *
 *   1. SET EQUALITY        every row matching a shipped filter has served=true, and every row
 *                          with served=true matches a shipped filter. Reported as two directed
 *                          differences, because "1,000 extra" and "1,000 missing" are different
 *                          accidents and a bare count conflates them.
 *   2. THE TIGHTENINGS     039's sermon and theology index predicates add a `source_type` conjunct
 *                          the shipped lane filters do not have. That is safe only if every row
 *                          the lane filters admit ALREADY carries that source_type. If one does
 *                          not, it silently leaves the partial index — the planner falls back,
 *                          the pool starves, and there is no error (how migration 009 died). So
 *                          this is asserted, not assumed.
 *   3. LICENSING           zero served rows belong to a MUST_NOT_SERVE author. The old allowlist
 *                          enforced this by omission; the new scheme must enforce it positively.
 *   4. UNREACHABILITY      the ~125k rows with no `metadata->>'work'` key that are NOT in the
 *                          legacy author allowlist stay served=false. They are the cohort that
 *                          holds Tyndale / CS Lewis / Origen, and the publish flip addresses rows
 *                          by slug, so nothing can ever flip them true.
 *
 * READ-ONLY, and refuses production unless the owner says so per occasion (AGENTS.md bylaw 7).
 * `--red-proof` writes exactly one boolean on a dev row and restores it in a finally block.
 */
import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RED_PROOF = process.argv.includes('--red-proof');
const url = process.env.DATABASE_URL;
if (!url) die('set DATABASE_URL', 2);

const host = (/^[a-z+]+:\/\/(?:[^@/]*@)?([^/?#]+)/i.exec(url.trim())?.[1] ?? '').toLowerCase();
const isProd = host.includes('ep-odd-fog');
if (isProd && process.env.VERIFY_SERVED_ALLOW_PROD !== '1') {
  die(`REFUSING: ${host.split('.')[0]} is production. Read-only or not, bylaw 7 wants the owner's go per occasion.\n` +
      '       Re-run with VERIFY_SERVED_ALLOW_PROD=1 once the owner has given it.', 2);
}
if (isProd && RED_PROOF) die('REFUSING: --red-proof writes a row. Never against production.', 2);

function die(msg, code = 1) { console.error(`\x1b[31m${msg}\x1b[0m`); process.exit(code); }
const ok = (m) => console.log(`  \x1b[32mPASS\x1b[0m  ${m}`);
const bad = (m) => { console.log(`  \x1b[31mFAIL\x1b[0m  ${m}`); failures++; };
let failures = 0;

// ── the expected set, READ OUT OF THE SHIPPED MODULE ─────────────────────────────────────────
// routing.ts is TypeScript and this is a plain .mjs script that must run without a build step, so
// the constants are parsed out of the source rather than imported. Parsing is narrow and FAILS
// LOUDLY: a renamed or restructured constant throws here instead of silently yielding [] and
// certifying an empty expectation, which is how a guard turns into decoration.
const routingSrc = readFileSync(
  fileURLToPath(new URL('../web/src/lib/teacher/routing.ts', import.meta.url)), 'utf8',
);
function constList(name) {
  const m = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const`, 'm').exec(routingSrc);
  if (!m) die(`cannot find ${name} in routing.ts — this guard is out of date with the module it guards`, 2);
  const xs = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  if (xs.length === 0) die(`${name} parsed to an EMPTY list — refusing to certify against nothing`, 2);
  return xs;
}
function constFilter(name) {
  // The four *_CORPUS_FILTER constants are template literals built from the lists. Rather than
  // re-implement their string assembly (a second copy), rebuild them the way routing.ts does.
  const m = new RegExp(`export const ${name} = \`([\\s\\S]*?)\`;`, 'm').exec(routingSrc);
  if (!m) die(`cannot find ${name} in routing.ts`, 2);
  return m[1];
}
const sqlList = (xs) => xs.map((s) => `'${s.replace(/'/g, "''")}'`).join(',');

const PROSE_WORKS = constList('SERVED_PROSE_WORKS');
const SERMON_WORKS = constList('SERVED_SERMON_WORKS');
const THEOLOGY_WORKS = constList('SERVED_THEOLOGY_WORKS');
const SONG_WORKS = constList('SERVED_SONG_VERSE_WORKS');

// LEGAL_CORPUS_FILTER carries author legs that no list export covers, so it is taken whole from
// the module text with its one interpolation resolved. `${sqlStrList(SERVED_PROSE_WORKS)}` is the
// only substitution routing.ts makes in it.
const LEGAL = constFilter('LEGAL_CORPUS_FILTER')
  .replace('${sqlStrList(SERVED_PROSE_WORKS)}', sqlList(PROSE_WORKS));
if (LEGAL.includes('${')) die('LEGAL_CORPUS_FILTER still holds an unresolved interpolation — parser is stale', 2);

const PROSE_TYPES = `source_type IN ('commentary','sermon','father','theology','confession','lexicon')`;
const LEGS = [
  { name: 'exegetical pool', sql: `${PROSE_TYPES} AND ${LEGAL}`, expectTypes: ['commentary', 'father'] },
  { name: 'song/verse lane', sql: `source_type IN ('hymn','poetry') AND metadata->>'work' IN (${sqlList(SONG_WORKS)})`, expectTypes: ['hymn', 'poetry'] },
  { name: 'sermon lane', sql: `metadata->>'work' IN (${sqlList(SERMON_WORKS)})`, expectTypes: ['sermon'] },
  { name: 'theology lane', sql: `metadata->>'work' IN (${sqlList(THEOLOGY_WORKS)})`, expectTypes: ['theology', 'confession'] },
];
const SHIPPED_UNION = LEGS.map((l) => `(${l.sql})`).join(' OR ');

const c = new Client({ connectionString: url });
await c.connect();
await c.query("SET statement_timeout='600s'");
console.log(`verify-served-backfill — ${host.split('.')[0]}${isProd ? '  \x1b[33m(PRODUCTION, owner-authorized)\x1b[0m' : ''}`);
console.log(`  filters read from routing.ts: prose=${PROSE_WORKS.length} sermon=${SERMON_WORKS.length} theology=${THEOLOGY_WORKS.length} song=${SONG_WORKS.length}\n`);

let restore = null;
try {
  const col = await c.query("SELECT 1 FROM information_schema.columns WHERE table_name='embeddings' AND column_name='served'");
  if (col.rowCount === 0) die('embeddings.served does not exist — apply migration 039 first', 2);

  if (RED_PROOF) {
    // Seed ONE flipped bit in the real column and require the equality check to name it. The
    // mutant is the actual production column, not a copy of the predicate.
    const victim = await c.query(`SELECT id FROM embeddings WHERE user_id IS NULL AND served ORDER BY id LIMIT 1`);
    if (victim.rowCount === 0) die('no served rows to mutate — cannot red-proof', 2);
    restore = victim.rows[0].id;
    await c.query('UPDATE embeddings SET served = false WHERE id = $1', [restore]);
    console.log(`  \x1b[33mRED-PROOF\x1b[0m seeded: row ${restore} forced served=false; the equality check MUST report it\n`);
  }

  // ── 1. set equality, in both directions ───────────────────────────────────────────────────
  const eq = await c.query(`
    SELECT count(*) FILTER (WHERE shipped AND NOT served)::int AS missing,
           count(*) FILTER (WHERE served AND NOT shipped)::int AS extra,
           count(*) FILTER (WHERE shipped)::int                AS shipped_total,
           count(*) FILTER (WHERE served)::int                 AS served_total
      FROM (SELECT served, (${SHIPPED_UNION}) AS shipped FROM embeddings WHERE user_id IS NULL) t`);
  const { missing, extra, shipped_total, served_total } = eq.rows[0];
  if (missing === 0 && extra === 0) ok(`served set is identical to the shipped filters (${served_total} rows)`);
  else {
    bad(`served set DIFFERS from the shipped filters: ${missing} shipped-but-unserved, ${extra} served-but-unshipped (shipped=${shipped_total} served=${served_total})`);
    const ex = await c.query(`
      SELECT id, metadata->>'work' AS work, metadata->>'author' AS author, source_type, served
        FROM embeddings WHERE user_id IS NULL AND served <> (${SHIPPED_UNION}) LIMIT 8`);
    for (const r of ex.rows) console.log(`          ${r.id}  served=${r.served}  ${r.source_type}  work=${r.work ?? '(none)'}  author=${r.author ?? '(none)'}`);
  }

  // ── 2. the tightenings 039's index predicates rely on ─────────────────────────────────────
  for (const leg of LEGS) {
    const r = await c.query(`
      SELECT count(*)::int n, coalesce(string_agg(DISTINCT source_type, ', '), '') AS types
        FROM embeddings WHERE user_id IS NULL AND (${leg.sql}) AND source_type <> ALL($1::text[])`, [leg.expectTypes]);
    if (r.rows[0].n === 0) ok(`${leg.name}: every admitted row is ${leg.expectTypes.join('/')} — the index conjunct is safe`);
    else bad(`${leg.name}: ${r.rows[0].n} row(s) carry source_type ${r.rows[0].types}, outside ${leg.expectTypes.join('/')} — 039's index predicate would DROP them from the partial index, silently`);
  }

  // ── 3. licensing: no served row belongs to a must-not-serve author ────────────────────────
  // The list is imported from the module that owns it, never re-typed here.
  const legalSrc = readFileSync(fileURLToPath(new URL('../web/src/lib/legal-corpus.ts', import.meta.url)), 'utf8');
  const banned = [...(/export const MUST_NOT_SERVE_AUTHORS = \[([\s\S]*?)\] as const/m.exec(legalSrc)?.[1] ?? '')
    .matchAll(/'([^']+)'/g)].map((x) => x[1]);
  if (banned.length === 0) die('MUST_NOT_SERVE_AUTHORS parsed empty — refusing to certify', 2);
  const b = await c.query(`
    SELECT metadata->>'author' AS author, count(*)::int n FROM embeddings
     WHERE user_id IS NULL AND served AND (metadata->>'author' = ANY($1::text[])
        OR metadata->>'author' LIKE 'Jerome''s%'
        OR split_part(metadata->>'author', ' of ', 1) = ANY($1::text[]))
     GROUP BY 1`, [banned]);
  if (b.rowCount === 0) ok(`no served row belongs to any of the ${banned.length} MUST_NOT_SERVE authors`);
  else for (const r of b.rows) bad(`MUST_NOT_SERVE author is SERVED: ${r.author} (${r.n} rows)`);

  // ── 4. the work-less cohort stays unreachable ─────────────────────────────────────────────
  const orphan = await c.query(`
    SELECT count(*)::int total, count(*) FILTER (WHERE served)::int served_n
      FROM embeddings WHERE user_id IS NULL AND metadata->>'work' IS NULL`);
  const { total, served_n } = orphan.rows[0];
  const legacyServed = await c.query(`
    SELECT count(*)::int n FROM embeddings
     WHERE user_id IS NULL AND metadata->>'work' IS NULL AND served AND NOT (${LEGAL})`);
  if (legacyServed.rows[0].n === 0) {
    ok(`${total} work-less rows: ${served_n} served, ALL of them inside the legacy author allowlist; the rest cannot be flipped (the flip addresses rows by slug)`);
  } else {
    bad(`${legacyServed.rows[0].n} work-less row(s) are served but outside the legacy allowlist — this cohort holds the copyrighted authors`);
  }
} finally {
  if (restore) {
    await c.query('UPDATE embeddings SET served = true WHERE id = $1', [restore]);
    console.log(`\n  \x1b[33mRED-PROOF\x1b[0m restored row ${restore} to served=true`);
  }
  await c.end();
}

if (RED_PROOF) {
  if (failures > 0) { console.log(`\n\x1b[32mRED-PROOF HELD\x1b[0m — the seeded bit was caught (${failures} failure(s)). The check can fail.`); process.exit(0); }
  die('\nRED-PROOF DID NOT FIRE — one served row was forced false and every check stayed green. This verifier proves nothing.');
}
if (failures > 0) die(`\n${failures} check(s) FAILED — migration 039 is not behaviour-preserving on this database.`);
console.log('\n\x1b[32mOK\x1b[0m — served set is exactly the shipped filters; tightenings safe; no banned author served.');
