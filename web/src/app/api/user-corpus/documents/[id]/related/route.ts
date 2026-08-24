import { NextRequest, NextResponse } from 'next/server';
import { LEGAL_CORPUS_FILTER } from '@/lib/teacher/routing';
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

export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const guard = await guardUser();
  if (guard.denied) return guard.denied;
  const user = guard.user;

  const { id } = await ctx.params;
  const doc = await getDocument(user.id, id);
  // 404 rather than 403 for a document that is not theirs, matching the sibling routes.
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Nothing is embedded before the document is indexed, so the honest answer is "still indexing",
  // not an empty shelf that reads as "the library has nothing like this".
  if (doc.status !== 'ready') {
    logEvent('match_outcome', { kind: 'semantic', documentId: id, userId: user.id, outcome: 'pending', voices: 0, ms: 0 });
    return NextResponse.json({ voices: [], comparable: false, pending: true }, { status: 200 });
  }

  // Same three outcomes as the anchor route, and the same rule: the operation is logged, the
  // document never is.
  const t0 = Date.now();
  try {
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
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
