// Falsifiability proof for G9's 030-specific probe, run entirely inside a transaction that
// is ROLLED BACK — Postgres DDL is transactional, so the constraint is weakened, the probe
// re-run against the weakened schema, and everything undone. Nothing on dev is mutated.
//
// The claim under test: "the 030 probe row is rejected BECAUSE of 030, not because of 025."
// If the probe row is ACCEPTED once the constraint is reverted to its 025 body, the probe
// really does distinguish the two — which is what the PR-#28 review said 6F-kind could not
// do, and why that check was a tautology.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const ROOT = '/Users/tfoley/theology-study-app';
const require = createRequire(`${ROOT}/package.json`);
const { Client } = require('pg');

const url = readFileSync(`${ROOT}/web/.env.local`, 'utf8').match(/^DATABASE_URL=(.*)/m)[1].trim().replace(/^"|"$/g, '');
if (!/ep-tiny-hat/.test(url)) throw new Error('not dev — refusing');

const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const sectionId = (await c.query(`SELECT id FROM sections ORDER BY id LIMIT 1`)).rows[0].id;
const u = '__cutover_e6_probe__falsifiability';

const PRE_030 = `CHECK (
  (target_kind = 'verse'   AND verse_id   IS NOT NULL AND section_id IS NULL) OR
  (target_kind = 'section' AND section_id IS NOT NULL AND verse_id   IS NULL))`;

// The exact row G9 uses as its 030-specific probe: a section highlight with NO content hash.
const PROBE = `INSERT INTO highlights (user_id, target_kind, verse_id, section_id, source_content_hash, color)
               VALUES ($1,'section',NULL,$2,NULL,'yellow')`;

async function tryProbe(label) {
  try {
    await c.query('SAVEPOINT p');
    await c.query(PROBE, [u, sectionId]);
    await c.query('ROLLBACK TO SAVEPOINT p');
    return { accepted: true, code: null, constraint: null };
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT p');
    return { accepted: false, code: e.code, constraint: e.constraint };
  }
}

await c.query('BEGIN');
try {
  const withO30 = await tryProbe();
  console.log(`WITH 030 body   : accepted=${withO30.accepted}  sqlstate=${withO30.code}  constraint=${withO30.constraint}`);

  await c.query(`ALTER TABLE highlights DROP CONSTRAINT highlights_anchor_xor`);
  await c.query(`ALTER TABLE highlights ADD CONSTRAINT highlights_anchor_xor ${PRE_030}`);
  const with025 = await tryProbe();
  console.log(`WITH 025 body   : accepted=${with025.accepted}  sqlstate=${with025.code}  constraint=${with025.constraint}`);

  const distinguishes =
    !withO30.accepted && withO30.code === '23514' && withO30.constraint === 'highlights_anchor_xor' &&
    with025.accepted;
  console.log('');
  console.log(distinguishes
    ? 'PROVEN   the G9 030-probe is rejected under the 030 body and ACCEPTED under the 025 body.\n         It therefore detects "030 silently did not apply" — it is not a tautology.'
    : 'FAILED   the probe does not distinguish 030 from 025.');

  // And the converse: G9 asserts SQLSTATE + NAME, so an unrelated error must NOT count.
  // Prove the assertion is selective by feeding it a DIFFERENT violation.
  let other;
  try {
    await c.query('SAVEPOINT q');
    await c.query(`INSERT INTO highlights (user_id, target_kind, verse_id, section_id, color)
                   VALUES ($1,'bogus',NULL,$2,'yellow')`, [u, sectionId]);
    await c.query('ROLLBACK TO SAVEPOINT q');
    other = { code: null, constraint: null };
  } catch (e) { await c.query('ROLLBACK TO SAVEPOINT q'); other = { code: e.code, constraint: e.constraint }; }
  console.log(`\nSELECTIVITY: a target_kind='bogus' row is rejected by sqlstate=${other.code} constraint=${other.constraint}`);
  console.log(other.constraint === 'highlights_anchor_xor'
    ? "             -> confirms the review's point: target_kind='bogus' trips the XOR, so a\n                target_kind_chk probe would 'pass' even with 030 absent. Catalog-only is correct."
    : `             -> rejected by ${other.constraint}`);

  process.exitCode = distinguishes ? 0 : 1;
} finally {
  await c.query('ROLLBACK');
  await c.end();
}
