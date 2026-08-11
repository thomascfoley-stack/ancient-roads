// Layer 1 — licensing invariant (behavioral): forbidden authors must never be returned
// from any served read path. Structure-only tests are insufficient — a refactor can
// keep the constant reference and break the filter.

import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/teacher/rerank', () => ({
  rerank: async (_query: string, docs: readonly string[]) =>
    docs.map((_, index) => ({ index, relevance_score: 1 - index * 0.01 })),
}));

import { getDb } from '@/lib/db';
import {
  isMustNotServeAuthor,
  isPublishedCommentaryEntry,
  LEGAL_CORPUS_FILTER,
  MUST_NOT_SERVE_AUTHORS,
} from '@/lib/legal-corpus';
import { legalBasePool } from '@/lib/teacher/routing';
import { searchCommentaries } from '@/lib/commentary-search';
import { retrieveCommentary } from '@/lib/teacher/retrieve';
import { requireDbInCi } from '../helpers/env';
import { evaluateForbiddenProvenanceRatchet } from '../helpers/corpus-scan';
import { announceSkip } from '../helpers/loud-skip';

const dbUrl = requireDbInCi();

function assertNoForbiddenAuthors(authors: string[], pathLabel: string): void {
  const hits = authors.filter((a) => isMustNotServeAuthor(a));
  expect(hits, `${pathLabel} returned quarantined authors: ${hits.join(', ')}`).toEqual([]);
}

// The DB publish switch, fetched once by beforeAll. Post-044, "published" is
// `sources.status='published'` and scripts/publish-flip.mjs writes `served` to match
// (scripts/served-reconcile.mjs is the standing instrument of that contract). A served
// chunk whose work is published in the DB is therefore licensed-reachable BY THE
// OPERATIVE GATE, even when the static SERVED lists — frozen at 044's backfill — have
// not caught up (they lag by design until the filed static-surface cutover; see the
// ⚠ note in teacher/routing.ts). The 2026-08-10 red was exactly this lag: served,
// published NPNF father volumes judged non-published by the frozen static record.
let publishedSlugs = new Set<string>();

function assertAllPublished(
  entries: Array<{ author: string; book: number; sourceUrl?: string | null; work?: string | null }>,
  pathLabel: string,
): void {
  // work MUST ride along: register works publish BY SLUG, and dropping it makes
  // every register author read as non-published (the gate-ingest L3 bug class,
  // A6 2026-07-17)
  const bad = entries.filter(
    (e) =>
      // The static predicate stays LOAD-BEARING for the work-less legacy flat-table
      // cohort — 124,955 rows with no work key, Tyndale/CS Lewis/Origen among them —
      // where it is the only guard. Work-keyed rows answer to the DB publish switch.
      !isPublishedCommentaryEntry({ author: e.author, book: e.book, sourceUrl: e.sourceUrl, work: e.work }) &&
      !(e.work && publishedSlugs.has(e.work)),
  );
  expect(
    bad.map((e) => e.author),
    `${pathLabel} returned non-published authors: ${bad.map((e) => e.author).join(', ')}`,
  ).toEqual([]);
}

// A DB-less run must READ as NOT RUN, not as coverage — see helpers/loud-skip.ts.
const SKIP = announceSkip(
  'Layer 1 — licensing invariant (behavioral)',
  [{ name: 'a runtime DB URL (APP_DATABASE_URL)', present: Boolean(dbUrl) }],
  'the licensing invariant — that no MUST_NOT_SERVE author reaches a read path',
);

