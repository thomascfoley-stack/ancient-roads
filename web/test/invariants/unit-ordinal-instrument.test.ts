// Work Order v2 Stage 2.1 — unit_ordinal instrument (db-invariants surface).
//
// Standing perturbation tests (in-memory SQL substitution against 024 backfill):
//   1. units-merge-islands — ordering fails, non-null still passes
//   2. unit-sort-storage-ordinal — chapter pair order fails
//
// Published-work leg runs when APP_DATABASE_URL is present (db-invariants job).
// Digest leg is part of measurePublishedUnitOrdinal.

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  analyzeUnitOrdinalPreservation,
  backfillSqlFromMigration,
  backfillSelectSql,
  backfillRepairUpdateSql,
  measurePublishedUnitOrdinal,
  perturbBackfillSql,
  rollupDigest,
} from '../../../scripts/lib/unit-ordinal-instrument.mjs';
import { seedOwnerUrl, runtimeDbUrl } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';

// Re-export runtimeDbUrl usage — published leg uses app_runtime, perturbations use seed owner.
const appUrl = runtimeDbUrl();
const ownerUrl = seedOwnerUrl();

const SEED = [
  { ordinal: 1, heading: 'Sermon A — ref (1/3)' },
  { ordinal: 2, heading: 'Sermon B — ref (1/2)' },
  { ordinal: 3, heading: 'Sermon A — ref (2/3)' },
  { ordinal: 4, heading: 'Sermon B — ref (2/2)' },
  { ordinal: 5, heading: 'Sermon A — ref (3/3)' },
  { ordinal: 6, heading: 'To Maecenas' },
  { ordinal: 7, heading: 'To Maecenas' },
  { ordinal: 8, heading: 'On Friendship' },
  { ordinal: 9, heading: null, vstart: 1_003_001 },
  { ordinal: 10, heading: null, vstart: 1_001_001 },
];

const EXPECTED_ORDER = [
  { unit_ordinal: 1, ordinal: 1 },
  { unit_ordinal: 1, ordinal: 3 },
  { unit_ordinal: 1, ordinal: 5 },
  { unit_ordinal: 2, ordinal: 2 },
  { unit_ordinal: 2, ordinal: 4 },
  { unit_ordinal: 3, ordinal: 6 },
  { unit_ordinal: 3, ordinal: 7 },
  { unit_ordinal: 4, ordinal: 8 },
  { unit_ordinal: 5, ordinal: 10 },
  { unit_ordinal: 6, ordinal: 9 },
];

const SLUG_PREFIX = 'qa-uoi-seed-';
const RUN_ID = process.env.GITHUB_RUN_ID ?? String(process.pid);
const SLUG = `${SLUG_PREFIX}${RUN_ID}`;

const backfillSql = backfillSqlFromMigration();

function rowsMatchOrder(
  rows: Array<{ unit_ordinal: number | null; ordinal: number }>,
  expected: typeof EXPECTED_ORDER,
) {
  return rows.every((r) => r.unit_ordinal !== null) && JSON.stringify(rows) === JSON.stringify(expected);
}

const PUBLISHED_SKIP = announceSkip(
  'unit_ordinal instrument — published works + digest',
  [{ name: 'APP_DATABASE_URL (runtime DB)', present: Boolean(appUrl) }],
  'published-work unit_ordinal NULL/order/recompute/digest checks',
);

const PERTURB_SKIP = announceSkip(
  'unit_ordinal instrument — 024 backfill perturbations',
  [{ name: 'DATABASE_URL (owner seed via seedOwnerUrl)', present: Boolean(ownerUrl) }],
  'standing perturbation regression against migration 024 backfill SQL',
);

