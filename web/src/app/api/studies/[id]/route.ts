import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { apiError } from '@/lib/api-error';
import {
  getStudyWithBlocks,
  softDeleteStudy,
  updateStudy,
  BLOCKS_PAGE_MAX,
  STUDY_TITLE_MAX,
} from '@/lib/studies';

// /api/studies/[id] — read, rename/pin, soft-delete. Route-shape and error-code rules are in
// ../route.ts's header; ownership misses are 404 (the study either does not exist or is not
// yours — indistinguishable on purpose), never 401.

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POSITION_RE = /^[0-9A-Za-z]+$/;

// GET /api/studies/[id]?limit&afterPosition — the study plus a page of its blocks in
// (position, id) order. nextAfterPosition is the cursor for the next page, null at the end.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  let user: { id: string };
  try { user = await requireUser(); } catch { return apiError('UNAUTHENTICATED'); }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return apiError('INVALID_REQUEST', { message: 'study id must be a UUID' });

  const url = new URL(req.url);
  const rawLimit = url.searchParams.get('limit');
  const limit = rawLimit === null ? undefined : Number(rawLimit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > BLOCKS_PAGE_MAX)) {
    return apiError('INVALID_REQUEST', { message: `limit must be an integer 1..${BLOCKS_PAGE_MAX}` });
  }
  const afterPosition = url.searchParams.get('afterPosition') ?? undefined;
  if (afterPosition !== undefined && !POSITION_RE.test(afterPosition)) {
    return apiError('INVALID_REQUEST', { message: 'afterPosition must be a base-62 position key' });
  }

  try {
    const found = await getStudyWithBlocks(user.id, id, { limit, afterPosition });
    if (!found) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such study.' } }, { status: 404 });
    const pageSize = limit ?? found.blocks.length;
    const nextAfterPosition =
      found.blocks.length > 0 && found.blocks.length >= pageSize
        ? found.blocks[found.blocks.length - 1]!.position
        : null;
    return NextResponse.json({ ...found, nextAfterPosition });
  } catch (e) {
    console.error('study get error:', (e as Error).message);
    return apiError('INTERNAL');
  }
}

// PATCH /api/studies/[id] { title? , pinned? } — rename and/or pin. At least one field.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  let user: { id: string };
  try { user = await requireUser(); } catch { return apiError('UNAUTHENTICATED'); }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return apiError('INVALID_REQUEST', { message: 'study id must be a UUID' });

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
