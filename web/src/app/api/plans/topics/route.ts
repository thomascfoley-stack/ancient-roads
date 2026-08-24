import { NextRequest, NextResponse } from 'next/server';
import { requireUser, authFailureResponse } from '@/lib/session';
import { apiError } from '@/lib/api-error';
import { matchTopics } from '@/lib/plan/topic-match';

export const runtime = 'nodejs';

// GET /api/plans/topics?q=prayer — up to 3 candidate topics from the
// ingested topical-index corpus (Nave's/Torrey's/OpenBible). No model call,
// no embedding spend; a bounded FTS lookup. Returns pointers only — the
// caller resolves a pick into a plan's {kind:'topic'} scope, never posts
// the query text itself as a scope.
export async function GET(req: NextRequest) {
  try {
    await requireUser();
  } catch (e) { return authFailureResponse(e); }
  const q = req.nextUrl.searchParams.get('q') ?? '';
  if (!q.trim()) return apiError('INVALID_REQUEST', { message: 'q is required' });
  try {
    const matches = await matchTopics(q, 3);
    return NextResponse.json({ matches });
  } catch (e) {
    console.error('topic match error:', (e as Error).message);
    return apiError('INTERNAL');
  }
}
