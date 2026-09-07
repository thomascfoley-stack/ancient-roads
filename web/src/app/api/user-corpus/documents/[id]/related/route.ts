import { NextRequest, NextResponse } from 'next/server';
import { LEGAL_CORPUS_FILTER } from '@/lib/teacher/routing';
import { apiError } from '@/lib/api-error';
import { getDocument } from '@/lib/user-corpus/documents';
import { relatedVoices } from '@/lib/user-corpus/related-voices';
import { guardUser } from '@/lib/user-corpus/route-guard';
import { corpusPredicate } from '@/lib/user-corpus/tradition-gap';
import { logEvent } from '@/lib/observability';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Corpus voices near this document in MEANING — sermons, hymns and poetry alongside the
 * commentators — for the case the anchor panel cannot answer: a sermon that preaches a passage
 * without quoting it verbatim anchors nothing, and `traditionGap` correctly returns nothing.
 *
 * Same canonical predicate as the anchor join, imported and never re-typed (ADR-104): what the
 * corpus serves has exactly one definition.
 */
const PREDICATE = corpusPredicate(LEGAL_CORPUS_FILTER);

interface Ctx {
  params: Promise<{ id: string }>;
}

// Returns `Response`, not `NextResponse`: the app-wide error envelope (`apiError`, lib/api-error.ts
// / docs/API_ERRORS.md) is framework-free and returns the global Web `Response`. NextResponse
// extends Response, so every JSON return below still satisfies this — same shape as the sibling
// search route (D35, e4542c97).
export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const guard = await guardUser();
  if (guard.denied) return guard.denied;
  const user = guard.user;

  const { id } = await ctx.params;
  // Same three outcomes as the anchor route, and the same rule: the operation is logged, the
  // document never is.
  //
  // A DB fault ANYWHERE in here — `getDocument` as much as the `relatedVoices` sweeps — must
  // return the stable error envelope, never escape as Next's raw 500. `getDocument` used to sit
  // outside the try, so a pool exhaustion or query timeout on the lookup escaped the handler
  // entirely; this route and the sibling `voices` route are the two /api/* handlers the D35
  // envelope sweep missed, and the `search` route is the precedent.
  const t0 = Date.now();
  try {
    const doc = await getDocument(user.id, id);
    // 404 rather than 403 for a document that is not theirs, matching the sibling routes.
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Nothing is embedded before the document is indexed, so the honest answer is "still indexing",
    // not an empty shelf that reads as "the library has nothing like this".
    if (doc.status !== 'ready') {
      logEvent('match_outcome', { kind: 'semantic', documentId: id, userId: user.id, outcome: 'pending', voices: 0, ms: 0 });
      return NextResponse.json({ voices: [], comparable: false, pending: true }, { status: 200 });
    }

    const result = await relatedVoices(user.id, id, PREDICATE);
    logEvent('match_outcome', {
      kind: 'semantic',
      documentId: id,
      userId: user.id,
      outcome: result.voices.length > 0 ? 'hit' : 'empty',
      voices: result.voices.length,
      comparable: result.comparable,
      ms: Date.now() - t0,
    });
    return NextResponse.json({ ...result, pending: false });
  } catch (e) {
    const message = (e as Error)?.message ?? String(e);
    logEvent('match_outcome', {
      kind: 'semantic', documentId: id, userId: user.id, outcome: 'error', voices: 0,
      ms: Date.now() - t0, message,
    });
    console.error('[user-corpus] semantic match failed:', message);
    // The envelope api-error.ts says every /api/* error uses (docs/API_ERRORS.md), rather than
    // Next's raw 500 or the bare `{ error: 'INTERNAL' }` this returned before: that shape put a
    // machine token where every other route puts `{ error: { code, message } }`, so a client that
    // rendered the field would have shown a reader the word INTERNAL.
    return apiError('INTERNAL');
  }
}
