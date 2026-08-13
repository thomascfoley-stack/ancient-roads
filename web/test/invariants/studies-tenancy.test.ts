// S-4 — cross-tenant read AND write are impossible on studies / study_blocks /
// study_block_revisions, proven with two real user ids over the app_runtime role; and the
// POSITIVE half matters as much: user A really does see A's own rows. A suite that only
// proves "B sees nothing" would also pass in a world where every query returns nothing.
//
// WHY THE LAYERS ARE TESTED SEPARATELY (design §8 S-4; C5 carried): RLS under Neon's
// user-id format is UNPROVEN, so the audited H1/H2 belts in lib/studies.ts (explicit
// user_id on every read; ownership-checked writes) are load-bearing and the RLS policy is
// the backstop. Three kinds of case, by what can stop them:
//   1. BELT level — through the data layer's own functions, as user B naming A's ids.
//   2. BELT-REMOVED controls — raw SQL with NO user_id filter, still as user B via
//      runAsUser: only RLS can stop these, so they measure RLS under the real GUC format
//      directly (this is the control that closes C5).
//   3. No-GUC backstop — app_runtime with app.current_user_id unset must see zero rows.
//
// RED-PROOFS (docs/evidence/study-docs-p2/studies-tenancy-red.log):
//   A. RLS inert: the suite run with the dev OWNER (BYPASSRLS) role as the runtime
//      connection → every belt-removed control goes RED (B reads A's rows, B's unbelted
//      UPDATE/INSERT land) while the belted cases stay GREEN — one run proving both that
//      the controls catch an RLS failure AND that the belts alone isolate.
//   B. Belt removed: the user_id filter deleted from getStudy's and updateStudy's queries
//      in lib/studies.ts, suite run under app_runtime → recorded in the log; expected
//      GREEN, which is RLS binding under Neon-format ids (the C5 measurement).
//
// Teardown is owner-side (app_runtime holds no DELETE on these tables BY DESIGN — 110), so
// this suite needs both URLs and loud-skips without either.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createStudy,
  getStudy,
  getStudyWithBlocks,
  insertTextBlock,
  listBlocks,
  listStudies,
  moveBlock,
  softDeleteBlock,
  softDeleteStudy,
  updateStudy,
  updateTextBlock,
} from '@/lib/studies';
import { getDb, runAsUser } from '@/lib/db';
import { requireDbInCi, seedOwnerUrl } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';

const userA = `qa-w1-ten-a-${Date.now()}-${randomUUID().slice(0, 8)}`;
const userB = `qa-w1-ten-b-${Date.now()}-${randomUUID().slice(0, 8)}`;

const dbUrl = requireDbInCi();
const ownerUrl = seedOwnerUrl();
const SKIP = announceSkip(
  'S-4 studies tenancy (two accounts over app_runtime; belt + RLS)',
  [
    { name: 'a runtime DB URL (APP_DATABASE_URL)', present: Boolean(dbUrl) },
    { name: 'DATABASE_URL (owner — teardown deletes; app_runtime holds no DELETE by design)', present: Boolean(ownerUrl) },
  ],
  'cross-tenant read/write isolation on studies, study_blocks, study_block_revisions',
);

let aStudy = '';
let aBlock1 = '';
let aBlock2 = '';

