import { NextRequest, NextResponse } from 'next/server';
import { guardUser } from '@/lib/user-corpus/route-guard';
import { checkCorpusSearchRateLimit } from '@/lib/rate-limit';
import { apiError } from '@/lib/api-error';
import { embedChunks } from '@/lib/user-corpus/embed';
import { keywordSearch, searchMyWorks, verseAnchorScan } from '@/lib/user-corpus/search';
import { parseRef } from '@bible/ref-parse';

export const runtime = 'nodejs';

/**
 * Search one user's own works.
 *
 * Three modes behind one endpoint, matching the order's amendment ("three entry points, two
 * functions"):
 *   ?q=…                 → semantic + FTS fused by reciprocal rank
 *   ?q=…&mode=keyword    → FTS only, for "find that exact line I wrote"
 *   ?ref=Romans 8        → the verse-anchor presence scan, an index lookup and never a vector scan
 *
 * `documentId` scopes any of them to a single work — the same function with a filter, not a second
 * code path.
 *
 * ONE EMBEDDING CALL ON THE REQUEST PATH, deliberately. §8 keeps embeddings off the request path
 * for INGEST, where it is a per-document batch; a single query vector is what the corpus `/ask`
 * route already does. It is one call, and the alternative — a round trip to a queue for an
 * interactive search — would be worse for the same reason.
 */
// Returns `Response`, not `NextResponse`: `apiError` (the app-wide error envelope,
// docs/API_ERRORS.md) is deliberately framework-free and returns the global Web Response.
// NextResponse extends Response, so every JSON return below still satisfies this.
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await guardUser();
  if (guard.denied) return guard.denied;
  const user = guard.user;

  // METERED BEFORE ANY SPEND. This route calls `embedChunks([q])` on the request path — a paid
  // DeepInfra embedding — and had NO limiter until the 2026-08-17 pre-deploy audit. The wallet
  // invariant was green over it only because `routeSpendsMoney` matched `teach()` alone while
  // being named for spend in general; both the predicate and this route are fixed together.
  //
  // The allowlist in `guardUser` is NOT the meter, and must not be mistaken for one: it is a
  // temporary protection that stops binding the moment USER_CORPUS_MULTI_USER is set, with no
  // deploy and no review. Assume it is gone (the audit's framing) and this is the only thing
  // between an authenticated account and an unbounded embedding bill.
  const limit_ = await checkCorpusSearchRateLimit(user.id);
  if (!limit_.ok) {
    return apiError(limit_.limited === 'day' ? 'RATE_LIMIT_DAY' : 'RATE_LIMIT_MINUTE', {
      retryAfterSec: limit_.retryAfterSec,
    });
  }

  const params = req.nextUrl.searchParams;
  const documentId = params.get('documentId') ?? undefined;
  // B019 — EVERY SEARCH RETURNED EXACTLY ONE RESULT. This was `Number(params.get('limit'))`, and
  // `Number(null)` is 0, as is `Number('')`. `Number.isFinite(0)` is true, so an ABSENT parameter
  // became `limit: 0`, which `clampLimit` floors to 1 — and `scope.limit ?? DEFAULT_LIMIT` in
  // search.ts cannot rescue it, because `??` catches null and undefined but not zero. The shipped
  // client never sends `limit`, so this was every search on every mode.
  //
  // Absent means "no preference", which is `undefined`. An explicit `limit=0` is also nonsense as
  // a request and lands on the same answer rather than on a silent one-result page.
  const limitParam = params.get('limit')?.trim();
  const limitRaw = limitParam ? Number(limitParam) : NaN;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;
  const scope = { documentId, limit };

  // ── verse presence ────────────────────────────────────────────────────────────────────────────
  const ref = params.get('ref')?.trim();
  if (ref) {
    const parsed = parseRef(ref);
    if (!parsed.ok || parsed.ref.ranges.length === 0) {
      return NextResponse.json({ error: `Could not read "${ref}" as a passage.` }, { status: 400 });
    }
    // The first range is the passage the user typed; a multi-range reference ("Rom 8; Jn 3") is a
    // Slice 2 concern and answering only the first is better than answering a merged span the user
    // did not ask for.
    const range = parsed.ref.ranges[0]!;
    const anchors = await verseAnchorScan(user.id, range, scope);
    return NextResponse.json({ mode: 'verse', ref: parsed.ref.display, range, anchors });
  }

  // ── text search ───────────────────────────────────────────────────────────────────────────────
  // CAPPED. `q` is embedded verbatim by `embedChunks([q])`, so an uncapped query is an uncapped
  // paid call. 500 matches the corpus /ask route's own question cap — the same shape of input
  // going to the same provider should not have two different bounds.
  const MAX_QUERY = 500;
  const qRaw = params.get('q')?.trim();
  if (qRaw !== undefined && qRaw.length > MAX_QUERY) {
    return apiError('INVALID_REQUEST', { message: 'That search is too long. Please shorten it.' });
  }
  const q = qRaw;
  if (!q) return NextResponse.json({ error: 'Provide q or ref.' }, { status: 400 });

  if (params.get('mode') === 'keyword') {
    return NextResponse.json({ mode: 'keyword', q, hits: await keywordSearch(user.id, q, scope) });
  }

  try {
    const [vector] = await embedChunks([q]);
    if (!vector) throw new Error('no query vector');
    return NextResponse.json({ mode: 'fused', q, hits: await searchMyWorks(user.id, vector, q, scope) });
  } catch (e) {
    // The embedder is the only external dependency here. Degrade to FTS rather than returning
    // nothing: a keyword answer is a worse answer, and no answer looks like an empty corpus.
    console.error('[user-corpus] search fell back to keyword:', String((e as Error)?.message ?? e));
    return NextResponse.json({
      mode: 'keyword',
      q,
      degraded: 'semantic search is unavailable; showing keyword matches only',
      hits: await keywordSearch(user.id, q, scope),
    });
  }
}