describe.skipIf(SKIP)('Layer 1 — licensing invariant (behavioral)', () => {
  let sampleVec: number[] = [];
  let tyndaleInCorpus = 0;

  beforeAll(async () => {
    const sql = getDb();
    const probe = await sql`
      SELECT count(*)::int AS n FROM commentary_entries
      WHERE author = 'Tyndale Study Notes'
    `;
    tyndaleInCorpus = (probe as { n: number }[])[0]?.n ?? 0;
    expect(tyndaleInCorpus, 'sanity: Tyndale must exist in corpus to prove the filter works').toBeGreaterThan(0);

    // DETERMINISTIC + LEGAL sample vector. The old `LIMIT 1` (no ORDER BY) picked an
    // arbitrary vector; if it was a non-legal author's, its HNSW neighbours could ALL be
    // non-legal and legalBasePoolSql(50) returned 0 rows (flaky). Anchoring on a legal
    // vector (ordered) guarantees its own legal passage is among the nearest.
    const row = (await sql.query(
      `SELECT embedding::text AS vec FROM embeddings
       WHERE user_id IS NULL AND source_type = 'commentary' AND ${LEGAL_CORPUS_FILTER}
       ORDER BY source_id LIMIT 1`,
    )) as { vec: string }[];
    const parsed = JSON.parse(row[0]!.vec) as number[];
    sampleVec = parsed;

    // The DB publish switch (see publishedSlugs above). POSITIVE CONTROL: an empty set
    // would make every work-keyed chunk read as non-published... or, worse, a blind
    // probe folded into the static leg could read as coverage. Refuse both.
    const pubRows = (await sql.query(
      `SELECT slug FROM sources WHERE status = 'published'`,
    )) as { slug: string }[];
    publishedSlugs = new Set(pubRows.map((r) => r.slug));
    expect(publishedSlugs.size, 'positive control: zero published works — the publish-switch probe is blind').toBeGreaterThan(0);
  }, 30_000);

  it('search path: Tyndale Study Notes is never returned', async () => {
    const { results, total } = await searchCommentaries({ query: 'grace faith love', limit: 100 });
    expect(total).toBeGreaterThan(0);
    assertNoForbiddenAuthors(results.map((r) => r.author), 'searchCommentaries');
    expect(results.some((r) => r.author === 'Tyndale Study Notes')).toBe(false);
  }, 30_000);

  it('search path: explicit Tyndale author filter returns nothing', async () => {
    const { results, total } = await searchCommentaries({
      query: 'repentance',
      author: 'Tyndale Study Notes',
      limit: 50,
    });
    expect(results).toEqual([]);
    expect(total).toBe(0);
  }, 30_000);

  it('teacher legal SQL pool: no quarantined author in top candidates', async () => {
    const sql = getDb();
    const vecStr = `[${sampleVec.join(',')}]`;
    const rows = (await legalBasePool(sql, vecStr, 50)) as Array<{ metadata: unknown }>;
    // §7 RECALL PROBE (2026-07-14): asking for 50 legal rows must return 50. Before migration
    // 012 this returned 5 (HNSW post-filter starvation). If it drops below 50 again, the
    // partial legal index regressed OR the hnsw.ef_search GUC isn't landing (a pooler change
    // dropped the transaction-local SET) — this goes red instead of the retrieval number
    // silently reverting.
    expect(rows.length, 'recall probe: legalBasePool(50) must return 50 (starvation fixed)').toBe(50);
    const authors = rows.map((r) => {
      const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata;
      return (meta as { author: string }).author;
    });
    assertNoForbiddenAuthors(authors, 'legalBasePoolSql');
    for (const forbidden of MUST_NOT_SERVE_AUTHORS) {
      // NO source_type scoping: the served pool spans commentary + the register
      // types (father/sermon/hymn/…) — the old ='commentary' scope let Origen's
      // 'father' rows slide past this sweep unseen (A6 2026-07-17)
      const leaked = (await sql.query(
        `SELECT count(*)::int AS n FROM embeddings
         WHERE user_id IS NULL
           AND ${LEGAL_CORPUS_FILTER}
           AND metadata->>'author' = $1`,
        [forbidden],
      )) as { n: number }[];
      expect(leaked[0]?.n ?? 0, `${forbidden} must not appear inside LEGAL_CORPUS_FILTER`).toBe(0);
    }
  }, 30_000);

  // PRESENCE (§6, 2026-07-13). Behavioral twin of published-authors.test.ts (which is
  // static): every OTHER behavioral test here asserts a forbidden author is ABSENT — none
  // asserted that the teacher's vector pool actually CONTAINS the voices it's supposed to
  // serve. The teacher's B/W/C come from a crosswire ingest ('Albert Barnes') gated by
  // `source_url ILIKE '%crosswire%'`; if that ingest or filter regressed, the teacher would
  // silently serve 6 of 9 and no absence test would notice. This turns that red.
  it('teacher LEGAL_CORPUS_FILTER admits ALL 9 served voices (presence)', async () => {
    const sql = getDb();
    const rows = (await sql.query(
      `SELECT DISTINCT metadata->>'author' AS author FROM embeddings
       WHERE user_id IS NULL AND source_type = 'commentary' AND ${LEGAL_CORPUS_FILTER}`,
    )) as { author: string }[];
    const present = new Set(rows.map((r) => r.author));
    const expected = [
      'John Gill', 'Jamieson, Fausset & Brown', 'Adam Clarke', 'Matthew Henry',
      'Albert Barnes', 'John Wesley', 'John Calvin', 'Augustine of Hippo', 'John Chrysostom',
    ];
    const missing = expected.filter((a) => !present.has(a));
    expect(missing, `teacher must serve all 9 voices; MISSING: ${missing.join(', ')}`).toEqual([]);
  }, 30_000);

  it('teacher retrieveCommentary: no quarantined author in returned chunks', async () => {
    const chunks = await retrieveCommentary(sampleVec, 12, { query: 'John 3:16' });
    expect(chunks.length).toBeGreaterThan(0);
    assertNoForbiddenAuthors(chunks.map((c) => c.metadata.author), 'retrieveCommentary');
    assertAllPublished(
      chunks.map((c) => ({
        author: c.metadata.author,
        book: Math.floor(c.metadata.verseId / 1_000_000),
        sourceUrl: c.metadata.sourceUrl,
        work: (c.metadata as { work?: string }).work,
      })),
      'retrieveCommentary',
    );
  }, 60_000);
});

