import { NextRequest, NextResponse } from 'next/server';
import { LEGAL_CORPUS_FILTER } from '@/lib/teacher/routing';
import { getDocument } from '@/lib/user-corpus/documents';
import { relatedVoices } from '@/lib/user-corpus/related-voices';
import { guardUser } from '@/lib/user-corpus/route-guard';
import { corpusPredicate } from '@/lib/user-corpus/tradition-gap';

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
    return NextResponse.json({ voices: [], comparable: false, pending: true }, { status: 200 });
  }

  const result = await relatedVoices(user.id, id, PREDICATE);
  return NextResponse.json({ ...result, pending: false });
}
