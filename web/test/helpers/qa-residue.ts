import pg from 'pg';
import { seedOwnerUrl } from './env';

// SWEEP THE ROWS AN INTERRUPTED RUN LEFT BEHIND.
//
// THE HAZARD, which `scripts/check-test-residue.mjs` states and no suite implemented: a tenancy
// suite names its users `qa-something-${Date.now()}`, so the ids exist only inside the process
// that made them. Kill that process — a timeout, a failed assertion in `beforeAll`, ^C — and
// `afterAll` never runs, the ids are gone forever, and NOTHING will ever reap those rows. Every
// later run invents new ids and cleans only after itself. The residue is therefore permanent by
// construction, and it accumulates on a SHARED dev database.
//
// That is exactly how the 9 rows found on 2026-08-17 got there (`qa-rls-a-…` across 7 tables,
// `qa-research-edge-…` across chats+messages, all seeded 14:38 UTC by a run that did not finish).
// Each suite's teardown was correct for the happy path and had no answer for any other.
//
// WHY THIS NEEDS THE OWNER ROLE, and why that is not a step backwards. A sweep is by PREFIX
// (`user_id LIKE 'qa-rls-a-%'`), and the whole point of RLS is that `app_runtime` cannot see rows
// belonging to a user it is not currently acting as — so a prefix sweep through `runAsUser` can
// only ever match the caller's own rows, which is precisely the case that already works. The
// suites therefore keep their existing RLS-scoped deletes as the primary teardown and stay
// runnable with no owner credentials at all; this is an ADDITIONAL best-effort pass that runs when
// the credentials happen to be there.
//
// It is deliberately LOUD when it cannot run. A silent no-op would read as "swept" to the next
// person debugging the residue gate, which is the failure this repo files under "unearned green".

/** Postgres identifier, conservatively. Table names come from the suites as literals; this is
 *  belt-and-braces, because they are interpolated rather than bound (an identifier cannot be a
 *  bind parameter) and a helper that interpolates should say why it is safe to. */
const IDENT = /^[a-z_][a-z0-9_]*$/;

/**
 * Best-effort prefix sweep of seeded user rows, for use in `afterAll` AFTER the suite's own
 * RLS-scoped deletes.
 *
 * @param prefixes user-id prefixes WITHOUT the trailing `%`, e.g. `['qa-rls-a-', 'qa-rls-b-']`
 * @param tables   in FK-safe order — children before parents (`annotation_tags` before `tags`)
 */
export async function sweepQaResidue(
  prefixes: readonly string[],
  tables: readonly string[],
): Promise<void> {
  for (const t of tables) {
    if (!IDENT.test(t)) throw new Error(`sweepQaResidue: refusing suspicious table name ${JSON.stringify(t)}`);
  }
  for (const p of prefixes) {
    // A bare `%`, or an empty prefix, would sweep EVERY user's rows off the target. Refuse loudly.
    if (!/^qa[-_]/.test(p) || p.includes('%')) {
      throw new Error(`sweepQaResidue: prefix must start with "qa-"/"qa_" and contain no wildcard, got ${JSON.stringify(p)}`);
    }
  }

  // seedOwnerUrl() THROWS if pointed at production and returns undefined for an undeclared
  // endpoint — the same one definition every seeding suite uses. Never re-implement that check.
  const url = seedOwnerUrl();
  if (!url) {
    console.warn(
      `⚠  qa-residue sweep NOT RUN (no owner DATABASE_URL) for ${prefixes.join(', ')}. `
      + 'Rows stranded by an INTERRUPTED earlier run are still there; this run cleaned only after itself.',
    );
    return;
  }

  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
  } catch (e) {
    console.warn(`⚠  qa-residue sweep could not connect: ${(e as Error).message}`);
    return;
  }
  try {
    for (const table of tables) {
      for (const prefix of prefixes) {
        // Each delete INDEPENDENTLY: one failure (a table absent on this branch, a permission
        // gap) must not skip the rest. That is the residue gate's own instruction, and the
        // single-batch teardowns it caught are what happens without it.
        try {
          const { rowCount } = await client.query(
            `DELETE FROM ${table} WHERE user_id LIKE $1`,
            [`${prefix}%`],
          );
          if (rowCount) console.warn(`  qa-residue: reaped ${rowCount} stranded ${table} row(s) matching ${prefix}%`);
        } catch (e) {
          console.error(`  qa-residue: sweep of ${table} for ${prefix}% failed: ${(e as Error).message}`);
        }
      }
    }
  } finally {
    await client.end().catch(() => {});
  }
}
