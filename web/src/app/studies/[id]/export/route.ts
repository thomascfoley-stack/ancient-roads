import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { apiError } from '@/lib/api-error';
import { getStudy, listAllBlocksForExport } from '@/lib/studies';
import { resolveServability } from '@/lib/servability';
import { exportStudyMarkdown } from '@/lib/study-export';

// GET /studies/[id]/export — the study as a markdown download (design Flow E: "durable body of
// work" includes taking it with you; export ships with the first slice).
//
// This endpoint is a P1 gap workaround (recorded as F-W3-3 for P3): P1 shipped the serializer
// (lib/study-export.ts, task 1.7) but no route exposes it, and the serialization is not
// client-safe — export is a RENDER PATH, so the fail-closed servability re-check
// (resolveServability) must run before blockRenderState decides what may be shown, exactly as on
// screen. The route lives beside the page that triggers it (not in /api/studies/**) to stay
// file-disjoint from P1's route surface.
//
// The read is the bounded one (listAllBlocksForExport pages internally to EXPORT_MAX_BLOCKS and
// THROWS past it — a truncated export is a lie about the document, so the ceiling is a 422, not
// a quietly shortened file).

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function filenameFor(title: string): string {
  const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${slug || 'study'}.md`;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  let user: { id: string };
  try { user = await requireUser(); } catch { return apiError('UNAUTHENTICATED'); }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return apiError('INVALID_REQUEST', { message: 'study id must be a UUID' });

  try {
    const study = await getStudy(user.id, id);
    // 404 — the study does not exist or is not yours, indistinguishable on purpose.
    if (!study) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such study.' } }, { status: 404 });
    const blocks = await listAllBlocksForExport(user.id, id);
    const resolution = await resolveServability(blocks);
    const markdown = exportStudyMarkdown(study, blocks, resolution);
    return new Response(markdown, {
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': `attachment; filename="${filenameFor(study.title)}"`,
      },
    });
  } catch (e) {
    if ((e as Error).message.includes('EXPORT_MAX_BLOCKS')) {
      return NextResponse.json(
        { error: { code: 'EXPORT_TOO_LARGE', message: 'This study is too long to export as one file.' } },
        { status: 422 },
      );
    }
    console.error('study export error:', (e as Error).message);
    return apiError('INTERNAL');
  }
}
