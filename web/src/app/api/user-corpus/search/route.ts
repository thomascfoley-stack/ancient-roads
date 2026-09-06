import { NextResponse } from 'next/server';
import { guardUser } from '@/lib/user-corpus/route-guard';
import { checkCorpusSearchRateLimit } from '@/lib/rate-limit';
import { requireJsonContentType } from '@/lib/csrf-floor';
import { apiError } from '@/lib/api-error';
import { embedChunks } from '@/lib/user-corpus/embed';
import { keywordSearch, searchMyWorks, verseAnchorScan } from '@/lib/user-corpus/search';
import { parseRef } from '@bible/ref-parse';
import { scheduleSearchOutcome, type SearchParams } from '@/lib/search-outcomes';

export const runtime = 'nodejs';

/**
 * Search one user's own works.
 *
 * Three modes behind one endpoint, matching the order's amendment ("three entry points, two
 * functions"):
 *   { q }                 → semantic + FTS fused by reciprocal rank
 *   { q, mode: 'keyword' } → FTS only, for "find that exact line I wrote"
 *   { ref: 'Romans 8' }    → the verse-anchor presence scan, an index lookup and never a vector scan
 *
 * `documentId` scopes any of them to a single work — the same function with a filter, not a second
 * code path.
 *
 * ONE EMBEDDING CALL ON THE REQUEST PATH, deliberately. §8 keeps embeddings off the request path
 * for INGEST, where it is a per-document batch; a single query vector is what the corpus `/ask`
 * route already does. It is one call, and the alternative — a round trip to a queue for an
 * interactive search — would be worse for the same reason.
 *
 * POST, NOT GET — CSRF (commit f1d36b72 / f34e6c90 audit). This route is state-changing: it runs a
 * paid `embedChunks` on the request path AND appends a victim-attributed `search_outcomes` audit
 * row via `scheduleSearchOutcome`. A GET has no Content-Type to gate, so the project's CSRF layer
 * (`csrf-floor.ts`, a Content-Type floor that forces a preflight on cross-origin callers) cannot
 * reach a GET — and there is no companion same-origin check. With the session cookie defaulting to
 * SameSite=Lax (Neon Auth SDK default), a cross-site TOP-LEVEL GET navigation carries the victim's
 * cookie and ran the handler as the victim (one paid embedding on attacker-chosen text + one
 * `user_id=victim` audit row). Converting to POST with `application/json` drops the route under
 * `requireJsonContentType` for free: a cross-origin `no-cors` POST arrives as a CORS-simple
 * Content-Type and is 400'd by the floor before any spend or write, while a cross-origin
 * `fetch` with `application/json` triggers a preflight the server does not answer. This mirrors
 * `POST /api/history/search`, the established CSRF-safe "authed paid search + user-attributed audit
 * row" shape (migration 129: "The authed surfaces (library, my_works, history) attribute through
 * runAsUser exactly as ask_outcomes does"). A top-level cross-site GET now hits Next's 405 (no GET
 * handler) and never runs.
 */
