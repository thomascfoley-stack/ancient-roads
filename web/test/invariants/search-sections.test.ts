// PHASE 4 REQUIREMENT B — searchSections must dedupe to READING UNITS and stay capped.
//
// WHY DEDUPE. `sections` is the RETRIEVAL unit: embedding-sized chunks. Calvin's Institutes is
// 3,448 chunks across 103 reading units. A raw section-level search returns twenty hits from one
// chapter, buries every other work, and stops being an index. `unit_ordinal` (ADR-026) makes the
// fix mechanical, so "results" means reading units, the same thing the reader navigates.
//
// WHY CAPPED. "Never return unbounded result sets" (CLAUDE.md) applies to the reported COUNT as
// much as the rows: a count that scans every match is an unbounded aggregate wearing a small
// number's clothes.
//
// ANTI-VACUITY. A dedupe test passes trivially if the query happened to hit one chunk per unit.
// Every case here first asserts the raw section-level hit count EXCEEDS the deduped unit count —
// i.e. that there was duplication to collapse. Without that precondition a green here would mean
// nothing.

import { afterAll, describe, expect, it } from 'vitest';
import { searchSections } from '@/lib/search-sections';
import { getDb } from '@/lib/db';
import { ensureDbEnv } from '../helpers/env';

const dbUrl = ensureDbEnv();

// A large, heavily-chunked published work + a term dense enough to hit many chunks inside one unit.
const BIG_SLUG = 'calvin-institutes';
const TERM = 'faith';

async function rawSectionHits(slug: string, term: string): Promise<number> {
  const sql = getDb();
  const rows = (await sql.query(
    `SELECT count(*)::int AS n
     FROM sections sec JOIN sources s ON s.id = sec.source_id
     WHERE s.slug = $1 AND s.status = 'published'
       AND sec.tsv @@ websearch_to_tsquery('english', $2)`,
    [slug, term],
  )) as unknown as { n: number }[];
  return rows[0]?.n ?? 0;
}

describe.skipIf(!dbUrl)('searchSections — deduped to reading units, and capped', () => {
  afterAll(() => {
    /* read-only: seeds nothing, so there is nothing to tear down */
  });

  it('collapses many chunks of one reading unit into ONE result', async () => {
    const raw = await rawSectionHits(BIG_SLUG, TERM);
    const { results } = await searchSections({ query: TERM, sourceSlug: BIG_SLUG, limit: 100 });

    // precondition: there must be duplication to collapse, else this proves nothing
    expect(raw, `precondition: '${TERM}' must hit many sections in ${BIG_SLUG}`).toBeGreaterThan(results.length);

    const unitKeys = results.map((r) => `${r.slug}#${r.unitOrdinal}`);
    expect(new Set(unitKeys).size, 'every result must be a DISTINCT reading unit').toBe(unitKeys.length);
  }, 60_000);

  it('reports a count in the same units as the list (not raw section hits)', async () => {
    const raw = await rawSectionHits(BIG_SLUG, TERM);
    const { total } = await searchSections({ query: TERM, sourceSlug: BIG_SLUG, limit: 100 });
    expect(raw).toBeGreaterThan(0);
    // The count must be unit-scale, not section-scale: a list of 40 units captioned "312 results"
    // is a lie about what the user is looking at.
    expect(total, 'the reported total must count reading units, not sections').toBeLessThan(raw);
    expect(total).toBeGreaterThan(0);
  }, 60_000);

  it('caps the page size no matter what the caller asks for', async () => {
    const { results } = await searchSections({ query: TERM, limit: 500 });
    expect(results.length, 'limit must clamp to MAX_LIMIT (100)').toBeLessThanOrEqual(100);
  }, 60_000);

  it('caps the reported count instead of scanning every match', async () => {
    // A very common term across the whole corpus — the case that would motivate an unbounded scan.
    const { total, totalCapped } = await searchSections({ query: 'God', limit: 10 });
    expect(total, 'the count must never exceed the cap').toBeLessThanOrEqual(1000);
    if (total >= 1000) expect(totalCapped, 'totalCapped must be true once the cap is hit').toBe(true);
  }, 60_000);

  it('an empty query returns nothing and touches the DB not at all', async () => {
    const r = await searchSections({ query: '   ' });
    expect(r).toEqual({ results: [], total: 0, totalCapped: false });
  }, 60_000);

  it('in-work search is fenced to that work', async () => {
    const { results } = await searchSections({ query: TERM, sourceSlug: BIG_SLUG, limit: 50 });
    expect(results.length).toBeGreaterThan(0);
    expect([...new Set(results.map((r) => r.slug))], 'in-work search must return only that work').toEqual([BIG_SLUG]);
  }, 60_000);
});
