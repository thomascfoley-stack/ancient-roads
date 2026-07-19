// Red-first (MIG-A / design §4): prove the polymorphic anchor invariant the DB now
// enforces on `notes` and `highlights`. Before migration 025 is applied these cases
// error ("column target_kind does not exist") — the suite is RED; after, GREEN.
//
// The data-shape-risk invariant (owner-flagged): a row must carry EXACTLY ONE
// anchor (verse XOR section) consistent with target_kind. We seed the bad rows and
// prove the CHECK rejects them. We also prove (a) section notes go many-per-section
// while verse notes stay single-active, and (b) the notes unique-index rework
// requires upsertNote's ON CONFLICT predicate to name target_kind='verse' — the OLD
// predicate no longer matches an arbiter index (that is why annotations.ts changes
// in this same slice).
//
// Owner-only + dev-guarded (same guard as db/apply-migration.mjs): every case runs
// inside a transaction that is ROLLED BACK, so nothing persists and RLS never needs
// to be disabled (owner bypasses RLS to seed arbitrary user_ids; the RLS boundary
// itself is proven separately with two app_runtime accounts). SKIPS unless an owner
// DATABASE_URL pointing at the dev endpoint is available — so it can never run on prod
// or in CI (which holds only the app_runtime URL).

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { localEnv } from '../helpers/env';

function ownerUrl(): string | undefined {
  const url = localEnv('DATABASE_URL') ?? localEnv('DATABASE_URL_UNPOOLED');
  if (!url) return undefined;
  if (!/ep-tiny-hat|localhost|127\.0\.0\.1/.test(url)) return undefined;
  return url;
}

const url = ownerUrl();
const USER = 'qa-polymorphic-user';
let client: pg.Client | undefined;
let sectionId: string | undefined;
let sectionId2: string | undefined;

/** Run fn inside a transaction that is ALWAYS rolled back — no residue, pass or fail. */
async function inTx<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  await client!.query('BEGIN');
  try {
    return await fn(client!);
  } finally {
    await client!.query('ROLLBACK');
  }
}

