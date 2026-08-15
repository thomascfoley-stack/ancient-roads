// S-7 — the studies reads are BOUNDED (row caps, cursor pagination past them, and a STATED
// byte ceiling), and a soft-deleted study contributes NOTHING to any read or to search.
//
// Why the byte ceiling is a source assertion: the data layer states the ceiling rather than
// enforcing it per page (lib/studies.ts header — a page is bounded by rows × the corpus's
// own unit sizes, worst measured unit tens of KB, typical pages far below 1 MB). S-7 asks
// for the ceiling to be STATED; deleting or gutting that statement must turn a check red,
// or "bounded" quietly became "unbounded, nobody noticed".
//
// What this suite does NOT cover, said plainly: the studies-side SEARCH GROUP of the merged
// surface (design §7.3) is T3 and does not exist in P1 — there is no searchStudies to call.
// This suite pins every P1 read path plus the data-level precondition the T3 query will
// filter on: after softDeleteStudy, the blocks' tombstones are real rows state (deleted_at
// IS NOT NULL, verified owner-side), and the design §6.4 search shape
// (user_id + deleted_at IS NULL on both tables + tsv match) returns nothing for the
// deleted study's unique token.
//
// FINDING F-W1-1 (measured 2026-08-13; this suite's standing RED case against P1 core):
// the studies-list cursor is LOSSY at the millisecond seam. The neon driver returns
// timestamptz as a JS Date and the route's JSON serializes millis, so a cursor's
// updated_at comes back truncated (stored .290151+00 → bound value .290Z), and the
// (updated_at, id) tuple comparison then excludes every row sharing the cursor's stored
// millisecond — bulk-created studies (one now() per statement) are silently DROPPED at
// the page seam. Probed directly: 3 same-timestamp rows, full-precision cursor text finds
// the rows behind the cursor, the driver-returned Date finds 0. The contract (design
// §6.2/§8 S-7: cursor-paginated, no gap) stands, so the list case below stays written
// against it and fails until the core serializes the cursor at full precision (a P3
// integration fix — brief rule 4: a red test against the core is a finding, not a patch).
//
// RED-PROOFS (docs/evidence/study-docs-p2/studies-bounds-red.log), all as temporary,
// reverted mutations to lib/studies.ts watched failing in one red run:
//   1. row caps: the Math.min clamp removed from listStudies/listBlocks → the cap cases RED.
//   2. cascade: the blocks-tombstone statement removed from softDeleteStudy (a broken
//      review-S-H cascade) → the deleted-study cases RED (its blocks still readable, its
//      token still searchable).
//   3. byte ceiling: the stated-ceiling sentence removed from the module header → the
//      source assertion RED.
//
// Teardown is owner-side (app_runtime holds no DELETE on these tables by design — 110).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createStudy,
  getStudy,
  getStudyWithBlocks,
  insertTextBlock,
  listBlocks,
  listStudies,
  positionsAfter,
  softDeleteStudy,
  BLOCKS_PAGE_LIMIT,
  BLOCKS_PAGE_MAX,
  EXPORT_MAX_BLOCKS,
  STUDIES_PAGE_LIMIT,
} from '@/lib/studies';
import { runAsUser } from '@/lib/db';
import { requireDbInCi, seedOwnerUrl } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';

const USER = `qa-w1-bnd-${Date.now()}`;
const TOKEN = `zzw1bnd${Date.now()}`;
const N_STUDIES = 60; // > STUDIES_PAGE_LIMIT (50), so the list clamp is observable
const N_BLOCKS = 250; // > BLOCKS_PAGE_MAX (200), so the blocks clamp is observable

const dbUrl = requireDbInCi();
const ownerUrl = seedOwnerUrl();
const SKIP = announceSkip(
  'S-7 studies bounds (row caps, cursor pagination, stated byte ceiling, deleted-study absence)',
  [
    { name: 'a runtime DB URL (APP_DATABASE_URL)', present: Boolean(dbUrl) },
    { name: 'DATABASE_URL (owner — teardown deletes; app_runtime holds no DELETE by design)', present: Boolean(ownerUrl) },
  ],
  'bounded reads on the studies tables and the deleted-study cascade',
);

