// ADR-029 remediation (owner ruling, 2026-07-19): SUPPRESS the 95 Schaff-Prolegomena
// rows from the served pool while KEEPING the 8,846 legitimate Chrysostom rows.
//
//   NEON_BRANCH=dev npx tsx src/ingest/suppress-chrysostom-prolegomena.ts [--apply]
//
// THE DEFECT. `chrysostom-homilies` (published, 8,941 rows) declares
// author='John Chrysostom'. Its first 16 source sections are NOT Chrysostom — they are
// Philip Schaff's *Prolegomena* to the NPNF volume ("The Life and Work of St. John
// Chrysostom. By Philip Schaff"), a 19th-century editor's biographical/bibliographic
// essay carried into the corpus because the CCEL adapter has no per-work attribution
// boundary inside a composite volume. Chrysostom's own text starts at section 17
// ("Homily 1"). 95 rows. Same defect CLASS as origen-commentary (ADR-029).
//
// WHY DELETE RATHER THAN A FILTER PREDICATE. The served boundary
// (LEGAL_CORPUS_FILTER) is mirrored by the partial HNSW index predicates (migration
// 018) and held in lockstep by test/invariants/legal-hnsw-index-sync. Excluding 95 rows
// by predicate would mean a predicate change + a CONCURRENTLY rebuild of a
// multi-hundred-thousand-row HNSW index on dev AND in the prod cutover — enormous
// machinery to fence 95 rows, and a new permanent clause in a filter that is already the
// most safety-critical string in the system. Removing the rows is the established
// pattern here (b2-remove-forbidden-provenance) and is effective on EVERY surface at
// once, with no risk that one read path misses the new clause.
//
// THIS IS NOT THE DURABLE REPAIR. Per ADR-029, ordinal-range removal alone leaves the
// adapter defect in place to recur on the next CCEL ingest. The durable repair is the
// CCEL adapter fix: split a composite volume at its work boundaries and give each work
// its own sources row + author. This script is the tactical suppression the owner ruled
// for; the adapter fix is tracked separately and MUST land before any further CCEL
// ingest.
//
// Discipline (mirrors b2-remove-forbidden-provenance):
//   1. DEV GUARD — refuse unless NEON_BRANCH=dev|test AND the host is ep-tiny-hat.
//   2. BACK UP every removed row (embeddings incl. vector, + sections) to JSONL first.
//   3. DELETE from the served flat store AND sections/section_embeddings.
//   4. VERIFY: 0 target rows remain, the surviving count is exactly 8,846, and the
//      boundary row (section 17, "Homily 1") is INTACT.
// Default is a DRY RUN. --apply performs backup + delete + verify.

import pg from 'pg';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';

const WORK = 'chrysostom-homilies';
const PROLEGOMENA_MAX_SECTION = 16; // sections 1..16 = Schaff; 17+ = Chrysostom
const EXPECTED_REMOVED = 95;
const EXPECTED_SURVIVING = 8846;
const BACKUP_DIR = 'docs/evidence/part1';

