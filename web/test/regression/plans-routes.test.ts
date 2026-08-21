// Plans routes end-to-end (handler → store → RLS → dev DB), with the session
// mocked at the requireUser seam — the one layer a credential-less machine
// cannot exercise in a browser. Everything below the cookie is REAL here.
//
// The Song of Solomon case was STUDY_PLANS_DESIGN §6's whole justification:
// the corpus had a KNOWN zero-coverage hole there, so the builder had to
// refuse it. 2026-08-12: owner-ordered ingest closed the hole (gill-song +
// jamieson-jfb; docs/SONG_OF_SOLOMON_COVERAGE_PLAN.md — 117/117 verses at ≥2
// admitted exegetical authors). The Song case now pins ACCEPTANCE; the refusal
// pin moved to a range with no exegetical coverage (Numbers 7, measured 0
// verses at ≥2 authors on the 2026-08-12 verse_coverage rebuild).

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { requireDbInCi } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';

const testUser = `qa-plan-routes-${Date.now()}`;
vi.mock('@/lib/session', () => ({
  requireUser: async () => ({ id: testUser, email: 'qa@example.test' }),
  currentUser: async () => ({ id: testUser, email: 'qa@example.test' }),
}));

import { GET as listPlansRoute, POST as createPlanRoute } from '@/app/api/plans/route';
import { DELETE as deletePlanRoute, GET as getPlanRoute, POST as togglePlanRoute } from '@/app/api/plans/[id]/route';

const dbUrl = requireDbInCi();
const SKIP = announceSkip(
  'Plans routes (handler → store → dev DB, session mocked)',
  [{ name: 'a runtime DB URL (APP_DATABASE_URL)', present: Boolean(dbUrl) }],
  'the plans API golden path and the coverage refusal',
);

const jsonReq = (body: unknown) =>
  new NextRequest('http://localhost/api/plans', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });

let createdId = '';
let corpusVerses = -1;

// The coverage gate can only be exercised where verse_coverage has rows (a
// corpus-less CI branch genuinely cannot). Runtime ctx.skip() keeps that
// visible as SKIPPED — never an unearned green (THE_LOOP §6). Executed and
// green against dev 2026-08-02 (30,227 coverage rows).
async function corpusPresent(): Promise<boolean> {
  if (corpusVerses === -1) {
    const { getDb } = await import('@/lib/db');
    const rows = (await getDb()`SELECT count(*)::int AS n FROM verse_coverage`) as Array<{ n: number }>;
    corpusVerses = rows[0]?.n ?? 0;
    if (corpusVerses === 0) console.warn('⚠ NOT RUN (visibly): verse_coverage is empty on this target — the coverage-gated cases cannot execute here.');
  }
  return corpusVerses > 0;
}

