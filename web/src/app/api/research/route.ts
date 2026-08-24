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
  // Cluster A (DEEP_SWEEP D14/D32/D33): the data layer has no catch of its own, so an
  // unwrapped call escapes to Next's RAW 500 instead of the envelope every /api/* route promises.
  try {
    const threads = await listThreads(user.id, limit);
    return Response.json({ threads });
  } catch (e) {
    console.error('GET /api/research:', (e as Error).message);
    return apiError('INTERNAL');
  }
}
