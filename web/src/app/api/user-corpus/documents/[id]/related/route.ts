import { NextRequest, NextResponse } from 'next/server';
import { LEGAL_CORPUS_FILTER } from '@/lib/teacher/routing';
import { getDocument } from '@/lib/user-corpus/documents';
import { relatedVoices } from '@/lib/user-corpus/related-voices';
import { guardUser } from '@/lib/user-corpus/route-guard';
import { corpusPredicate } from '@/lib/user-corpus/tradition-gap';
import type { DocStatus } from '@/lib/user-corpus/types';
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

/** The four claim statuses — a row in one of these IS still being indexed, not yet searchable. */
const IN_FLIGHT: DocStatus[] = ['queued', 'parsing', 'chunking', 'embedding'];

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
  // not an empty shelf that reads as "the library has nothing like this". That is only honest for
  // the claim statuses — `failed` and `empty` are terminal/stopped, not in flight, and are surfaced
  // by the next branch rather than reported as "still being indexed".
  if (IN_FLIGHT.includes(doc.status)) {
    logEvent('match_outcome', { kind: 'semantic', documentId: id, userId: user.id, outcome: 'pending', voices: 0, ms: 0 });
    return NextResponse.json({ voices: [], comparable: false, pending: true }, { status: 200 });
  }

  // Terminal/stopped states are NOT "still indexing". `empty` is a permanent verdict (the retry
  // endpoint refuses it with 409 — retrying cannot change the result); `failed` is stopped — the
  // drain has given up on the row and it will not reach `ready` again until a manual retry. Report
  // the verdict and its actionable `parseError` reason instead of a `pending: true` that lies about
  // a finished failure and swallows the cause. The reason is returned to the caller, never logged.
  if (doc.status === 'failed' || doc.status === 'empty') {
    logEvent('match_outcome', { kind: 'semantic', documentId: id, userId: user.id, outcome: doc.status, voices: 0, ms: 0 });
    return NextResponse.json(
      { voices: [], comparable: false, pending: false, failed: doc.status, reason: doc.parseError },
      { status: 200 },
    );
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