describe.skipIf(SKIP)('S-4 studies tenancy (two accounts over app_runtime; belt + RLS)', () => {
  beforeAll(async () => {
    const study = await createStudy(userA, 'Tenancy A');
    aStudy = study.id;
    const b1 = await insertTextBlock(userA, aStudy, 'A block one');
    if (!b1.ok) throw new Error(`seed block 1 failed: ${b1.reason}`);
    aBlock1 = b1.block.id;
    const b2 = await insertTextBlock(userA, aStudy, 'A block two');
    if (!b2.ok) throw new Error(`seed block 2 failed: ${b2.reason}`);
    aBlock2 = b2.block.id;
    // One revision row, so the revisions table has tenant data to protect.
    expect(await updateTextBlock(userA, aStudy, aBlock1, 'A block one, edited')).toBe(true);
    // B owns a study too — the list cases below must not pass vacuously on empty lists.
    const bStudy = await createStudy(userB, 'Tenancy B');
    const bb = await insertTextBlock(userB, bStudy.id, 'B block');
    if (!bb.ok) throw new Error(`seed B block failed: ${bb.reason}`);
  }, 60_000);

  afterAll(async () => {
    if (!ownerUrl) return;
    const { default: pg } = await import('pg');
    const c = new pg.Client({ connectionString: ownerUrl, ssl: { rejectUnauthorized: false } });
    await c.connect();
    try {
      // ON DELETE CASCADE reaps blocks + revisions with the study rows; the prefix also
      // reaps rows leaked by earlier interrupted runs of this suite.
      await c.query(`DELETE FROM studies WHERE user_id LIKE 'qa-w1-ten-%'`);
    } finally {
      await c.end();
    }
  }, 60_000);

  it('POSITIVE: user A sees A’s own study, blocks, and edit through every read path', async () => {
    // Without this half, every refusal below could pass by refusing everyone everything.
    const list = await listStudies(userA);
    expect(list.map((s) => s.id), 'A’s own study must appear in A’s list').toContain(aStudy);
    expect((await getStudy(userA, aStudy))?.title).toBe('Tenancy A');
    const blocks = await listBlocks(userA, aStudy);
    expect(blocks.map((b) => b.id)).toEqual([aBlock1, aBlock2]);
    expect(blocks[0]!.body, 'A’s edit must be visible to A').toBe('A block one, edited');
    const withBlocks = await getStudyWithBlocks(userA, aStudy);
    expect(withBlocks?.study.id).toBe(aStudy);
    expect(withBlocks?.blocks).toHaveLength(2);
  });

  it('B cannot READ A’s study through any data-layer read path', async () => {
    // SEED: drop the user_id belt from these queries AND neutralize RLS, and B reads A's doc.
    expect(await getStudy(userB, aStudy)).toBeNull();
    expect(await getStudyWithBlocks(userB, aStudy)).toBeNull();
    expect(await listBlocks(userB, aStudy), 'B naming A’s study id must get zero blocks').toEqual([]);
    const bList = await listStudies(userB);
    expect(bList.map((s) => s.title), 'B’s list must contain B’s own study (not vacuous)').toContain('Tenancy B');
    expect(bList.map((s) => s.id), 'B’s list must not contain A’s study').not.toContain(aStudy);
  });

  it('B cannot WRITE A’s study or blocks through any data-layer op', async () => {
    expect(await updateStudy(userB, aStudy, { title: 'pwned' }), 'rename as B').toBeNull();
    expect(await softDeleteStudy(userB, aStudy), 'soft-delete as B').toBe(false);
    const ins = await insertTextBlock(userB, aStudy, 'B writing into A’s study');
    expect(ins.ok, 'insert into A’s study as B').toBe(false);
    expect(await updateTextBlock(userB, aStudy, aBlock1, 'pwned'), 'update_text as B').toBe(false);
    const moved = await moveBlock(userB, aStudy, aBlock1, {});
    expect(moved.ok, 'move as B').toBe(false);
    expect(await softDeleteBlock(userB, aStudy, aBlock1), 'block delete as B').toBe(false);

    // None of the above may have landed — checked as A, through the same layer.
    expect((await getStudy(userA, aStudy))?.title, 'A’s title must be unchanged').toBe('Tenancy A');
    const blocks = await listBlocks(userA, aStudy);
    expect(blocks.map((b) => b.id), 'A’s blocks must be unchanged').toEqual([aBlock1, aBlock2]);
    expect(blocks[0]!.body, 'A’s block body must be unchanged').toBe('A block one, edited');
    // And the failed update_text must not have appended a revision either (the revision
    // INSERT carries the same belt). Read back as A — revisions are SELECT-granted.
    const [revs] = await runAsUser(userA, (sql) => [
      sql`SELECT id FROM study_block_revisions WHERE block_id = ${aBlock1}`,
    ]);
    expect(revs, 'exactly the one legitimate revision may exist').toHaveLength(1);
  });

  it('BELT-REMOVED control: raw SQL as B (no user_id filter) is stopped by RLS alone', async () => {
    // These queries carry NO belt — only the RLS policy can stop them. This is the case
    // that measures C5 (RLS under Neon's user-id format) directly, and it is the one that
    // goes RED when the runtime role bypasses RLS (red run A).
    const [studies, blocks, revs] = await runAsUser(userB, (sql) => [
      sql`SELECT id FROM studies WHERE id = ${aStudy}`,
      sql`SELECT id FROM study_blocks WHERE study_id = ${aStudy}`,
      sql`SELECT id FROM study_block_revisions WHERE block_id = ${aBlock1}`,
    ]);
    expect(studies, 'RLS must hide A’s study row from B').toHaveLength(0);
    expect(blocks, 'RLS must hide A’s block rows from B').toHaveLength(0);
    expect(revs, 'RLS must hide A’s revision rows from B').toHaveLength(0);

    // Positive RLS control: the same unfiltered shape as A DOES return A's rows — the
    // zeroes above are isolation, not a policy that hides everything from everyone.
    const [asA] = await runAsUser(userA, (sql) => [sql`SELECT id FROM studies WHERE id = ${aStudy}`]);
    expect(asA, 'RLS must pass A’s own row to A').toHaveLength(1);
  });

  it('BELT-REMOVED control: unbelted WRITES as B are stopped by RLS alone', async () => {
    const [updated] = await runAsUser(userB, (sql) => [
      sql`UPDATE studies SET title = 'rls-pwned' WHERE id = ${aStudy} RETURNING id`,
    ]);
    expect(updated, 'RLS must make B’s unbelted UPDATE match zero rows').toHaveLength(0);
    expect((await getStudy(userA, aStudy))?.title, 'A’s title must survive B’s unbelted UPDATE').toBe('Tenancy A');

    // The WITH CHECK leg: B cannot insert a row OWNED by A at all.
    await expect(
      runAsUser(userB, (sql) => [
        sql`INSERT INTO studies (user_id, title) VALUES (${userA}, 'planted by B') RETURNING id`,
      ]),
    ).rejects.toThrow(/row.level security/i);
  });

  it('RLS backstop: with NO app.current_user_id set, app_runtime sees zero of A’s rows', async () => {
    // Measurable only when the runtime URL is the least-privilege role; the owner
    // connection legitimately bypasses RLS (red run A runs as owner — this case skips there).
    const sql = getDb();
    const roleRows = (await sql`SELECT current_user AS role`) as { role: string }[];
    if (roleRows[0]?.role !== 'app_runtime') {
      console.warn(`⚠ NOT RUN (visibly): runtime role is ${roleRows[0]?.role}, not app_runtime — backstop not measurable here.`);
      return;
    }
    const rows = (await sql`SELECT id FROM studies WHERE id = ${aStudy}`) as unknown[];
    expect(rows, 'no GUC ⇒ zero rows (the db.ts:111 backstop)').toHaveLength(0);
  });
});