describe('Layer 1 — static reader forbidden-provenance ratchet', () => {
  it('forbidden-provenance count may only decrease (or must be zero)', (ctx) => {
    const { current, baseline, corpusPresent, mode } = evaluateForbiddenProvenanceRatchet();

    if (!corpusPresent) {
      // HONEST SKIP — do NOT report a green pass here.
      //
      // web/public/commentaries/ is gitignored and has NO build step. It is written by
      // offline ingest scripts and ships to production straight from the operator's
      // machine (`vercel --prod` uploads the local directory). CI therefore CANNOT see
      // the artifact this invariant is about, and any assertion here would be theatre —
      // the previous version asserted the baseline constant against itself and reported
      // green, which is worse than no check because it buys unearned confidence.
      //
      // The REAL, enforced gate is scripts/predeploy-gate.ts, wired into deploy.sh and
      // run on the machine that actually holds the files, immediately before upload.
      console.warn(
        `\n⚠️  RATCHET NOT ENFORCED HERE — static corpus absent (gitignored).\n` +
          `    Committed debt baseline: ${baseline.toLocaleString()} forbidden-provenance entries.\n` +
          `    This invariant is enforced at deploy time by scripts/predeploy-gate.ts, not in CI.\n`,
      );
      ctx.skip();
      return;
    }

    if (mode === 'zero') {
      expect(current, 'at zero baseline, any forbidden provenance fails closed').toBe(0);
      return;
    }

    expect(
      current,
      `ratchet: baseline=${baseline}, current=${current} — forbidden provenance may not increase; commit a lower baseline when content fixes land`,
    ).toBeLessThanOrEqual(baseline);
  });
});
