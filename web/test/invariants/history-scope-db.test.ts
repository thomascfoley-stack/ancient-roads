// BEHAVIORAL scope test (design §6 test 4, amended after review — never a string match on SQL):
// every result the history search returns belongs to an IN-SCOPE PUBLISHED work, and every
// excerpt is a verbatim substring of its stored section. Fully derived: the probe entity comes
// from the vocabulary itself, never hand-typed. Scope = published + (historian OR genre-history
// by the per-work datum sources.provenance.genre) — widened 2026-08-23 per the ruled Phase-0
// mechanism (2026-08-20-historian-ingestion-plan); the restatements below moved with it.
//
// ── 2026-08-21: this suite was reported as "~60% flaky, a true-positive scope leak". It was
// neither. Root-caused with a driven probe sweep; the record matters because two of the three
// defects were invisible from the failure message:
//
//   1. THE PROBE WAS DRAWN FROM A WIDER POOL THAN THE PRODUCT SEARCHES. The old query filtered
//      on `he.served` alone — 81 labels on dev — while searchHistory's SCOPE is
//      served AND status='published' AND source_type='historian' — 31 labels. So 50 of 81
//      probes (61.7%) named entities living only in STAGED historian works and could never
//      match. That 61.7% is the reported "60% of runs". The test was failing on its own fixture.
//   2. `LIMIT 1` WITH NO `ORDER BY` made which probe you got PLAN-DEPENDENT — proven, not
//      assumed: the same query on the same data returned `Arians` under the default plan and
//      `Abraham` under five separate planner perturbations (hashagg off, work_mem, hashjoin
//      off, seq_page_cost, no parallel). Deterministic per environment, arbitrary across them.
//   3. THE LEAK CHECK BELOW HAS NEVER BEEN WATCHED RED. `sources.slug` is UNIQUE and all four
//      retrieval legs interpolate SCOPE, so the historian/published loop is structurally unable
//      to fail unless someone deletes SCOPE from the SQL. It was a check that could not fail;
//      the negative probe added below is the direction that can.
//
// The probe predicate is written as LITERAL SQL here, deliberately NOT imported from
// history-search-db. Importing the module's own SCOPE would make this the watchlist's
// instance-fourteen shape — a verifier whose expectation is derived from the artifact under
// test, which reduces to `served` diffed against `served`. If the two drift apart, this test
// must go red; that is the whole point of restating it.
import { describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { searchHistory } from '@/lib/history-search-db';
import { assertExcerptVerbatim } from '@/lib/history-search';
import { localEnv, requireDbInCi } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';

// Source the key the way four sibling suites already do (test/user-corpus/search.test.ts:38-39).
// Reading process.env directly meant this suite silently NOT-RAN for every local invocation —
// eight consecutive runs before this fix, all "missing DEEPINFRA_API_KEY", which is why nobody
// had seen its real failure. A suite nobody can run is not a gate.
const KEY = localEnv('DEEPINFRA_API_KEY');
if (KEY && !process.env.DEEPINFRA_API_KEY) process.env.DEEPINFRA_API_KEY = KEY;

const dbUrl = requireDbInCi();
const SKIP = announceSkip(
  'history search scope (DB)',
  [
    { name: 'a runtime DB URL (APP_DATABASE_URL)', present: Boolean(dbUrl) },
    { name: 'DEEPINFRA_API_KEY (query embedding)', present: Boolean(KEY) },
  ],
  'that history results are in-scope published works only, with verbatim excerpts',
);

// The product's scope, restated (see the header for why this is not imported).
const SCOPED_VOCAB = `
  SELECT DISTINCT a.entity_label AS label
    FROM section_history_anchors a
    JOIN history_embeddings he ON he.section_id = a.section_id
    JOIN sections s ON s.id = a.section_id
    JOIN sources src ON src.id = s.source_id
   WHERE he.served AND src.status = 'published' AND (src.source_type = 'historian' OR src.provenance->>'genre' = 'history')
   ORDER BY a.entity_label
   LIMIT 1`;

// A label anchored ONLY outside the scope — staged, or not a historian. This is what makes the
// leak check able to fail: if SCOPE were ever dropped, searching this returns rows.
const UNSCOPED_ONLY_VOCAB = `
  SELECT DISTINCT a.entity_label AS label
    FROM section_history_anchors a
    JOIN history_embeddings he ON he.section_id = a.section_id
   WHERE he.served
     AND a.entity_label NOT IN (
       SELECT DISTINCT a2.entity_label
         FROM section_history_anchors a2
         JOIN history_embeddings he2 ON he2.section_id = a2.section_id
         JOIN sections s2 ON s2.id = a2.section_id
         JOIN sources src2 ON src2.id = s2.source_id
        WHERE he2.served AND src2.status = 'published' AND (src2.source_type = 'historian' OR src2.provenance->>'genre' = 'history'))
   ORDER BY a.entity_label
   LIMIT 1`;

describe.skipIf(SKIP)('history search — scope and excerpt gate against a real DB', () => {
  it('returns historian/published works only, every excerpt verbatim', async () => {
    const sql = getDb();
    // Derive a probe from the vocabulary the PRODUCT can actually match — a corpus with none is
    // NOT a pass. Ordered, so the probe is the same row on every machine and every plan.
    const vocab = (await sql.query(SCOPED_VOCAB)) as { label: string }[];
    expect(vocab.length, 'no served in-scope published anchored entities — cannot exercise the scope; NOT a pass').toBeGreaterThan(0);

    const res = await searchHistory(`tell me about ${vocab[0]!.label}`);
    expect(res.results.length, 'the derived probe entity returned nothing').toBeGreaterThan(0);
    expect(res.closest?.matched).toContain('entity');

    const slugs = res.results.map((g) => g.work.slug);
    const kinds = (await sql.query(
      `SELECT slug, source_type, status, provenance->>'genre' AS genre FROM sources WHERE slug = ANY($1)`, [slugs],
    )) as { slug: string; source_type: string; status: string; genre: string | null }[];
    for (const k of kinds) {
      // In-scope = published AND (historian OR genre-history by the per-work datum) — the
      // widened SCOPE, restated (deliberately not imported; see the header).
      expect(
        k.source_type === 'historian' || k.genre === 'history',
        `${k.slug} (${k.source_type}/genre=${k.genre}) leaked into history results`,
      ).toBe(true);
      expect(k.status).toBe('published');
    }
    for (const g of res.results) {
      for (const s of g.sections) {
        const body = (await sql.query(`SELECT body FROM sections WHERE id = $1`, [s.sectionId])) as { body: string }[];
        expect(() => assertExcerptVerbatim(body[0]!.body, s.excerpt)).not.toThrow();
      }
    }
  }, 60_000);

  it('an entity anchored ONLY in out-of-scope works returns nothing — the leak direction', async () => {
    // The check the original suite lacked. The loop above asserts "everything returned is in
    // scope", which passes trivially when nothing is returned and cannot fail while SCOPE is
    // present. This asks the opposite question: something IS anchored and served, and is NOT in
    // the published in-scope set — the search must not surface it.
    // SEED: delete `AND src.status = 'published'` from SCOPE in history-search-db.ts and this
    // goes red while every other assertion here stays green.
    const sql = getDb();
    const outside = (await sql.query(UNSCOPED_ONLY_VOCAB)) as { label: string }[];
    if (outside.length === 0) {
      // Not a silent pass: if every served anchored entity is in scope there is nothing to leak,
      // and the corpus state must be visible rather than inferred from a green tick.
      console.warn('⚠ leak direction NOT EXERCISED: every served anchored entity is already in the published scope on this target.');
      return;
    }
    const res = await searchHistory(`tell me about ${outside[0]!.label}`);
    const slugs = res.results.map((g) => g.work.slug);
    expect(slugs, `${outside[0]!.label} is anchored only outside the served scope and must not surface`).toEqual([]);
  }, 60_000);
});
