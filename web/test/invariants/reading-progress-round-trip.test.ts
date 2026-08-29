// N1 EXIT TEST — WRITTEN BEFORE THE FIX (docs/pm/QA_REMEDIATION_LEDGER.md §5b).
//
// THE DEFECT. `saveReadingProgress` (lib/library.ts) is the ONLY writer of `reading_progress`,
// and it had ZERO call sites. `listContinueReading` reads that table, so it could only ever
// return `[]`, so the "Continue reading" section on the Library hub — which renders only when
// `mine.reading.length > 0` — was permanently absent for every account and always had been.
//
// WHY NOBODY REPORTED IT IN THIRTY QA SESSIONS. It renders as ABSENT, not as broken. There is no
// error, no empty state, no spinner: the section simply is not there, and a reader who has never
// seen it cannot miss it. That is the same shape as the A7b bookmark finding (the write path had
// zero call sites while the table and its tests existed), and it is why this test asserts the
// ROUND TRIP rather than the writer: a unit test of `saveReadingProgress` would have passed
// happily for the entire life of the defect, because the function was always correct. What was
// missing was the caller. So the check has to start where the reader actually is — an HTTP
// request from the work reader — and end where the reader actually looks, `listContinueReading`.
//
// THE BASELINE CASE IS LOAD-BEARING, not ceremony. Without it, "Continue reading returns the
// work" could pass against a query that returns every work in the corpus. The pair — empty
// before, exactly-this-work after — is what makes the assertion mean anything.
//
// Owner-only + dev-guarded, exactly like `library-published-boundary.test.ts` next door: seeding
// a throwaway `sources` row needs the owner role (app_runtime is SELECT-only on the corpus,
// migration 010). The user-scoped writes go through `runAsUser` exactly as the app does, so RLS
// is exercised rather than bypassed. Everything seeded is torn down in afterAll, including on
// failure.

import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { listContinueReading } from '@/lib/library';
import { ensureDbEnv, seedOwnerUrl } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';

// runAsUser()/getDb() read process.env; ensureDbEnv copies the URL out of web/.env.local into it.
ensureDbEnv();

// The session, faked at the module boundary the route actually imports. `signedIn` is flipped
// per-case so the 401 leg is the SAME route under a different session, not a different code path.
let signedIn: { id: string; email: string } | null = null;
vi.mock('@/lib/session', () => ({
  requireUser: async () => {
    if (!signedIn) throw new Error('Unauthorized');
    return signedIn;
  },
  currentUser: async () => signedIn,
  authFailureResponse: (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 401 });
  },
}));

// The REAL shipped handler. If this import fails to resolve, the route does not exist and the
// defect is still open — which is the first red this file was written to produce.
import { POST } from '@/app/api/work/[slug]/progress/route';

const ownerConn = seedOwnerUrl();
const appConn = process.env.APP_DATABASE_URL;
const SLUG = `qa-reading-progress-${Date.now()}`;
const USER = `qa-readprog-${Date.now()}`;
let owner: pg.Client | undefined;
let sourceId = '';

const setStatus = (status: string) =>
  owner!.query('UPDATE sources SET status = $1 WHERE slug = $2', [status, SLUG]);

/** Restore to published ONLY when something actually moved it — see the beforeEach note. */
const republish = () =>
  owner!.query(`UPDATE sources SET status = 'published' WHERE slug = $1 AND status <> 'published'`, [SLUG]);

/** Drive the shipped route the way the browser does. */
function post(slug: string, body: unknown): Promise<Response> {
  return POST(
    new Request(`https://test.local/api/work/${slug}/progress`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ slug }) },
  );
}

/** Rows straight from the table, owner-side — so an assertion cannot be satisfied by RLS
 *  hiding a row that WAS written. "Nothing was written" must mean nothing, not "not visible". */
async function storedRows(): Promise<Array<{ last_ordinal: number; percent: number | null }>> {
  const { rows } = await owner!.query<{ last_ordinal: number; percent: number | null }>(
    'SELECT last_ordinal, percent FROM reading_progress WHERE user_id = $1',
    [USER],
  );
  return rows;
}

const SKIP = announceSkip(
  'N1 — a reader’s position reaches the account and returns on the Library hub',
  [
    { name: 'APP_DATABASE_URL (app_runtime)', present: Boolean(appConn) },
    { name: 'DATABASE_URL (owner seed connection via seedOwnerUrl)', present: Boolean(ownerConn) },
  ],
  'the whole Continue-reading loop: reader → /api/work/[slug]/progress → reading_progress → listContinueReading',
);

