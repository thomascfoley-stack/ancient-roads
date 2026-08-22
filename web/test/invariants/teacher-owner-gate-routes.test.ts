// THE GATE IS ENFORCED ON THE REAL ROUTES, not just in its helper.
//
// teacher-owner-gate.test.ts proves `isTeacherAllowed` decides correctly. That is not the same
// claim as "the teacher is closed" — a correct helper nobody calls protects nothing, and this
// repo has shipped that exact shape before (a guard whose expected set was right and whose call
// site did not exist). These cases drive the SHIPPED route handlers.
//
// The refusal must also come BEFORE any spend. /api/ask is the paid path: embedding + compose +
// verify. A gate that refuses after the model call would still be billable by a stranger.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const ALLOWED = { id: 'user_owner', email: 'owner@example.test' };
const REFUSED = { id: 'user_beta', email: 'beta@example.test' };
let current = ALLOWED;

vi.mock('@/lib/session', () => ({
  requireUser: async () => current,
  currentUser: async () => current,
}));

// Spend tripwires: if the gate lets a refused caller through, these record it. They are the
// evidence for "refused costs nothing", not decoration.
const spent = { rateLimit: 0, teach: 0 };
vi.mock('@/lib/rate-limit', () => ({
  checkAskRateLimit: async () => {
    spent.rateLimit += 1;
    return { ok: true };
  },
  checkGateRateLimit: async () => ({ ok: true }),
}));

// THE PIPELINE IS STUBBED, and that is the point of this suite rather than a convenience.
//
// This file's claim is about the GATE — who reaches the paid path — not about what the paid path
// then produces. Unstubbed, the positive control below ran the real `teach()`: embed + retrieve +
// compose against a live provider. Two things followed, and they were the ONE test keeping
// `db-invariants` red (142 passed, 1 failed):
//
//   1. In CI, where the provider secrets exist, it did real work and blew vitest's 5s budget —
//      and billed a provider call on every push, in the suite whose whole subject is "a stranger
//      must not be able to spend our money".
//   2. Locally, where they do not, `teach()` threw instantly, the route returned 500, and
//      `status !== 403` was satisfied WITHOUT THE GATE HAVING BEEN EXERCISED. Green for the wrong
//      reason, in the positive control of an access gate — THE_LOOP §6's unearned green, sitting
//      in the check that exists to prove the gate is not simply off.
//
// Stubbed, the same assertion becomes exact: the caller reached the pipeline entry point. That is
// the boundary "not refused" actually means, and `spent.teach` now says so directly instead of
// being inferred from a status code that several unrelated failures also produce.
vi.mock('@/lib/teacher/teach', () => ({
  teach: async () => {
    spent.teach += 1;
    return {
      result: { kind: 'empty', reason: 'stubbed — this suite tests the gate, not the pipeline' },
      meta: { attempts: 0, voices: 0, traditions: 0, rejections: [] },
    };
  },
}));

// Same reasoning one layer down: the outcome log is a fire-and-forget DB write, and this suite has
// no business appending rows to whatever database CI hands it.
vi.mock('@/lib/ask-outcomes', () => ({ scheduleAskOutcome: () => {} }));

const ORIGINAL = process.env.TEACHER_ALLOWLIST;
beforeEach(() => {
  spent.rateLimit = 0;
  spent.teach = 0;
  process.env.TEACHER_ALLOWLIST = 'owner@example.test';
});
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.TEACHER_ALLOWLIST;
  else process.env.TEACHER_ALLOWLIST = ORIGINAL;
  vi.resetModules();
});

const askReq = () =>
  new NextRequest('http://localhost/api/ask', {
    method: 'POST',
    body: JSON.stringify({ question: 'What does Romans 8 say about hope?' }),
    headers: { 'Content-Type': 'application/json' },
  });

describe('the teacher owner-gate fires on the shipped routes (ADR-116 ruling 3)', () => {
  it('POST /api/ask refuses an authenticated NON-allowlisted user with 403, before any spend', async () => {
    current = REFUSED;
    const { POST } = await import('@/app/api/ask/route');
    const res = await POST(askReq());
    // SEED: delete the `isTeacherAllowed` line from the route and this returns something else.
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('FORBIDDEN');
    // The refusal cost nothing: the rate limiter (first thing after the gate) never ran.
    expect(spent.rateLimit).toBe(0);
  });

  it('POST /api/ask/stream refuses the same caller the same way — both doors, not one', async () => {
    current = REFUSED;
    const { POST } = await import('@/app/api/ask/stream/route');
    const res = await POST(askReq());
    expect(res.status).toBe(403);
    expect(spent.rateLimit).toBe(0);
  });

  it('an ALLOWLISTED caller is NOT refused — the gate is not simply off', async () => {
    // The positive control. Without it, a route that returned 403 unconditionally would pass
    // every case above while breaking the product for its only permitted user.
    current = ALLOWED;
    const { POST } = await import('@/app/api/ask/route');
    const res = await POST(askReq());
    expect(res.status).not.toBe(403);
    // Past the gate, to the limiter, and into the pipeline — the boundary "not refused" means.
    // `status !== 403` alone is weak evidence: a 500 from any unrelated failure satisfies it, and
    // that is precisely how this test used to pass without exercising the gate.
    expect(spent.rateLimit).toBe(1);
    expect(spent.teach).toBe(1);
  });

  it('with the allowlist UNSET, even the owner is refused — fail-closed, on the real route', async () => {
    delete process.env.TEACHER_ALLOWLIST;
    current = ALLOWED;
    const { POST } = await import('@/app/api/ask/route');
    const res = await POST(askReq());
    expect(res.status).toBe(403);
    expect(spent.rateLimit).toBe(0);
    expect(spent.teach).toBe(0);
  });
});
