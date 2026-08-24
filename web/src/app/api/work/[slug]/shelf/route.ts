import { requireUser, authFailureResponse } from '@/lib/session';
import { apiError } from '@/lib/api-error';
import { getShelf, isShelf, removeFromLibrary, setShelf } from '@/lib/library';
import { publishedSourceId } from '@/lib/work';

// GET/PUT/DELETE /api/work/[slug]/shelf — whether a signed-in reader has this work on a shelf,
// and the two verbs that change it (docs/LIBRARY_READER_DESIGN.md §4, migration 027).
//
// WHY THIS ROUTE EXISTS. `setShelf` and `removeFromLibrary` are the only writers of
// `library_items` and had ZERO call sites, so nothing in the product could shelve a work,
// `listLibraryItems` could only return `[]`, and `/library/books` stayed a ComingSoon stub behind
// a first-class nav entry — while the Library hub queried the shelf on every load and discarded
// the result (ledger N3/N5). Identical in shape to N1 one table over.
//
// PUBLISHED-ONLY ON ALL THREE VERBS, and DELETE is deliberately included. It looks asymmetric —
// why refuse to un-shelve a withdrawn work? — but it follows the design lib/library.ts states in
// its header: the published predicate FILTERS, it does not delete, so a work withdrawn while
// shelved keeps its row and reappears if it is re-published. A withdrawn work is invisible on
// every surface, so no DELETE for one can originate from the UI, and honouring it would quietly
// destroy the row that design exists to preserve.
//
// The shelf VALUE is validated with the shipped `isShelf` guard rather than a second list of
// names, so the accepted set cannot drift from `SHELVES`.

/** Resolve the session and the work together: every verb needs both, and both are 401/404. */
async function resolve(
  ctx: { params: Promise<{ slug: string }> },
): Promise<{ userId: string; sourceId: string } | Response> {
  // requireUser in its OWN try, whose catch returns UNAUTHENTICATED and nothing else — the A1-16
  // finding: four routes wrapped auth and the DB call in one try, so an RLS refusal reached the
  // client as "signed out".
  let user: { id: string };
  try {
    user = await requireUser();
  } catch (e) { return authFailureResponse(e); }
  const { slug } = await ctx.params;
  const sourceId = await publishedSourceId(slug);
  // Same shape as the sibling GET /api/work/[slug]: staged, quarantined and unknown are one 404.
  if (sourceId === null) return Response.json({ error: 'not found' }, { status: 404 });
  return { userId: user.id, sourceId: String(sourceId) };
}

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }): Promise<Response> {
  const r = await resolve(ctx);
  if (r instanceof Response) return r;
  try {
    return Response.json({ shelf: await getShelf(r.userId, r.sourceId) });
  } catch (e) {
    console.error(`[work/shelf] read failed: ${(e as Error).message}`);
    return apiError('INTERNAL');
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ slug: string }> }): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError('INVALID_REQUEST', { message: 'Expected a JSON body.' });
  }
  const shelf = (raw as { shelf?: unknown } | null)?.shelf;
  if (!isShelf(shelf)) {
    return apiError('INVALID_REQUEST', { message: 'shelf must be one of: reading, saved, archived.' });
  }

  // Body validated BEFORE the session/work lookup, so a malformed request costs no database work.
  const r = await resolve(ctx);
  if (r instanceof Response) return r;
  try {
    await setShelf(r.userId, r.sourceId, shelf);
  } catch (e) {
    console.error(`[work/shelf] write failed: ${(e as Error).message}`);
    return apiError('INTERNAL');
  }
  return Response.json({ shelf });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ slug: string }> }): Promise<Response> {
  const r = await resolve(ctx);
  if (r instanceof Response) return r;
  try {
    await removeFromLibrary(r.userId, r.sourceId);
  } catch (e) {
    console.error(`[work/shelf] delete failed: ${(e as Error).message}`);
    return apiError('INTERNAL');
  }
  return Response.json({ ok: true });
}
