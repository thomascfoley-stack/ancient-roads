import { requireUser } from '@/lib/session';
import { apiError } from '@/lib/api-error';
import { requireJsonContentType } from '@/lib/csrf-floor';
import { saveReadingProgress } from '@/lib/library';
import { publishedSourceId } from '@/lib/work';
import { parseProgressBody } from '@/lib/work-reader';

// POST /api/work/[slug]/progress — record where a signed-in reader has got to in a work
// (docs/LIBRARY_READER_DESIGN.md §4, migration 028).
//
// WHY THIS ROUTE EXISTS AT ALL. `saveReadingProgress` shipped with the table, the RLS policy and
// a test, and then had ZERO call sites for the life of the feature — so `listContinueReading`
// could only ever return `[]` and the Library hub's "Continue reading" section was permanently
// absent for every account (ledger N1). The data layer was never the missing part; this is.
//
// THE WRITE IS NOT ON A RENDER PATH. The caller is a throttled, fire-and-forget `fetch` from the
// Book Reader (app/work/[slug]/page.tsx) — the reader's scroll never awaits it, and a failure is
// a lost convenience rather than a lost page, because the per-device localStorage record still
// holds the position. `shouldSyncProgress` in lib/work-reader.ts is the cadence.
//
// PUBLISHED-ONLY, and that is a licensing rule rather than a tidiness one. `reading_progress`
// carries a plain FK to `sources(id)`, which cannot express "…and only while published", so a
// withdrawn work's rows survive a quarantine. Every read path in lib/library.ts re-asserts the
// predicate for that reason; the WRITE path asserts it too, so a work that has been staged or
// quarantined stops accruing new rows the moment it is withdrawn rather than only being filtered
// out on the way back. Uses the same `publishedSourceId` the sibling reader routes resolve
// through, so there is one definition of "a work you may read" and it cannot drift.
//
// NOT RATE-LIMITED, deliberately, and this is the reasoning rather than an omission. The write is
// an idempotent UPSERT on 028's UNIQUE(user_id, source_id): the row count is bounded by (accounts
// x published works) no matter how often it is called, so there is no growth to cap. It requires
// a session, it spends nothing upstream, and it is the same posture as the sibling authenticated
// write routes (/api/annotations, /api/studies). The unauthenticated read routes next door ARE
// throttled (publicReadThrottle) because they are unauthenticated and each request is a full-text
// or keyset scan; neither is true here. If this ever grows a cost, the limiter goes in front.

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }): Promise<Response> {
  // requireUser in its OWN try, whose catch returns UNAUTHENTICATED and nothing else. Four routes
  // wrapped auth and the DB call in one try (pre-deploy audit A1-16), so an RLS refusal — the very
  // condition the isolation design exists to produce — arrived at the client as "signed out".
  let user: { id: string };
  try {
    user = await requireUser();
  } catch {
    return apiError('UNAUTHENTICATED');
  }

  const csrfFloor = requireJsonContentType(req);
  if (csrfFloor) return csrfFloor;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError('INVALID_REQUEST', { message: 'Expected a JSON body.' });
  }

  const position = parseProgressBody(raw);
  if (!position) {
    return apiError('INVALID_REQUEST', {
      message: 'Expected an integer ordinal of 1 or more, and a percent between 0 and 1 or null.',
    });
  }

  const { slug } = await ctx.params;
  const sourceId = await publishedSourceId(slug);
  // Same shape as the sibling GET /api/work/[slug]: a staged, quarantined or unknown work is a
  // 404, never a leak of which of the three it was.
  if (sourceId === null) return Response.json({ error: 'not found' }, { status: 404 });

  try {
    await saveReadingProgress(user.id, String(sourceId), position.ordinal, position.percent);
  } catch (e) {
    // Never a bare catch: a DB failure is a 500, distinct from the 401 above. The slug is safe to
    // log (it is public corpus metadata); the user id is not, and is not logged.
    console.error(`[work/progress] save failed for ${slug}: ${(e as Error).message}`);
    return apiError('INTERNAL');
  }

  return Response.json({ ok: true });
}