// Returns `Response`, not `NextResponse`: `apiError` (the app-wide error envelope,
// docs/API_ERRORS.md) is deliberately framework-free and returns the global Web Response.
// NextResponse extends Response, so every JSON return below still satisfies this.
export async function POST(req: Request): Promise<Response> {
  const guard = await guardUser();
  if (guard.denied) return guard.denied;
  const user = guard.user;

  // CSRF Content-Type floor — BEFORE the meter and before the body parse. A cross-site no-cors
  // POST arrives as a CORS-simple Content-Type (text/plain / form-urlencoded / multipart), which
  // this 400s; a cross-origin fetch with application/json triggers a preflight the server does not
  // answer, so it never arrives. Putting this before the rate limiter means a flood of cross-site
  // text/plain POSTs cannot exhaust the victim's per-user quota — they are rejected here.
  const csrfFloor = requireJsonContentType(req);
  if (csrfFloor) return csrfFloor;

  // METERED BEFORE ANY SPEND. This route calls `embedChunks([q])` on the request path — a paid
  // DeepInfra embedding — and had NO limiter until the 2026-08-17 pre-deploy audit. The wallet
  // invariant was green over it only because `routeSpendsMoney` matched `teach()` alone while
  // being named for spend in general; both the predicate and this route are fixed together.
  //
  // The allowlist in `guardUser` is NOT the meter, and must not be mistaken for one: it is a
  // temporary protection that stops binding the moment USER_CORPUS_MULTI_USER is set, with no
  // deploy and no review. Assume it is gone (the audit's framing) and this is the only thing
  // between an authenticated account and an unbounded embedding bill.
  const limit_ = await checkCorpusSearchRateLimit(user.id);
  if (!limit_.ok) {
    return apiError(limit_.limited === 'day' ? 'RATE_LIMIT_DAY' : 'RATE_LIMIT_MINUTE', {
      retryAfterSec: limit_.retryAfterSec,
    });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    // Malformed JSON falls through to the field validations below, which produce a 400, never a
    // raw 500 — the same shape as history/search/route.ts.
    raw = {};
  }
  const body = parseBody(raw);

  const documentId = body.documentId;
  // Query log (migration 129), off the request path, fail-open. This is the user's PRIVATE
  // corpus: the row stores their own typed input and counts, attributed through runAsUser —
  // the same first-party, owner-read-only posture as ask_outcomes (which already stores the
  // question text for asks over this same corpus).
  const t0 = Date.now();
  const logSearch = (mode: string, typed: string, resultCount: number): void => {
    const logged: SearchParams = { mode };
    if (documentId !== undefined) logged.documentId = documentId;
    scheduleSearchOutcome({
      surface: 'my_works',
      userId: user.id,
      query: typed,
      params: logged,
      resultCount,
      latencyMs: Date.now() - t0,
    });
  };
  // B019 — EVERY SEARCH RETURNED EXACTLY ONE RESULT. This used to be `Number(params.get('limit'))`,
  // and `Number(null)` is 0, as is `Number('')`. `Number.isFinite(0)` is true, so an ABSENT parameter
  // became `limit: 0`, which `clampLimit` floors to 1 — and `scope.limit ?? DEFAULT_LIMIT` in
  // search.ts cannot rescue it, because `??` catches null and undefined but not zero. The shipped
  // client never sends `limit`, so this was every search on every mode.
  //
  // Absent means "no preference", which is `undefined`. An explicit `limit: 0` is also nonsense as
  // a request and lands on the same answer rather than on a silent one-result page. `coerceLimit`
  // preserves both: a missing key, a non-numeric value, an empty string, or a number <= 0 all
  // resolve to `undefined`; only a positive finite number (or its string form) is honoured.
  const limit = coerceLimit(body.limit);
  const scope = { documentId, limit };

  // ── verse presence ────────────────────────────────────────────────────────────────────────────
  // Parsed BEFORE q — a body carrying both { ref, q } answers the verse branch, matching the prior
  // query-string order (`?ref=` was checked before `?q=`).
  const ref = body.ref?.trim();
  if (ref) {
    const parsed = parseRef(ref);
    if (!parsed.ok || parsed.ref.ranges.length === 0) {
      return NextResponse.json({ error: `Could not read "${ref}" as a passage.` }, { status: 400 });
    }
    // The first range is the passage the user typed; a multi-range reference ("Rom 8; Jn 3") is a
    // Slice 2 concern and answering only the first is better than answering a merged span the user
    // did not ask for.
    const range = parsed.ref.ranges[0]!;
    // D35: this data-layer call sat OUTSIDE the try below, so a DB fault on the verse path
    // escaped as Next's raw 500 while the fused path degraded gracefully three lines down.
    // UNION 2026-08-24: the 129 query log goes INSIDE the success path — a search that threw is
    // not a search that happened, and logging it before the catch would record a phantom.
    try {
      const anchors = await verseAnchorScan(user.id, range, scope);
      logSearch('verse', ref, anchors.length);
      return NextResponse.json({ mode: 'verse', ref: parsed.ref.display, range, anchors });
    } catch (e) {
      console.error('[user-corpus] verse anchor scan failed:', String((e as Error)?.message ?? e));
      return apiError('INTERNAL');
    }
  }

  // ── text search ───────────────────────────────────────────────────────────────────────────────
  // CAPPED. `q` is embedded verbatim by `embedChunks([q])`, so an uncapped query is an uncapped
  // paid call. 500 matches the corpus /ask route's own question cap — the same shape of input
  // going to the same provider should not have two different bounds.
  const MAX_QUERY = 500;
  const qRaw = body.q?.trim();
  if (qRaw !== undefined && qRaw.length > MAX_QUERY) {
    return apiError('INVALID_REQUEST', { message: 'That search is too long. Please shorten it.' });
  }
  const q = qRaw;
  if (!q) return NextResponse.json({ error: 'Provide q or ref.' }, { status: 400 });

  if (body.mode === 'keyword') {
    // D35: likewise unwrapped.
    try {
      const hits = await keywordSearch(user.id, q, scope);
      logSearch('keyword', q, hits.length);
      return NextResponse.json({ mode: 'keyword', q, hits });
    } catch (e) {
      console.error('[user-corpus] keyword search failed:', String((e as Error)?.message ?? e));
      return apiError('INTERNAL');
    }
  }

  try {
    const [vector] = await embedChunks([q]);
    if (!vector) throw new Error('no query vector');
    const hits = await searchMyWorks(user.id, vector, q, scope);
    logSearch('fused', q, hits.length);
    return NextResponse.json({ mode: 'fused', q, hits });
  } catch (e) {
    // The embedder is the only external dependency here. Degrade to FTS rather than returning
    // nothing: a keyword answer is a worse answer, and no answer looks like an empty corpus.
    console.error('[user-corpus] search fell back to keyword:', String((e as Error)?.message ?? e));
    // D35: the FALLBACK itself was unwrapped — if FTS is what is down, the degrade path threw
    // straight out of the handler, turning a graceful degradation into a raw 500.
    // UNION 2026-08-24: the 129 log records the DEGRADED mode distinctly, so "semantic search was
    // down" is visible in the query log rather than looking like ordinary keyword usage.
    try {
      const hits = await keywordSearch(user.id, q, scope);
      logSearch('keyword-degraded', q, hits.length);
      return NextResponse.json({
        mode: 'keyword',
        q,
        degraded: 'semantic search is unavailable; showing keyword matches only',
        hits,
      });
    } catch (e2) {
      console.error('[user-corpus] keyword fallback also failed:', String((e2 as Error)?.message ?? e2));
      return apiError('INTERNAL');
    }
  }
}

