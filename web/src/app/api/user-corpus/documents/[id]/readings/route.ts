import { NextRequest, NextResponse, after } from 'next/server';
import { getDocument } from '@/lib/user-corpus/documents';
import { runReadingsJob } from '@/lib/user-corpus/readings-job';
import { listReadings, readingsState, setReadingsState, setSearchCategories } from '@/lib/user-corpus/readings-store';
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
  const { id } = await ctx.params;

  const doc = await getDocument(user.id, id);
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (doc.status !== 'ready') {
    return NextResponse.json(
      { error: 'That document is still being indexed, so there is nothing to search with yet.' },
      { status: 409 },
    );
  }
  if (doc.readingsStatus === 'running') {
    // Not an error the user can act on, and re-entering would double the work on one document.
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

  await setSearchCategories(user.id, id, categories);
  await setReadingsState(user.id, id, { status: 'pending', progress: 0, step: null, error: null });

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