describe('unit_ordinal instrument — order preservation analysis (in-memory)', () => {
  const base = [
    { section_id: 'a', stored: 1, computed: 1, ordinal: 1 },
    { section_id: 'b', stored: 1, computed: 1, ordinal: 2 },
    { section_id: 'c', stored: 2, computed: 2, ordinal: 3 },
  ];

  it('exact match: grouping and order preserved', () => {
    const r = analyzeUnitOrdinalPreservation(base);
    expect(r.ok).toBe(true);
    expect(r.uniformOffset).toBe(0);
  });

  it('uniform offset: GREEN with offset reported', () => {
    const offset = base.map((r) => ({ ...r, stored: r.stored + 16 }));
    const r = analyzeUnitOrdinalPreservation(offset);
    expect(r.ok).toBe(true);
    expect(r.uniformOffset).toBe(16);
    expect(r.errors).toEqual([]);
  });

  it('non-uniform offset: RED', () => {
    const bad = [
      { section_id: 'a', stored: 1, computed: 1, ordinal: 1 },
      { section_id: 'b', stored: 2, computed: 1, ordinal: 2 },
    ];
    const r = analyzeUnitOrdinalPreservation(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('non-uniform offset'))).toBe(true);
  });

  it('genuine mis-order: RED (reading order break)', () => {
    const bad = [
      { section_id: 'a', stored: 2, computed: 1, ordinal: 1 },
      { section_id: 'b', stored: 1, computed: 2, ordinal: 2 },
    ];
    const r = analyzeUnitOrdinalPreservation(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('reading order break') || e.includes('non-uniform offset'))).toBe(true);
  });

  it('grouping break: same stored unit, different computed units', () => {
    const bad = [
      { section_id: 'a', stored: 1, computed: 1, ordinal: 1 },
      { section_id: 'b', stored: 1, computed: 2, ordinal: 2 },
    ];
    const r = analyzeUnitOrdinalPreservation(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('grouping break'))).toBe(true);
  });
});

