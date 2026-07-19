// Book Reader API invariants (docs/LIBRARY_READER_DESIGN.md §2), exercised through
// the REAL route handlers against the real DB — never lib-only stand-ins, so the
// served path itself (param parsing, clamp, status filter) is what goes red.
//
//   * Published-only boundary: a staged source is a 404 on BOTH routes (the DB
//     analogue of the client published filter). josephus-whiston is staged on dev;
//     the sanity 200 on calvin-institutes proves the 404 is the filter, not a dead
//     route (the licensing.test.ts Tyndale-probe pattern).
//   * Keyset correctness: ascending, non-overlapping pages driven by nextAfter;
//     walking a whole work reconstructs it exactly; nextAfter ends null.
//   * Never unbounded: limit=100000 is clamped to WORK_SECTIONS_MAX_LIMIT (the
//     Institutes is 3,448 sections — only the clamp stops at the cap).
//   * TOC carries no bodies and is in (unit_ordinal, ordinal) reading order; the
//     response never contains a host URL (attribution = author + work + locus).
//
// DB-backed: skips when no runtime DB URL is configured (helpers/env.ts), executes
// for real locally and in the db-invariants job — never fake-green.

import { describe, expect, it } from 'vitest';
import { GET as getWork } from '@/app/api/work/[slug]/route';
import { GET as getWorkSections } from '@/app/api/work/[slug]/sections/route';
import {
  WORK_SECTIONS_DEFAULT_LIMIT,
  WORK_SECTIONS_MAX_LIMIT,
  type WorkSectionsPage,
  type WorkSource,
  type WorkTocRow,
} from '@/lib/work';
import { getDb } from '@/lib/db';
import { runtimeDbUrl } from '../helpers/env';

const dbUrl = runtimeDbUrl();

const STAGED_SLUG = 'josephus-whiston'; // staged on dev — the boundary probe
const BIG_SLUG = 'calvin-institutes'; // published, 3,448 sections — the unbounded probe
const SMALL_SLUG = 'herbert-temple'; // published, 246 sections — walkable end-to-end

function callWork(slug: string): Promise<Response> {
  return getWork(new Request(`https://test.local/api/work/${slug}`), { params: Promise.resolve({ slug }) });
}

function callSections(slug: string, qs = ''): Promise<Response> {
  return getWorkSections(new Request(`https://test.local/api/work/${slug}/sections${qs}`), {
    params: Promise.resolve({ slug }),
  });
}

async function workJson(slug: string): Promise<{ source: WorkSource; toc: WorkTocRow[] }> {
  const res = await callWork(slug);
  expect(res.status, `GET /api/work/${slug} must serve a published work`).toBe(200);
  return (await res.json()) as { source: WorkSource; toc: WorkTocRow[] };
}

async function sectionsJson(slug: string, qs = ''): Promise<WorkSectionsPage> {
  const res = await callSections(slug, qs);
  expect(res.status, `GET /api/work/${slug}/sections${qs} must serve a published work`).toBe(200);
  return (await res.json()) as WorkSectionsPage;
}

function ordinals(rows: { ordinal: number }[]): number[] {
  return rows.map((r) => r.ordinal);
}

