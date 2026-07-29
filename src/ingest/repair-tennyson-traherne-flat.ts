// REPAIR for a bug in suppress-nonauthorial-matter.ts (found by post-apply verification,
// 2026-07-19). Run once.
//
//   NEON_BRANCH=dev npx tsx src/ingest/repair-tennyson-traherne-flat.ts [--apply]
//
// THE BUG. The suppression deletes from two stores. In `sections` it targeted an inclusive
// ORDINAL range; in the served flat `embeddings` it re-expressed that range against the
// writer's SOURCE SECTION number parsed out of source_id ("poetry:<work>:<sec>[.<chunk>]").
// Those two are NOT the same axis. repoint-sections-work makes sections 1:1 with flat ROWS,
// so a chunked source section (2.1, 2.2) consumes TWO ordinals while remaining ONE source
// section. The ranges therefore drift apart wherever a work has chunked sections:
//
//   * tennyson-in-memoriam — sections 1-5 (the ads) are flat source sections 1-3; deleting
//     flat "BETWEEN 1 AND 5" also removed source sections 4 and 5 = 3 rows of REAL VERSE:
//     the Prologue ("Whom we, that have not seen thy face") and canto I ("I held it truth,
//     with him who sings"). OVER-deleted.
//   * traherne-poems — sections 413-417 (the ads) are flat source sections 282-286, so
//     "BETWEEN 413 AND 417" matched NOTHING and the publisher's catalogue (Charles Lamb,
//     James Thomson, Oliver Goldsmith under Traherne's name) is still SERVED. UNDER-deleted.
//
// Caught because the post-apply check compared sections-vs-flat per work and demanded 1:1;
// the two works that broke it were the only two with an ordinal-range target and chunking.
//
// THE REPAIR.
//  1. RESTORE the 3 Tennyson rows. They are fully recoverable: only the flat rows were lost,
//     while `sections` and `section_embeddings` for them survived untouched, so content and
//     the 1024-dim vector are both still on hand. source_id is reassigned as 4, 5.1, 5.2 —
//     the numbering the repoint ORDER BY needs to sort them between source 3.x and 6, which
//     is what source_id is actually load-bearing for. metadata is copied from the adjacent
//     surviving row with only `heading` re-derived.
//  2. DELETE the 5 Traherne ad rows from the flat store by their REAL source sections 282-286
//     (verified by body: each is a priced catalogue entry for another author's book).
//
// Discipline: dev-guard, dry-run default, back up the Traherne rows (with vectors) before
// deleting, verify 1:1 per work inside the txn, roll back on any failure.

import pg from 'pg';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';

