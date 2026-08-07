// PHASE 4 REQUIREMENT A — the published-status predicate, written BEFORE the implementation.
//
// THE HAZARD (found in the Phase 3 audit): `library_items.source_id` and
// `reading_progress.source_id` are plain FKs to `sources(id)`. A foreign key CANNOT express
// "...and only while that source is published". So a user can shelf a work while it is published,
// the work is later STAGED or QUARANTINED (a licensing action — CLAUDE.md treats licensing as
// existential and fail-closed), and the shelf row survives untouched. If any library / catalog /
// search query joins `sources` without re-asserting `status = 'published'`, the library will list
// and LINK a quarantined work while `/api/work/[slug]` correctly 404s it.
//
// That is not merely an inconsistent surface: it is a licensing exposure, because the thing the
// quarantine was supposed to withdraw is still being surfaced to the user.
//
// So every read path in Phase 4 must re-assert the predicate itself. This test is the enforcement:
// it shelves a work, flips the source to 'staged' behind the user's back, and demands the work
// vanish from EVERY user-facing surface while the reader route 404s it.
//
// Owner-only + dev-guarded: seeding a throwaway `sources` row needs the owner role (app_runtime is
// SELECT-only on the corpus). The user-scoped writes go through runAsUser exactly as the app does.
// Everything seeded here is torn down in afterAll — including on failure.

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET as getWork } from '@/app/api/work/[slug]/route';
import { listCatalogWorks } from '@/lib/catalog';
import { listContinueReading, listLibraryItems } from '@/lib/library';
import { searchSections } from '@/lib/search-sections';
import { runAsUser } from '@/lib/db';
import {ensureDbEnv, seedOwnerUrl } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';

// runAsUser()/getDb() read process.env; ensureDbEnv copies the URL out of web/.env.local into it.
// Without this the user-scoped writes below throw "APP_DATABASE_URL or DATABASE_URL must be set".
ensureDbEnv();

function ownerUrl(): string | undefined {
  // ONE definition, in helpers/env.ts: refuses production LOUDLY, allows dev/localhost,
  // and allows any other endpoint only when declared by exact id in SEED_TEST_ENDPOINT.
  // Was a hardcoded dev-endpoint regex, which made this suite un-runnable in CI.
  return seedOwnerUrl();
}

const ownerConn = ownerUrl();
// Skip messaging must name the exact missing var — do not treat DATABASE_URL as APP.
const appConn = process.env.APP_DATABASE_URL;
const SLUG = `qa-published-boundary-${Date.now()}`;
const USER = `qa-libbound-${Date.now()}`;
// Unique, unlikely-to-collide search token for the searchSections leg of this proof.
const TOKEN = `zzqatoken${Date.now()}`;
let owner: pg.Client | undefined;
let sourceId = '';

const setStatus = (status: string) =>
  owner!.query('UPDATE sources SET status = $1 WHERE slug = $2', [status, SLUG]);

function callWork(slug: string): Promise<Response> {
  return getWork(new Request(`https://test.local/api/work/${slug}`), { params: Promise.resolve({ slug }) });
}

// A DB-less run must READ as NOT RUN, not as coverage — see helpers/loud-skip.ts.
const SKIP = announceSkip(
  'Phase 4 §A — a shelved work that is later staged/quarantined disappears from every surface',
  [
    { name: 'APP_DATABASE_URL (app_runtime via requireDbInCi)', present: Boolean(appConn) },
    { name: 'DATABASE_URL (owner seed connection via seedOwnerUrl)', present: Boolean(ownerConn) },
  ],
  'the published-status boundary across every read surface',
);

