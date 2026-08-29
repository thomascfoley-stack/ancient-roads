// N3 EXIT TEST — WRITTEN BEFORE THE FIX (docs/pm/QA_REMEDIATION_LEDGER.md §5b).
//
// THE DEFECT, which is N1's exactly one table over. `setShelf` and `removeFromLibrary` are the
// only writers of `library_items`, and both had ZERO call sites — so nothing in the product could
// put a work on a shelf, `listLibraryItems` could only ever return `[]`, and `/library/books`
// stayed a `ComingSoon` stub sitting behind a first-class nav entry. The table, its RLS policy,
// its UNIQUE constraint and its tenancy tests all existed and were all correct. What was missing
// was a caller, again.
//
// WHY THIS IS BUILT RATHER THAN DELETED, since bylaw 3 makes deletion an allowed remedy and the
// N4 sibling IS being kept dead. Both `chat_memories` and `library_items` are data layers built
// ahead of a `ComingSoon` surface, but they are not the same case: the study-partner surface says
// in its own copy that it arrives "with the trained model", so it cannot be built today, while a
// shelf is plain CRUD over a table that is already here — and the Library hub was ALREADY paying
// for it, querying `listLibraryItems` on every load and discarding the result (N5). The cheap
// thing was never "build the shelf"; it was "stop half-shipping it".
//
// The round trip is the assertion, for the same reason as N1: a unit test of `setShelf` would have
// passed for the whole life of the defect, because `setShelf` was never broken.
//
// Owner-seeded + dev-guarded, mirroring `library-published-boundary.test.ts` and
// `reading-progress-round-trip.test.ts`.

import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { listLibraryItems } from '@/lib/library';
import { ensureDbEnv, seedOwnerUrl } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';
import { sweepQaResidue } from '../helpers/qa-residue';

ensureDbEnv();

let signedIn: { id: string; email: string } | null = null;
vi.mock('@/lib/session', () => ({
  requireUser: async () => {
    if (!signedIn) throw new Error('Unauthorized');
    return signedIn;
  },
  currentUser: async () => signedIn,
  authFailureResponse: (_e: unknown) => Response.json({ error: 'Please sign in to continue.' }, { status: 401 }),
}));

// The REAL shipped handlers.
import { DELETE, GET, PUT } from '@/app/api/work/[slug]/shelf/route';

const ownerConn = seedOwnerUrl();
const appConn = process.env.APP_DATABASE_URL;
const SLUG = `qa-shelf-${Date.now()}`;
const USER = `qa-shelf-user-${Date.now()}`;
let owner: pg.Client | undefined;
let sourceId = '';

const setStatus = (status: string) =>
  owner!.query('UPDATE sources SET status = $1 WHERE slug = $2', [status, SLUG]);

/** Restore to published ONLY when something actually moved it — see the beforeEach note. */
const republish = () =>
  owner!.query(`UPDATE sources SET status = 'published' WHERE slug = $1 AND status <> 'published'`, [SLUG]);

const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
const url = (slug: string) => `https://test.local/api/work/${slug}/shelf`;

const put = (slug: string, body: unknown) =>
  PUT(new Request(url(slug), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), ctx(slug));
const del = (slug: string) => DELETE(new Request(url(slug), { method: 'DELETE' }), ctx(slug));
const get = (slug: string) => GET(new Request(url(slug)), ctx(slug));

/** Owner-side truth, so "nothing was written" cannot be satisfied by RLS hiding a row. */
async function storedShelves(): Promise<string[]> {
  const { rows } = await owner!.query<{ shelf: string }>(
    'SELECT shelf FROM library_items WHERE user_id = $1',
    [USER],
  );
  return rows.map((r) => r.shelf);
}

const SKIP = announceSkip(
  'N3 — a work a reader saves reaches their shelf and comes back',
  [
    { name: 'APP_DATABASE_URL (app_runtime)', present: Boolean(appConn) },
    { name: 'DATABASE_URL (owner seed connection via seedOwnerUrl)', present: Boolean(ownerConn) },
  ],
  'the whole shelf loop: reader → /api/work/[slug]/shelf → library_items → listLibraryItems',
);

