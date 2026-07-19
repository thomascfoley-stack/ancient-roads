import { getWorkWithToc } from '@/lib/work';

// GET /api/work/[slug] — the source row + TOC (no bodies) for the Book Reader
// (docs/LIBRARY_READER_DESIGN.md §2). 404 unless the source is published. Uses the
// framework-free Request/Response idiom (see lib/api-error.ts) so the handler is
// unit-testable outside Next.
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await ctx.params;
  const work = await getWorkWithToc(slug);
  if (!work) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json(work);
}
