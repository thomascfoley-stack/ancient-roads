import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { apiError } from '@/lib/api-error';
import { listBlocks, BLOCKS_PAGE_MAX } from '@/lib/studies';
import { blockRenderState, resolveServability } from '@/lib/servability';

// GET /studies/[id]/feed?limit&afterPosition — one blocks page, each row carrying the
// server-computed renderState. This endpoint exists because of a P1 gap (recorded as F-W3-2 for
// P3): GET /api/studies/[id]/blocks returns raw blocks with NO servability re-check, and a
// stored clipping quote read back without one bypasses every live licensing predicate (the
// reason servability.ts exists). The doc page therefore cannot paginate through the bare blocks
// route without rendering possibly-unlicensed text. It lives beside the page it serves (not in
// /api/studies/**) to stay file-disjoint from P1's route surface; the query shape and error
// codes deliberately mirror the P1 route's.
//
// The re-check is one bounded query per key leg per page (servability.ts), positive-form and
// fail-closed: if the check errors, this page's clippings all render as tombstones.

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POSITION_RE = /^[0-9A-Za-z]+$/;

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
    // Ownership rides the data layer's user_id belt (H1): a foreign or missing study pages as an
    // empty list, which is also the honest end-of-document answer.
    const blocks = await listBlocks(user.id, id, { limit, afterPosition });
    const resolution = await resolveServability(blocks);
    const pageSize = limit ?? blocks.length;
    const nextAfterPosition =
      blocks.length > 0 && blocks.length >= pageSize ? blocks[blocks.length - 1]!.position : null;
    return NextResponse.json({
      blocks: blocks.map((b) => ({
        id: b.id,
        position: b.position,
        kind: b.kind,
        body: b.body,
        work_slug: b.work_slug,
        ordinal: b.ordinal,
        quote: b.quote,
        attribution: b.attribution,
        trim_start: b.trim_start,
        trim_end: b.trim_end,
        renderState: blockRenderState(b, resolution),
      })),
      nextAfterPosition,
    });
  } catch (e) {
    console.error('study feed error:', (e as Error).message);
    return apiError('INTERNAL');
  }
}
