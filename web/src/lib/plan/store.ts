import 'server-only';
import { randomUUID } from 'node:crypto';
// Plans data layer — every query through runAsUser (RLS binds) WITH the
// explicit `user_id = ${userId}` belt, and the child-table write through
// INSERT … SELECT … WHERE EXISTS (owner check), the lib/chat.ts H2 pattern.
// plan_days has no user_id column: ownership flows through the parent row.

import { getDb, runAsUser } from '@/lib/db';
import { expandPlan, expandTopicalPlan, rescheduleDates, type TopicalEntryInput, type TopicalPlanDay } from './expand';
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

export interface PlanReadingRow {
  day_index: number;
  ordinal: number;
  verse_start: number;
  verse_end: number;
  label: string | null;
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
          : `Only ${covered} of ${days.length} reading days have commentary coverage. Narrow the scope, or wait for the library to grow.`,
    };
  }
  return null;
}

// The largest topic a single plan may draw from. Above this the builder
// refuses with a reason instead of quietly planning a prefix.
const TOPIC_ENTRY_CAP = 2000;

/** Resolve a topic pointer to its verified topic + ordered entries, or refuse. */
async function loadTopic(scope: { workSlug: string; sectionId: number }): Promise<
  | { heading: string; workTitle: string; entries: TopicalEntryInput[] }
  | CoverageRefusal
> {
  const sql = getDb();
  // Corpus-side read (no user rows): verify the pointer names a PUBLISHED
  // topical-index section of the claimed work — a stale id after a re-ingest,
  // a staged work, or a non-topical section all refuse with a reason.
  const head = (await sql.query(
    `SELECT s.heading, src.title
     FROM sections s JOIN sources src ON src.id = s.source_id
     WHERE s.id = $1 AND src.slug = $2
       AND src.source_type = 'topical_index' AND src.status = 'published'`,
    [scope.sectionId, scope.workSlug],
  )) as Array<{ heading: string | null; title: string }>;
  const topic = head[0];
  if (!topic || !topic.heading) {
    return { refused: true, reason: 'That topic is not available. Pick another from the suggestions.' };
  }
  // Bounded, and the bound REFUSES rather than truncating. The picker shows
  // the topic's true passage count (matchTopics counts them all), so silently
  // planning only the first N would build a plan that claims a topic it does
  // not cover — Nave's "JESUS, THE CHRIST" alone is 3,833 entries. One extra
  // row past the cap is enough to detect it.
  const rows = (await sql.query(
    `SELECT label, verse_id_start, verse_id_end FROM topical_entries
     WHERE section_id = $1 ORDER BY ordinal LIMIT ${TOPIC_ENTRY_CAP + 1}`,
    [scope.sectionId],
  )) as Array<{ label: string | null; verse_id_start: number; verse_id_end: number }>;
  if (rows.length > TOPIC_ENTRY_CAP) {
    return {
      refused: true,
      reason: `That topic carries more than ${TOPIC_ENTRY_CAP.toLocaleString()} passages, too many for one plan. Pick a narrower topic.`,
    };
  }
  return {
    heading: topic.heading,
    workTitle: topic.title,
    entries: rows.map((r) => ({ label: r.label, verseStart: r.verse_id_start, verseEnd: r.verse_id_end })),
  };
}

interface PersistDay {
  dayIndex: number;
  date: string;
  verseStart: number;
  verseEnd: number;
  readings?: TopicalEntryInput[];
}

