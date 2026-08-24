/**
 * W-HISTSCOPE — seeded probe proof, BOTH DIRECTIONS, transaction rolled back.
 *
 * The W-HISTSCOPE brief's red-proof for an ALREADY-DONE fix (4baefe5): seed an out-of-scope
 * SERVED label and watch (a) the corrected probe (with the sources legs) NOT draw it, and
 * (b) the OLD pre-4baefe5 probe (served-only) draw it. The seed is one INSERT into
 * section_history_anchors on a section that already has served history_embeddings and whose
 * source is out of scope (staged historian) — inside a transaction that is ALWAYS rolled
 * back, so dev is left untouched. The sentinel label sorts before every real label, so the
 * OLD probe's ORDER BY ... LIMIT 1 draws it deterministically.
 *
 * Target guard: dev only (ep-tiny-hat). Prints no secrets.
 *
 *   node docs/evidence/swarm-2026-08-22/W-HISTSCOPE/seeded-probe-proof.mjs
 */
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

// web/.env.local carries APP_DATABASE_URL; the owner DATABASE_URL lives in the ROOT .env.local.
const loadEnv = (rel) => Object.fromEntries(
  readFileSync(new URL(rel, import.meta.url), 'utf8')
    .split('\n').filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const env = { ...loadEnv('../../../../.env.local'), ...loadEnv('../../../../web/.env.local') };
const URL_ = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
if (!URL_) { console.error('No DATABASE_URL in web/.env.local'); process.exit(1); }
const host = new URL(URL_.replace(/^postgres(ql)?:\/\//, 'https://')).host;
if (!host.includes('ep-tiny-hat') || host.includes('odd-fog')) {
  console.error('Refusing: target host is not dev (ep-tiny-hat).');
  process.exit(1);
}
console.log(`target host: ${host} (dev, ep-tiny-hat)`);

const SENTINEL = 'AAA_SWARM_HISTSCOPE_SENTINEL';
// The pre-4baefe5 probe: served-only, no sources legs (the defective one).
const OLD_PROBE = `
  SELECT DISTINCT a.entity_label AS label
    FROM section_history_anchors a
    JOIN history_embeddings he ON he.section_id = a.section_id
   WHERE he.served
   ORDER BY a.entity_label
   LIMIT 1`;
// The shipped probe as fixed in 4baefe5: served + published + historian.
const SCOPED_PROBE = `
  SELECT DISTINCT a.entity_label AS label
    FROM section_history_anchors a
    JOIN history_embeddings he ON he.section_id = a.section_id
    JOIN sections s ON s.id = a.section_id
    JOIN sources src ON src.id = s.source_id
   WHERE he.served AND src.status = 'published' AND src.source_type = 'historian'
   ORDER BY a.entity_label
   LIMIT 1`;

const client = new Client({ connectionString: URL_ });
await client.connect();
let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
};
try {
  await client.query('BEGIN');
  // A served section whose source is OUT of scope (staged historian if present; else any
  // non-(published historian) served source).
  const sec = await client.query(
    `SELECT he.section_id, src.slug, src.source_type, src.status
       FROM history_embeddings he
       JOIN sections s ON s.id = he.section_id
       JOIN sources src ON src.id = s.source_id
      WHERE he.served AND NOT (src.status = 'published' AND src.source_type = 'historian')
      LIMIT 1`);
  check('found an out-of-scope served section to seed on', sec.rows.length === 1,
    sec.rows[0] ? `${sec.rows[0].slug} [${sec.rows[0].source_type}/${sec.rows[0].status}]` : 'none');
  const sectionId = sec.rows[0].section_id;

  await client.query(
    `INSERT INTO section_history_anchors (section_id, kind, entity_slug, entity_label)
     VALUES ($1, 'event', 'zz-swarm-histscope-sentinel', $2)`, [sectionId, SENTINEL]);

  const seeded = await client.query(
    `SELECT COUNT(*) AS n FROM section_history_anchors WHERE entity_label = $1`, [SENTINEL]);
  check('sentinel visible inside the transaction', seeded.rows[0].n === '1');

  const oldDraw = await client.query(OLD_PROBE);
  check('OLD probe (served-only) DRAWS the out-of-scope sentinel', oldDraw.rows[0]?.label === SENTINEL,
    `drew ${oldDraw.rows[0]?.label}`);

  const scopedDraw = await client.query(SCOPED_PROBE);
  check('CORRECTED probe (sources legs) does NOT draw the sentinel', scopedDraw.rows[0]?.label !== SENTINEL,
    `drew ${scopedDraw.rows[0]?.label}`);
} finally {
  await client.query('ROLLBACK');
}
const gone = await client.query(
  `SELECT COUNT(*) AS n FROM section_history_anchors WHERE entity_label = $1`, [SENTINEL]);
check('sentinel gone after ROLLBACK (dev untouched)', gone.rows[0].n === '0');
await client.end();
process.exit(failures === 0 ? 0 : 1);
