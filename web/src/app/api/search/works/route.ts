// GET /api/search/works — cross-corpus + per-catalog + in-work search over `sections`
// (docs/LIBRARY_READER_DESIGN.md §5). This is the sermon search.
//
// Every property that keeps it safe lives in lib/search-sections.ts (published-only, deduped to
// reading units, capped count, hard LIMIT); this route is the thin, validated edge. Input is
// schema-parsed rather than trusted (CLAUDE.md: validate external input at the edge) — an unknown
// catalog is a 400, not a silently-widened query, because silently dropping a bad catalog filter
// would turn a fenced search into a cross-corpus one and breach the register wall.

import { isCatalogId } from '@/lib/catalog';
import { searchSections } from '@/lib/search-sections';

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const query = (url.searchParams.get('q') ?? '').trim();
  if (!query) return Response.json({ results: [], total: 0, totalCapped: false });

  const catalogParam = url.searchParams.get('catalog');
  if (catalogParam !== null && !isCatalogId(catalogParam)) {
    return Response.json({ error: `unknown catalog "${catalogParam}"` }, { status: 400 });
  }

  const num = (name: string): number | undefined => {
    const raw = url.searchParams.get(name);
    if (raw === null) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };

  const page = await searchSections({
    query,
    catalog: catalogParam ?? undefined,
    subFilter: url.searchParams.get('sub') ?? undefined,
    sourceSlug: url.searchParams.get('work') ?? undefined,
    tradition: url.searchParams.get('tradition') ?? undefined,
    limit: num('limit'),
    offset: num('offset'),
  });
  return Response.json(page);
}
