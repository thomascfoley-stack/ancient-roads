// S-14 — block order is STABLE and TOTAL across renders: every read orders by
// (position, id), two blocks that land at the same computed midpoint resolve
// deterministically (unique index → 23505 → bounded retry against fresh anchors), and no
// read path ever falls back to insertion order.
//
// The mechanism under test (design §6.1, review S-I): `position` is a base-62 fractional
// key; positionBetween's midpoint always exists, so there is no rebalance path and no
// exhaustion. The collision case is not hypothetical — two tabs inserting after the same
// anchor read the same anchors and a PURE function returns the same key for both; the
// partial unique index idx_blocks_order admits exactly one, and the loser's retry
// recomputes against the winner. What must never happen is a silent reorder.
//
// RED-PROOFS (docs/evidence/study-docs-p2/studies-order-red.log), both as temporary,
// reverted mutations to lib/studies.ts watched failing in one red run:
//   1. ORDER BY flipped to (position DESC, id DESC) in listBlocks → the order assertions
//      RED (proving they observe the read's actual order, not insertion order).
//   2. The 23505 retry removed from insertTextBlock (catch rethrows) → the concurrent
//      same-midpoint case RED (the second insert's unique violation escapes instead of
//      being retried against fresh anchors).
//
// Teardown is owner-side (app_runtime holds no DELETE on these tables by design — 110);
// the stored-position control (case 6) also writes via owner.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createStudy,
  getStudyWithBlocks,
  insertTextBlock,
  listBlocks,
  positionBetween,
  positionsAfter,
} from '@/lib/studies';
import { runAsUser } from '@/lib/db';
import { requireDbInCi, seedOwnerUrl } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';

const USER = `qa-w1-ord-${Date.now()}`;

const dbUrl = requireDbInCi();
const ownerUrl = seedOwnerUrl();
const SKIP = announceSkip(
  'S-14 studies order (total, stable, collision-free)',
  [
    { name: 'a runtime DB URL (APP_DATABASE_URL)', present: Boolean(dbUrl) },
    { name: 'DATABASE_URL (owner — teardown deletes; app_runtime holds no DELETE by design)', present: Boolean(ownerUrl) },
  ],
  'stable total block order across renders and deterministic midpoint-collision handling',
);

/** (position, id) strictly ascending — the total order every read must present. */
function expectTotalOrder(blocks: readonly { id: string; position: string }[]): void {
  for (let i = 1; i < blocks.length; i++) {
    const prev = blocks[i - 1]!;
    const cur = blocks[i]!;
    const ordered =
      prev.position < cur.position || (prev.position === cur.position && prev.id < cur.id);
    expect(ordered, `order broke: (${prev.position}, ${prev.id}) then (${cur.position}, ${cur.id})`).toBe(true);
  }
}

