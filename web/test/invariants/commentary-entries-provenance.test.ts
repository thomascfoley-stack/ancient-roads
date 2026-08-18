// THE COMMENTARY SERVING PREDICATE MUST REFUSE AGGREGATOR PROVENANCE — deep audit H4 + H5.
//
// WHY THIS FILE EXISTS AND fts-legal-index-sync.test.ts DOES NOT COVER IT. That test asserts the
// migration's index predicate equals LEGAL_COMMENTARY_ENTRIES_PREDICATE. It is an EQUALITY between
// two things a single edit changes together — the audit's own words: "it can detect a performance
// regression, never a legality one." When the crosswire condition was dropped in 2026-07, both
// sides were widened in lockstep and that test stayed green while 50,618 aggregator-sourced
// entries became servable. This file asserts the property instead of the agreement.
//
// TWO LEVELS, DELIBERATELY.
//
//   SHAPE (always runs). The provenance leg exists and is ANDed with the author legs, not ORed
//   into them. Not an algebraic identity: the predicate is generated from the canonical domain
//   list, so "does it mention biblehub" is guaranteed by construction and proves nothing, whereas
//   "is the leg conjunctive" is exactly what the 2026-07 regression got wrong.
//
//   EXECUTED (needs a Postgres). Rows are seeded and the REAL predicate string is run as SQL. This
//   is the only level that proves the predicate does what it reads like — that `source_url IS NULL`
//   still admits, that a biblehub Barnes row is refused, and that the crosswire Barnes row beside
//   it is kept. Red-proof 2026-08-01 against a throwaway local Postgres:
//   docs/evidence/h4-h5-provenance-redproof.log

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { LEGAL_COMMENTARY_ENTRIES_PREDICATE } from '@/lib/legal-corpus';
import { FORBIDDEN_PROVENANCE_DOMAINS } from '../../../src/ingest/forbidden-provenance.mjs';
import { announceSkip } from '../helpers/loud-skip';
import { requireDbInCi, runtimeDbUrl, seedOwnerUrl } from '../helpers/env';

describe('shape — the provenance leg is conjunctive', () => {
  it('every canonical forbidden domain is excluded, and the leg is ANDed with the author legs', () => {
    // SEED: change `AND (source_url IS NULL OR (...))` to `OR (...)` -> RED.
    // SEED: delete the leg entirely -> RED.
    for (const d of FORBIDDEN_PROVENANCE_DOMAINS) {
      expect(LEGAL_COMMENTARY_ENTRIES_PREDICATE, `${d} is not excluded`).toContain(`NOT ILIKE '%${d}%'`);
    }
    const legStart = LEGAL_COMMENTARY_ENTRIES_PREDICATE.indexOf('source_url IS NULL');
    expect(legStart, 'no NULL-tolerant provenance leg at all').toBeGreaterThan(0);
    // The author alternation must CLOSE before the provenance leg opens: an `OR` here would make
    // any admitted author bypass provenance entirely, which is the pre-2026-08 behaviour.
    expect(LEGAL_COMMENTARY_ENTRIES_PREDICATE.slice(0, legStart)).toMatch(/\)\s*\n?\s*AND\s*\($/);
  });

  it('a NULL source_url is still admitted — provenance-unknown is not provenance-forbidden', () => {
    // 64,216 of the admitted rows on production carry no source_url (John Gill, JFB, Adam Clarke,
    // Matthew Henry). Excluding them would empty the surface, and `NULL NOT ILIKE x` is NULL, not
    // true — so the IS NULL branch is load-bearing, not defensive.
    expect(LEGAL_COMMENTARY_ENTRIES_PREDICATE).toContain('source_url IS NULL OR');
  });
});