describe.skipIf(SKIP)('N3 — a work a reader saves reaches their shelf and comes back', () => {
  beforeAll(async () => {
    owner = new pg.Client({ connectionString: ownerConn!, ssl: { rejectUnauthorized: false } });
    await owner.connect();
    // An ALLOWED_LICENSES value: Gate B fail-closes on any PUBLISHED row outside that set, and a
    // leaked fixture turned the shared audit gate red on 2026-07-19.
    const { rows } = await owner.query<{ id: string }>(
      `INSERT INTO sources (slug, title, author, source_type, tradition, era, license, provenance, status)
       VALUES ($1, 'QA shelf work', 'QA Author', 'sermon', 'qa', 'qa', 'Public Domain', '{}', 'published')
       RETURNING id`,
      [SLUG],
    );
    sourceId = rows[0]!.id;
    // SECTIONS ARE REQUIRED, even though nothing in this file reads one.
    //
    // A PUBLISHED source joins every corpus-wide invariant on the target, and
    // `unit-ordinal-instrument.test.ts` asserts `digests.length === publishedWorks` over the whole
    // published cohort. It counts SOURCES for one side and produces a digest per work WITH
    // SECTIONS for the other, so a published fixture carrying no sections is counted and never
    // digested: "expected 125 to be 126", from a sibling worker, with nothing wrong in the corpus.
    // Isolated by running the instrument against each fixture separately — this file reproduced it
    // 3/3, the sectioned one 0/3.
    //
    // unit_ordinal EQUALS ordinal for the same reason as the sibling suite: 024 decides
    // verse-anchoredness by `heading IS NULL`, and these rows have headings, so it computes one
    // unit per section. Any other grouping is a "grouping break" to the same instrument.
    await owner.query(
      `INSERT INTO sections (source_id, ordinal, unit_ordinal, heading, body)
       VALUES ($1, 1, 1, 'QA shelf one', 'first'), ($1, 2, 2, 'QA shelf two', 'second')`,
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
    await attempt('quarantine seeded source', () =>
      owner!.query(`UPDATE sources SET status = 'quarantined' WHERE slug LIKE 'qa-shelf-%'`),
    );
    await attempt('shelf rows', () =>
      owner!.query(
        `DELETE FROM library_items WHERE user_id LIKE 'qa-shelf-user-%'
            OR source_id IN (SELECT id FROM sources WHERE slug LIKE 'qa-shelf-%')`,
      ),
    );
    await attempt('sections', () =>
      owner!.query(`DELETE FROM sections WHERE source_id IN (SELECT id FROM sources WHERE slug LIKE 'qa-shelf-%')`),
    );
    await attempt('sources', () => owner!.query(`DELETE FROM sources WHERE slug LIKE 'qa-shelf-%'`));
    // The prefix sweep that reaps an INTERRUPTED run — see helpers/qa-residue.ts (N6).
    await attempt('prefix sweep', () => sweepQaResidue(['qa-shelf-user-'], ['library_items']));
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
    await owner!.query('DELETE FROM library_items WHERE user_id = $1', [USER]);
  });

  it('BASELINE: nothing is on the shelf, and the work reports itself unsaved', async () => {
    expect(await listLibraryItems(USER)).toEqual([]);
    const res = await get(SLUG);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ shelf: null });
  });

  // THE EXIT TEST.
  it('a saved work appears on the shelf', async () => {
    const res = await put(SLUG, { shelf: 'saved' });
    expect(res.status, await res.text().catch(() => '')).toBe(200);

    const items = await listLibraryItems(USER);
    expect(items).toHaveLength(1);
    expect(items[0]!.slug).toBe(SLUG);
    expect(items[0]!.title).toBe('QA shelf work');
    expect(items[0]!.shelf).toBe('saved');

    // And the reader is told, so the control can render its state.
    expect(await (await get(SLUG)).json()).toEqual({ shelf: 'saved' });
  });

  it('unsaving removes it', async () => {
    await put(SLUG, { shelf: 'saved' });
    const res = await del(SLUG);
    expect(res.status).toBe(200);
    expect(await listLibraryItems(USER)).toEqual([]);
    expect(await storedShelves()).toEqual([]);
  });

  // 027's UNIQUE(user_id, source_id): a work is on exactly ONE shelf.
  it('re-shelving moves the work rather than adding a second row', async () => {
    await put(SLUG, { shelf: 'saved' });
    await put(SLUG, { shelf: 'reading' });
    expect(await storedShelves()).toEqual(['reading']);
    const items = await listLibraryItems(USER);
    expect(items).toHaveLength(1);
    expect(items[0]!.shelf).toBe('reading');
  });

  it('a signed-out reader gets 401 from every verb, and writes nothing', async () => {
    signedIn = null;
    expect((await get(SLUG)).status).toBe(401);
    expect((await put(SLUG, { shelf: 'saved' })).status).toBe(401);
    expect((await del(SLUG)).status).toBe(401);
    expect(await storedShelves()).toEqual([]);
  });

  // LICENSING FAIL-CLOSED, the same rule the read paths carry: a withdrawn work must not keep
  // accruing shelf rows. The owner-side read is what makes this real — RLS would hide the row
  // from the app either way.
  it('a withdrawn work 404s and writes nothing', async () => {
    await setStatus('quarantined');
    const res = await put(SLUG, { shelf: 'saved' });
    expect(res.status).toBe(404);
    expect(await storedShelves()).toEqual([]);
  });

  it('404s an unknown slug without writing', async () => {
    expect((await put('no-such-work-at-all', { shelf: 'saved' })).status).toBe(404);
    expect(await storedShelves()).toEqual([]);
  });

  it.each([
    ['an unknown shelf name', { shelf: 'wishlist' }],
    ['a missing shelf', {}],
    ['a non-string shelf', { shelf: 7 }],
    ['SQL-ish junk', { shelf: "saved'; DROP TABLE library_items; --" }],
  ])('rejects %s at the edge, without writing', async (_label, body) => {
    const res = await put(SLUG, body);
    expect(res.status).toBe(400);
    expect(await storedShelves()).toEqual([]);
  });

  it('a malformed body is a 400, not a 500', async () => {
    const res = await PUT(
      new Request(url(SLUG), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: 'not json' }),
      ctx(SLUG),
    );
    expect(res.status).toBe(400);
    expect(await storedShelves()).toEqual([]);
  });

  // The published predicate on the READ side, which lib/library.ts's header calls load-bearing:
  // a work shelved while published must vanish from the shelf the moment it is withdrawn.
  it('a work withdrawn after shelving disappears from the shelf', async () => {
    await put(SLUG, { shelf: 'saved' });
    expect(await listLibraryItems(USER)).toHaveLength(1);
    await setStatus('staged');
    expect(await listLibraryItems(USER)).toEqual([]);
    // The row SURVIVES — the predicate filters, it does not delete, so re-publishing restores it.
    expect(await storedShelves()).toEqual(['saved']);
  });
});
