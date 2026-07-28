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
// DATABASE_URL pointing at the dev OR ci endpoint is available — so it can never run on prod.
//
// ⚠ THIS SUITE DOES **NOT** RUN IN CI TODAY. A previous version of this header asserted the
// opposite — that CI held an owner connection string (the disposable Neon `ci` branch) and ran
// this suite in earnest. That was FALSE and is corrected here: commit `f229a93` parked the
// `.github/workflows/audit.yml` edit (the push lacked the `workflow` token scope), so the
// documentation half of that change landed and the enforcement half did not. Measured under CI
// conditions (no `web/.env.local`): **75 of 200 web tests skip, including every test here.**
// Believing the old claim is how a PR that drops a `status='published'` predicate merges green.
// Tracked in `docs/OWNER_ACTIONS.md` §1; enforced against re-introduction by
// `test/invariants/ci-claims-match-reality.test.ts`. (That guard matches claim-phrases anywhere
// in a file, so describe a retracted claim — never reproduce its wording verbatim.)

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

// A DB-less run must READ as NOT RUN, not as coverage — see helpers/loud-skip.ts.
const SKIP = announceSkip(
  'MIG-A polymorphic annotations — anchor XOR CHECK + verse-only unique index',
  [{ name: 'a runtime DB URL (APP_DATABASE_URL)', present: Boolean(url) }],
  'the 025 anchor XOR CHECK and the verse-only partial unique index',
);

describe.skipIf(SKIP)('MIG-A polymorphic annotations — anchor XOR CHECK + verse-only unique index', () => {
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

  it('highlights: accepts a valid section span (hash pinned), rejects all three corrupt shapes', async () => {
    await inTx(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO highlights (user_id, target_kind, section_id, source_content_hash, span_start, span_end, color)
         VALUES ($1, 'section', $2, 'deadbeefhash', 0, 5, 'yellow') RETURNING target_kind, verse_id`,
        [USER, sectionId2 ?? sectionId],
      );
      expect(rows[0]).toMatchObject({ target_kind: 'section', verse_id: null });
    });
    // both anchors
    await expect(
      inTx((c) =>
        c.query(`INSERT INTO highlights (user_id, target_kind, verse_id, section_id, color) VALUES ($1,'verse',1001001,$2,'yellow')`, [USER, sectionId]),
      ),
    ).rejects.toThrow(/highlights_anchor_xor|check constraint/i);
    // neither anchor
    await expect(
      inTx((c) => c.query(`INSERT INTO highlights (user_id, target_kind, color) VALUES ($1,'verse','yellow')`, [USER])),
    ).rejects.toThrow(/highlights_anchor_xor|check constraint/i);
    // kind/anchor mismatch
    await expect(
      inTx((c) => c.query(`INSERT INTO highlights (user_id, target_kind, verse_id, color) VALUES ($1,'section',1001001,'yellow')`, [USER])),
    ).rejects.toThrow(/highlights_anchor_xor|check constraint/i);
  });

  // 030 (audit remediation): ADR-027 says a section span must never render corrupt. A section
  // HIGHLIGHT carries span offsets into sections.body, so without a pinned content hash a later
  // re-ingest that shifts the body is undetectable and the span paints at wrong offsets. The
  // constraint therefore REQUIRES the hash on section highlights, and forbids `translation`
  // there (offsets are translation-relative, so it is meaningless for a section).
  it('highlights: a section span WITHOUT source_content_hash is rejected (ADR-027 fail-closed)', async () => {
    await expect(
      inTx((c) =>
        c.query(`INSERT INTO highlights (user_id, target_kind, section_id, span_start, span_end, color) VALUES ($1,'section',$2,0,5,'yellow')`, [USER, sectionId]),
      ),
    ).rejects.toThrow(/highlights_anchor_xor|check constraint/i);
  });

  it('highlights: a section span may not carry a translation (verse-only)', async () => {
    await expect(
      inTx((c) =>
        c.query(
          `INSERT INTO highlights (user_id, target_kind, section_id, source_content_hash, span_start, span_end, color, translation)
           VALUES ($1,'section',$2,'hash',0,5,'yellow','kjv')`,
          [USER, sectionId],
        ),
      ),
    ).rejects.toThrow(/highlights_anchor_xor|check constraint/i);
  });

  it('rejects a target_kind outside the whitelist on notes, highlights and bookmarks', async () => {
    await expect(
      inTx((c) => c.query(`INSERT INTO notes (user_id, target_kind, verse_id, body) VALUES ($1,'bogus',1001001,'x')`, [USER])),
    ).rejects.toThrow(/target_kind_chk|anchor_xor|check constraint/i);
    await expect(
      inTx((c) => c.query(`INSERT INTO highlights (user_id, target_kind, verse_id, color) VALUES ($1,'bogus',1001001,'yellow')`, [USER])),
    ).rejects.toThrow(/target_kind_chk|anchor_xor|check constraint/i);
    await expect(
      inTx((c) => c.query(`INSERT INTO bookmarks (user_id, target_kind, verse_id) VALUES ($1,'bogus',1001001)`, [USER])),
    ).rejects.toThrow(/target_kind_chk|anchor_xor|check constraint/i);
  });
});
