import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { apiError } from '@/lib/api-error';
import { getStudy, listAllBlocksForExport } from '@/lib/studies';
import { resolveServability } from '@/lib/servability';
import { exportStudyDocx, studyExportModel, type ExportNode } from '@/lib/study-export-docx';

// GET /studies/[id]/export?format=docx|pdf — the study as a download (design Flow E), in the
// formats people actually hand to other people (editor v2, owner 2026-08-12: "Word or PDF …
// we cannot export a .md file").
//
// MARKDOWN WAS REMOVED 2026-08-21 (owner: an AI-native plumbing format, not something a person
// hands to a person) — and the 2026-08-12 ruling above had already said so; the md branch and
// menu item survived it as "plumbing kept", which is how a ruling erodes. The serializer lived
// in lib/study-export.ts (deleted with this change; git history has it if the §12 Google Docs
// export ever wants a text pipeline — though that export should render from the MODEL below,
// as both surviving formats do). Format is REQUIRED now: the old `md` default was a relic of
// this route's origin as the F-W3-3 serializer workaround.
//
// EVERY FORMAT IS THE SAME RENDER PATH. One bounded read (listAllBlocksForExport — THROWS past
// the ceiling; a truncated export is a lie about the document), one fail-closed servability
// re-check, and then two renderers over the same decided content: the .docx model, and the
// print view — which is the .docx MODEL rendered as print-styled HTML that opens the browser's
// print dialog ("Save as PDF"). A real PDF engine is a heavy dependency this replaces with the
// browser the user is already holding; the tradeoff is recorded here, not hidden.

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function baseFilename(title: string): string {
  const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'study';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// The print view: the SAME export model, as minimal print-styled HTML. Every text node is
// escaped — the corpus is data here, never markup. The inline script only opens the print
// dialog; the page is complete without it.
function printHtml(nodes: ExportNode[]): string {
  const body = nodes
    .map((n) => {
      const text = escapeHtml(n.text);
      switch (n.type) {
        case 'title': return `<h1>${text}</h1>`;
        case 'body': return `<p>${text}</p>`;
        case 'quote': return `<p class="q">${text}</p>`;
        case 'attribution': return `<p class="a">${text}</p>`;
        case 'notice': return `<p class="a n">${text}</p>`;
      }
    })
    .join('\n');
  const title = escapeHtml(nodes[0]?.text ?? 'Study');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 42rem; margin: 2rem auto; padding: 0 1.5rem; color: #1c1917; line-height: 1.75; }
  h1 { font-size: 1.6rem; font-weight: 600; margin: 0 0 1.5rem; }
  p { margin: 0 0 1rem; }
  .q { margin-left: 1.5rem; }
  .a { margin-left: 1.5rem; font-style: italic; color: #57534e; }
  .n { margin-top: -0.75rem; }
  @media print { body { margin: 0 auto; } }
</style></head>
<body>
${body}
<script>window.print();</script>
</body></html>`;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  let user: { id: string };
  try { user = await requireUser(); } catch { return apiError('UNAUTHENTICATED'); }
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return apiError('INVALID_REQUEST', { message: 'study id must be a UUID' });

  const format = new URL(req.url).searchParams.get('format');
  if (format !== 'docx' && format !== 'pdf') {
    return apiError('INVALID_REQUEST', { message: "format must be 'docx' or 'pdf'" });
  }

  try {
    const study = await getStudy(user.id, id);
    // 404 — the study does not exist or is not yours, indistinguishable on purpose.
    if (!study) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'No such study.' } }, { status: 404 });
    const blocks = await listAllBlocksForExport(user.id, id);
    const resolution = await resolveServability(blocks);

    if (format === 'docx') {
      const buffer = await exportStudyDocx(study, blocks, resolution);
      return new Response(new Uint8Array(buffer), {
        headers: {
          'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'content-disposition': `attachment; filename="${baseFilename(study.title)}.docx"`,
        },
      });
    }
    // format === 'pdf' — inline, not attachment: the page IS the deliverable; it opens
    // print-ready and the browser's dialog does the "Save as PDF".
    return new Response(printHtml(studyExportModel(study, blocks, resolution)), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
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