describe.skipIf(SKIP)('S-14 studies order', () => {
  let study = '';
  let anchorId = '';

  beforeAll(async () => {
    const s = await createStudy(USER, 'w1ord order');
    study = s.id;
    const a = await insertTextBlock(USER, study, 'anchor');
    if (!a.ok) throw new Error(`seed failed: ${a.reason}`);
    anchorId = a.block.id;
  }, 60_000);

  afterAll(async () => {
    if (!ownerUrl) return;
    const { default: pg } = await import('pg');
    const c = new pg.Client({ connectionString: ownerUrl, ssl: { rejectUnauthorized: false } });
    await c.connect();
    try {
      await c.query(`DELETE FROM studies WHERE user_id LIKE 'qa-w1-ord-%'`);
    } finally {
      await c.end();
    }
  }, 60_000);

  it('positionBetween: deterministic, strictly between, valid base-62, never the minimum digit', () => {
    const k1 = positionBetween(null, null);
    const k2 = positionBetween(null, null);
    expect(k1, 'the midpoint of the same anchors must be the same key (pure)').toBe(k2);
    expect(k1).toMatch(/^[0-9A-Za-z]+$/);
    expect(k1.endsWith('0'), 'a key ending in the minimum digit has no key before it').toBe(false);

    const between = positionBetween('a', 'b');
    expect(between > 'a' && between < 'b', `${between} must sort strictly between a and b`).toBe(true);
    expect(() => positionBetween('b', 'a'), 'out-of-order bounds must throw, not corrupt order').toThrow();

    const chain = positionsAfter(null, 4);
    for (let i = 1; i < chain.length; i++) {
      expect(chain[i]! > chain[i - 1]!, 'positionsAfter must be strictly ascending').toBe(true);
    }
  });

  it('two blocks at the SAME computed midpoint resolve deterministically — no silent reorder', async () => {
    // Four concurrent inserts after the same anchor: the anchor reads see the same state,
    // the pure positionBetween returns the same key for all of them, the unique index
    // admits one, and the rest must land — via bounded 23505 retry — at fresh midpoints,
    // never fail a well-formed insert and never reorder.
    const results = await Promise.all(
      ['c1', 'c2', 'c3', 'c4'].map((body) => insertTextBlock(USER, study, body, { afterBlockId: anchorId })),
    );
    for (const r of results) {
      expect(r.ok, `a midpoint race must resolve by retry, not failure (${r.ok ? '' : r.reason})`).toBe(true);
    }
    const positions = results.map((r) => (r.ok ? r.block.position : ''));
    expect(new Set(positions).size, 'colliding inserts must land at DISTINCT positions').toBe(positions.length);

    const anchor = (await listBlocks(USER, study)).find((b) => b.id === anchorId)!;
    for (const p of positions) {
      expect(p > anchor.position, 'each raced insert must sort after its anchor').toBe(true);
    }
  });

  it('read order is (position, id), NOT insertion order', async () => {
    // Insert a block BEFORE the anchor, after the anchor existed: insertion sequence and
    // position sequence now disagree, and the read must present position order.
    const before = await insertTextBlock(USER, study, 'inserted last, sorts first', { beforeBlockId: anchorId });
    if (!before.ok) throw new Error(`seed failed: ${before.reason}`);
    expect(before.block.position < (await listBlocks(USER, study)).find((b) => b.id === anchorId)!.position).toBe(true);

    const blocks = await listBlocks(USER, study);
    expectTotalOrder(blocks);
    expect(blocks[0]!.id, 'the newest insert sorts first by position').toBe(before.block.id);
    expect(blocks.findIndex((b) => b.id === before.block.id)).toBeLessThan(
      blocks.findIndex((b) => b.id === anchorId),
    );
  });

  it('order is STABLE across renders — two paged reads and the doc read agree exactly', async () => {
    const read1 = await listBlocks(USER, study);
    const read2 = await listBlocks(USER, study);
    const docRead = await getStudyWithBlocks(USER, study);
    expect(read1.map((b) => b.id), 'the same read twice must give the same order').toEqual(read2.map((b) => b.id));
    expect(docRead?.blocks.map((b) => b.id), 'the doc-page read must agree with the block read').toEqual(
      read1.map((b) => b.id),
    );
    expectTotalOrder(read1);
  });

  it('a duplicate live position is rejected (23505) — the collision becomes a retry, never a reorder', async () => {
    const anchor = (await listBlocks(USER, study)).find((b) => b.id === anchorId)!;
    // Bypass the data layer and attempt the collision directly: idx_blocks_order
    // (partial unique on (study_id, position) WHERE deleted_at IS NULL) must refuse it.
    await expect(
      runAsUser(USER, (sql) => [
        sql`INSERT INTO study_blocks (study_id, user_id, position, kind, body)
            SELECT ${study}, ${USER}, ${anchor.position}, 'text', 'duplicate position'
            WHERE EXISTS (SELECT 1 FROM studies WHERE id = ${study} AND user_id = ${USER})`,
      ]),
    ).rejects.toThrow(/duplicate key|23505/);
  });

  it('control: order follows the STORED position — an owner-side move is reflected in the next read', async () => {
    // Without a control that perturbs the stored order, the assertions above could pass
    // against a read that secretly sorts by insertion sequence. Move the last block's
    // position ahead of everything via the owner connection; the very next read through
    // the data layer must present it first.
    const { default: pg } = await import('pg');
    const c = new pg.Client({ connectionString: ownerUrl!, ssl: { rejectUnauthorized: false } });
    await c.connect();
    try {
      const before = await listBlocks(USER, study);
      const last = before[before.length - 1]!;
      const newPos = positionBetween(null, before[0]!.position);
      await c.query('UPDATE study_blocks SET position = $1 WHERE id = $2', [newPos, last.id]);
      const after = await listBlocks(USER, study);
      expect(after[0]!.id, 'the moved block must sort first on the very next read').toBe(last.id);
      expectTotalOrder(after);
    } finally {
      await c.end();
    }
  });
});