const BACKUP = 'docs/evidence/part2/traherne-ads-suppressed.jsonl';
const TRAHERNE_AD_SECTIONS: [number, number] = [282, 286];
/** The Tennyson sections whose flat rows were deleted in error, with the source_id to restore. */
const TENNYSON_RESTORE: Array<{ ordinal: number; sourceId: string }> = [
  { ordinal: 6, sourceId: 'poetry:tennyson-in-memoriam:4' },
  { ordinal: 7, sourceId: 'poetry:tennyson-in-memoriam:5.1' },
  { ordinal: 8, sourceId: 'poetry:tennyson-in-memoriam:5.2' },
];

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
  const fromEnv = Boolean(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);
  const branch = fromEnv ? process.env.NEON_BRANCH : localEnv('NEON_BRANCH');
  if (branch !== 'dev' && branch !== 'test') throw new Error(`STOP: NEON_BRANCH="${branch ?? '(unset)'}" must be dev|test`);
  const host = new URL(dbUrl.replace(/^"|"$/g, '')).host;
  if (!host.includes('ep-tiny-hat')) throw new Error(`STOP: host "${host}" is not dev (expected ep-tiny-hat)`);
  console.log(`db host: ${host} (credentials redacted)\n`);

  const client = new pg.Client({ connectionString: dbUrl.replace(/^"|"$/g, ''), ssl: { rejectUnauthorized: false } });
  await client.connect();
  const SEC = `split_part(split_part(source_id,':',3),'.',1)::int`;

  try {
    // ── 1. Tennyson: what is missing, and is it recoverable?
    const { rows: missing } = await client.query<{ ordinal: number; body: string; embedding: string | null; heading: string | null }>(
      `SELECT sec.ordinal, sec.body, se.embedding::text AS embedding, sec.heading
         FROM sections sec
         JOIN sources s ON s.id = sec.source_id
         LEFT JOIN section_embeddings se ON se.section_id = sec.id
        WHERE s.slug = 'tennyson-in-memoriam' AND sec.ordinal = ANY($1::int[])
        ORDER BY sec.ordinal`,
      [TENNYSON_RESTORE.map((t) => t.ordinal)],
    );
    if (missing.length !== TENNYSON_RESTORE.length) {
      throw new Error(`STOP: expected ${TENNYSON_RESTORE.length} recoverable Tennyson sections, found ${missing.length}`);
    }
    for (const m of missing) {
      if (!m.embedding) throw new Error(`STOP: section ${m.ordinal} has no section_embeddings vector — not recoverable here`);
    }
    console.log('TENNYSON — restore (real verse deleted in error):');
    for (const m of missing) console.log(`  §${m.ordinal} ${JSON.stringify(m.body.slice(0, 72))}`);

    // The template row supplies work/author/license/sourceUrl/... unchanged.
    const { rows: tmplRows } = await client.query<{ metadata: Record<string, unknown>; source_type: string }>(
      `SELECT metadata, source_type FROM embeddings
        WHERE user_id IS NULL AND source_id = 'poetry:tennyson-in-memoriam:6'`,
    );
    const tmpl = tmplRows[0];
    if (!tmpl) throw new Error('STOP: template row poetry:tennyson-in-memoriam:6 not found');

    // ── 2. Traherne: the ads, by their REAL source sections.
    const { rows: ads } = await client.query<{ source_id: string; content: string }>(
      `SELECT source_id, content FROM embeddings
        WHERE user_id IS NULL AND metadata->>'work' = 'traherne-poems' AND ${SEC} BETWEEN $1 AND $2
        ORDER BY ${SEC}`,
      TRAHERNE_AD_SECTIONS,
    );
    console.log(`\nTRAHERNE — delete ${ads.length} ad rows still in the SERVED pool:`);
    for (const a of ads) console.log(`  ${a.source_id} ${JSON.stringify(a.content.slice(0, 66))}`);
    if (ads.length !== 5) throw new Error(`STOP: expected 5 Traherne ad rows, found ${ads.length}`);

    if (!apply) {
      console.log('\nDRY RUN — nothing written. Re-run with --apply.');
      return;
    }

    mkdirSync('docs/evidence/part2', { recursive: true });
    const { rows: adBackup } = await client.query(
      `SELECT source_id, source_type, content, metadata, embedding::text AS embedding
         FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = 'traherne-poems' AND ${SEC} BETWEEN $1 AND $2`,
      TRAHERNE_AD_SECTIONS,
    );
    writeFileSync(BACKUP, adBackup.map((r) => JSON.stringify(r)).join('\n') + '\n');
    console.log(`\n✓ backed up ${adBackup.length} Traherne rows (with vectors) → ${BACKUP}`);

    await client.query('BEGIN');

    for (let i = 0; i < missing.length; i++) {
      const m = missing[i]!;
      const spec = TENNYSON_RESTORE[i]!;
      const metadata = { ...tmpl.metadata, heading: m.heading ?? '' };
      await client.query(
        `INSERT INTO embeddings (user_id, source_type, source_id, content, embedding, metadata)
         VALUES (NULL, $1, $2, $3, $4::vector, $5::jsonb)
         ON CONFLICT DO NOTHING`,
        [tmpl.source_type, spec.sourceId, m.body, m.embedding, JSON.stringify(metadata)],
      );
    }
    const { rowCount: adsDeleted } = await client.query(
      `DELETE FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = 'traherne-poems' AND ${SEC} BETWEEN $1 AND $2`,
      TRAHERNE_AD_SECTIONS,
    );

    // ── VERIFY: both works must be exactly 1:1 sections↔flat, and no ad text may survive.
    for (const slug of ['tennyson-in-memoriam', 'traherne-poems']) {
      const { rows } = await client.query<{ sec: string; emb: string }>(
        `SELECT (SELECT count(*) FROM sections x JOIN sources s ON s.id = x.source_id WHERE s.slug = $1) AS sec,
                (SELECT count(*) FROM embeddings WHERE user_id IS NULL AND metadata->>'work' = $1) AS emb`,
        [slug],
      );
      const { sec, emb } = rows[0]!;
      if (sec !== emb) throw new Error(`VERIFY FAILED: ${slug} sections=${sec} flat=${emb} — not 1:1`);
      console.log(`  ${slug.padEnd(24)} sections=${sec} flat=${emb} ✓ 1:1`);
    }
    const { rows: leak } = await client.query<{ n: string }>(
      `SELECT count(*) n FROM embeddings
        WHERE user_id IS NULL AND metadata->>'work' IN ('traherne-poems','tennyson-in-memoriam')
          AND (content ILIKE '%cloth extra%' OR content ILIKE '%buckram%' OR content ILIKE '%CHEAP EDITIONS%')`,
    );
    if (Number(leak[0]!.n) !== 0) throw new Error(`VERIFY FAILED: ${leak[0]!.n} ad rows still served`);

    await client.query('COMMIT');
    console.log(`\n✓ REPAIRED — restored ${missing.length} Tennyson verse rows, deleted ${adsDeleted} Traherne ad rows.`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
