// PHASE 4 REQUIREMENT C — re-prove the REGISTER WALL on the NEW surfaces.
//
// The wall (A5, `register-wall-check.mts`): hymns, poems, sermons and theology are lane content.
// They ride ALONGSIDE the exegetical answer as labeled payloads, are never composed over, and can
// never satisfy the ≥2-voices exegetical floor. The reconciliation proved 0 breaches across 1,212
// chapters — but on the FOUR surfaces that existed then.
//
// The catalogs and cross-corpus search are NEW DOORS into exactly that content. A wall proven at
// the retrieval layer says nothing about a catalog that files Spurgeon under "Commentaries", or a
// search result that renders a hymn as though it were exposition. So it is re-proven here, on the
// new doors, with assertions that can fail.
//
// What is asserted:
//   1. Each catalog admits ONLY its own declared source_types (fenced, disjoint).
//   2. The catalog taxonomy is disjoint — no type reachable through two catalogs.
//   3. Lane/other types (theology, confession, lexicon) appear in NO catalog. This is the
//      fail-closed default: an unlisted type must not be swallowed by an "everything else" bucket.
//   4. Catalog-scoped SEARCH honours the same fence.
//   5. EVERY search result carries a non-empty sourceType — cross-corpus search may surface lane
//      content, but the caller cannot honour the wall if the row does not say what register it is.

import { describe, expect, it } from 'vitest';
import { CATALOGS, CATALOG_IDS, listCatalogWorks, type CatalogId } from '@/lib/catalog';
import { searchSections } from '@/lib/search-sections';
import { getDb } from '@/lib/db';
import { ensureDbEnv } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';

const dbUrl = ensureDbEnv();

/** Types that must never appear in ANY catalog: lane content + the Word Study surface. */
const NON_CATALOG_TYPES = ['theology', 'confession', 'lexicon'];

// A DB-less run must READ as NOT RUN, not as coverage — see helpers/loud-skip.ts.
const SKIP = announceSkip(
  'register wall — the NEW catalog + search surfaces',
  [{ name: 'a runtime DB URL (APP_DATABASE_URL)', present: Boolean(dbUrl) }],
  'the register wall on real data — catalog fence, disjoint taxonomy, labelled search',
);

describe.skipIf(SKIP)('register wall — the NEW catalog + search surfaces', () => {
  it('the taxonomy is disjoint: no source_type is reachable through two catalogs', () => {
    const seen = new Map<string, CatalogId>();
    for (const id of CATALOG_IDS) {
      for (const t of CATALOGS[id].types) {
        expect(seen.has(t), `type "${t}" is in both ${seen.get(t)} and ${id}`).toBe(false);
        seen.set(t, id);
      }
    }
    // and lane/other content is in none of them
    for (const t of NON_CATALOG_TYPES) {
      expect(seen.has(t), `"${t}" is lane/other content and must appear in NO catalog`).toBe(false);
    }
  });

  it('every catalog returns ONLY its declared types (fence holds against real data)', async () => {
    for (const id of CATALOG_IDS) {
      const allowed = new Set(CATALOGS[id].types);
      const works = await listCatalogWorks({ catalog: id, limit: 100 });
      // precondition: a fence over an empty shelf proves nothing
      expect(works.length, `precondition: catalog "${id}" must have works to fence`).toBeGreaterThan(0);
      for (const w of works) {
        expect(
          allowed.has(w.sourceType),
          `catalog "${id}" surfaced "${w.slug}" of type "${w.sourceType}" — outside its fence`,
        ).toBe(true);
      }
    }
  }, 60_000);

  it('no catalog surfaces lane/other content that exists in the corpus', async () => {
    const sql = getDb();
    // Confirm the corpus actually HAS such works, else this is vacuous.
    const rows = (await sql.query(
      `SELECT source_type, count(*)::int AS n FROM sources
       WHERE status='published' AND source_type = ANY($1::text[]) GROUP BY 1`,
      [NON_CATALOG_TYPES],
    )) as unknown as { source_type: string; n: number }[];
    expect(rows.length, 'precondition: the corpus must contain lane/other works for this to mean anything').toBeGreaterThan(0);

    const surfaced = new Set<string>();
    for (const id of CATALOG_IDS) {
      for (const w of await listCatalogWorks({ catalog: id, limit: 100 })) surfaced.add(w.sourceType);
    }
    for (const t of NON_CATALOG_TYPES) {
      expect(surfaced.has(t), `"${t}" reached a catalog — the wall is breached in the UI layer`).toBe(false);
    }
  }, 60_000);

  it('catalog-scoped SEARCH honours the same fence', async () => {
    for (const id of CATALOG_IDS) {
      const allowed = new Set(CATALOGS[id].types);
      const { results } = await searchSections({ query: 'God', catalog: id, limit: 50 });
      for (const r of results) {
        expect(
          allowed.has(r.sourceType),
          `search in catalog "${id}" returned "${r.slug}" of type "${r.sourceType}" — outside its fence`,
        ).toBe(true);
      }
    }
  }, 120_000);

  it('the Hymns & Poetry sub-filter narrows rather than widens', async () => {
    const hymns = await listCatalogWorks({ catalog: 'hymns-poetry', subFilter: 'hymns', limit: 100 });
    const poetry = await listCatalogWorks({ catalog: 'hymns-poetry', subFilter: 'poetry', limit: 100 });
    expect(hymns.length + poetry.length).toBeGreaterThan(0);
    for (const w of hymns) expect(w.sourceType, 'the hymns sub-filter must return only hymns').toBe('hymn');
    for (const w of poetry) expect(w.sourceType, 'the poetry sub-filter must return only poetry').toBe('poetry');
  }, 60_000);

  it('EVERY cross-corpus search result is register-LABELLED (the caller can honour the wall)', async () => {
    const { results } = await searchSections({ query: 'God', limit: 50 });
    expect(results.length, 'precondition: cross-corpus search must return something').toBeGreaterThan(0);
    for (const r of results) {
      expect(typeof r.sourceType === 'string' && r.sourceType.length > 0, `result "${r.slug}" has no sourceType label`).toBe(true);
    }
    // Cross-corpus search is ALLOWED to surface lane content — that is the point of a corpus-wide
    // search — but it must arrive labelled, never anonymous.
    const types = [...new Set(results.map((r) => r.sourceType))];
    expect(types.every((t) => t.length > 0)).toBe(true);
  }, 120_000);
});