describe.skipIf(SKIP)('Plans routes (handler → store → dev DB, session mocked)', () => {
  beforeAll(() => { expect(dbUrl).toBeTruthy(); });

  afterAll(async () => {
    // PREFIX SWEEP, not remembered-id cleanup (check-test-residue's rule: fix the teardown,
    // sweep by prefix so interrupted runs are reaped too). The inline delete of the Pauline
    // plan sits AFTER its assertions, so any failure there strands a plan; three audit runs
    // 2026-08-10 each left their Romans plan behind exactly that way. Hard delete, each step
    // independent, via the owner connection (app_runtime is correctly refused plans writes
    // for other users; the mocked session only exists inside the route handlers).
    const { seedOwnerUrl } = await import('../helpers/env');
    const owner = seedOwnerUrl();
    if (!owner) return;
    const { default: pg } = await import('pg');
    const c = new pg.Client({ connectionString: owner, ssl: { rejectUnauthorized: false } });
    await c.connect();
    try {
      const stranded = `SELECT id FROM plans WHERE user_id LIKE 'qa-plan-routes-%'`;
      // plan_day_readings cascades from plan_days (042's ON DELETE CASCADE).
      await c.query(`DELETE FROM plan_days WHERE plan_id IN (${stranded})`).catch(() => {});
      await c.query(`DELETE FROM plans WHERE user_id LIKE 'qa-plan-routes-%'`).catch(() => {});
    } finally {
      await c.end();
    }
  }, 30_000);

  it('POST creates a Romans plan: 201, days persisted, dates arithmetic', async (ctx) => {
    if (!(await corpusPresent())) return ctx.skip();
    const res = await createPlanRoute(jsonReq({
      spec: { scope: { kind: 'book', book: 'rom' }, weeks: 8, daysPerWeek: 2, startDate: '2026-08-03' },
    }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { plan: { id: string; title: string } };
    createdId = body.plan.id;
    // L2c (2026-08-08) changed the generated title from the raw-slug 'rom in 8 weeks' to the
    // human-readable 'Romans · 8 weeks'; date-locale-and-plan-title.test.ts owns that format.
    expect(body.plan.title).toBe('Romans · 8 weeks');

    const got = await getPlanRoute(new NextRequest('http://localhost'), { params: Promise.resolve({ id: createdId }) });
    expect(got.status).toBe(200);
    const detail = (await got.json()) as { days: Array<{ day_index: number; day_date: string }> };
    expect(detail.days).toHaveLength(16);
    expect(detail.days[0]!.day_date).toBe('2026-08-03');
    expect(detail.days[2]!.day_date).toBe('2026-08-10'); // week 2 starts +7, not +2
  }, 30_000);

  it('GET lists the plan with progress counts', async (ctx) => {
    if (!createdId) return ctx.skip();
    const res = await listPlansRoute();
    const body = (await res.json()) as { plans: Array<{ id: string; total_days: number; read_days: number }> };
    const mine = body.plans.find((p) => p.id === createdId);
    expect(mine).toBeDefined();
    expect(mine!.total_days).toBe(16);
    expect(mine!.read_days).toBe(0);
  }, 30_000);

  it('POST kind:day toggles progress and the list count follows', async (ctx) => {
    if (!createdId) return ctx.skip();
    const res = await togglePlanRoute(jsonReq({ kind: 'day', dayIndex: 1, completed: true }), {
      params: Promise.resolve({ id: createdId }),
    });
    expect(res.status).toBe(200);
    const list = (await listPlansRoute().then((r) => r.json())) as { plans: Array<{ id: string; read_days: number }> };
    expect(list.plans.find((p) => p.id === createdId)!.read_days).toBe(1);
  }, 30_000);

  it('ACCEPTS Song of Songs — the 2026-08-12 ingest closed the known zero-coverage hole', async (ctx) => {
    if (!(await corpusPresent())) return ctx.skip();
    // Was: the refusal pin ("REFUSES Song of Solomon — the known zero-coverage
    // hole"). Red watched 2026-08-12: with gill-song + jamieson-jfb published and
    // verse_coverage rebuilt, the old expectation failed on a real accept.
    // DETECTION PRESERVED: if the Song's ≥2-author coverage disappears (works
    // unpublished, coverage rebuilt away), checkScopeCoverage refuses and the
    // 201 below goes RED.
    const res = await createPlanRoute(jsonReq({
      spec: { scope: { kind: 'book', book: 'sng' }, weeks: 2, daysPerWeek: 4, startDate: '2026-08-03' },
    }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { plan: { id: string; title: string } };
    expect(body.plan.title).toBe('Song of Songs · 2 weeks');
    const got = await getPlanRoute(new NextRequest('http://localhost'), { params: Promise.resolve({ id: body.plan.id }) });
    const detail = (await got.json()) as { days: Array<{ verse_start: number; verse_end: number }> };
    expect(detail.days).toHaveLength(8);
    expect(Math.floor(detail.days[0]!.verse_start / 1_000_000)).toBe(22);
    expect(Math.floor(detail.days[7]!.verse_end / 1_000_000)).toBe(22);
    await deletePlanRoute(new NextRequest('http://localhost'), { params: Promise.resolve({ id: body.plan.id }) });
  }, 30_000);

  it('coverage gate at the store seam: a bare verse range refuses, a covered one passes', async (ctx) => {
    if (!(await corpusPresent())) return ctx.skip();
    // The refusal pin, moved off the Song 2026-08-12 and off the ROUTE: day
    // expansion rounds scopes to whole chapters, and the 2026-08-12 rebuild left
    // every canonical chapter with at least one ≥2-author verse, so no route
    // scope can refuse today. The gate is pinned here instead, over real
    // verse_coverage: Numbers 7:57-83 is the longest stretch with ZERO ≥2-author
    // verses (measured 2026-08-12); the chapter around it passes. If ingest
    // covers the stretch, this goes RED and the pin moves — the Song pin's own
    // discipline. SEED: drop the EXISTS clause and the first call returns null.
    const { checkScopeCoverage } = await import('@/lib/plan/store');
    const bare = await checkScopeCoverage([{ verseStart: 4007057, verseEnd: 4007083 }]);
    expect(bare?.refused).toBe(true);
    expect(bare?.reason).toMatch(/coverage/i);
    const covered = await checkScopeCoverage([{ verseStart: 4007001, verseEnd: 4007999 }]);
    expect(covered).toBeNull();
  }, 30_000);

  it('creates a Pauline-epistles collection plan spanning book boundaries (ADR-048)', async (ctx) => {
    if (!(await corpusPresent())) return ctx.skip();
    const res = await createPlanRoute(jsonReq({
      spec: { scope: { kind: 'books', group: 'pauline-epistles' }, weeks: 8, daysPerWeek: 3, startDate: '2026-08-03' },
    }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { plan: { id: string; title: string } };
    expect(body.plan.title).toBe("Paul's Epistles · 8 weeks"); // L2c title format, as above
    const got = await getPlanRoute(new NextRequest('http://localhost'), { params: Promise.resolve({ id: body.plan.id }) });
    const detail = (await got.json()) as { days: Array<{ verse_start: number; verse_end: number }> };
    expect(detail.days).toHaveLength(24);
    expect(Math.floor(detail.days[0]!.verse_start / 1_000_000)).toBe(45);   // starts in Romans
    expect(Math.floor(detail.days[23]!.verse_end / 1_000_000)).toBe(57);    // ends in Philemon
    // SEED: include 'heb' in the group and the last day lands in book 58.
    await deletePlanRoute(new NextRequest('http://localhost'), { params: Promise.resolve({ id: body.plan.id }) });
  }, 30_000);

  it('POST kind:reschedule moves ONLY the unread days to today, at the plan cadence', async (ctx) => {
    if (!createdId) return ctx.skip();
    const { addDays } = await import('@/lib/plan/expand');
    const d = new Date();
    const todayIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    // Day 1 was completed by the toggle case above; the plan started 2026-08-03,
    // so the remaining 15 days are all in the past — the catch-up case exactly.
    const res = await togglePlanRoute(jsonReq({ kind: 'reschedule', fromDate: todayIso }), {
      params: Promise.resolve({ id: createdId }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { moved: number }).moved).toBe(15);

    const got = await getPlanRoute(new NextRequest('http://localhost'), { params: Promise.resolve({ id: createdId }) });
    const detail = (await got.json()) as { days: Array<{ day_index: number; day_date: string; completed_at: string | null }> };
    // The read day keeps its HISTORY — reschedule never rewrites what happened.
    expect(detail.days[0]!.completed_at).not.toBeNull();
    expect(detail.days[0]!.day_date).toBe('2026-08-03');
    // The unread days resume today at the plan's own 2/week cadence: two readings,
    // then the rest of the week off, then week 2 at +7. SEED: redate ALL days
    // instead of the incomplete set and days[0] moves; use a flat daily cadence
    // and days[3] lands at +2 instead of +7.
    expect(detail.days[1]!.day_date).toBe(todayIso);
    expect(detail.days[2]!.day_date).toBe(addDays(todayIso, 1));
    expect(detail.days[3]!.day_date).toBe(addDays(todayIso, 7));
  }, 30_000);

  it('rejects a reschedule fromDate that is not today anywhere on Earth', async (ctx) => {
    if (!createdId) return ctx.skip();
    const res = await togglePlanRoute(jsonReq({ kind: 'reschedule', fromDate: '2026-01-01' }), {
      params: Promise.resolve({ id: createdId }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_REQUEST');
  }, 30_000);

  it('pins the ±48h window BOUNDARY, so the bound cannot silently widen or vanish', async (ctx) => {
    if (!createdId) return ctx.skip();
    // Tomorrow is inside the window (a UTC+14 client's local "today" can sit a
    // calendar day past the server's); five days out is not today anywhere.
    const iso = (offsetDays: number) => {
      const d = new Date(Date.now() + offsetDays * 86_400_000);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    };
    const near = await togglePlanRoute(jsonReq({ kind: 'reschedule', fromDate: iso(1) }), {
      params: Promise.resolve({ id: createdId }),
    });
    expect(near.status).toBe(200);
    const far = await togglePlanRoute(jsonReq({ kind: 'reschedule', fromDate: iso(5) }), {
      params: Promise.resolve({ id: createdId }),
    });
    expect(far.status).toBe(400);
    // Restore the schedule the earlier cases assert against.
    const d = new Date();
    const todayIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await togglePlanRoute(jsonReq({ kind: 'reschedule', fromDate: todayIso }), {
      params: Promise.resolve({ id: createdId }),
    });
  }, 30_000);

  it('refuses a mutation without a JSON Content-Type (the CSRF floor)', async (ctx) => {
    if (!createdId) return ctx.skip();
    // A cross-origin <form enctype="text/plain"> is a simple request that can
    // carry a JSON-shaped body without a preflight; the type gate refuses it.
    const res = await togglePlanRoute(
      new NextRequest('http://localhost/api/plans', {
        method: 'POST',
        body: JSON.stringify({ kind: 'day', dayIndex: 1, completed: true }),
        headers: { 'Content-Type': 'text/plain' },
      }),
      { params: Promise.resolve({ id: createdId }) },
    );
    expect(res.status).toBe(400);
  }, 30_000);

  it('another user cannot reschedule this plan (store seam, real RLS + belt)', async (ctx) => {
    if (!createdId) return ctx.skip();
    const { reschedulePlan } = await import('@/lib/plan/store');
    const d = new Date();
    const todayIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    // Not-found, not silently-zero: the plan is invisible to the other tenant.
    expect(await reschedulePlan(`${testUser}-intruder`, createdId, todayIso)).toBeNull();
    // And the schedule did not move under the failed attempt.
    const got = await getPlanRoute(new NextRequest('http://localhost'), { params: Promise.resolve({ id: createdId }) });
    const detail = (await got.json()) as { days: Array<{ day_date: string }> };
    expect(detail.days[1]!.day_date).toBe(todayIso);
  }, 30_000);

  it('rejects a malformed spec with the documented envelope', async () => {
    const res = await createPlanRoute(jsonReq({ spec: { scope: { kind: 'book', book: 'rom' }, weeks: 0, daysPerWeek: 2, startDate: '2026-08-03' } }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INVALID_REQUEST');
    expect(body.error.message).toMatch(/weeks/);
  });

  it('DELETE removes the plan and its days', async (ctx) => {
    if (!createdId) return ctx.skip();
    const res = await deletePlanRoute(new NextRequest('http://localhost'), { params: Promise.resolve({ id: createdId }) });
    expect(res.status).toBe(200);
    const gone = await getPlanRoute(new NextRequest('http://localhost'), { params: Promise.resolve({ id: createdId }) });
    expect(gone.status).toBe(404);
    createdId = '';
  }, 30_000);
});
