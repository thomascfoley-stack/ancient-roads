// POST /api/history/search — the standalone history lane (HISTORY_RETRIEVAL_DESIGN §4).
// Deterministic retrieval, no LLM composition: the only model call is embedding the query.
// Fail closed everywhere — an error returns nothing, never partial or unverified content.
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { checkHistorySearchRateLimit } from '@/lib/rate-limit';
import { searchHistory } from '@/lib/history-search-db';
import { createHistoryThread } from '@/lib/history-threads';
import { scheduleSearchOutcome } from '@/lib/search-outcomes';

// zlib-free but embedQuery + pg need node, not edge.
export const runtime = 'nodejs';

/** Edge validation without a new dependency: web/ has never carried zod, and one bounded string
 *  does not justify one (typecheck resolved the import from the monorepo ROOT node_modules while
 *  Next's build correctly refused — the walk caught it). */
function parseBody(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const q = (raw as { query?: unknown }).query;
  if (typeof q !== 'string') return null;
  const t = q.trim();
  return t.length >= 1 && t.length <= 500 ? t : null;
}

export async function POST(req: Request): Promise<NextResponse> {
  // requireUser in its OWN try (the A1-16 pattern): an auth failure must be a 401, never the
  // catch-all 500 that would hide it.
  let userId: string;
  try {
    userId = (await requireUser()).id;
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let query: string | null = null;
  try {
    query = parseBody(await req.json());
  } catch { /* malformed JSON falls through to the 400 below */ }
  if (query === null) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const rl = await checkHistorySearchRateLimit(userId);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  try {
    const t0 = Date.now();
    const data = await searchHistory(query);
    // Persistence is UX (UX-4 parity), not correctness: losing the thread must not lose the
    // results, so this single write fails OPEN with a log line — unlike everything above it.
    let threadId: string | null = null;
    try {
      threadId = await createHistoryThread(userId, query, data);
    } catch (e) {
      console.error('history_thread_persist_failed', (e as Error).message);
    }
    // Query log (migration 129), off the request path, fail-open. The thread above is the
    // user's own UX record; this row is the owner-readable one, same as every other surface.
    scheduleSearchOutcome({
      surface: 'history',
      userId,
      query,
      resultCount: data.results.length,
      latencyMs: Date.now() - t0,
    });
    return NextResponse.json({ threadId, ...data });
  } catch (e) {
    // Includes assertExcerptVerbatim throws: a mutated excerpt is a 500, never a render.
    console.error('history_search_failed', (e as Error).message);
    return NextResponse.json({ error: 'history_unavailable' }, { status: 500 });
  }
}
