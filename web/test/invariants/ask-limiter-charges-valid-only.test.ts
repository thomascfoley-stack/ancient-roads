// D42 (DEEP_SWEEP) — checkAskRateLimit bumps the minute, DAY and GLOBAL counters, and it ran
// BEFORE req.json() and the question-shape check. So a malformed body or an empty question
// returned 400 having already spent a daily ask slot. This app's own client retries on timeout,
// so a buggy retry loop could burn a user's 100/day without one teach() call reaching a provider.
//
// The H4 comment in the route reasons carefully about minute-vs-day ordering and never asks the
// prior question: should an invalid request be charged at all?
//
// The ordering constraint this must NOT break: the limiter still runs before teach(), which
// test/invariants/wallet.test.ts enforces by shape.
import { describe, expect, it, vi, beforeEach } from 'vitest';

const checkAskRateLimit = vi.fn();
const requireUser = vi.fn();
const teach = vi.fn();

vi.mock('@/lib/rate-limit', () => ({ checkAskRateLimit: (...a: unknown[]) => checkAskRateLimit(...a) }));
vi.mock('@/lib/session', () => ({ requireUser: () => requireUser() }));
vi.mock('@/lib/teacher/teach', () => ({ teach: (...a: unknown[]) => teach(...a) }));
// ADR-116 gated beta: the teacher is owner-only. Not what this test is about — allow, so the
// ordering under test is reachable.
vi.mock('@/lib/teacher-access', () => ({ isTeacherAllowed: () => true }));
vi.mock('@/lib/observability', () => ({ logEvent: () => {} }));
vi.mock('@/lib/ask-outcome-log', () => ({ logAskOutcome: () => {} }));
vi.mock('@/lib/ask-outcomes', () => ({ scheduleAskOutcome: () => {} }));

const post = (body: string) =>
  new Request('http://t/api/ask', { method: 'POST', body, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: 'u1' });
  checkAskRateLimit.mockResolvedValue({ ok: true });
});

describe('D42 — the ask quota is charged only for requests that could spend', () => {
  it('a malformed JSON body is 400 and costs no quota', async () => {
    const { POST } = await import('@/app/api/ask/route');
    const res = await POST(post('{not json') as never);
    expect(res.status).toBe(400);
    expect(checkAskRateLimit, 'an unparseable body must not burn a daily ask slot').not.toHaveBeenCalled();
  });

  it('an empty question is 400 and costs no quota', async () => {
    const { POST } = await import('@/app/api/ask/route');
    const res = await POST(post(JSON.stringify({ question: '   ' })) as never);
    expect(res.status).toBe(400);
    expect(checkAskRateLimit).not.toHaveBeenCalled();
  });

  it('an over-long question is 400 and costs no quota', async () => {
    const { POST } = await import('@/app/api/ask/route');
    const res = await POST(post(JSON.stringify({ question: 'x'.repeat(501) })) as never);
    expect(res.status).toBe(400);
    expect(checkAskRateLimit).not.toHaveBeenCalled();
  });

  // The limiter must still fire for a request that WOULD spend, and still before teach().
  it('a valid question IS charged, and charged before teach() runs', async () => {
    const { POST } = await import('@/app/api/ask/route');
    let chargedBeforeTeach = false;
    checkAskRateLimit.mockImplementation(async () => { chargedBeforeTeach = !teach.mock.calls.length; return { ok: true }; });
    teach.mockResolvedValue({ result: { kind: 'answer', voices: [] }, meta: {} });
    await POST(post(JSON.stringify({ question: 'what is grace' })) as never);
    expect(checkAskRateLimit).toHaveBeenCalledWith('u1');
    expect(chargedBeforeTeach, 'the wallet invariant: metered before it spends').toBe(true);
  });

  it('a rate-limited valid question is refused with 429', async () => {
    const { POST } = await import('@/app/api/ask/route');
    checkAskRateLimit.mockResolvedValue({ ok: false, limited: 'day', retryAfterSec: 60 });
    const res = await POST(post(JSON.stringify({ question: 'what is grace' })) as never);
    expect(res.status).toBe(429);
    expect(teach).not.toHaveBeenCalled();
  });
});