/** Create a plan: expand (pure), coverage-gate, persist plan + days (+ readings). */
export async function createPlan(
  userId: string,
  title: string,
  spec: PlanSpec,
): Promise<{ plan: PlanRow } | CoverageRefusal> {
  let days: PersistDay[];

  if (spec.scope.kind === 'topic') {
    const topic = await loadTopic(spec.scope);
    if ('refused' in topic) return topic;
    const expanded = expandTopicalPlan(topic.entries, spec.weeks, spec.daysPerWeek, spec.startDate);
    if (!expanded.ok) return { refused: true, reason: expanded.reason };
    // The day's plan_days range is its FIRST reading (the lead) so every
    // range-shaped consumer keeps working; the full list goes to readings.
    days = expanded.days.map((d) => ({
      dayIndex: d.dayIndex,
      date: d.date,
      verseStart: d.readings[0]!.verseStart,
      verseEnd: d.readings[0]!.verseEnd,
      readings: d.readings,
    }));
    // Coverage-gate per reading; a day counts covered when ANY of its
    // readings carries >=2 admitted exegetical authors.
    const refusal = await checkTopicalCoverage(expanded.days);
    if (refusal) return refusal;
  } else {
    const expanded = expandPlan(spec);
    if (!expanded.ok) return { refused: true, reason: expanded.reason };
    days = expanded.days;
    const refusal = await checkScopeCoverage(days.map((d) => ({ verseStart: d.verseStart, verseEnd: d.verseEnd })));
    if (refusal) return refusal;
  }

  const flat = days.flatMap((d) =>
    (d.readings ?? []).map((r, i) => ({ di: d.dayIndex, ord: i + 1, vs: r.verseStart, ve: r.verseEnd, label: r.label })),
  );

  // ONE TRANSACTION for all three inserts. They used to be three sequential
  // runAsUser calls, and runAsUser wraps only its own batch (db.ts) — over the
  // stateless HTTP driver that is three independent commits with nothing
  // spanning them. A transient failure between commit 2 and 3 left a topical
  // plan with days but no readings, which renders as its lead passages ALONE
  // and silently understates the day; between 1 and 2 it left a "0 of 0 days"
  // plan. Worse, the count-mismatch guards below can only THROW — they cannot
  // undo an already-committed sibling. Batching needs the plan id up front,
  // hence the client-side UUID (the column keeps its gen_random_uuid default
  // for every other writer).
  const planId = randomUUID();
  const [planRows, dayRows, readingRows] = await runAsUser(userId, (sql) => [
    sql`INSERT INTO plans (id, user_id, title, spec)
        VALUES (${planId}::uuid, ${userId}, ${title}, ${JSON.stringify(spec)}::jsonb)
        RETURNING id, title, spec, created_at, updated_at`,
    sql`INSERT INTO plan_days (plan_id, day_index, day_date, verse_start, verse_end)
        SELECT ${planId}::uuid, u.di, u.dd::date, u.vs, u.ve
        FROM unnest(
          ${days.map((d) => d.dayIndex)}::int[],
          ${days.map((d) => d.date)}::text[],
          ${days.map((d) => d.verseStart)}::int[],
          ${days.map((d) => d.verseEnd)}::int[]
        ) AS u(di, dd, vs, ve)
        WHERE EXISTS (SELECT 1 FROM plans p WHERE p.id = ${planId}::uuid AND p.user_id = ${userId})
        RETURNING day_index`,
    sql`INSERT INTO plan_day_readings (plan_id, day_index, ordinal, verse_start, verse_end, label)
        SELECT ${planId}::uuid, u.di, u.ord, u.vs, u.ve, u.label
        FROM unnest(
          ${flat.map((f) => f.di)}::int[],
          ${flat.map((f) => f.ord)}::int[],
          ${flat.map((f) => f.vs)}::int[],
          ${flat.map((f) => f.ve)}::int[],
          ${flat.map((f) => f.label)}::text[]
        ) AS u(di, ord, vs, ve, label)
        WHERE EXISTS (SELECT 1 FROM plans p WHERE p.id = ${planId}::uuid AND p.user_id = ${userId})
        RETURNING ordinal`,
  ]);

  const plan = (planRows as PlanRow[])[0];
  if (!plan) throw new Error('plan insert returned no row');
  // These guards are now defense-in-depth, NOT a rollback: sql.transaction has
  // already committed by the time it returns, so a throw here cannot undo it.
  // What changed is that there is no longer a partial state to catch — all
  // three inserts share one transaction, and the ownership predicate reads a
  // plans row written inside it, so a mismatch would mean the driver or the
  // policy did something unexpected rather than a half-applied write.
  if ((dayRows as unknown[]).length !== days.length) {
    throw new Error('plan_days insert count mismatch — ownership guard refused rows');
  }
  if ((readingRows as unknown[]).length !== flat.length) {
    throw new Error('plan_day_readings insert count mismatch — ownership guard refused rows');
  }
  return { plan };
}

// A topical day is covered when ANY of its readings reaches >=2 admitted
// exegetical authors — same bar as checkScopeCoverage (half the days must
// be covered), evaluated per reading rather than per day-envelope, because
// a topical day's readings are non-contiguous and an envelope would count
// coverage of unrelated Scripture in between.
async function checkTopicalCoverage(days: TopicalPlanDay[]): Promise<CoverageRefusal | null> {
  const sql = getDb();
  const flat = days.flatMap((d) => d.readings.map((r) => ({ di: d.dayIndex, vs: r.verseStart, ve: r.verseEnd })));
  const rows = (await sql.query(
    `SELECT count(DISTINCT u.di)::int AS n
     FROM unnest($1::int[], $2::int[], $3::int[]) AS u(di, vs, ve)
     WHERE EXISTS (SELECT 1 FROM verse_coverage c
                   WHERE c.author_count >= 2 AND c.verse_id BETWEEN u.vs AND u.ve)`,
    [flat.map((f) => f.di), flat.map((f) => f.vs), flat.map((f) => f.ve)],
  )) as Array<{ n: number }>;
  const covered = rows[0]?.n ?? 0;
  if (covered * 2 < days.length) {
    return {
      refused: true,
      reason:
        covered === 0
          ? 'The corpus has no commentary coverage on this topic’s passages yet.'
          : `Only ${covered} of ${days.length} reading days have commentary coverage. Try a shorter plan, or another topic.`,
    };
  }
  return null;
}

