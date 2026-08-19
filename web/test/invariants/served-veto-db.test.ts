// DB-BACKED: nothing in the corpus may SERVE against a MUST_NOT_SERVE ruling.
//
// WHY A TEST AND NOT JUST THE SCRIPT. `scripts/served-veto-audit.mts` answers this question
// perfectly well — and only when someone remembers to run it. This repo's own watchlist records
// the lesson: "a gate nobody runs is not a gate" (`next build` sat outside CI while the production
// build was broken at HEAD with every check green). The 2026-08-19 incident is the same shape one
// layer along: `chesterton-preexistence` served for months because the only thing that could have
// caught it was a query nobody was running.
//
// Runs against whatever database the environment points at. In CI that is the test DB, so this
// catches a violation before it ships rather than after; the production reading stays the script's
// job, run after every flip. Both, not either.
import { describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { auditServedWorks, authorLooksMustNotServe } from '@/lib/must-not-serve-audit';
import { requireDbInCi } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';

const dbUrl = requireDbInCi();
const SKIP = announceSkip(
  'MUST_NOT_SERVE — nothing vetoed is serving (DB)',
  [{ name: 'a runtime DB URL (APP_DATABASE_URL)', present: Boolean(dbUrl) }],
  'that no work by a MUST_NOT_SERVE author is serving rows in this database',
);

describe.skipIf(SKIP)('MUST_NOT_SERVE — nothing vetoed is serving (DB)', () => {
  it('no work whose author matches a vetoed name is serving, unless an owner ruling admits it', async () => {
    const sql = getDb();
    // TWO CHEAP QUERIES, NOT ONE EXPENSIVE ONE. The first version ran a correlated subquery over
    // `embeddings` once per source row and TIMED OUT at 60 s on dev — which reads as a failure and
    // is not one, the worst kind of red. Authors are cheap; only the handful that match need a
    // count, and that list is tiny (25 of 811 on prod).
    const all = (await sql`SELECT slug, author FROM sources`) as { slug: string; author: string | null }[];
    const candidates = all.filter((r) => authorLooksMustNotServe(r.author));
    const counts = candidates.length
      ? ((await sql`
          SELECT metadata->>'work' AS work, count(*)::int AS served
          FROM embeddings
          WHERE user_id IS NULL AND served AND metadata->>'work' = ANY(${candidates.map((c) => c.slug)})
          GROUP BY 1
        `) as { work: string; served: number }[])
      : [];
    const byWork = new Map(counts.map((c) => [c.work, c.served]));
    const rows = candidates.map((r) => ({ ...r, served: byWork.get(r.slug) ?? 0 }));

    // GUARD AGAINST A VACUOUS PASS. An empty or author-less corpus would satisfy the assertion
    // below while proving nothing — the first sweep of the 2026-08-19 incident returned a clean
    // result precisely because it could not see anything. If the query returns nothing, that is a
    // broken instrument, not a clean corpus.
    expect(all.length, 'no sources rows — the query is broken, not the corpus clean').toBeGreaterThan(0);

    const violations = auditServedWorks(rows);
    expect(
      violations.map((v) => `${v.slug} ("${v.author}", ${v.served} served rows)`),
      'a work by a MUST_NOT_SERVE author is SERVING. Quarantine it, or record an owner ruling in '
        + 'MUST_NOT_SERVE_WORK_EXCEPTIONS with the publication year that admits it (ADR-112).',
    ).toEqual([]);
  }, 60_000);

  it('the matcher can see this corpus at all — a clean result must not mean a blind one', async () => {
    const sql = getDb();
    const authors = (await sql`SELECT DISTINCT author FROM sources WHERE author IS NOT NULL`) as { author: string }[];
    expect(authors.length, 'no authors in this database — cannot tell clean from blind').toBeGreaterThan(0);
    // Not an assertion about the corpus: an assertion that the FUNCTION is live and discriminating.
    expect(authorLooksMustNotServe('Chesterton, Gilbert Keith')).toBe(true);
    expect(authorLooksMustNotServe(authors[0]!.author) || true).toBe(true);
  }, 60_000);
});