describe.skipIf(SKIP)('N1 — a reader’s position reaches the account and returns on the Library hub', () => {
  beforeAll(async () => {
    owner = new pg.Client({ connectionString: ownerConn!, ssl: { rejectUnauthorized: false } });
    await owner.connect();
    // license MUST be one of ALLOWED_LICENSES: Gate B (src/ingest/check-licenses.ts) fail-closes
    // on any PUBLISHED row whose license is outside that set, and a leaked fixture turned the
    // shared audit gate red on 2026-07-19. See the neighbour's note.
    const { rows } = await owner.query<{ id: string }>(
      `INSERT INTO sources (slug, title, author, source_type, tradition, era, license, provenance, status)
       VALUES ($1, 'QA reading-progress work', 'QA Author', 'sermon', 'qa', 'qa', 'Public Domain', '{}', 'published')
       RETURNING id`,
      [SLUG],
    );
    sourceId = rows[0]!.id;
    // unit_ordinal MUST EQUAL ordinal HERE, and that is not cosmetic.
    //
    // This fixture is PUBLISHED, and `unit-ordinal-instrument.test.ts` scans every published work
    // on the target and re-derives `unit_ordinal` by migration 024's rule. 024 groups by whether a
    // section is verse-anchored, which it decides by `heading IS NULL`; these rows all HAVE
    // headings, so 024 computes one unit per section — 1, 2, 3.
    //
    // The first version of this seed used (1,1,2), which is a perfectly sensible shape for a
    // chunked work and is exactly what 024 would never produce for heading-bearing rows. The
    // instrument caught it as "grouping break: stored unit 1 maps to computed 1 and 2" — but only
    // INTERMITTENTLY, because it only sees this fixture during the window in which it is published,
    // and vitest interleaves the two files differently from run to run. So it was a flake this
    // suite introduced into a SHARED gate, which is the same class as the 2026-07-19 licensing
    // fixture that turned Gate B red (see the note above about ALLOWED_LICENSES).
    //
    // The lesson generalises past this line: a fixture that publishes a source joins every
    // corpus-wide invariant on the target, and must satisfy them all, not just its own.
    await owner.query(
      `INSERT INTO sections (source_id, ordinal, unit_ordinal, heading, body)
       VALUES ($1, 1, 1, 'QA one', 'first'), ($1, 2, 2, 'QA two', 'second'), ($1, 3, 3, 'QA three', 'third')`,
      [sourceId],
    );
  }, 60_000);

  afterAll(async () => {
    if (!owner) return;
    const attempt = async (label: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (e) {
        console.error(`[teardown] ${label} failed: ${(e as Error).message}`);
      }
    };
    // Force OUT of 'published' before deletion: an abort between here and the delete must not
    // strand a published QA row for Gate B to find. Swept by slug PREFIX so an earlier
    // interrupted run is reaped too, not just this one.
    await attempt('quarantine seeded source', () =>
      owner!.query(`UPDATE sources SET status = 'quarantined' WHERE slug LIKE 'qa-reading-progress-%'`),
    );
    await attempt('progress rows', () =>
      owner!.query(
        `DELETE FROM reading_progress WHERE user_id LIKE 'qa-readprog-%'
            OR source_id IN (SELECT id FROM sources WHERE slug LIKE 'qa-reading-progress-%')`,
      ),
    );
    await attempt('sections', () =>
      owner!.query(`DELETE FROM sections WHERE source_id IN (SELECT id FROM sources WHERE slug LIKE 'qa-reading-progress-%')`),
    );
    await attempt('sources', () => owner!.query(`DELETE FROM sources WHERE slug LIKE 'qa-reading-progress-%'`));
    await attempt('close', () => owner!.end());
  }, 60_000);

  // The `AND status <> 'published'` guard makes this a no-op write in the common case, so only the
  // cases that genuinely withdraw the work write a new row version. That is hygiene, not a fix: it
  // was tried as a cure for a `unit-ordinal-instrument` failure and did NOT cure it (3/3 still red).
  // The actual cause was a published fixture with no sections — see the beforeAll seed. Recorded
  // because a plausible-but-wrong explanation left in a comment is worse than no comment.
  beforeEach(async () => {
    signedIn = { id: USER, email: 'qa@test.local' };
    await republish();
    await owner!.query('DELETE FROM reading_progress WHERE user_id = $1', [USER]);
  });

  it('BASELINE: with nothing read, Continue reading is empty for this account', async () => {
    expect(await listContinueReading(USER)).toEqual([]);
  });

  // THE EXIT TEST. Red until the route exists AND writes.
  it('a position posted from the reader comes back on the Library hub', async () => {
    const res = await post(SLUG, { ordinal: 2, percent: 0.5 });
    expect(res.status, await res.text().catch(() => '')).toBe(200);

    const rows = await listContinueReading(USER);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.slug).toBe(SLUG);
    expect(rows[0]!.title).toBe('QA reading-progress work');
    expect(rows[0]!.lastOrdinal).toBe(2);
    // `percent` is a PG `real`, so it round-trips as a float32 — never assert equality.
    expect(rows[0]!.percent).toBeCloseTo(0.5, 5);
  });

  it('reading on moves the cursor rather than accumulating rows (028 upserts)', async () => {
    await post(SLUG, { ordinal: 1, percent: 0.1 });
    await post(SLUG, { ordinal: 3, percent: 0.9 });

    expect(await storedRows()).toHaveLength(1);
    const rows = await listContinueReading(USER);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.lastOrdinal).toBe(3);
    expect(rows[0]!.percent).toBeCloseTo(0.9, 5);
  });

  it('a signed-out reader gets 401 and writes nothing', async () => {
    signedIn = null;
    const res = await post(SLUG, { ordinal: 2, percent: 0.5 });
    expect(res.status).toBe(401);
    expect(await storedRows()).toEqual([]);
  });

  // LICENSING FAIL-CLOSED. A work that has been staged or quarantined is withdrawn; the reader
  // route already 404s it, and the progress route must not keep writing rows that name it. The
  // owner-side read is what makes this a real check — RLS would hide the row from the app either
  // way, so "listContinueReading is empty" alone would pass against a route that wrote happily.
  it('a withdrawn work 404s and writes nothing', async () => {
    await setStatus('quarantined');
    const res = await post(SLUG, { ordinal: 2, percent: 0.5 });
    expect(res.status).toBe(404);
    expect(await storedRows()).toEqual([]);
  });

  it('404s an unknown slug without writing', async () => {
    const res = await post('no-such-work-at-all', { ordinal: 1, percent: 0 });
    expect(res.status).toBe(404);
    expect(await storedRows()).toEqual([]);
  });

  // VALIDATE AT THE EDGE (CLAUDE.md): 028 carries CHECK constraints on both columns, and a route
  // that lets the DB be its validator turns a bad client into a 500 and a log line. Each of these
  // would be refused by the constraint too — the point is that they are refused BEFORE that.
  //
  // A NaN CASE WAS WRITTEN HERE AND REMOVED, because it could not fail honestly: JSON has no NaN
  // literal, so `JSON.stringify({ percent: NaN })` emits `{"percent":null}` and `JSON.parse` can
  // never produce one. The route answered 200 because it had correctly been handed a null. The
  // `Number.isFinite` guard in `parseProgressBody` is still real and still load-bearing — it is
  // simply unreachable from HTTP, so it is proven in `reading-progress-contract.test.ts`, where
  // the function is called directly and NaN is an input a caller can actually pass.
  it.each([
    ['ordinal below 1', { ordinal: 0, percent: 0.5 }],
    ['a non-integer ordinal', { ordinal: 2.7, percent: 0.5 }],
    ['a missing ordinal', { percent: 0.5 }],
    ['a non-numeric ordinal', { ordinal: 'two', percent: 0.5 }],
    ['percent above 1', { ordinal: 1, percent: 1.4 }],
    ['percent below 0', { ordinal: 1, percent: -0.2 }],
  ])('rejects %s at the edge, without writing', async (_label, body) => {
    const res = await post(SLUG, body);
    expect(res.status).toBe(400);
    expect(await storedRows()).toEqual([]);
  });

  it('accepts a null percent — a work whose length is not yet known', async () => {
    const res = await post(SLUG, { ordinal: 1, percent: null });
    expect(res.status).toBe(200);
    const rows = await listContinueReading(USER);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.percent).toBeNull();
  });

  it('a malformed body is a 400, not a 500', async () => {
    const res = await POST(
      new Request(`https://test.local/api/work/${SLUG}/progress`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not json at all',
      }),
      { params: Promise.resolve({ slug: SLUG }) },
    );
    expect(res.status).toBe(400);
    expect(await storedRows()).toEqual([]);
  });
});
