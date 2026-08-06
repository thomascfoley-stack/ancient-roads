import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { guardUser } from '@/lib/user-corpus/route-guard';
import { deleteDocument, getDocument, getDocumentSections, setDocStatus } from '@/lib/user-corpus/documents';
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

  await setDocStatus(user.id, id, 'queued', null);
  await resetAttempts(user.id, id);
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

// Kept beside its only caller rather than exported from documents.ts: resetting the attempt
// counter is meaningless outside a retry, and a general-purpose setAttempts() would be a way to
// defeat MAX_ATTEMPTS from anywhere.
async function resetAttempts(userId: string, id: string): Promise<void> {
  const { runAsUser } = await import('@/lib/db');
  await runAsUser(userId, (sql) => [
    sql`UPDATE user_documents SET attempts = 0, claimed_at = NULL, updated_at = now()
        WHERE user_id = ${userId} AND id = ${id}`,
  ]);
}
