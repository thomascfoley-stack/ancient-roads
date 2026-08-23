import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { isTeacherAllowed } from '@/lib/teacher-access';
import { checkAskRateLimit } from '@/lib/rate-limit';
import { apiError } from '@/lib/api-error';
import { requireJsonContentType } from '@/lib/csrf-floor';
import { logEvent } from '@/lib/observability';
import { teach } from '@/lib/teacher/teach';
import { randomUUID } from 'node:crypto';
import { logAskOutcome } from '@/lib/ask-outcome-log';
import { scheduleAskOutcome } from '@/lib/ask-outcomes';

export const runtime = 'nodejs';
// MUST be a literal: Next 16 statically analyses route segment config and rejects a
// non-literal with "Invalid segment configuration export detected" -- which failed the
// whole production build (2026-08-01). ASK_MAX_DURATION_SEC stays the source of truth;
// test/ask-max-duration-literal.test.ts asserts this literal still equals it, so the two
// cannot drift. Do not re-import the constant here -- it does not build.
export const maxDuration = 300;

// POST /api/ask { question } → the teacher pipeline (retrieve → compose → verify).
// Authed-only: the endpoint spends on embeddings + LLM, so it is not public.
// Errors use the stable envelope (docs/API_ERRORS.md) — a code, a safe message,
// never a leaked internal.
export async function POST(req: NextRequest) {
  let user: { id: string; email: string };
  try {
    user = await requireUser();
  } catch {
    return apiError('UNAUTHENTICATED');
  }

  // ADR-116 ruling 3 (gated beta): the teacher is OWNER-ONLY until interpretation_bait earns
  // its >=99% bar (currently 100/100 = a ~97% lower bound). Placed BEFORE the rate limiter and
  // before any spend: a refused caller must cost nothing. The site password gate does not
  // cover this — a beta user has the password by definition.
  if (!isTeacherAllowed(user)) return apiError('FORBIDDEN');

  // Per-user rate limit BEFORE any spend (wallet-DoS guard). Fails open on its
  // own DB error (see rate-limit.ts) so a limiter outage can't down the product.
  const rl = await checkAskRateLimit(user.id);
  if (!rl.ok) {
    // 'unavailable' is the limiter itself failing, and it now DENIES rather than allows
    // (2026-08-02 deep audit, H2) — an unmetered paid endpoint is the worse outcome. 'global'
    // is the all-users daily ceiling: the same 429 to the caller, a different line in the log.
    const code =
      rl.limited === 'unavailable'
        ? 'UPSTREAM_UNAVAILABLE'
        : rl.limited === 'day' || rl.limited === 'global'
          ? 'RATE_LIMIT_DAY'
          : 'RATE_LIMIT_MINUTE';
    return apiError(code, { retryAfterSec: rl.retryAfterSec });
  }

  const csrfFloor = requireJsonContentType(req);
  if (csrfFloor) return csrfFloor;

  let body: { question?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiError('INVALID_REQUEST');
  }

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) {
    return apiError('INVALID_REQUEST', { message: 'A question is required.' });
  }
  if (question.length > 500) {
    return apiError('INVALID_REQUEST', { message: 'That question is too long (max 500 characters).' });
  }

  const startedAt = Date.now();
  try {
    const { result, meta } = await teach(question, { userId: user.id });
    const latencyMs = Date.now() - startedAt;
    logAskOutcome(result.kind, latencyMs, meta);
    // Same durable write as the stream route (migration 116) — off the request path,
    // fail-open: a logging failure never breaks an ask.
    // The id is minted HERE, not by the database, so it can be returned to the client and come
    // back on a clipping (125). 116 inserts without RETURNING, so a DB-generated id would never
    // be reachable. `askOutcomeId` is opaque and read-only to the client: app_runtime holds no
    // SELECT on ask_outcomes, so possessing it grants nothing.
    const askOutcomeId = randomUUID();
    scheduleAskOutcome({ id: askOutcomeId, userId: user.id, query: question, lanes: {}, result, meta, latencyMs });
    return NextResponse.json({ ...result, askOutcomeId });
  } catch (e) {
    console.error('teacher pipeline error:', (e as Error).message);
    logEvent('error', { where: 'api/ask', message: (e as Error).message });
    return apiError('INTERNAL');
  }
}
