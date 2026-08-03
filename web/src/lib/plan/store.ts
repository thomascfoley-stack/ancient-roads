import 'server-only';
// Plans data layer — every query through runAsUser (RLS binds) WITH the
// explicit `user_id = ${userId}` belt, and the child-table write through
// INSERT … SELECT … WHERE EXISTS (owner check), the lib/chat.ts H2 pattern.
// plan_days has no user_id column: ownership flows through the parent row.

import { getDb, runAsUser } from '@/lib/db';
import { expandPlan } from './expand';
import type { PlanSpec } from './spec';

export interface PlanRow {
  id: string;
  title: string;
  spec: PlanSpec;
  created_at: string;
  updated_at: string;
}

export interface PlanDayRow {
  day_index: number;
  day_date: string;
  verse_start: number;
  verse_end: number;
  completed_at: string | null;
}

export interface CoverageRefusal {
  refused: true;
  reason: string;
}

// STUDY_PLANS_DESIGN §6: refuse a scope BEFORE building a schedule over it.
// One indexed read per day over verse_coverage's PK — no embedding call, no
// vector query. The bar mirrors the G1 floor: refuse when fewer than half
// the reading days could carry >=2 exegetical voices. verse_coverage is
// corpus-wide platform data (no user rows), so this read needs no RLS var.
export async function checkScopeCoverage(days: Array<{ verseStart: number; verseEnd: number }>): Promise<CoverageRefusal | null> {
  const sql = getDb();
  const rows = (await sql.query(
    `SELECT count(*)::int AS n
     FROM unnest($1::int[], $2::int[]) AS d(vs, ve)
     WHERE EXISTS (SELECT 1 FROM verse_coverage c
                   WHERE c.author_count >= 2 AND c.verse_id BETWEEN d.vs AND d.ve)`,
    [days.map((d) => d.verseStart), days.map((d) => d.verseEnd)],
  )) as Array<{ n: number }>;
  const covered = rows[0]?.n ?? 0;
  if (covered * 2 < days.length) {
    return {
      refused: true,
      reason:
        covered === 0
          ? 'The corpus has no commentary coverage on this passage yet.'
          : `Only ${covered} of ${days.length} reading days have commentary coverage — narrow the scope or wait for the library to grow.`,
    };
  }
  return null;
}

/** Create a plan: expand (pure), coverage-gate, persist plan + days. */
export async function createPlan(
  userId: string,
  title: string,
  spec: PlanSpec,
): Promise<{ plan: PlanRow } | CoverageRefusal> {
  const expanded = expandPlan(spec);
  if (!expanded.ok) return { refused: true, reason: expanded.reason };

  const refusal = await checkScopeCoverage(expanded.days.map((d) => ({ verseStart: d.verseStart, verseEnd: d.verseEnd })));
  if (refusal) return refusal;

  const [planRows] = await runAsUser(userId, (sql) => [
    sql`INSERT INTO plans (user_id, title, spec)
        VALUES (${userId}, ${title}, ${JSON.stringify(spec)}::jsonb)
        RETURNING id, title, spec, created_at, updated_at`,
  ]);
  const plan = (planRows as PlanRow[])[0];
  if (!plan) throw new Error('plan insert returned no row');

  const [dayRows] = await runAsUser(userId, (sql) => [
    sql`INSERT INTO plan_days (plan_id, day_index, day_date, verse_start, verse_end)
        SELECT ${plan.id}::uuid, u.di, u.dd::date, u.vs, u.ve
        FROM unnest(
          ${expanded.days.map((d) => d.dayIndex)}::int[],
          ${expanded.days.map((d) => d.date)}::text[],
          ${expanded.days.map((d) => d.verseStart)}::int[],
          ${expanded.days.map((d) => d.verseEnd)}::int[]
        ) AS u(di, dd, vs, ve)
        WHERE EXISTS (SELECT 1 FROM plans p WHERE p.id = ${plan.id}::uuid AND p.user_id = ${userId})
        RETURNING day_index`,
  ]);
  if ((dayRows as unknown[]).length !== expanded.days.length) {
    throw new Error('plan_days insert count mismatch — ownership guard refused rows');
  }
  return { plan };
}

export async function listPlans(userId: string): Promise<Array<PlanRow & { total_days: number; read_days: number }>> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT p.id, p.title, p.spec, p.created_at, p.updated_at,
               (SELECT count(*)::int FROM plan_days d WHERE d.plan_id = p.id) AS total_days,
               (SELECT count(*)::int FROM plan_days d WHERE d.plan_id = p.id AND d.completed_at IS NOT NULL) AS read_days
        FROM plans p
        WHERE p.user_id = ${userId}
        ORDER BY p.updated_at DESC
        LIMIT 100`,
  ]);
  return rows as Array<PlanRow & { total_days: number; read_days: number }>;
}

export async function getPlan(userId: string, planId: string): Promise<{ plan: PlanRow; days: PlanDayRow[] } | null> {
  const [planRows, dayRows] = await runAsUser(userId, (sql) => [
    sql`SELECT id, title, spec, created_at, updated_at FROM plans
        WHERE id = ${planId} AND user_id = ${userId}`,
    sql`SELECT d.day_index, d.day_date::text AS day_date, d.verse_start, d.verse_end, d.completed_at
        FROM plan_days d JOIN plans p ON p.id = d.plan_id
        WHERE d.plan_id = ${planId} AND p.user_id = ${userId}
        ORDER BY d.day_index
        LIMIT 800`,
  ]);
  const plan = (planRows as PlanRow[])[0];
  if (!plan) return null;
  return { plan, days: dayRows as PlanDayRow[] };
}

export async function setDayCompleted(
  userId: string,
  planId: string,
  dayIndex: number,
  completed: boolean,
): Promise<boolean> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`UPDATE plan_days d SET completed_at = ${completed ? new Date().toISOString() : null}
        FROM plans p
        WHERE d.plan_id = ${planId} AND d.day_index = ${dayIndex}
          AND p.id = d.plan_id AND p.user_id = ${userId}
        RETURNING d.day_index`,
  ]);
  return (rows as unknown[]).length === 1;
}

export async function deletePlan(userId: string, planId: string): Promise<boolean> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`DELETE FROM plans WHERE id = ${planId} AND user_id = ${userId} RETURNING id`,
  ]);
  return (rows as unknown[]).length === 1;
}
