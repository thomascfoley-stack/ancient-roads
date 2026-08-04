// Plans tenancy invariant: user B cannot read, write, toggle, or delete user
// A's plan — through the DATA LAYER's own functions, executed against the
// real DB when APP_DATABASE_URL is set (two-account discipline, CLAUDE.md
// §Security: RLS is proven with accounts, not by reading policy).
// plan_days has no user_id, so its isolation rides the EXISTS-on-parent
// policy + the store's joins — exactly what these cases exercise.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPlan, deletePlan, getPlan, listPlans, setDayCompleted } from '@/lib/plan/store';
import { getDb } from '@/lib/db';
import { requireDbInCi } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';

const dbUrl = requireDbInCi();
const userA = `qa-plan-a-${Date.now()}`;
const userB = `qa-plan-b-${Date.now()}`;
let planId = '';

const SKIP = announceSkip(
  'Plans tenancy invariant (two-account, executed)',
  [{ name: 'a runtime DB URL (APP_DATABASE_URL)', present: Boolean(dbUrl) }],
  'the two-account tenancy invariant on plans/plan_days',
);

describe.skipIf(SKIP)('Plans tenancy invariant (two-account, executed)', () => {
  beforeAll(async () => {
    const created = await createPlan(userA, 'qa tenancy plan', {
      scope: { kind: 'book', book: 'rom' },
      weeks: 2,
      daysPerWeek: 2,
      startDate: '2026-08-03',
    });
    if ('refused' in created) throw new Error(`seed plan refused: ${created.reason}`);
    planId = created.plan.id;
  }, 30_000);

  afterAll(async () => {
    if (!planId || !dbUrl) return;
    // Owner-side cleanup via the data layer as user A (plan_days cascade).
    await deletePlan(userA, planId).catch(() => {});
  }, 30_000);

  it('user B cannot read user A plan (belt + RLS)', async () => {
    // SEED: drop `AND user_id = ${userId}` from getPlan's plan query AND the
    // RLS policy and this returns A's plan to B.
    expect(await getPlan(userB, planId)).toBeNull();
  });

  it('user B does not see user A plans in a list', async () => {
    const plans = await listPlans(userB);
    expect(plans.some((p) => p.id === planId)).toBe(false);
  });

  it('user B cannot toggle user A plan day (child-table write guard)', async () => {
    // SEED: drop the `JOIN plans p … p.user_id` leg from setDayCompleted and
    // B marks A's day read — the H2 IDOR-write shape on a table with no
    // user_id column of its own.
    expect(await setDayCompleted(userB, planId, 1, true)).toBe(false);
    const asA = await getPlan(userA, planId);
    expect(asA?.days[0]?.completed_at).toBeNull();
  });

  it('user B cannot delete user A plan', async () => {
    expect(await deletePlan(userB, planId)).toBe(false);
  });

  it('positive control: user A reads, toggles, and still owns the plan', async () => {
    // Without this every refusal above could pass by refusing everything.
    const found = await getPlan(userA, planId);
    expect(found).not.toBeNull();
    expect(found!.days).toHaveLength(4);
    expect(await setDayCompleted(userA, planId, 1, true)).toBe(true);
    const after = await getPlan(userA, planId);
    expect(after!.days[0]!.completed_at).not.toBeNull();
    expect(await setDayCompleted(userA, planId, 1, false)).toBe(true);
  });

  it('RLS backstop: with NO app.current_user_id set, plans returns zero rows', async () => {
    // The app_runtime role + policy alone must hide rows when the GUC is
    // absent (db.ts:102-103). Executed only when the runtime URL is the
    // least-privilege role; the owner connection legitimately bypasses RLS.
    const sql = getDb();
    const roleRows = (await sql`SELECT current_user AS role`) as Array<{ role: string }>;
    if (roleRows[0]?.role !== 'app_runtime') return; // owner URL — backstop not measurable here
    const rows = (await sql`SELECT id FROM plans WHERE id = ${planId}`) as unknown[];
    expect(rows).toHaveLength(0);
  });
});