/** The verified display title pieces for a topic scope (used by the route's default title). */
export async function topicTitle(scope: { workSlug: string; sectionId: number }): Promise<string | null> {
  const topic = await loadTopic(scope);
  if ('refused' in topic) return null;
  return `${topic.heading} (${topic.workTitle})`;
}

export interface PlanListRow extends PlanRow {
  total_days: number;
  read_days: number;
  // The first not-yet-read day, so the list (and the home card) can say what is
  // due without a second request per plan. NULL on a finished plan.
  next_day_index: number | null;
  next_day_date: string | null;
  next_verse_start: number | null;
  next_verse_end: number | null;
}

export async function listPlans(userId: string): Promise<PlanListRow[]> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT p.id, p.title, p.spec, p.created_at, p.updated_at,
               (SELECT count(*)::int FROM plan_days d WHERE d.plan_id = p.id) AS total_days,
               (SELECT count(*)::int FROM plan_days d WHERE d.plan_id = p.id AND d.completed_at IS NOT NULL) AS read_days,
               n.day_index AS next_day_index,
               n.day_date::text AS next_day_date,
               n.verse_start AS next_verse_start,
               n.verse_end AS next_verse_end
        FROM plans p
        LEFT JOIN LATERAL (
          SELECT d.day_index, d.day_date, d.verse_start, d.verse_end
          FROM plan_days d
          WHERE d.plan_id = p.id AND d.completed_at IS NULL
          ORDER BY d.day_index
          LIMIT 1
        ) n ON true
        WHERE p.user_id = ${userId}
        ORDER BY p.updated_at DESC
        LIMIT 100`,
  ]);
  return rows as PlanListRow[];
}

export async function getPlan(
  userId: string,
  planId: string,
): Promise<{ plan: PlanRow; days: PlanDayRow[]; readings: PlanReadingRow[] } | null> {
  const [planRows, dayRows, readingRows] = await runAsUser(userId, (sql) => [
    sql`SELECT id, title, spec, created_at, updated_at FROM plans
        WHERE id = ${planId} AND user_id = ${userId}`,
    sql`SELECT d.day_index, d.day_date::text AS day_date, d.verse_start, d.verse_end, d.completed_at
        FROM plan_days d JOIN plans p ON p.id = d.plan_id
        WHERE d.plan_id = ${planId} AND p.user_id = ${userId}
        ORDER BY d.day_index
        LIMIT 800`,
    sql`SELECT r.day_index, r.ordinal, r.verse_start, r.verse_end, r.label
        FROM plan_day_readings r JOIN plans p ON p.id = r.plan_id
        WHERE r.plan_id = ${planId} AND p.user_id = ${userId}
        ORDER BY r.day_index, r.ordinal
        LIMIT 4000`,
  ]);
  const plan = (planRows as PlanRow[])[0];
  if (!plan) return null;
  return { plan, days: dayRows as PlanDayRow[], readings: readingRows as PlanReadingRow[] };
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

/**
 * Catch-up: redate the plan's not-yet-read days to resume at `fromDate`, at the
 * plan's own cadence (spec.daysPerWeek), in day_index order. Completed days keep
 * their historical dates — nothing read is lost, nothing is re-generated. One
 * UPDATE over plan_days (migration 106's grant); `plans` itself is untouched.
 * Returns the number of days moved; null when the plan is not this user's.
 */
export async function reschedulePlan(
  userId: string,
  planId: string,
  fromDate: string,
): Promise<number | null> {
  const found = await getPlan(userId, planId);
  if (!found) return null;
  const incomplete = found.days.filter((d) => !d.completed_at).sort((a, b) => a.day_index - b.day_index);
  if (incomplete.length === 0) return 0;
  const dates = rescheduleDates(found.plan.spec.daysPerWeek, incomplete.length, fromDate);
  const indexes = incomplete.map((d) => d.day_index);
  const [rows] = await runAsUser(userId, (sql) => [
    sql`UPDATE plan_days d
        SET day_date = v.new_date::date
        FROM (SELECT unnest(${indexes}::int[]) AS day_index, unnest(${dates}::text[]) AS new_date) v,
             plans p
        WHERE d.plan_id = ${planId}
          AND d.day_index = v.day_index
          AND p.id = d.plan_id AND p.user_id = ${userId}
        RETURNING d.day_index`,
  ]);
  return (rows as unknown[]).length;
}
