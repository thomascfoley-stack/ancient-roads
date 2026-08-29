import { NextRequest, NextResponse } from 'next/server';
import { LEGAL_CORPUS_FILTER } from '@/lib/teacher/routing';
import { apiError } from '@/lib/api-error';
import { getDocument } from '@/lib/user-corpus/documents';
import { guardUser } from '@/lib/user-corpus/route-guard';
import { corpusPredicate, traditionGap } from '@/lib/user-corpus/tradition-gap';

export const runtime = 'nodejs';

/**
 * The tradition-gap join: which voices from the corpus speak on this document's passages.
 *
 * ── THIS IS THE ADR-104 CALL SITE, AND IT IS THE WHOLE POINT OF THE INJECTED PREDICATE ─────────
 * `traditionGap` takes the corpus filter as a parameter rather than importing it, because when the
 * join was built `LEGAL_CORPUS_FILTER` on that branch was still the AUTHOR ALLOWLIST while the
 * `served` column already existed on the database. Importing the canonical symbol then would have
 * silently applied the wrong filter, and hand-writing `served = true` here would have been the
 * repo's most-punished defect (a second copy of the predicate; instance 14 was this exact file).
 *
 * Lane A has since merged: `LEGAL_CORPUS_FILTER` is now `(served)` and production carries 399,597
 * served rows. So the gate ADR-104 named is discharged, and this line -- importing THE canonical
 * predicate and branding it -- is the one-line change the design reserved. There is still exactly
 * one definition of what the corpus serves.
 *
 * `corpusPredicate()` is a tripwire, not a sanitiser: it refuses statement terminators and comment
 * markers so that an accidental `corpusPredicate(userInput)` fails loudly. The argument here is a
 * compile-time constant, which is the only thing that type is for.
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
  // A DB fault here — `getDocument` or the `traditionGap` join — must return the stable error
  // envelope, never escape as Next's raw 500. This route and the sibling `related` route are the
  // two /api/* handlers the D35 envelope sweep missed; the `search` route is the precedent.
  try {
    // 404 rather than 403 for a document that is not theirs, matching the sibling routes: RLS makes
    // it invisible anyway, and distinguishing "not yours" from "does not exist" confirms an id to
    // someone who cannot read it.
    const doc = await getDocument(user.id, id);
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // A document that has not finished indexing has no anchors yet, so the join would honestly
    // return nothing. Say which of the two it is rather than showing an empty shelf.
    if (doc.status !== 'ready') {
      return NextResponse.json(
        { voices: [], authorCount: 0, rangesConsidered: 0, pending: true },
        { status: 200 },
      );
    }

    const result = await traditionGap(user.id, id, PREDICATE);
    return NextResponse.json({ ...result, pending: false });
  } catch (e) {
    console.error('[user-corpus] voices failed:', String((e as Error)?.message ?? e));
    return apiError('INTERNAL');
  }
}
