import { NextRequest, NextResponse, after } from 'next/server';
import { checkCorpusSearchRateLimit } from '@/lib/rate-limit';
import { getDocument } from '@/lib/user-corpus/documents';
import { runReadingsJob } from '@/lib/user-corpus/readings-job';
import { READINGS_STALE_MS, claimReadingsStart, listReadings, readingsState, setReadingsState, setSearchCategories, readingsStartRefused } from '@/lib/user-corpus/readings-store';
import { guardUser } from '@/lib/user-corpus/route-guard';
import { DEFAULT_CATEGORIES, sanitiseCategories } from '@/lib/user-corpus/suggested-readings';

export const runtime = 'nodejs';
// The job runs inside `after()` on this invocation, and searching all five categories exactly is
// ~49s measured, with the owner accepting ~90s for accuracy. 30 would kill it mid-search — the
// setting he asked for would be the one that never worked.
export const maxDuration = 300;

interface Ctx {
  params: Promise<{ id: string }>;
}

/** Stored readings + the job's progress. Cheap: a read of rows already computed. */
export async function GET(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const guard = await guardUser();
  if (guard.denied) return guard.denied;
  const user = guard.user;
  const { id } = await ctx.params;

  const state = await readingsState(user.id, id);
  if (!state) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const readings = state.count > 0 ? await listReadings(user.id, id) : [];
  return NextResponse.json({ ...state, categories: state.categories ?? DEFAULT_CATEGORIES, readings });
}

/**
 * Choose categories and (re-)run the search.
 *
 * The categories are saved BEFORE the job is kicked, so a refresh mid-search shows what is being
 * searched rather than what was searched last time.
 */
export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const guard = await guardUser();
  if (guard.denied) return guard.denied;
  const user = guard.user;

  // METERED (H8): each accepted POST runs a ~300 s unindexed corpus scan inside after(). The
  // corpus-search limiter is the ceiling here per the H8 order — shared buckets with
  // /api/user-corpus/search, both being reads of the corpus on this user's behalf. Plain string
  // error: the client renders `error` as a string (H6).
  const limit_ = await checkCorpusSearchRateLimit(user.id);
  if (!limit_.ok) {
    return NextResponse.json(
      { error: 'Too many searches. Please wait a moment and try again.', retryAfterSec: limit_.retryAfterSec },
      // D34: docs/API_ERRORS.md — "Retry-After is required on every 429 ... so clients back off
      // instead of hammering a paid endpoint". The plain-string `error` shape here is deliberate
      // (H6: the client reads a string), but nothing ever justified omitting the HEADER; the
      // sibling routes that use apiError get it for free. These are the paid endpoints.
      { status: 429, headers: { 'Retry-After': String(limit_.retryAfterSec ?? 60) } },
    );
  }

  const { id } = await ctx.params;

  const doc = await getDocument(user.id, id);
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (doc.status !== 'ready') {
    return NextResponse.json(
      { error: 'That document is still being indexed, so there is nothing to search with yet.' },
      { status: 409 },
    );
  }
  // B015 ("suggested readings never completes") — the guard below used to be unconditional, and
  // that is what BRICKED a document. The job runs in `after()`, which the platform may recycle
  // between the `running` write and any terminal write; die there and the status is `running`
  // forever, the panel polls forever, and this 409 refuses every restart. One crash, no way out
  // short of SQL. The 2026-08-17 authenticated QA session hit exactly that symptom.
  //
  // The staleness key is `updated_at`, which every setReadingsState touches — including each
  // per-category progress write — so a LIVE run's heartbeat advances at least every category
  // (~10s apart, ~49-90s total, hard-bounded by the route's maxDuration = 300). Ten minutes is
  // beyond every legitimate case by more than 2x, so a `running` older than that is a corpse and
  // re-running is recovery, not double work.
  // `readingsStartRefused`, not `readingsRunRefused` (H8): this route writes 'pending' before the
  // kick, so a guard that only rejects 'running' waves every back-to-back POST through. The wider
  // predicate refuses a live pending too, with the same staleness escape.
  if (readingsStartRefused(doc.readingsStatus, doc.updatedAt, Date.now())) {
    // Not an error the user can act on, and re-entering would double the work on one document.
    // The staleness/fail-closed reasoning lives on the predicate itself (readings-store.ts).
    return NextResponse.json({ error: 'That search is already running.' }, { status: 409 });
  }

  let categories = DEFAULT_CATEGORIES;
  try {
    const body = (await req.json()) as { categories?: unknown };
    if (body && 'categories' in body) categories = sanitiseCategories(body.categories);
  } catch {
    // No body is a valid request: re-run with whatever the document already had.
    categories = doc.searchCategories ? sanitiseCategories(doc.searchCategories) : DEFAULT_CATEGORIES;
  }

  // The CAS half of H8: the read-guard above 409s back-to-back posts with a human message, but
  // two SAME-INSTANT posts can both pass a read. One atomic claim decides the winner; the loser
  // gets the same 409 the read-guard gives. The claim runs BEFORE setSearchCategories — that
  // write bumps updated_at, the staleness heartbeat, so done first it would make a stale
  // crashed-kick 'pending' look fresh and wedge the escape hatch shut (caught red by the
  // stale-escape leg of readings-reentrancy).
  const won = await claimReadingsStart(user.id, id, READINGS_STALE_MS);
  if (!won) {
    return NextResponse.json(
      { error: 'A suggested-readings search is already running for this document.' },
      { status: 409 },
    );
  }
  await setSearchCategories(user.id, id, categories);

  try {
    after(async () => {
      await runReadingsJob(user.id, id, categories);
    });
  } catch (e) {
    // The row already says 'pending', so a scheduling failure must say so rather than leave a
    // document waiting for a job that was never queued.
    await setReadingsState(user.id, id, {
      status: 'failed',
      error: `could not start the search: ${String((e as Error)?.message ?? e)}`.slice(0, 300),
    });
    return NextResponse.json({ error: 'That search could not be started.' }, { status: 500 });
  }

  return NextResponse.json({ status: 'pending', categories }, { status: 202 });
}
