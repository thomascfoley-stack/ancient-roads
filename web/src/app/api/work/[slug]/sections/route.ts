import { apiError } from '@/lib/api-error';
import { getWorkSectionsPage, WORK_SECTIONS_DEFAULT_LIMIT } from '@/lib/work';

// GET /api/work/[slug]/sections?after={ordinal}&limit={N} — one keyset page of
// section bodies for the Book Reader (docs/LIBRARY_READER_DESIGN.md §2). NEVER an
// unbounded response: the page size is capped in the data layer
// (WORK_SECTIONS_MAX_LIMIT); `nextAfter` is the cursor for the next page, null at
// the end of the work. 404 unless the source is published. Framework-free
// Request/Response idiom (see lib/api-error.ts).
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await ctx.params;
  const sp = new URL(req.url).searchParams;

  const afterParam = sp.get('after');
  const after = afterParam === null ? 0 : Number(afterParam);
  if (!Number.isInteger(after) || after < 0) {
    return apiError('INVALID_REQUEST', { message: '`after` must be a non-negative integer ordinal.' });
  }

  const limitParam = sp.get('limit');
  const limit = limitParam === null ? WORK_SECTIONS_DEFAULT_LIMIT : Number(limitParam);
  if (!Number.isInteger(limit) || limit < 1) {
    return apiError('INVALID_REQUEST', { message: '`limit` must be a positive integer.' });
  }

  const page = await getWorkSectionsPage(slug, { after, limit });
  if (!page) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json(page);
}