// ── executed ────────────────────────────────────────────────────────────────────────────────
//
// RUNS IN THE db-invariants JOB, against the same test branch every other suite here uses, which
// is why it does NOT touch `commentary_entries`. It seeds a TEMP table carrying only the four
// columns the predicate reads: temp tables are session-scoped, vanish on disconnect, and cannot
// collide with a shared database. An earlier draft did `DROP TABLE IF EXISTS commentary_entries`,
// which would have destroyed the seeded corpus of whatever branch it was pointed at.
//
// `requireDbInCi()` makes a missing URL a hard failure under REQUIRE_DB=1 rather than a green
// skip; `runtimeDbUrl()` THROWS if that URL resolves to production. REDPROOF_DATABASE_URL is a
// local override for a throwaway Postgres and takes precedence over neither guard — it is only
// consulted when no test DB is configured.
// A TEMP TABLE NEEDS THE SAME BACKEND FOR ITS CREATE AND ITS INSERT, and APP_DATABASE_URL is
// Neon's POOLED endpoint — pgbouncer in transaction mode, which hands each statement to whichever
// backend is free. So the CREATE succeeded on one session and the INSERT ran on another, where
// the table had never existed: `relation "fixture" does not exist`, every run, on any pooled
// target. That is why this suite was red against the lane-b branch while the predicate it tests
// was perfectly fine.
//
// seedOwnerUrl() is the DIRECT endpoint, and is already what this repo reserves for suites that
// seed their own fixtures (helpers/env.ts). It refuses production loudly and requires any
// non-dev endpoint to be declared by exact id in SEED_TEST_ENDPOINT, so preferring it here does
// not widen what this can be pointed at.
//
// THE FALLBACK BELOW USED TO UNDO THE PARAGRAPH ABOVE. It read
//     seedOwnerUrl() ?? (requireDbInCi() ? runtimeDbUrl() : REDPROOF_DATABASE_URL)
// and `runtimeDbUrl()` returns APP_DATABASE_URL — the POOLED endpoint this comment has just
// finished explaining cannot hold a temp table. So on any tree without an owner URL the suite
// walked straight back into the documented failure, and did it INTERMITTENTLY: alone it usually
// wins the backend race and passes, under a full parallel run it does not. A flake, in a suite
// whose whole subject is a licensing predicate.
//
// Pooled URLs are now REFUSED rather than used: a missing direct endpoint is a loud NOT RUN,
// which is honest, where a flaky red is not. `-pooler.` is how Neon names them; localhost and any
// direct endpoint pass through unchanged.
const isPooled = (u: string | undefined): boolean => Boolean(u && /-pooler\./.test(u));
const CANDIDATE = seedOwnerUrl() ?? (requireDbInCi() ? runtimeDbUrl() : process.env.REDPROOF_DATABASE_URL);
const PG_URL = isPooled(CANDIDATE) ? undefined : CANDIDATE;
const SKIP = announceSkip(
  'executed — the predicate run as SQL over seeded rows',
  [{ name: 'a DIRECT (non-pooled) test DB — DATABASE_URL via seedOwnerUrl, or REDPROOF_DATABASE_URL', present: Boolean(PG_URL) }],
  'that the predicate actually refuses aggregator rows and keeps their clean twins',
);

describe.skipIf(SKIP)('executed — the predicate run as SQL over seeded rows', () => {
  let client: pg.Client;

  // Every row is a REAL production shape, taken from
  // docs/evidence/serving-provenance-census-2026-08-01.log.
  const ROWS = [
    ['Barnes\' Notes', 'https://biblehub.com/commentaries/barnes/genesis/1.htm', false, 'H4: 21,036 rows like this'],
    ['Barnes\' Notes', 'https://crosswire.org/sword/modules/ModInfo.jsp?modName=Barnes', true, 'the clean twin — must survive'],
    ['John Wesley', 'https://biblehub.com/commentaries/wesley/john/3.htm', false, '18,181 rows'],
    ['John Calvin', 'https://biblehub.com/commentaries/calvin/romans/8.htm', false, '6,163 rows'],
    ['John Calvin', 'https://ccel.org/ccel/calvin/calcom38', true, 'ccel is permitted'],
    ['John Chrysostom', 'https://historicalchristian.faith/john-chrysostom', false, '2,947 rows — added to the list 2026-07-10'],
    ['Augustine of Hippo', 'https://www.newadvent.org/fathers/1701.htm', true, 'newadvent is the permitted edition'],
    ['John Gill', null, true, 'no provenance recorded — unknown is not forbidden'],
    ['John Gill', '', true, 'empty string, the shape forbiddenProvenanceDomain() reads as clean'],
    ['Pelagius', null, false, 'not a published author at all — the author legs still bind'],
  ] as const;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: PG_URL, ssl: /localhost|127\.0\.0\.1/.test(PG_URL!) ? undefined : { rejectUnauthorized: true } });
    await client.connect();
    // TEMP, and never named commentary_entries. Only the columns the predicate reads.
    // book 43 = John, inside Chrysostom's allowance, so the book-scoped leg is exercised.
    await client.query(`CREATE TEMP TABLE fixture (
      id SERIAL PRIMARY KEY, author TEXT NOT NULL, book SMALLINT NOT NULL, work TEXT, source_url TEXT)`);
    for (const [author, url] of ROWS) {
      await client.query('INSERT INTO fixture (author, book, work, source_url) VALUES ($1, 43, NULL, $2)', [author, url]);
    }
  });
  afterAll(async () => {
    await client?.end().catch(() => {}); // the temp table goes with the session
  });

  it('admits exactly the rows it should', async () => {
    const { rows } = await client.query<{ id: number; author: string; source_url: string | null }>(
      `SELECT id, author, source_url FROM fixture WHERE ${LEGAL_COMMENTARY_ENTRIES_PREDICATE} ORDER BY id`,
    );
    const admitted = new Set(rows.map((r) => r.id));
    ROWS.forEach(([author, url, expected, why], i) => {
      expect(admitted.has(i + 1), `${author} <${url ?? 'NULL'}> — ${why}`).toBe(expected);
    });
  });

  it('is not vacuous — it admits some rows and refuses some rows', async () => {
    // A predicate that matched nothing would pass every "must not be admitted" case above.
    const { rows } = await client.query<{ n: string }>(
      `SELECT count(*) AS n FROM fixture WHERE ${LEGAL_COMMENTARY_ENTRIES_PREDICATE}`,
    );
    const n = Number(rows[0]!.n);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(ROWS.length);
  });
});