describe.skipIf(SKIP)('Phase 4 §A — a shelved work that is later staged/quarantined disappears from every surface', () => {
  beforeAll(async () => {
    owner = new pg.Client({ connectionString: ownerConn!, ssl: { rejectUnauthorized: false } });
    await owner.connect();
    // license MUST be a value in ALLOWED_LICENSES ('Public Domain' | 'CC BY' | 'CC BY-SA').
    // This test necessarily seeds a PUBLISHED source, and Gate B (src/ingest/check-licenses.ts)
    // fail-closes on any published row whose license is not in that set. Seeding
    // 'public-domain' (lower-hyphen) leaked twice on 2026-07-19 and turned the SHARED audit gate
    // red — a test poisoning a shared gate, the same class this suite's neighbours were fixed for.
    // Using an allowed value means even leaked residue cannot fail Gate B.
    // (The 024 seed uses 'public-domain' but seeds status='staged'; Gate B only inspects
    // published rows, which is why it never bit there.)
    const { rows } = await owner.query<{ id: string }>(
      `INSERT INTO sources (slug, title, author, source_type, tradition, era, license, provenance, status)
       VALUES ($1, 'QA published-boundary work', 'QA', 'sermon', 'qa', 'qa', 'Public Domain', '{}', 'published')
       RETURNING id`,
      [SLUG],
    );
    sourceId = rows[0]!.id;
    await owner.query(
      // A UNIQUE token so full-text search can find this work deterministically — the catalog and
      // search surfaces are read paths with the same published hazard, and requirement A says the
      // proof must travel to them, not stop at the two surfaces that existed when it was written.
      `INSERT INTO sections (source_id, ordinal, unit_ordinal, heading, body) VALUES ($1, 1, 1, 'QA heading', $2)`,
      [sourceId, `QA body text mentioning ${TOKEN} exactly once.`],
    );
    // The user shelves it and starts reading it, while it is legitimately published.
    await runAsUser(USER, (sql) => [
      sql`INSERT INTO library_items (user_id, source_id, shelf) VALUES (${USER}, ${sourceId}, 'reading')`,
      sql`INSERT INTO reading_progress (user_id, source_id, last_ordinal, percent) VALUES (${USER}, ${sourceId}, 1, 0.5)`,
    ]);
  }, 60_000);

  // Teardown is BELT-AND-BRACES on purpose. The last case leaves the source PUBLISHED, so an
  // abort between there and here strands a published QA row — which is precisely what failed
  // Gate B on 2026-07-19. Each step is independent (one failure must not skip the rest), the
  // source is forced OUT of 'published' before deletion, and the final sweep is by slug PREFIX so
  // it also reaps rows leaked by earlier interrupted runs, not just this one.
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
      owner!.query(`UPDATE sources SET status = 'quarantined' WHERE slug LIKE 'qa-published-boundary-%'`),
    );
    await attempt('user rows', () =>
      runAsUser(USER, (sql) => [
        sql`DELETE FROM reading_progress WHERE user_id = ${USER}`,
        sql`DELETE FROM library_items WHERE user_id = ${USER}`,
      ]),
    );
    await attempt('orphaned shelf/progress rows', () =>
      owner!.query(
        `DELETE FROM library_items WHERE source_id IN (SELECT id FROM sources WHERE slug LIKE 'qa-published-boundary-%');
         DELETE FROM reading_progress WHERE source_id IN (SELECT id FROM sources WHERE slug LIKE 'qa-published-boundary-%')`,
      ),
    );
    await attempt('sections', () =>
      owner!.query(`DELETE FROM sections WHERE source_id IN (SELECT id FROM sources WHERE slug LIKE 'qa-published-boundary-%')`),
    );
    await attempt('sources', () => owner!.query(`DELETE FROM sources WHERE slug LIKE 'qa-published-boundary-%'`));
    await attempt('close', () => owner!.end());
  }, 60_000);

  it('BASELINE: while published, the work IS shelved, IS in continue-reading, and the reader serves it', async () => {
    await setStatus('published');
    const items = await listLibraryItems(USER);
    const reading = await listContinueReading(USER);
    expect(items.map((i) => i.slug), 'a published shelved work must appear in the library').toContain(SLUG);
    expect(reading.map((r) => r.slug), 'a published in-progress work must appear in continue-reading').toContain(SLUG);
    expect((await callWork(SLUG)).status).toBe(200);
  }, 60_000);

  // ── Requirement A extended (2026-07-19): the CATALOGS and searchSections are NEW read paths
  // with the SAME hazard. The original proof only covered listLibraryItems/listContinueReading —
  // the surfaces that existed when it was written — so on its own it does not travel. These cases
  // make it travel. The seeded work is source_type='sermon', so its catalog is 'sermons'.

  it('BASELINE: while published, the work IS in its catalog and IS findable by search', async () => {
    await setStatus('published');
    const { works } = await listCatalogWorks({ catalog: 'sermons', limit: 100 });
    expect(works.map((w) => w.slug), 'a published work must appear in its catalog').toContain(SLUG);

    const hits = await searchSections({ query: TOKEN });
    expect(hits.results.map((r) => r.slug), 'a published work must be findable by search').toContain(SLUG);
    expect(hits.total, 'the capped count must see it too').toBeGreaterThan(0);
  }, 60_000);

  it('STAGED: the work must vanish from the CATALOG', async () => {
    await setStatus('staged');
    const { works } = await listCatalogWorks({ catalog: 'sermons', limit: 100 });
    expect(works.map((w) => w.slug), 'a staged work must NOT be listed in the catalog').not.toContain(SLUG);
  }, 60_000);

  it('STAGED: the work must vanish from SEARCH — results AND the reported count', async () => {
    await setStatus('staged');
    const hits = await searchSections({ query: TOKEN });
    expect(hits.results.map((r) => r.slug), 'a staged work must NOT be searchable').not.toContain(SLUG);
    // The count is a separate query with its own copy of the predicate; a surface that hides the
    // row but still counts it leaks the fact that a withdrawn work exists.
    expect(hits.total, 'the capped count must not count a staged work').toBe(0);
  }, 60_000);

  it('QUARANTINED: catalog and search stay clean, and an in-work search finds nothing', async () => {
    await setStatus('quarantined');
    const { works } = await listCatalogWorks({ catalog: 'sermons', limit: 100 });
    expect(works.map((w) => w.slug)).not.toContain(SLUG);
    const hits = await searchSections({ query: TOKEN });
    expect(hits.results.map((r) => r.slug)).not.toContain(SLUG);
    // in-work search scoped directly AT the withdrawn work must also return nothing
    const inWork = await searchSections({ query: TOKEN, sourceSlug: SLUG });
    expect(inWork.results, 'in-work search on a quarantined work must return nothing').toEqual([]);
    expect(inWork.total).toBe(0);
  }, 60_000);

  it('STAGED: the shelf row survives in the DB, but the work must vanish from the library listing', async () => {
    await setStatus('staged');
    // the row is still there — that is exactly why the QUERY must carry the predicate
    const raw = await owner!.query('SELECT count(*)::int n FROM library_items WHERE user_id = $1', [USER]);
    expect(raw.rows[0].n, 'precondition: the shelf row must still exist, else this proves nothing').toBe(1);

    const items = await listLibraryItems(USER);
    expect(items.map((i) => i.slug), 'a staged work must NOT be listed in the library').not.toContain(SLUG);
  }, 60_000);

  it('STAGED: continue-reading must not surface it either', async () => {
    await setStatus('staged');
    const raw = await owner!.query('SELECT count(*)::int n FROM reading_progress WHERE user_id = $1', [USER]);
    expect(raw.rows[0].n, 'precondition: the progress row must still exist').toBe(1);

    const reading = await listContinueReading(USER);
    expect(reading.map((r) => r.slug), 'a staged work must NOT be in continue-reading').not.toContain(SLUG);
  }, 60_000);

  it('QUARANTINED: same, and the reader route 404s — no surface links to a withdrawn work', async () => {
    await setStatus('quarantined');
    const items = await listLibraryItems(USER);
    const reading = await listContinueReading(USER);
    expect(items.map((i) => i.slug)).not.toContain(SLUG);
    expect(reading.map((r) => r.slug)).not.toContain(SLUG);
    expect((await callWork(SLUG)).status, 'the reader must 404 a quarantined work').toBe(404);
  }, 60_000);

  it('RESTORED: re-publishing brings it back — the predicate filters, it does not delete', async () => {
    await setStatus('published');
    const items = await listLibraryItems(USER);
    expect(items.map((i) => i.slug), 're-publishing must restore the shelved work').toContain(SLUG);
  }, 60_000);
});