describe.skipIf(!dbUrl)('Book Reader API — /api/work/[slug] + /sections (executed against the real DB)', () => {
  it('404s a staged source on BOTH routes (published-only boundary)', async () => {
    // FIXTURE PRECONDITION (added 2026-07-19). Without this the test is fixture-dependent and
    // can pass for the WRONG reason: against a DB where `josephus-whiston` is simply ABSENT,
    // deleting the `status = 'published'` filter entirely would STILL yield 404, and this test
    // would certify a boundary that no longer exists. Asserting the row exists AND is staged is
    // what makes the 404s below attributable to the filter.
    const sql = getDb();
    const fixture = (await sql`SELECT status FROM sources WHERE slug = ${STAGED_SLUG}`) as { status: string }[];
    expect(fixture.length, `fixture missing: '${STAGED_SLUG}' must exist in this DB, else the 404 proves nothing`).toBe(1);
    expect(fixture[0]!.status, `fixture wrong: '${STAGED_SLUG}' must be staged for this boundary probe`).toBe('staged');

    // sanity: a published work IS served on both routes — so the 404s below are the
    // status filter doing its job, not broken wiring.
    expect((await callWork(BIG_SLUG)).status).toBe(200);
    expect((await callSections(BIG_SLUG)).status).toBe(200);

    expect((await callWork(STAGED_SLUG)).status, 'staged source must 404 on the work route').toBe(404);
    expect((await callSections(STAGED_SLUG)).status, 'staged source must 404 on the sections route').toBe(404);
    expect((await callWork('no-such-work')).status).toBe(404);
    expect((await callSections('no-such-work')).status).toBe(404);
  }, 30_000);

  it('TOC: source whitelist, no bodies, (unitOrdinal, ordinal) reading order, never a host URL', async () => {
    const { source, toc } = await workJson(BIG_SLUG);

    // exactly the contracted source fields — `provenance` (host URLs) never rides along
    expect(Object.keys(source).sort()).toEqual([
      'author',
      'era',
      'license',
      'slug',
      'source_type',
      'title',
      'tradition',
    ]);
    expect(source).toMatchObject({ slug: BIG_SLUG, author: 'John Calvin', license: 'Public Domain' });

    expect(toc.length, 'the Institutes TOC is the full section set').toBeGreaterThan(3000);
    for (const row of toc) {
      // ids/ordinals/units/headings only — NEVER a body
      expect(Object.keys(row).sort()).toEqual(['heading', 'id', 'ordinal', 'unitOrdinal']);
      expect(typeof row.id).toBe('number');
      expect(typeof row.unitOrdinal, '024 backfill: every section has a reading unit').toBe('number');
    }
    // reading order is (unit_ordinal, ordinal), strictly increasing as a pair
    for (let i = 1; i < toc.length; i++) {
      const prev = toc[i - 1]!;
      const cur = toc[i]!;
      const ordered =
        cur.unitOrdinal! > prev.unitOrdinal! ||
        (cur.unitOrdinal === prev.unitOrdinal && cur.ordinal > prev.ordinal);
      expect(ordered, `TOC row ${i} breaks (unitOrdinal, ordinal) order`).toBe(true);
    }

    // attribution discipline (§8.6): author + work + locus only — no host URL anywhere
    expect(JSON.stringify({ source, toc })).not.toMatch(/https?:\/\//);
  }, 60_000);

  it('sections: keyset pages are ascending, non-overlapping, cursor-driven', async () => {
    const p1 = await sectionsJson(BIG_SLUG, '?limit=5');
    expect(p1.sections).toHaveLength(5);
    const ords1 = ordinals(p1.sections);
    expect([...ords1].sort((a, b) => a - b)).toEqual(ords1); // ascending
    expect(p1.nextAfter, 'a full page hands back its last ordinal as the cursor').toBe(ords1[ords1.length - 1]);
    for (const s of p1.sections) {
      expect(Object.keys(s).sort()).toEqual(['body', 'heading', 'id', 'ordinal', 'unitOrdinal']);
      expect(s.body.length).toBeGreaterThan(0);
    }

    const p2 = await sectionsJson(BIG_SLUG, `?after=${p1.nextAfter}&limit=5`);
    expect(p2.sections).toHaveLength(5);
    const ords2 = ordinals(p2.sections);
    expect([...ords2].sort((a, b) => a - b)).toEqual(ords2);
    expect(Math.min(...ords2), 'page 2 must not overlap page 1').toBeGreaterThan(Math.max(...ords1));
    expect(p2.nextAfter).toBe(ords2[ords2.length - 1]);
  }, 30_000);

  it('sections: the default limit applies when limit is absent', async () => {
    const page = await sectionsJson(BIG_SLUG);
    expect(page.sections).toHaveLength(WORK_SECTIONS_DEFAULT_LIMIT);
  }, 30_000);

  it('sections: limit=100000 is clamped — NEVER an unbounded response', async () => {
    const page = await sectionsJson(BIG_SLUG, '?limit=100000');
    // the Institutes has 3,448 sections: only the clamp stops the page at the cap
    expect(page.sections.length).toBeLessThanOrEqual(WORK_SECTIONS_MAX_LIMIT);
    expect(page.sections.length).toBe(WORK_SECTIONS_MAX_LIMIT);
    expect(page.nextAfter).toBe(page.sections[page.sections.length - 1]!.ordinal);
  }, 30_000);

  it('sections: walking nextAfter to the end reconstructs the whole work; the cursor ends null', async () => {
    const { toc } = await workJson(SMALL_SLUG);
    expect(toc.length, 'sanity: the small work is multi-page at limit 100').toBeGreaterThan(100);

    const seen: number[] = [];
    let after: number | null = 0;
    let pages = 0;
    while (after !== null) {
      const page: WorkSectionsPage = await sectionsJson(SMALL_SLUG, `?after=${after}&limit=100`);
      seen.push(...ordinals(page.sections));
      after = page.nextAfter;
      pages++;
      expect(pages, 'cursor must terminate — a nextAfter bug would loop forever').toBeLessThanOrEqual(10);
    }

    expect(pages, 'a short final page ends the walk').toBe(Math.floor(toc.length / 100) + 1);
    expect(seen).toHaveLength(toc.length); // nothing dropped, nothing repeated
    const sorted = [...seen].sort((a, b) => a - b);
    expect(seen, 'the walk is strictly ascending across page boundaries').toEqual(sorted);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i], 'no duplicate ordinals across pages').toBeGreaterThan(sorted[i - 1]!);
    }

    // past the last ordinal: an empty page with a null cursor — the end-of-work contract
    const tail = await sectionsJson(SMALL_SLUG, `?after=${sorted[sorted.length - 1]}`);
    expect(tail.sections).toEqual([]);
    expect(tail.nextAfter).toBeNull();
  }, 60_000);

  it('sections: malformed params are a 400, never a 500', async () => {
    for (const qs of ['?after=abc', '?after=1.5', '?after=-1', '?limit=0', '?limit=-3', '?limit=two']) {
      const res = await callSections(BIG_SLUG, qs);
      expect(res.status, `${qs} must be rejected as INVALID_REQUEST`).toBe(400);
    }
  }, 30_000);
});
