// THE ONE CHECK EVERY DESTRUCTIVE RE-INGEST RUNS, INSIDE ITS OWN TRANSACTION.
//
// Two findings from the 2026-08-02 deep audit, and they are the same shape: a decision taken
// where it cannot bind.
//
// M22 — TOCTOU. `ingest-sermon.ts:198-202` and `ingest-historian.ts:142-146` each ran
//   SELECT status FROM sources WHERE slug=$1
// and refused if it read 'published'. Both ran that SELECT **before** `BEGIN`; the
// `DELETE FROM sections WHERE source_id=$1` then ran in the transaction that followed. Between
// the two, a publish flip can commit — and six works became publishable on 2026-08-01, which is
// when that window started mattering. The read and the write have to be in one transaction, and
// the row has to be LOCKED, or a flip that starts after the read still commits before the delete.
//
// M22b — `migrate-sections-slice.ts` never had the check at all. It is the script that wrote all
// 72,863 production sections, it is exposed as `pnpm migrate:sections-slice`, and it deletes every
// section of the slug it re-slices. Its guard was the optional wrapper.
//
// M21 — the FK that turns a re-ingest into a hard failure. `notes.section_id`,
// `highlights.section_id` and `bookmarks.section_id` REFERENCE sections(id) with NO ON DELETE
// action, so `DELETE FROM sections` raises 23503 the moment one annotation points into the work.
// ADR-027's drift design assumes sections get replaced; the FK forbids it. Measured on production
// 2026-08-01: all three tables are EMPTY, so nothing is broken today — this fires the first time a
// user annotates a work that is later re-ingested, and a bare 23503 mid-transaction is an
// unhelpful way to learn it.
//
// WHY THE FK IS NOT GIVEN AN ON DELETE ACTION. CASCADE silently deletes a user's notes because a
// corpus job re-ran, which is the one outcome nobody would choose. SET NULL violates the 025 CHECK
// (`target_kind='section'` requires `section_id IS NOT NULL`). RESTRICT is what NO ACTION already
// does. So refusing IS the right behaviour, and the fix is to refuse in a way that names the
// problem and the remedy instead of surfacing a constraint code. Migration 036 adds the missing
// indexes so the refusal is also cheap to check.

import type { Client } from 'pg';

export interface ReingestTarget {
  /** `sources.id`, or null when the slug has never been ingested (nothing to protect). */
  sourceId: string | null;
  annotations: number;
}

/**
 * Assert that `slug` may be destructively re-ingested. MUST be called AFTER `BEGIN`, on the same
 * client that will run the DELETE — the `FOR UPDATE` is the entire point, and a call outside the
 * transaction reintroduces exactly the window this closes.
 *
 * @throws if the work is published, or if any annotation anchors into its sections.
 */
export async function assertReingestable(db: Client, slug: string, what: string): Promise<ReingestTarget> {
  // NOTE ON ENFORCEMENT. There is no reliable server-side way to ask "am I inside a transaction
  // block": `transaction_isolation` reads identically either way, `pg_current_xact_id_if_assigned()`
  // stays null until a write, and `SELECT ... FOR UPDATE` in autocommit succeeds and drops the lock
  // immediately — which is precisely the silent failure. So the contract is enforced STATICALLY
  // instead, by test/invariants/reingest-guard-wiring.test.ts, which reads each of the three
  // callers and asserts the call sits between its `BEGIN` and its `DELETE FROM sections`. A guard
  // whose precondition is unenforceable at runtime gets checked where it CAN be checked, rather
  // than getting a runtime check that always passes.
  const { rows } = await db.query<{ id: string; status: string }>(
    `SELECT id, status FROM sources WHERE slug = $1 FOR UPDATE`,
    [slug],
  );
  const row = rows[0];
  if (!row) return { sourceId: null, annotations: 0 };

  if (row.status === 'published') {
    throw new Error(
      `STOP: ${slug} is PUBLISHED — ${what} would replace owner-approved content; unpublish first.\n` +
        `  (Checked inside the transaction, on a row locked FOR UPDATE: a publish flip cannot land\n` +
        `   between this check and the delete.)`,
    );
  }

  // The three annotation tables, only those that exist on this database — dev branches predating
  // 025/026 have none, and a missing table must not read as "no annotations" by accident.
  const { rows: present } = await db.query<{ t: string }>(
    `SELECT t FROM unnest(ARRAY['notes','highlights','bookmarks']) t WHERE to_regclass('public.' || t) IS NOT NULL`,
  );
  let annotations = 0;
  for (const { t } of present) {
    const { rows: n } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${t} a JOIN sections s ON s.id = a.section_id WHERE s.source_id = $1`,
      [row.id],
    );
    annotations += n[0]!.n;
  }
  if (annotations > 0) {
    throw new Error(
      `STOP: ${annotations} user annotation(s) anchor into ${slug}'s sections, and ${what} deletes them.\n` +
        `  notes/highlights/bookmarks REFERENCE sections(id) with no ON DELETE action, so the DELETE\n` +
        `  would fail with 23503 partway through the transaction. This refuses first, with the count.\n` +
        `  Deliberately NOT auto-resolved: CASCADE would delete a user's notes because a corpus job\n` +
        `  re-ran, and SET NULL violates the 025 target_kind CHECK. Re-anchoring is an owner slice.`,
    );
  }
  return { sourceId: row.id, annotations };
}
