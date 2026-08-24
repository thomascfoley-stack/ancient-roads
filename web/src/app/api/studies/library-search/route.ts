import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { apiError } from '@/lib/api-error';
import { getDb } from '@/lib/db';
import { searchSections, type SectionSearchResult } from '@/lib/search-sections';
import { searchLexicons } from '@/lib/search-lexicons';
import { CORPUS_GROUPS, type CorpusGroupId } from '@/lib/search-groups';
import { scheduleSearchOutcome } from '@/lib/search-outcomes';

// GET /api/studies/library-search?q=…&group=…&offset=… — the study editor's library panel
// (editor v2, owner direction 2026-08-12: "search commentaries within this page itself").
//
// This is the §12 FINDER's first rung, not a new engine (design F4): one capped query per
// request through the EXISTING register fence — searchSections' catalog option for the four
// catalog groups, the pinned lexicon sibling for the fifth — exactly the queries the /search
// page runs. CORPUS GROUPS ONLY, by design: a clipping is a stored corpus quote (F2); personal
// domains are searched on /search, not clipped from here.
//
// The one thing this route adds is IDENTITY: the engine's rows carry (slug, ordinal) but not
// sections.id, and the clipping write is keyed by sectionId. The resolver below maps the page's
// rows through the UNIQUE (source_id, ordinal) key — resolution only, never a licensing
// decision: the clipping POST re-runs the full gate (published + provenance + ownership) inside
// its own INSERT…SELECT, so a stale row here can at worst produce an honest 409, never a serve.
//
// Design §7.4 said clippings arrive "never from an in-editor corpus fetch" — amended by the
// owner 2026-08-12 (editor v2). The property that clause protected still holds structurally:
// snippets render read-only in the panel, raw corpus text never enters the editing buffer, and
// "Add" sends a REFERENCE to the same server-snapshotting write as every other surface (S-1).

export const runtime = 'nodejs';

const PAGE_SIZE = 10;
const MAX_OFFSET = 100_000;
const QUERY_MAX = 200;

export interface LibrarySearchRow {
  sectionId: number;
  slug: string;
  title: string;
  author: string | null;
  sourceType: string;
  ordinal: number;
  heading: string | null;
  snippet: string;
}

const GROUP_IDS = new Set<string>(CORPUS_GROUPS.map((g) => g.id));

async function resolveSectionIds(
  rows: SectionSearchResult[],
): Promise<Map<string, number>> {
  if (rows.length === 0) return new Map();
  const slugs = rows.map((r) => r.slug);
  const ordinals = rows.map((r) => r.ordinal);
  const sql = getDb();
  // Row-wise pair match over the UNIQUE (source_id, ordinal) key — same shape as the
  // servability module's pair-equality lookup, and bounded by the page size.
  const found = (await sql.query(
    `SELECT s.id::int AS id, src.slug, s.ordinal
     FROM sections s JOIN sources src ON src.id = s.source_id
     WHERE (src.slug, s.ordinal) IN
           (SELECT unnest($1::text[]), unnest($2::int[]))`,
    [slugs, ordinals],
  )) as { id: number; slug: string; ordinal: number }[];
  return new Map(found.map((r) => [`${r.slug}#${r.ordinal}`, r.id]));
}

export async function GET(req: NextRequest): Promise<Response> {
  let user: { id: string };
  try { user = await requireUser(); } catch { return apiError('UNAUTHENTICATED'); }
  // Auth wall — the corpus is not user-scoped; user.id is used only to attribute the query log.
  const t0 = Date.now();

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  if (!q) return apiError('INVALID_REQUEST', { message: 'q is required' });
  if (q.length > QUERY_MAX) {
    return apiError('INVALID_REQUEST', { message: `q holds at most ${QUERY_MAX} characters` });
  }
  const group = url.searchParams.get('group') ?? 'commentaries';
  if (!GROUP_IDS.has(group)) {
    return apiError('INVALID_REQUEST', { message: 'unknown group' });
  }
  const rawOffset = url.searchParams.get('offset');
  const offset = rawOffset === null ? 0 : Number(rawOffset);
  if (!Number.isInteger(offset) || offset < 0 || offset > MAX_OFFSET) {
    return apiError('INVALID_REQUEST', { message: 'offset must be a small non-negative integer' });
  }

  try {
    const def = CORPUS_GROUPS.find((g) => g.id === (group as CorpusGroupId))!;
    const page =
      def.via === 'catalog'
        ? await searchSections({ query: q, catalog: def.catalog, limit: PAGE_SIZE, offset })
        : await searchLexicons({ query: q, limit: PAGE_SIZE, offset });
    const ids = await resolveSectionIds(page.results);
    const results: LibrarySearchRow[] = page.results.flatMap((r) => {
      const sectionId = ids.get(`${r.slug}#${r.ordinal}`);
      // A row whose identity no longer resolves (corpus moved between queries) is dropped
      // rather than rendered un-addable; the count may then run one high — cosmetic.
      if (sectionId === undefined) return [];
      return [{
        sectionId,
        slug: r.slug,
        title: r.title,
        author: r.author,
        sourceType: r.sourceType,
        ordinal: r.ordinal,
        heading: r.heading,
        snippet: r.snippet,
      }];
    });
    // Query log (migration 127), off the request path, fail-open.
    scheduleSearchOutcome({
      surface: 'library',
      userId: user.id,
      query: q,
      params: offset > 0 ? { group, offset } : { group },
      resultCount: results.length,
      total: page.total,
      latencyMs: Date.now() - t0,
    });
    return NextResponse.json({ results, total: page.total, totalCapped: page.totalCapped });
  } catch (e) {
    console.error('library search error:', (e as Error).message);
    return apiError('INTERNAL');
  }
}
