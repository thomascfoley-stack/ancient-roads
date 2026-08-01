// GET /api/search/commentaries — passage-level commentary search over `commentary_entries`.
//
// EVERY PARAMETER IS VALIDATED HERE, and that is a repair rather than a design note. Until
// 2026-08-02 this route read `Number(sp.get('book'))`, `Number(sp.get('limit'))` and
// `Number(sp.get('offset'))` with no integer check, and had no try/catch anywhere in the file:
//
//   ?book=abc     -> NaN, forwarded because `?? null` does not catch NaN -> "NaN"::smallint -> 500
//   ?limit=2.5    -> clamped to 2.5, bound into `LIMIT $n` -> Postgres 22P02 -> 500
//   ?offset=1e21  -> "1e+21"::bigint -> 500
//
// That is verbatim the defect its SIBLING route fixed on the same day — and the sibling's comment
// asserts "the /api/work/[slug]/sections route has always checked Number.isInteger; this one now
// agrees" while THIS file, the one actually named, had never checked anything (2026-08-02 deep
// audit, H9). The audit named the shape: a fix applied where the author was looking, and nowhere
// else.
//
// The route is unauthenticated and today sits behind the site password. It is written as though
// the password were already gone, because it will be.

import { searchCommentaries } from '@/lib/commentary-search';
import { apiError } from '@/lib/api-error';
import { publicReadThrottle } from '@/lib/public-read-limit';

/** Bible book ordinal — 1..66, and a smallint column downstream. */
const MAX_BOOK = 66;

// Plain `Request` and `new URL(req.url)`, matching the sibling /api/search/works — so the handler
// is unit-testable outside Next rather than requiring a NextRequest to be constructed.
export async function GET(req: Request): Promise<Response> {
  // Unauthenticated and, once the gate comes off, public. Throttle before doing any work.
  const throttled = await publicReadThrottle(req, 'search-commentaries');
  if (throttled) return throttled;
  const sp = new URL(req.url).searchParams;
  const q = sp.get('q')?.trim();
  if (!q) return apiError('INVALID_REQUEST', { message: 'q is required' });

  /** Integer in range, or refuse. Never NaN, never a float, never Infinity — all three reach SQL. */
  const int = (name: string, min: number, max: number): number | undefined | null => {
    const raw = sp.get(name);
    if (raw === null) return undefined;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) return null; // null means refuse
    return n;
  };

  const book = int('book', 1, MAX_BOOK);
  const limit = int('limit', 1, 100);
  const offset = int('offset', 0, 100_000);
  const bad = [
    book === null ? `book (1..${MAX_BOOK})` : null,
    limit === null ? 'limit (1..100)' : null,
    offset === null ? 'offset (0..100000)' : null,
  ].filter(Boolean);
  if (bad.length > 0) {
    return apiError('INVALID_REQUEST', { message: `invalid ${bad.join(', ')} — integers only` });
  }

  // Free text with no closed vocabulary in the schema, so an unknown value honestly matches
  // nothing rather than 400ing against a list this route would have to keep in sync — the
  // hand-maintained-expected-set trap. Length is still bounded: an unbounded string reaches a
  // query parameter.
  const str = (name: string): string | undefined => sp.get(name)?.slice(0, 100) || undefined;

  try {
    const data = await searchCommentaries({
      query: q.slice(0, 200),
      book: book ?? undefined,
      tradition: str('tradition'),
      author: str('author'),
      limit: limit ?? undefined,
      offset: offset ?? undefined,
    });
    return Response.json(data);
  } catch (err) {
    // The file had no try/catch at all, so a DB fault surfaced as Next's raw 500 rather than the
    // envelope api-error.ts says EVERY /api/* error uses. The detail is logged, never returned.
    console.error('[search/commentaries]', err instanceof Error ? err.message : String(err));
    return apiError('INTERNAL');
  }
}
