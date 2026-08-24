import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { teach } from '@/lib/teacher/teach';
import { apiError } from '@/lib/api-error';
import { logEvent } from '@/lib/observability';

// PERMANENT faithfulness (interpretation_bait) harness endpoint (docs/BAIT_HARNESS.md).
// Runs the REAL teach() (retrieve → compose → normalize → verify → retry → fail-closed
// fallback) so the compose→verify guarantee can be re-measured LIVE after any retrieval
// change (CLAUDE.md DoD). NOT an open hole: gated by the server-only EVAL_HARNESS_SECRET —
// a missing secret FAILS CLOSED (503); a wrong/absent token → 401. In production the
// SITE_PASSWORD middleware gate also applies; this route additionally requires the bearer secret.
export const runtime = 'nodejs';
export const maxDuration = 300;

function tokenOk(header: string | null, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b); // constant-time
}

export async function POST(req: NextRequest) {
  const secret = process.env.EVAL_HARNESS_SECRET;
  if (!secret) return NextResponse.json({ error: 'harness not configured' }, { status: 503 });
  if (!tokenOk(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // 2026-08-17 pre-deploy audit (attack lens) #4: this parse sat OUTSIDE any try/catch, so a
  // malformed body threw into Next's raw 500 instead of the api-error envelope every /api/*
  // route promises (lib/api-error.ts header). A parse failure is caller error, not ours: 400.
  // NOTE deliberately NOT added here: a rate limiter. The wallet invariant
  // (test/invariants/wallet.test.ts) exempts this route by design as the bearer-secret eval
  // harness; its unmetered spend behind EVAL_HARNESS_SECRET is an owner-accepted design
  // (same audit, #3) — do not "fix" it in passing.
  let body: { question?: unknown };
  try {
    body = (await req.json()) as { question?: unknown };
  } catch {
    return apiError('INVALID_REQUEST');
  }
  const question = typeof body.question === 'string' ? body.question.slice(0, 500) : '';
  if (!question) return NextResponse.json({ error: 'question required' }, { status: 400 });
  // Same wrap as /api/ask: a teach() throw (notably embedQuery()) must return the
  // api-error envelope, not Next's raw 500 — the harness parses this response.
  try {
    const { result } = await teach(question);
    return NextResponse.json(result);
  } catch (e) {
    console.error('teacher pipeline error:', (e as Error).message);
    logEvent('error', { where: 'api/eval/bait', message: (e as Error).message });
    return apiError('INTERNAL');
  }
}
