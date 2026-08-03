// Plans routes end-to-end (handler → store → RLS → dev DB), with the session
// mocked at the requireUser seam — the one layer a credential-less machine
// cannot exercise in a browser. Everything below the cookie is REAL here.
//
// The Song of Solomon case is STUDY_PLANS_DESIGN §6's whole justification:
// the corpus has a KNOWN zero-coverage hole there (GO_LIVE_STATUS; CLAUDE.md
// records v4 sampling no SoS), so the builder must refuse it — before this
// feature, nothing would have.

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
    if (!createdId) return;
    await deletePlanRoute(new NextRequest('http://localhost'), { params: Promise.resolve({ id: createdId }) });
  }, 30_000);

  it('POST creates a Romans plan: 201, days persisted, dates arithmetic', async (ctx) => {
    if (!(await corpusPresent())) return ctx.skip();
    const res = await createPlanRoute(jsonReq({
      spec: { scope: { kind: 'book', book: 'rom' }, weeks: 8, daysPerWeek: 2, startDate: '2026-08-03' },
    }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { plan: { id: string; title: string } };
    createdId = body.plan.id;
    expect(body.plan.title).toBe('rom in 8 weeks');

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

  it('REFUSES Song of Solomon — the known zero-coverage hole, stated honestly', async (ctx) => {
    if (!(await corpusPresent())) return ctx.skip();
    // SEED: drop checkScopeCoverage from createPlan and this returns 201 —
    // a confident dated schedule over passages the corpus cannot support.
    const res = await createPlanRoute(jsonReq({
      spec: { scope: { kind: 'book', book: 'sng' }, weeks: 2, daysPerWeek: 4, startDate: '2026-08-03' },
    }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { refused?: boolean; reason?: string };
    expect(body.refused).toBe(true);
    expect(body.reason).toMatch(/coverage/i);
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