describe.skipIf(!url)('MIG-A polymorphic annotations — anchor XOR CHECK + verse-only unique index', () => {
  beforeAll(async () => {
    client = new pg.Client({ connectionString: url!, ssl: { rejectUnauthorized: false } });
    await client.connect();
    const { rows } = await client.query<{ id: string }>('SELECT id FROM sections ORDER BY id LIMIT 2');
    sectionId = rows[0]?.id;
    sectionId2 = rows[1]?.id;
  }, 60_000);

  afterAll(async () => {
    if (client) await client.end();
  });

  it('accepts a valid VERSE note (default target_kind, verse_id set, section_id null)', async () => {
    await inTx(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO notes (user_id, verse_id, body) VALUES ($1, 1001001, 'v') RETURNING target_kind, verse_id, section_id`,
        [USER],
      );
      expect(rows[0]).toMatchObject({ target_kind: 'verse', verse_id: 1001001, section_id: null });
    });
  });

  it('accepts a valid SECTION note (target_kind=section, section_id set, verse_id null)', async () => {
    await inTx(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO notes (user_id, target_kind, section_id, source_content_hash, body)
         VALUES ($1, 'section', $2, 'deadbeef', 's') RETURNING target_kind, verse_id, section_id`,
        [USER, sectionId],
      );
      expect(rows[0]).toMatchObject({ target_kind: 'section', verse_id: null });
      expect(String(rows[0].section_id)).toBe(String(sectionId));
    });
  });

  it('REJECTS a corrupt row with BOTH anchors set (verse_id AND section_id)', async () => {
    await expect(
      inTx((c) =>
        c.query(
          `INSERT INTO notes (user_id, target_kind, verse_id, section_id, body) VALUES ($1, 'verse', 1001001, $2, 'x')`,
          [USER, sectionId],
        ),
      ),
    ).rejects.toThrow(/notes_anchor_xor|check constraint/i);
  });

  it('REJECTS a corrupt row with NEITHER anchor set', async () => {
    await expect(
      inTx((c) =>
        c.query(`INSERT INTO notes (user_id, target_kind, verse_id, section_id, body) VALUES ($1, 'verse', NULL, NULL, 'x')`, [USER]),
      ),
    ).rejects.toThrow(/notes_anchor_xor|check constraint/i);
  });

  it('REJECTS target_kind=section with a verse_id (kind/anchor mismatch)', async () => {
    await expect(
      inTx((c) =>
        c.query(`INSERT INTO notes (user_id, target_kind, verse_id, body) VALUES ($1, 'section', 1001001, 'x')`, [USER]),
      ),
    ).rejects.toThrow(/notes_anchor_xor|check constraint/i);
  });

  it('allows MANY section notes on the same (user, section) — verse-only unique index', async () => {
    await inTx(async (c) => {
      for (const body of ['note one', 'note two', 'note three']) {
        await c.query(`INSERT INTO notes (user_id, target_kind, section_id, body) VALUES ($1, 'section', $2, $3)`, [USER, sectionId, body]);
      }
      const { rows } = await c.query(`SELECT count(*)::int n FROM notes WHERE user_id=$1 AND section_id=$2 AND deleted_at IS NULL`, [USER, sectionId]);
      expect(rows[0].n).toBe(3);
    });
  });

  it('still enforces ONE active VERSE note per (user, verse) — a second raw insert violates the unique index', async () => {
    await inTx(async (c) => {
      await c.query(`INSERT INTO notes (user_id, verse_id, body) VALUES ($1, 2002002, 'first')`, [USER]);
      await expect(
        c.query(`INSERT INTO notes (user_id, verse_id, body) VALUES ($1, 2002002, 'second')`, [USER]),
      ).rejects.toThrow(/idx_notes_user_verse|duplicate key|unique/i);
    });
  });

  it('upsertNote NEW predicate (…AND target_kind=\'verse\') upserts in place; OLD predicate no longer matches an arbiter index', async () => {
    await inTx(async (c) => {
      // New predicate — the one annotations.ts now uses. First insert, then upsert-update.
      await c.query(
        `INSERT INTO notes (user_id, verse_id, body) VALUES ($1, 3003003, 'a')
         ON CONFLICT (user_id, verse_id) WHERE deleted_at IS NULL AND target_kind = 'verse'
         DO UPDATE SET body = EXCLUDED.body, updated_at = now()`,
        [USER],
      );
      await c.query(
        `INSERT INTO notes (user_id, verse_id, body) VALUES ($1, 3003003, 'b')
         ON CONFLICT (user_id, verse_id) WHERE deleted_at IS NULL AND target_kind = 'verse'
         DO UPDATE SET body = EXCLUDED.body, updated_at = now()`,
        [USER],
      );
      const { rows } = await c.query(`SELECT count(*)::int n, max(body) body FROM notes WHERE user_id=$1 AND verse_id=3003003 AND deleted_at IS NULL`, [USER]);
      expect(rows[0]).toMatchObject({ n: 1, body: 'b' });
    });
    // Old predicate (deleted_at IS NULL only) — proves why the code had to change.
    await inTx(async (c) => {
      await expect(
        c.query(
          `INSERT INTO notes (user_id, verse_id, body) VALUES ($1, 4004004, 'a')
           ON CONFLICT (user_id, verse_id) WHERE deleted_at IS NULL
           DO UPDATE SET body = EXCLUDED.body`,
          [USER],
        ),
      ).rejects.toThrow(/no unique or exclusion constraint matching/i);
    });
  });

  it('applies the same anchor XOR CHECK to highlights', async () => {
    await inTx(async (c) => {
      // valid section highlight
      const { rows } = await c.query(
        `INSERT INTO highlights (user_id, target_kind, section_id, span_start, span_end, color)
         VALUES ($1, 'section', $2, 0, 5, 'yellow') RETURNING target_kind, verse_id`,
        [USER, sectionId2 ?? sectionId],
      );
      expect(rows[0]).toMatchObject({ target_kind: 'section', verse_id: null });
    });
    await expect(
      inTx((c) =>
        c.query(`INSERT INTO highlights (user_id, target_kind, verse_id, section_id, color) VALUES ($1, 'verse', 1001001, $2, 'yellow')`, [USER, sectionId]),
      ),
    ).rejects.toThrow(/highlights_anchor_xor|check constraint/i);
  });
});