let pagedStudy = '';

describe.skipIf(SKIP)('S-7 studies bounds', () => {
  beforeAll(async () => {
    // 60 studies in ONE statement (a real user accumulates studies; the clamp must hold
    // past the page size, which 3 hand-made rows cannot observe).
    await runAsUser(USER, (sql) => [
      sql`INSERT INTO studies (user_id, title)
          SELECT ${USER}, 'w1bnd study ' || g FROM generate_series(1, ${N_STUDIES}) g`,
    ]);
    // One study holding 250 blocks, positions from the data layer's own key generator.
    const study = await createStudy(USER, 'w1bnd paged');
    pagedStudy = study.id;
    const payload = positionsAfter(null, N_BLOCKS).map((p, i) => ({ p, b: `w1bnd block ${i}` }));
    await runAsUser(USER, (sql) => [
      sql`INSERT INTO study_blocks (study_id, user_id, position, kind, body)
          SELECT ${pagedStudy}, ${USER}, e->>'p', 'text', e->>'b'
          FROM jsonb_array_elements(${JSON.stringify(payload)}::jsonb) e
          WHERE EXISTS (SELECT 1 FROM studies WHERE id = ${pagedStudy} AND user_id = ${USER})`,
    ]);
  }, 60_000);

  afterAll(async () => {
    if (!ownerUrl) return;
    const { default: pg } = await import('pg');
    const c = new pg.Client({ connectionString: ownerUrl, ssl: { rejectUnauthorized: false } });
    await c.connect();
    try {
      await c.query(`DELETE FROM studies WHERE user_id LIKE 'qa-w1-bnd-%'`);
    } finally {
      await c.end();
    }
  }, 60_000);

  it('the bound constants are coherent (routes share these exports)', () => {
    for (const c of [STUDIES_PAGE_LIMIT, BLOCKS_PAGE_LIMIT, BLOCKS_PAGE_MAX, EXPORT_MAX_BLOCKS]) {
      expect(Number.isInteger(c) && c > 0, 'bounds must be positive integers').toBe(true);
    }
    expect(BLOCKS_PAGE_LIMIT).toBeLessThanOrEqual(BLOCKS_PAGE_MAX);
    expect(EXPORT_MAX_BLOCKS).toBeGreaterThanOrEqual(BLOCKS_PAGE_MAX);
  });

  it('studies list: row cap holds past the page size, and the cursor paginates with no overlap or gap', async () => {
    const page1 = await listStudies(USER, { limit: 10_000 });
    expect(page1, 'an over-large limit must be clamped to STUDIES_PAGE_LIMIT').toHaveLength(STUDIES_PAGE_LIMIT);

    const cursor = { updatedAt: page1[page1.length - 1]!.updated_at, id: page1[page1.length - 1]!.id };
    const page2 = await listStudies(USER, { limit: 10_000, before: cursor });
    const ids1 = new Set(page1.map((s) => s.id));
    expect(page2.some((s) => ids1.has(s.id)), 'pages must not overlap').toBe(false);
    // RED against P1 core while F-W1-1 stands (see header): the 60 bulk studies share one
    // now(), and the millisecond-truncated cursor drops every one of them at the seam.
    expect(
      page1.length + page2.length,
      'the cursor must reach every study — a seam that drops rows is not pagination (F-W1-1)',
    ).toBe(N_STUDIES + 1);

    // The cursor key is (updated_at, id) DESC — assert the pair is a TOTAL order across
    // the seam, or a tie at the page boundary would silently drop or repeat a study.
    const all = [...page1, ...page2];
    for (let i = 1; i < all.length; i++) {
      const prev = all[i - 1]!;
      const cur = all[i]!;
      const ordered =
        prev.updated_at > cur.updated_at ||
        (prev.updated_at === cur.updated_at && prev.id > cur.id);
      expect(ordered, `list order broke at the page seam (${prev.id} then ${cur.id})`).toBe(true);
    }
  });

  it('blocks read: row cap holds past BLOCKS_PAGE_MAX, and position-cursor pages tile the document', async () => {
    const clamped = await listBlocks(USER, pagedStudy, { limit: 99_999 });
    expect(clamped, 'an over-large limit must be clamped to BLOCKS_PAGE_MAX').toHaveLength(BLOCKS_PAGE_MAX);

    const seen = new Set<string>();
    let after: string | undefined;
    let pages = 0;
    for (;;) {
      const page = await listBlocks(USER, pagedStudy, { limit: BLOCKS_PAGE_LIMIT, afterPosition: after });
      pages++;
      for (const b of page) {
        expect(seen.has(b.id), `block ${b.id} appeared on two pages`).toBe(false);
        seen.add(b.id);
      }
      if (page.length < BLOCKS_PAGE_LIMIT) break;
      after = page[page.length - 1]!.position;
    }
    expect(seen.size, 'every block is reachable by paging').toBe(N_BLOCKS);
    expect(pages).toBe(Math.ceil(N_BLOCKS / BLOCKS_PAGE_LIMIT));
  });

  it('the byte ceiling is STATED where the bounds are defined', async () => {
    // S-7's words: "row caps AND a stated byte ceiling". A page's bytes are bounded by
    // rows × the corpus's own unit sizes; that statement lives in the studies.ts header
    // and this assertion is what turns its deletion red.
    const source = readFileSync(path.join(__dirname, '../../src/lib/studies.ts'), 'utf-8');
    expect(source, 'the byte-ceiling statement is gone from lib/studies.ts').toMatch(/byte ceiling is stated/i);
    expect(source, 'the ceiling must name a magnitude, not just a principle').toMatch(/1 MB/);
  });

  it('a soft-deleted study contributes NOTHING: not to the list, the doc read, the block read, or search', async () => {
    const study = await createStudy(USER, 'w1bnd to-delete');
    const b1 = await insertTextBlock(USER, study.id, `first note on ${TOKEN}`);
    const b2 = await insertTextBlock(USER, study.id, `second note on ${TOKEN}`);
    if (!b1.ok || !b2.ok) throw new Error('seed failed');

    // The design §6.4 search shape — the predicate the T3 studies group will run.
    const searchAsUser = () =>
      runAsUser(USER, (sql) => [
        sql`SELECT b.id FROM study_blocks b JOIN studies s ON s.id = b.study_id
            WHERE b.user_id = ${USER} AND b.deleted_at IS NULL AND s.deleted_at IS NULL
              AND b.tsv @@ plainto_tsquery('english', ${TOKEN})`,
      ]);

    // Baseline (positive half): while live, the study and its blocks ARE reachable.
    expect((await listStudies(USER)).map((s) => s.id)).toContain(study.id);
    const [baselineHits] = await searchAsUser();
    expect(baselineHits, 'precondition: the live study’s blocks must be searchable').toHaveLength(2);

    expect(await softDeleteStudy(USER, study.id)).toBe(true);

    expect((await listStudies(USER)).map((s) => s.id), 'deleted study in the list').not.toContain(study.id);
    expect(await getStudy(USER, study.id), 'deleted study readable').toBeNull();
    expect(await getStudyWithBlocks(USER, study.id), 'deleted study readable with blocks').toBeNull();
    expect(await listBlocks(USER, study.id), 'deleted study’s blocks still readable').toEqual([]);
    const [hits] = await searchAsUser();
    expect(hits, 'deleted study’s blocks still contribute to search').toHaveLength(0);

    // The cascade is DATA STATE, not a render decision (review S-H): the tombstones must
    // be real on the blocks themselves, verified owner-side (bypasses RLS, sees all rows).
    const { default: pg } = await import('pg');
    const c = new pg.Client({ connectionString: ownerUrl!, ssl: { rejectUnauthorized: false } });
    await c.connect();
    try {
      const { rows } = await c.query<{ total: number; live: number }>(
        `SELECT count(*)::int AS total, count(*) FILTER (WHERE deleted_at IS NULL)::int AS live
         FROM study_blocks WHERE study_id = $1`,
        [study.id],
      );
      expect(rows[0]!.total, 'precondition: the blocks must still EXIST (tombstoned, not removed)').toBe(2);
      expect(rows[0]!.live, 'the blocks’ tombstones must be real rows state').toBe(0);
    } finally {
      await c.end();
    }
  }, 60_000);
});
