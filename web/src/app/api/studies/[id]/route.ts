import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { apiError } from '@/lib/api-error';
import { requireJsonContentType } from '@/lib/csrf-floor';
import { softDeleteStudy, updateStudy, STUDY_TITLE_MAX } from '@/lib/studies';

// /api/studies/[id] — rename/pin, soft-delete. Route-shape and error-code rules are in
// ../route.ts's header; ownership misses are 404 (the study either does not exist or is not
// yours — indistinguishable on purpose), never 401.
//
// NO GET — DELETED 2026-08-17 (deep-audit domain lens, HIGH), and the absence is pinned by
// web/test/invariants/studies-api-no-get.test.ts. The GET that stood here returned the study's
// blocks with `quote` verbatim and NO servability re-check — the §4.4 bypass servability.ts
// exists to close (a work withdrawn for a licensing reason keeps serving its stored text
// forever). It also had ZERO consumers: every fetch of this path in web/src is PATCH
// (study-editor.tsx) or DELETE (study-delete-button.tsx); the shipped reads are the study page
// (getStudyWithBlocks + resolveServability, both Flow D legs) and GET /studies/[id]/feed
// (listBlocks + resolveServability, per page). Deletion over plumbing is the precedented remedy
// (bylaw 3): /api/research/[id]'s GET was removed for exactly this shape — "zero consumers and
// returned stored answers with no servability data — a §4.4 bypass for any future consumer"
// (research-history-static.test.ts I-1). A future reader who needs a JSON read of one study
// must go through a route that runs resolveServability on every page, the way the feed does.

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PATCH /api/studies/[id] { title? , pinned? } — rename and/or pin. At least one field.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  let user: { id: string };
  try { user = await requireUser(); } catch { return apiError('UNAUTHENTICATED'); }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return apiError('INVALID_REQUEST', { message: 'study id must be a UUID' });

  const csrfFloor = requireJsonContentType(req);
  if (csrfFloor) return csrfFloor;

  let body: { title?: unknown; pinned?: unknown };
  try { body = await req.json(); } catch { return apiError('INVALID_REQUEST'); }

  let title: string | undefined;
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim()) {
      return apiError('INVALID_REQUEST', { message: 'title must be a non-empty string' });
    }
    title = body.title.trim();
    if (title.length > STUDY_TITLE_MAX) {
      return apiError('INVALID_REQUEST', { message: `title is longer than ${STUDY_TITLE_MAX} characters` });
    }
  }
  let pinned: boolean | undefined;
  if (body.pinned !== undefined) {
    if (typeof body.pinned !== 'boolean') {
      return apiError('INVALID_REQUEST', { message: 'pinned must be a boolean' });
    }
    pinned = body.pinned;
  }
  if (title === undefined && pinned === undefined) {
    return apiError('INVALID_REQUEST', { message: 'nothing to update: send title and/or pinned' });
  }

  try {
    const study = await updateStudy(user.id, id, { title, pinned });
    if (!study) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such study.' } }, { status: 404 });
    return NextResponse.json({ study });
  } catch (e) {
    console.error('study patch error:', (e as Error).message);
    return apiError('INTERNAL');
  }
}

// DELETE /api/studies/[id] — soft delete; the blocks' tombstones land in the SAME transaction
// (design §6.2, review S-H), so there is no instant with a deleted study and live blocks.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  let user: { id: string };
  try { user = await requireUser(); } catch { return apiError('UNAUTHENTICATED'); }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return apiError('INVALID_REQUEST', { message: 'study id must be a UUID' });

  try {
    const ok = await softDeleteStudy(user.id, id);
    if (!ok) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such study.' } }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('study delete error:', (e as Error).message);
    return apiError('INTERNAL');
  }
}