function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const p = 'web/.env.local';
  if (!existsSync(p)) return undefined;
  return readFileSync(p, 'utf-8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}

async function main() {
  const apply = process.argv.includes('--apply');

  const dbUrl = localEnv('DATABASE_URL_UNPOOLED') ?? localEnv('DATABASE_URL');
  if (!dbUrl) throw new Error('owner DATABASE_URL is required');
  const fromProcessEnv = Boolean(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);
  const branch = fromProcessEnv ? process.env.NEON_BRANCH : localEnv('NEON_BRANCH');
  if (branch !== 'dev' && branch !== 'test') {
    throw new Error(`STOP: NEON_BRANCH="${branch ?? '(unset)'}" from the same source as DATABASE_URL must be dev|test`);
  }
  const host = new URL(dbUrl.replace(/^"|"$/g, '')).host;
  if (!host.includes('ep-tiny-hat')) throw new Error(`STOP: host "${host}" is not the dev branch (expected ep-tiny-hat)`);
  console.log(`db host: ${host} (credentials redacted)`);

  const client = new pg.Client({ connectionString: dbUrl.replace(/^"|"$/g, ''), ssl: { rejectUnauthorized: false } });
  await client.connect();

  const SEC = `split_part(split_part(source_id,':',3),'.',1)::int`;

  try {
    const { rows: before } = await client.query<{ target: string; total: string }>(
      `SELECT count(*) FILTER (WHERE ${SEC} <= $2) AS target, count(*) AS total
         FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = $1`,
      [WORK, PROLEGOMENA_MAX_SECTION],
    );
    const target = Number(before[0]!.target);
    const total = Number(before[0]!.total);
    console.log(`\nflat embeddings for "${WORK}": ${total} total, ${target} in sections 1-${PROLEGOMENA_MAX_SECTION} (Schaff Prolegomena)`);

    if (target === 0) {
      console.log('✓ already suppressed — nothing to do (idempotent).');
      return;
    }
    if (target !== EXPECTED_REMOVED) {
      throw new Error(`STOP: expected ${EXPECTED_REMOVED} target rows, found ${target}. The boundary moved — re-verify before deleting.`);
    }

    // The boundary row must be Chrysostom, not Schaff — proves we are cutting in the right place.
    const { rows: boundary } = await client.query<{ heading: string; content: string }>(
      `SELECT metadata->>'heading' AS heading, left(content, 80) AS content
         FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = $1 AND ${SEC} = $2
         ORDER BY source_id LIMIT 1`,
      [WORK, PROLEGOMENA_MAX_SECTION + 1],
    );
    const b = boundary[0];
    if (!b) throw new Error(`STOP: no row at section ${PROLEGOMENA_MAX_SECTION + 1} — cannot confirm the cut boundary`);
    console.log(`boundary section ${PROLEGOMENA_MAX_SECTION + 1}: heading="${b.heading}" content="${b.content.replace(/\n/g, ' ')}"`);
    if (!/^homily/i.test(b.heading ?? '')) {
      throw new Error(`STOP: section ${PROLEGOMENA_MAX_SECTION + 1} heading "${b.heading}" is not a Homily — the boundary is not where expected`);
    }

    if (!apply) {
      const { rows: sample } = await client.query<{ source_id: string; heading: string }>(
        `SELECT source_id, metadata->>'heading' AS heading FROM embeddings
          WHERE user_id IS NULL AND metadata->>'work' = $1 AND ${SEC} <= $2
          ORDER BY ${SEC}, source_id LIMIT 5`,
        [WORK, PROLEGOMENA_MAX_SECTION],
      );
      console.log('\nDRY RUN — would remove these (first 5):');
      for (const r of sample) console.log(`  ${r.source_id}  "${r.heading}"`);
      console.log(`\n  flat embeddings to delete: ${target}`);
      console.log(`  surviving Chrysostom rows: ${total - target} (expected ${EXPECTED_SURVIVING})`);
      console.log('\nRe-run with --apply to back up and delete.');
      return;
    }

    // 2. BACK UP (vector included — a hard delete without a restore path is not allowed).
    mkdirSync(BACKUP_DIR, { recursive: true });
    const { rows: backup } = await client.query(
      `SELECT source_id, content, metadata, source_type, embedding::text AS embedding
         FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = $1 AND ${SEC} <= $2
         ORDER BY ${SEC}, source_id`,
      [WORK, PROLEGOMENA_MAX_SECTION],
    );
    const backupPath = `${BACKUP_DIR}/chrysostom-prolegomena-suppressed.jsonl`;
    writeFileSync(backupPath, backup.map((r) => JSON.stringify(r)).join('\n') + '\n');
    console.log(`\n✓ backed up ${backup.length} rows (with vectors) → ${backupPath}`);

    await client.query('BEGIN');

    // 3a. sections + section_embeddings (the Book Reader / catalog surface).
    //     sections.ordinal 1..95 for this source == the same Prolegomena run
    //     (repoint-sections-work orders by the SAME source_id section number).
    const { rows: srcRow } = await client.query<{ id: string }>(`SELECT id FROM sources WHERE slug = $1`, [WORK]);
    const sourcePk = srcRow[0]?.id;
    let secDeleted = 0;
    if (sourcePk) {
      const { rowCount: se } = await client.query(
        `DELETE FROM section_embeddings se USING sections s
          WHERE se.section_id = s.id AND s.source_id = $1 AND s.ordinal <= $2`,
        [sourcePk, EXPECTED_REMOVED],
      );
      const { rowCount: sec } = await client.query(
        `DELETE FROM sections WHERE source_id = $1 AND ordinal <= $2`,
        [sourcePk, EXPECTED_REMOVED],
      );
      secDeleted = sec ?? 0;
      console.log(`  sections deleted: ${sec}  section_embeddings deleted: ${se}`);
    }

    // 3b. the SERVED flat store (the /ask retrieval pool).
    const { rowCount: flatDeleted } = await client.query(
      `DELETE FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = $1 AND ${SEC} <= $2`,
      [WORK, PROLEGOMENA_MAX_SECTION],
    );
    console.log(`  flat embeddings deleted: ${flatDeleted}`);

    // 4. VERIFY inside the txn — roll back if any assertion fails.
    const { rows: after } = await client.query<{ target: string; total: string }>(
      `SELECT count(*) FILTER (WHERE ${SEC} <= $2) AS target, count(*) AS total
         FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = $1`,
      [WORK, PROLEGOMENA_MAX_SECTION],
    );
    const remaining = Number(after[0]!.target);
    const surviving = Number(after[0]!.total);
    if (remaining !== 0) throw new Error(`VERIFY FAILED: ${remaining} target rows still present`);
    if (surviving !== EXPECTED_SURVIVING) {
      throw new Error(`VERIFY FAILED: ${surviving} surviving rows, expected ${EXPECTED_SURVIVING}`);
    }
    const { rows: intact } = await client.query<{ heading: string }>(
      `SELECT metadata->>'heading' AS heading FROM embeddings
        WHERE user_id IS NULL AND metadata->>'work' = $1 AND ${SEC} = $2 ORDER BY source_id LIMIT 1`,
      [WORK, PROLEGOMENA_MAX_SECTION + 1],
    );
    if (!/^homily/i.test(intact[0]?.heading ?? '')) {
      throw new Error(`VERIFY FAILED: boundary row lost — section ${PROLEGOMENA_MAX_SECTION + 1} heading is "${intact[0]?.heading}"`);
    }

    await client.query('COMMIT');

    console.log('\n' + '='.repeat(66));
    console.log('SUPPRESSED — Schaff Prolegomena removed from the served pool');
    console.log('='.repeat(66));
    console.log(`  flat embeddings removed:  ${flatDeleted}`);
    console.log(`  sections removed:         ${secDeleted}`);
    console.log(`  Chrysostom rows retained: ${surviving}`);
    console.log(`  boundary intact:          section ${PROLEGOMENA_MAX_SECTION + 1} = "${intact[0]!.heading}"`);
    console.log(`  restore path:             ${backupPath}`);
    console.log('\n  NOT the durable repair — the CCEL adapter still lacks a per-work');
    console.log('  attribution boundary and will recur on the next composite volume (ADR-029).');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
