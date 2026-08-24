import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { checkCorpusUploadRateLimit } from '@/lib/rate-limit';
import { guardUser } from '@/lib/user-corpus/route-guard';
import { deleteDocument, getDocument, getDocumentSections, requeueForRetry } from '@/lib/user-corpus/documents';
import { drain } from '@/lib/user-corpus/queue';

export const runtime = 'nodejs';

interface Ctx {
  params: Promise<{ id: string }>;
}

/** One document's status, for polling after an upload. */
export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const guard = await guardUser();
  if (guard.denied) return guard.denied;
  const user = guard.user;
  const { id } = await ctx.params;
  const doc = await getDocument(user.id, id);
  // 404 rather than 403 for another user's id. RLS already makes it invisible, and distinguishing
  // "not yours" from "does not exist" would confirm that a given id exists to someone who cannot
  // read it.
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // `?sections=1` is opt-in: the list view wants status and nothing else, and shipping a whole
  // sermon's text to render one row would be the unbounded-payload version of the same mistake
  // the LIMITs guard against. The reading view asks for it explicitly.
  const wantSections = new URL(_req.url).searchParams.get('sections') === '1';
  const sections = wantSections ? await getDocumentSections(user.id, id) : undefined;
  return NextResponse.json({ document: doc, ...(sections ? { sections } : {}) });
}

/**
 * Per-doc retry (§8).
 *
 * Resets attempts to 0 and returns the document to 'queued'. Resetting is the point: the drain's
 * claim predicate ignores rows at MAX_ATTEMPTS, so a retry that left the counter alone would
 * appear to do something and then never be picked up -- a button that lies.
 *
 * Refusals are NOT retryable. A scan without a text layer and an empty file are verdicts about the
 * file, not transient errors, and re-running the same parse over the same bytes cannot reach a
 * different answer. Offering retry there would be an invitation to click forever.
 */
export async function POST(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const guard = await guardUser();
  if (guard.denied) return guard.denied;
  const user = guard.user;

  // METERED LIKE AN UPLOAD (H5a): a retry re-embeds the WHOLE document through the same drain,
  // and the attempts reset below means MAX_ATTEMPTS bounds consecutive failures, never spend —
  // without this, holding the retry button was an unmetered embedding loop. Same bucket as
  // upload, deliberately: both actions buy the same thing.
  const limit_ = await checkCorpusUploadRateLimit(user.id);
  if (!limit_.ok) {
    return NextResponse.json(
      { error: 'Too many retries. Please wait a moment and try again.', retryAfterSec: limit_.retryAfterSec },
      // D34: docs/API_ERRORS.md — "Retry-After is required on every 429 ... so clients back off
      // instead of hammering a paid endpoint". The plain-string `error` shape here is deliberate
      // (H6: the client reads a string), but nothing ever justified omitting the HEADER; the
      // sibling routes that use apiError get it for free. These are the paid endpoints.
      { status: 429, headers: { 'Retry-After': String(limit_.retryAfterSec ?? 60) } },
    );
  }

  const { id } = await ctx.params;
  const doc = await getDocument(user.id, id);
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (doc.status === 'empty') {
    return NextResponse.json(
      { error: 'That file contains no readable text, so retrying cannot change the result.' },
      { status: 409 },
    );
  }
  if (!doc.blobUrl) {
    return NextResponse.json(
      { error: 'The original file was not stored, so it cannot be re-parsed. Please upload it again.' },
      { status: 409 },
    );
  }

  // D9 (DEEP_SWEEP): this was setDocStatus + resetAttempts as TWO transactions on a row a worker
  // might be actively holding, followed by a drain kick — so the same document went to a second
  // worker: double parse, double PAID embedding, and two storeSections DELETE+INSERT pairs that
  // are not mutually exclusive under READ COMMITTED. The UI invites it, offering Retry on any doc
  // stuck >5 min, which is also STALE_CLAIM_MINUTES — and a live worker on a large PDF is
  // legitimately past 5 minutes with a fresh claim. One atomic CAS now, refusing a fresh claim.
  if (!(await requeueForRetry(user.id, id))) {
    return NextResponse.json(
      { error: 'That document is being processed right now. Give it a moment and try again.' },
      { status: 409 },
    );
  }
  // Best-effort, for the same reason as the upload route: the retry has already reset the row, so
  // a scheduling failure must not report the retry as failed.
  try {
    after(async () => {
      try {
        await drain(user.id);
      } catch (e) {
        console.error('[user-corpus] drain failed after retry:', String((e as Error)?.message ?? e));
      }
    });
  } catch (e) {
    console.error('[user-corpus] could not schedule the drain after retry:', String((e as Error)?.message ?? e));
  }

  const updated = await getDocument(user.id, id);
  return NextResponse.json({ document: updated });
}

export async function DELETE(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const guard = await guardUser();
  if (guard.denied) return guard.denied;
  const user = guard.user;
  const { id } = await ctx.params;
  const deleted = await deleteDocument(user.id, id);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ deleted: true });
}

