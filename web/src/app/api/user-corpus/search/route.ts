import { NextRequest, NextResponse } from 'next/server';
import { guardUser } from '@/lib/user-corpus/route-guard';
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
export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await guardUser();
  if (guard.denied) return guard.denied;
  const user = guard.user;

  const params = req.nextUrl.searchParams;
  const documentId = params.get('documentId') ?? undefined;
  const limitRaw = Number(params.get('limit'));
  const limit = Number.isFinite(limitRaw) ? limitRaw : undefined;
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
  const q = params.get('q')?.trim();
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