describe('unit_ordinal instrument — 024 backfill perturbations (in-memory SQL)', () => {
  it('extracts backfill SQL containing the units and unit_sort CTEs', () => {
    expect(backfillSql).toMatch(/UPDATE sections/i);
    expect(backfillSql).toMatch(/CASE WHEN grp LIKE 'r\|%' THEN grp/);
    expect(backfillSql).toMatch(/min\(CASE WHEN grp LIKE 'c\|%' THEN/);
  });

  it('units-merge-islands perturbation changes the units CTE', () => {
    const p = perturbBackfillSql(backfillSql, 'units-merge-islands');
    expect(p).not.toContain("CASE WHEN grp LIKE 'r|%' THEN grp");
    expect(p).toContain("grp || '|' || island");
  });

  it('unit-sort-storage-ordinal perturbation changes unit_sort', () => {
    const p = perturbBackfillSql(backfillSql, 'unit-sort-storage-ordinal');
    expect(p).toMatch(/unit_sort AS \([\s\S]*min\(ordinal::bigint\)/);
    expect(backfillSql).toMatch(/unit_sort AS \([\s\S]*vstart \/ 1000/);
  });

  it('backfillSelectSql produces a SELECT over computed unit_ordinal', () => {
    const sel = backfillSelectSql(backfillSql);
    expect(sel).toMatch(/SELECT u\.id AS section_id/i);
    expect(sel).not.toMatch(/UPDATE sections/i);
  });

  it('backfillRepairUpdateSql scopes need to slug list and keeps UPDATE', () => {
    const repair = backfillRepairUpdateSql(backfillSql);
    expect(repair).toMatch(/slug = ANY\(\$1::text\[\]\)/);
    expect(repair).toMatch(/UPDATE sections s/i);
    expect(repair).not.toMatch(/unit_ordinal IS NULL/);
    // CTEs below need must still be the migration's (no second predicate).
    expect(repair).toMatch(/CASE WHEN grp LIKE 'r\|%' THEN grp/);
  });

  it('backfillSelectSql scope=slugs uses the same need selector as repair', () => {
    const sel = backfillSelectSql(backfillSql, { scope: 'slugs' });
    expect(sel).toMatch(/slug = ANY\(\$1::text\[\]\)/);
    expect(sel).not.toMatch(/UPDATE sections/i);
  });
});

describe.skipIf(PERTURB_SKIP)('unit_ordinal instrument — perturbation red-proofs on seeded mis-order', () => {
  let client: pg.Client;
  let seeded = false;

  const deleteSeed = async (c: pg.Client, slug: string) => {
    await c.query(
      `DELETE FROM section_anchors sa USING sections s
       WHERE sa.section_id = s.id AND s.source_id IN (SELECT id FROM sources WHERE slug = $1)`,
      [slug],
    );
    await c.query(`DELETE FROM sections WHERE source_id IN (SELECT id FROM sources WHERE slug = $1)`, [slug]);
    await c.query(`DELETE FROM sources WHERE slug = $1`, [slug]);
  };

  beforeAll(async () => {
    client = new pg.Client({ connectionString: ownerUrl!, ssl: { rejectUnauthorized: false } });
    await client.connect();
    await deleteSeed(client, SLUG);
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO sources (slug, title, author, source_type, tradition, era, license, provenance, status)
       VALUES ($1, 'QA UOI seed', 'QA', 'sermon', 'qa', 'qa', 'Public Domain', '{}', 'staged')
       RETURNING id`,
      [SLUG],
    );
    const sourceId = rows[0]!.id;
    for (const r of SEED) {
      const { rows: sec } = await client.query<{ id: string }>(
        `INSERT INTO sections (source_id, ordinal, heading, body) VALUES ($1, $2, $3, $4) RETURNING id`,
        [sourceId, r.ordinal, r.heading, `qa uoi ${r.ordinal}`],
      );
      if ('vstart' in r && r.vstart !== undefined) {
        await client.query(
          `INSERT INTO section_anchors (section_id, verse_id_start, verse_id_end) VALUES ($1, $2, $2)`,
          [sec[0]!.id, r.vstart],
        );
      }
    }
    seeded = true;
  }, 60_000);

  afterAll(async () => {
    if (!client || !seeded) return;
    await deleteSeed(client, SLUG);
    await client.end();
  }, 60_000);

  async function runBackfill(sql: string) {
    await client.query(`UPDATE sections SET unit_ordinal = NULL WHERE source_id IN (SELECT id FROM sources WHERE slug = $1)`, [SLUG]);
    await client.query(sql);
    const { rows } = await client.query<{ unit_ordinal: number | null; ordinal: number }>(
      `SELECT s.unit_ordinal, s.ordinal FROM sections s
       JOIN sources w ON w.id = s.source_id WHERE w.slug = $1
       ORDER BY s.unit_ordinal, s.ordinal`,
      [SLUG],
    );
    return rows;
  }

  it('correct backfill: ordering matches EXPECTED_ORDER', async () => {
    const rows = await runBackfill(backfillSql);
    expect(rowsMatchOrder(rows, EXPECTED_ORDER)).toBe(true);
  }, 60_000);

  it('units-merge-islands: non-null passes but ordering FAILS', async () => {
    const rows = await runBackfill(perturbBackfillSql(backfillSql, 'units-merge-islands'));
    expect(rows.every((r) => r.unit_ordinal !== null)).toBe(true);
    expect(rowsMatchOrder(rows, EXPECTED_ORDER)).toBe(false);
  }, 60_000);

  it('unit-sort-storage-ordinal: non-null passes but chapter order FAILS', async () => {
    const rows = await runBackfill(perturbBackfillSql(backfillSql, 'unit-sort-storage-ordinal'));
    expect(rows.every((r) => r.unit_ordinal !== null)).toBe(true);
    expect(rowsMatchOrder(rows, EXPECTED_ORDER)).toBe(false);
  }, 60_000);
});

describe.skipIf(PUBLISHED_SKIP)('unit_ordinal instrument — published works + digest', () => {
  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: appUrl!, ssl: { rejectUnauthorized: false } });
    await client.connect();
  }, 30_000);

  afterAll(async () => {
    await client?.end();
  });

  it('passes NULL/order/recompute/digest checks on all published works', async () => {
    const result = await measurePublishedUnitOrdinal(client);
    expect(result.errors, result.errors.join('\n')).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.digests.length).toBe(result.publishedWorks);
    expect(result.digests.every((d) => /^[a-f0-9]{32}$/.test(d.digest))).toBe(true);
    const roll = rollupDigest(result.digests);
    expect(roll).toMatch(/^[a-f0-9]{32}$/);
  }, 120_000);
});
