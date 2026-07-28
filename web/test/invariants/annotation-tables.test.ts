// Red-first (MIG-B..E): the four new user tables — bookmarks (026), library_items
// (027), reading_progress (028), tags + annotation_tags (029). Before those
// migrations are applied every case errors ("relation does not exist") — RED;
// after, GREEN.
//
// What is actually asserted (each is a constraint that CAN fail):
//   * bookmarks       — the same verse-XOR-section anchor CHECK as 025, and ONE
//                       active bookmark per target (toggle semantics).
//   * library_items   — shelf ∈ {reading,saved,archived}; a work sits on exactly
//                       ONE shelf per user (UNIQUE user_id, source_id).
//   * reading_progress— one cursor per (user, work); percent bounded to 0..1;
//                       last_ordinal >= 1; upsert on the unique key works.
//   * tags/annotation_tags — per-user unique tag names, non-empty names, the
//                       polymorphic target_type whitelist, no duplicate links.
//   * ALL FIVE        — row level security is ENABLED and carries a policy (the
//                       isolation itself is proven separately with two accounts).
//
// Owner-only + dev-guarded; every case runs in a transaction that is ROLLED BACK,
// so nothing persists. SKIPS unless an owner DATABASE_URL on the dev endpoint is
// available, so it can never touch prod or run in CI.

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { localEnv } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';

function ownerUrl(): string | undefined {
  const url = localEnv('DATABASE_URL') ?? localEnv('DATABASE_URL_UNPOOLED');
  if (!url) return undefined;
  if (!/ep-tiny-hat|ep-holy-rice-athhpp5z|localhost|127\.0\.0\.1/.test(url)) return undefined;
  return url;
}

const url = ownerUrl();
const USER = 'qa-tables-user';
let client: pg.Client | undefined;
let sectionId: string;
let sourceId: string;
let sourceId2: string;

async function inTx<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  await client!.query('BEGIN');
  try {
    return await fn(client!);
  } finally {
    await client!.query('ROLLBACK');
  }
}

// A DB-less run must READ as NOT RUN, not as coverage — see helpers/loud-skip.ts.
const SKIP = announceSkip(
  'MIG-B..E — bookmarks, library_items, reading_progress, tags',
  [{ name: 'a runtime DB URL (APP_DATABASE_URL)', present: Boolean(url) }],
  'bookmarks, library_items, reading_progress and tags schema invariants',
);

