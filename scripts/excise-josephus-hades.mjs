#!/usr/bin/env node
// Excise Whiston's spurious pseudo-Josephus "Discourse to the Greeks concerning Hades"
// appendix from josephus-whiston (owner call 2026-07-24: josephus: excise).
//
//   node scripts/excise-josephus-hades.mjs           dry-run
//   node scripts/excise-josephus-hades.mjs --apply   delete + verify (dev only)
import pg from 'pg';
import fs from 'node:fs';

const SLUG = 'josephus-whiston';
const ORD_LO = 4113;
const ORD_HI = 4124;
const EXPECT = 12;
const BACKUP = 'docs/evidence/part2/josephus-hades-excised.jsonl';

const envText = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const val = (k) => envText.match(new RegExp(`^${k}="?([^"\\n]*)"?$`, 'm'))?.[1];
const url = val('DATABASE_URL_UNPOOLED') ?? val('DATABASE_URL');
if (!url) throw new Error('no DATABASE_URL in root .env.local');
const host = new URL(url).host;
if (!host.includes('ep-tiny-hat')) {
  console.error(`FAIL: host ${host} is not dev — refusing`);
  process.exit(1);
}

const apply = process.argv.includes('--apply');
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

try {
  const { rows } = await c.query(
    `SELECT sec.id, sec.ordinal, sec.unit_ordinal, sec.heading, left(sec.body, 100) AS head
       FROM sections sec JOIN sources s ON s.id = sec.source_id
      WHERE s.slug = $1 AND sec.ordinal BETWEEN $2 AND $3
      ORDER BY sec.ordinal`,
    [SLUG, ORD_LO, ORD_HI],
  );
  if (rows.length !== EXPECT) {
    throw new Error(`STOP: matched ${rows.length} sections, expected ${EXPECT}`);
  }
  console.log(`host: ${host}  target: ${SLUG} §${ORD_LO}–${ORD_HI}  (${rows.length} sections)`);
  console.log(`  head: u${rows[0].unit_ordinal} ${rows[0].heading}`);
  console.log(`  tail: u${rows[rows.length - 1].unit_ordinal} ${rows[rows.length - 1].heading}`);

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply.');
    process.exit(0);
  }

  fs.mkdirSync(new URL('../docs/evidence/part2', import.meta.url), { recursive: true });
  const ids = rows.map((r) => r.id);
  const backup = (await c.query(
    `SELECT s.slug, sec.id, sec.ordinal, sec.unit_ordinal, sec.heading, sec.body,
            se.model_slug, se.embedding::text AS embedding
       FROM sections sec JOIN sources s ON s.id = sec.source_id
       LEFT JOIN section_embeddings se ON se.section_id = sec.id
      WHERE sec.id = ANY($1::bigint[]) ORDER BY sec.ordinal`,
    [ids],
  )).rows;
  fs.writeFileSync(new URL(`../${BACKUP}`, import.meta.url), backup.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(`\n✓ backed up ${backup.length} rows → ${BACKUP}`);

  await c.query('BEGIN');
  await c.query(`DELETE FROM section_history_anchors WHERE section_id = ANY($1::bigint[])`, [ids]);
  await c.query(`DELETE FROM section_embeddings WHERE section_id = ANY($1::bigint[])`, [ids]);
  const del = await c.query(`DELETE FROM sections WHERE id = ANY($1::bigint[]) RETURNING id`, [ids]);
  const left = (await c.query(
    `SELECT count(*)::int n FROM sections sec JOIN sources s ON s.id = sec.source_id WHERE s.slug = $1`,
    [SLUG],
  )).rows[0].n;
  if (del.rowCount !== EXPECT) throw new Error(`deleted ${del.rowCount}, expected ${EXPECT}`);
  await c.query('COMMIT');
  console.log(`✓ excised ${del.rowCount} sections; ${SLUG} now has ${left} sections`);
} catch (e) {
  await c.query('ROLLBACK').catch(() => {});
  throw e;
} finally {
  await c.end();
}
