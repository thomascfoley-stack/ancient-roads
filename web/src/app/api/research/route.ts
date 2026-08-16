import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/session';
import { apiError } from '@/lib/api-error';
import { listThreads } from '@/lib/research';

export const runtime = 'nodejs';

// GET /api/research?limit=N — the caller's research threads, newest first. READ-ONLY BY
// DESIGN (I-1): history is written exclusively inside /api/ask/stream from the verified
// pipeline result. There is deliberately no POST here — a client that could write
// history rows could store text that later re-renders as Ancient Paths output.
// test/invariants/research-history-static.test.ts pins this.
export async function GET(req: NextRequest) {
  let user: { id: string };
  try {
    user = await requireUser();
  } catch {
    return apiError('UNAUTHENTICATED');
  }
  const raw = Number(req.nextUrl.searchParams.get('limit') ?? '20');
  const limit = Number.isFinite(raw) ? raw : 20; // listThreads caps to [1, 50]
  const threads = await listThreads(user.id, limit);
  return Response.json({ threads });
}
