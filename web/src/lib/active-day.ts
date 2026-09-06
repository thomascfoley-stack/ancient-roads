import 'server-only';
import { after } from 'next/server';
import { runAsUser } from '@/lib/db';
import { truncateCodePoints } from '@/lib/text';

// ── user_active_day — the vendor-free half of the analytics (migration 130) ──────────────────────
// One row per user per day. That is the whole design, and every property that matters follows from
// the bound: DAU, WAU/MAU, 7-day churn, retention and resurrection all become plain SQL over a
// table that grows with PEOPLE rather than with page loads.
//
// WHY NOT PAGEVIEWS IN POSTGRES: this database also serves the corpus (the HNSW index over ~295k
// sections). A pageview-rate append stream evicts that working set and makes /ask slower — trading
// a measured product gate for dashboards the analytics doc calls non-load-bearing. Migration 130's
// header carries the full reasoning and the conditions for revisiting it.
//
// FAILS OPEN, ALWAYS. A missing activity row costs one point on a retention chart. It must never
// cost a reader their request, so every path here swallows its own errors — the ask-outcomes.ts
// contract, verbatim.

/** `${userId}:${YYYY-MM-DD}` for rows this instance has already written. */
const written = new Set<string>();

/** A warm serverless instance serving many users must not grow this without bound. The cap is
 *  arbitrary and generous; clearing it costs at most one redundant INSERT per user per day, which
 *  the primary key turns into a no-op anyway. */
const MAX_CACHED = 10_000;

/** UTC day. A cohort boundary a few hours off for one reader does not move a retention curve, and
 *  a single timezone keeps "day" meaning one thing across the whole table. */
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// NOTE: there is deliberately no exported cache-reset. One was added for the test and
// `test/invariants/no-dead-user-table-writer.test.ts` correctly flagged it as an export nothing in
// production calls. The test gets a fresh cache with vi.resetModules() instead — test scaffolding
// belongs in the test, not in a module that writes user rows.

async function insertActiveDay(userId: string, day: string): Promise<void> {
  try {
    // NO `ON CONFLICT DO NOTHING`. Postgres requires the proposed row to be SELECT-visible under
    // RLS to run the conflict arbiter, and this table — like waitlist (034) and ask_outcomes (116)
    // — has an INSERT-only policy with no SELECT. That combination fails with "new row violates
    // row-level security policy" on a brand-new row with no conflict at all; it is measured, not
    // theorised (see the waitlist route's comment). So the duplicate is CAUGHT instead of declared:
    // 23505 on the primary key means "already marked active today", which is exactly the no-op
    // ON CONFLICT would have given.
    await runAsUser(userId, (sql) => [
      sql`INSERT INTO user_active_day (user_id, day) VALUES (${userId}, ${day}::date)`,
    ]);
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return; // already active today — success
    const message = truncateCodePoints(String((e as Error)?.message ?? e), 200);
    console.error('[user_active_day] write failed:', message);
    written.delete(`${userId}:${day}`); // release the key so the next request can retry the genuine first write
  }
}

/**
 * Record that this user was active today. Cheap to call on every authenticated request.
 *
 * Called from lib/session.ts, which every authenticated API route and page goes through — one call
 * site, complete coverage. That matters: measuring activity from the ask/search logs alone would
 * miss a reader who spends an hour in Scripture without ever searching, and they are as active as
 * anyone.
 *
 * NEVER THROWS and never returns a promise the caller has to handle: the write is scheduled off the
 * request path and the in-memory set means a warm instance writes at most once per user per day.
 */
export function markActiveDay(userId: string): void {
  if (!userId) return;
  const key = `${userId}:${utcDay()}`;
  if (written.has(key)) return;
  if (written.size >= MAX_CACHED) written.clear();
  written.add(key);

  const day = utcDay();
  try {
    after(() => insertActiveDay(userId, day));
  } catch {
    // Outside a request scope (the upload-route lesson): plain fire-and-forget. insertActiveDay
    // never rejects, so nothing here can throw.
    void insertActiveDay(userId, day);
  }
}
