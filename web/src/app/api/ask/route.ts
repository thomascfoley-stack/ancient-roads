import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { checkAskRateLimit } from '@/lib/rate-limit';
import { apiError } from '@/lib/api-error';
import { logEvent } from '@/lib/observability';
import { teach } from '@/lib/teacher/teach';

export const runtime = 'nodejs';
export const maxDuration = 300; // composition + retries can take a while

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

  // Per-user rate limit BEFORE any spend (wallet-DoS guard). Fails open on its
  // own DB error (see rate-limit.ts) so a limiter outage can't down the product.
  const rl = await checkAskRateLimit(user.id);
  if (!rl.ok) {
    return apiError(rl.limited === 'day' ? 'RATE_LIMIT_DAY' : 'RATE_LIMIT_MINUTE', { retryAfterSec: rl.retryAfterSec });
  }

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
    const { result, meta } = await teach(question);
    logEvent('ask_outcome', {
      kind: result.kind,
      ms: Date.now() - startedAt,
      attempts: meta.attempts,
      ...(meta.firstCheck ? { firstCheck: meta.firstCheck } : {}),
      voices: meta.voices,
      traditions: meta.traditions,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error('teacher pipeline error:', (e as Error).message);
    logEvent('error', { where: 'api/ask', message: (e as Error).message });
    return apiError('INTERNAL');
  }
}