/**
 * Edge validation without a new dependency: web/ has never carried zod, and five bounded fields
 * do not justify one (the same call history/search/route.ts made for one string). Type-checks each
 * field and ignores anything else; the handler does the semantic validation (ref parse, q cap,
 * mode selection). A non-object body (including `null` or a JSON primitive/array) yields an empty
 * object, which the handler turns into the 400 "Provide q or ref." — never a raw 500.
 */
interface SearchBody {
  q?: string;
  ref?: string;
  mode?: string;
  documentId?: string;
  limit?: unknown;
}

function parseBody(raw: unknown): SearchBody {
  if (typeof raw !== 'object' || raw === null) return {};
  const b = raw as Record<string, unknown>;
  const out: SearchBody = {};
  if (typeof b.q === 'string') out.q = b.q;
  if (typeof b.ref === 'string') out.ref = b.ref;
  if (typeof b.mode === 'string') out.mode = b.mode;
  if (typeof b.documentId === 'string') out.documentId = b.documentId;
  if (b.limit !== undefined) out.limit = b.limit;
  return out;
}

/**
 * The B019 limit rule as a pure function. Accepts a number (JSON native) or a numeric string (so
 * the old `limit: "5"` shape still works); an absent, empty, non-numeric, or non-positive value
 * resolves to `undefined` so `DEFAULT_LIMIT` applies in search.ts rather than `clampLimit` flooring
 * a 0 to 1.
 */
function coerceLimit(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw > 0 ? raw : undefined;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const n = Number(trimmed);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
  return undefined;
}
