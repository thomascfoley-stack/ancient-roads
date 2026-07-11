import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { teach } from '@/lib/teacher/teach';

// PERMANENT faithfulness (interpretation_bait) harness endpoint (docs/BAIT_HARNESS.md).
// Runs the REAL teach() (retrieve → compose → normalize → verify → retry → fail-closed
// fallback) so the compose→verify guarantee can be re-measured LIVE after any retrieval
// change (CLAUDE.md DoD). NOT an open hole: gated by the server-only EVAL_HARNESS_SECRET —
// a missing secret FAILS CLOSED (503); a wrong/absent token → 401. Drive it with
// src/evals/run-bait.mts. In production this also sits behind the SITE_PASSWORD gate.
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
  const body = (await req.json()) as { question?: unknown };
  const question = typeof body.question === 'string' ? body.question : '';
  if (!question) return NextResponse.json({ error: 'question required' }, { status: 400 });
  const result = await teach(question);
  return NextResponse.json(result);
}