describe.skipIf(SKIP)('MIG-B..E — bookmarks, library_items, reading_progress, tags', () => {
  beforeAll(async () => {
    client = new pg.Client({ connectionString: url!, ssl: { rejectUnauthorized: false } });
    await client.connect();
    sectionId = (await client.query('SELECT id FROM sections ORDER BY id LIMIT 1')).rows[0].id;
    const s = await client.query('SELECT id FROM sources ORDER BY id LIMIT 2');
    sourceId = s.rows[0].id;
    sourceId2 = s.rows[1].id;
  }, 60_000);

  afterAll(async () => {
    if (client) await client.end();
  });

  it('RLS is ENABLED with a policy on every new table', async () => {
    const { rows } = await client!.query<{ relname: string; relrowsecurity: boolean; policies: number }>(
      `SELECT c.relname, c.relrowsecurity,
              (SELECT count(*)::int FROM pg_policies p WHERE p.tablename = c.relname AND p.schemaname = 'public') AS policies
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname='public' AND c.relname IN ('bookmarks','library_items','reading_progress','tags','annotation_tags')
       ORDER BY c.relname`,
    );
    expect(rows.map((r) => r.relname)).toEqual(['annotation_tags', 'bookmarks', 'library_items', 'reading_progress', 'tags']);
    for (const r of rows) {
      expect(r.relrowsecurity, `${r.relname} RLS enabled`).toBe(true);
      expect(r.policies, `${r.relname} has a policy`).toBeGreaterThan(0);
    }
    // NOTE: this is a STRUCTURAL check only — it would pass for a policy of USING (true).
    // The actual isolation boundary is proven two-account and executed in
    // annotation-rls-tenancy.test.ts. Do not treat this test as the RLS proof.
  });

  // ---- bookmarks (026) ----
  it('bookmarks: accepts verse and section anchors, REJECTS a both-anchor row', async () => {
    await inTx(async (c) => {
      await c.query(`INSERT INTO bookmarks (user_id, verse_id) VALUES ($1, 1001001)`, [USER]);
      await c.query(`INSERT INTO bookmarks (user_id, target_kind, section_id) VALUES ($1,'section',$2)`, [USER, sectionId]);
    });
    await expect(
      inTx((c) => c.query(`INSERT INTO bookmarks (user_id, target_kind, verse_id, section_id) VALUES ($1,'verse',1001001,$2)`, [USER, sectionId])),
    ).rejects.toThrow(/bookmarks_anchor_xor|check constraint/i);
  });

  it('bookmarks: only ONE active bookmark per target (toggle semantics)', async () => {
    await inTx(async (c) => {
      await c.query(`INSERT INTO bookmarks (user_id, verse_id) VALUES ($1, 2002002)`, [USER]);
      await expect(c.query(`INSERT INTO bookmarks (user_id, verse_id) VALUES ($1, 2002002)`, [USER])).rejects.toThrow(/duplicate key|unique/i);
    });
  });

  // ---- library_items (027) ----
  it('library_items: shelf whitelist, and a work sits on exactly ONE shelf per user', async () => {
    await inTx(async (c) => {
      await c.query(`INSERT INTO library_items (user_id, source_id, shelf) VALUES ($1,$2,'reading')`, [USER, sourceId]);
      // same user + same source again -> unique violation (move shelf is an UPDATE)
      await expect(c.query(`INSERT INTO library_items (user_id, source_id, shelf) VALUES ($1,$2,'saved')`, [USER, sourceId])).rejects.toThrow(/duplicate key|unique/i);
    });
    await expect(
      inTx((c) => c.query(`INSERT INTO library_items (user_id, source_id, shelf) VALUES ($1,$2,'bogus-shelf')`, [USER, sourceId2])),
    ).rejects.toThrow(/library_items_shelf_chk|check constraint/i);
  });

  // ---- reading_progress (028) ----
  it('reading_progress: one cursor per (user, work); upsert overwrites it', async () => {
    await inTx(async (c) => {
      await c.query(`INSERT INTO reading_progress (user_id, source_id, last_ordinal, percent) VALUES ($1,$2,5,0.1)`, [USER, sourceId]);
      await c.query(
        `INSERT INTO reading_progress (user_id, source_id, last_ordinal, percent) VALUES ($1,$2,42,0.9)
         ON CONFLICT (user_id, source_id) DO UPDATE SET last_ordinal = EXCLUDED.last_ordinal, percent = EXCLUDED.percent, updated_at = now()`,
        [USER, sourceId],
      );
      const { rows } = await c.query(`SELECT count(*)::int n, max(last_ordinal) ord FROM reading_progress WHERE user_id=$1 AND source_id=$2`, [USER, sourceId]);
      expect(rows[0]).toMatchObject({ n: 1, ord: 42 });
    });
  });

  it('reading_progress: percent bounded 0..1 and last_ordinal >= 1', async () => {
    await expect(
      inTx((c) => c.query(`INSERT INTO reading_progress (user_id, source_id, last_ordinal, percent) VALUES ($1,$2,1,1.5)`, [USER, sourceId])),
    ).rejects.toThrow(/percent_chk|check constraint/i);
    await expect(
      inTx((c) => c.query(`INSERT INTO reading_progress (user_id, source_id, last_ordinal) VALUES ($1,$2,0)`, [USER, sourceId])),
    ).rejects.toThrow(/ordinal_chk|check constraint/i);
  });

  // ---- tags + annotation_tags (029) ----
  it('tags: per-user unique names, non-empty', async () => {
    await inTx(async (c) => {
      await c.query(`INSERT INTO tags (user_id, name) VALUES ($1,'grace')`, [USER]);
      await expect(c.query(`INSERT INTO tags (user_id, name) VALUES ($1,'grace')`, [USER])).rejects.toThrow(/duplicate key|unique/i);
    });
    await expect(inTx((c) => c.query(`INSERT INTO tags (user_id, name) VALUES ($1,'   ')`, [USER]))).rejects.toThrow(/nonempty|check constraint/i);
  });

  it('annotation_tags: target_type whitelist and no duplicate links', async () => {
    await inTx(async (c) => {
      const tag = (await c.query(`INSERT INTO tags (user_id, name) VALUES ($1,'t') RETURNING id`, [USER])).rows[0].id;
      const note = (await c.query(`INSERT INTO notes (user_id, verse_id, body) VALUES ($1, 5005005, 'n') RETURNING id`, [USER])).rows[0].id;
      await c.query(`INSERT INTO annotation_tags (user_id, tag_id, target_type, target_id) VALUES ($1,$2,'note',$3)`, [USER, tag, note]);
      await expect(
        c.query(`INSERT INTO annotation_tags (user_id, tag_id, target_type, target_id) VALUES ($1,$2,'note',$3)`, [USER, tag, note]),
      ).rejects.toThrow(/duplicate key|unique/i);
    });
    await inTx(async (c) => {
      const tag = (await c.query(`INSERT INTO tags (user_id, name) VALUES ($1,'t2') RETURNING id`, [USER])).rows[0].id;
      await expect(
        c.query(`INSERT INTO annotation_tags (user_id, tag_id, target_type, target_id) VALUES ($1,$2,'not-a-kind',gen_random_uuid())`, [USER, tag]),
      ).rejects.toThrow(/target_type_chk|check constraint/i);
    });
  });
});
