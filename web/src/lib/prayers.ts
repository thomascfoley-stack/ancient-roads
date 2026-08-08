// The prayer journal's data layer — block `PR1a`.
//
// ── C9: ONE-WAY RETRIEVAL. THIS FILE IS WHERE IT IS KEPT OR LOST. ───────────────────────────────
// The prayer is the QUERY, never the CORPUS. Nothing here embeds, indexes, or hands prayer text to
// a model, and nothing in the retrieval layer reads this table. `prayers-c9.test.ts` asserts both
// directions — including the transitive import graph, because the way this regresses is not a
// direct `import { teach }` that a reviewer would catch, but a helper that innocently pulls the
// embedder in behind it.
//
// **No AI, structurally.** No suggestions, completions, summaries or "insights". A product whose
// position is that AI is not the Holy Spirit cannot put a model in the prayer closet. The absence
// is the feature, and the import-graph test is what keeps it true when nobody is looking.
//
// ── A DISTINCT ENTITY, NOT notes-with-a-flag ────────────────────────────────────────────────────
// Its own table (migration 107), so prayer text is outside every query that already reads notes.
// That is the privacy boundary, not a modelling preference: retrofitting privacy onto a shared
// container does not work.
//
// ── STANDS ALONE, OPTIONAL VERSE REFERENCE (owner ruling 2026-08-08) ────────────────────────────
// `verseId` is nullable and carries NO foreign key. A prayer prompted by John 1:14 keeps the
// reference; one written from the journal has none. The reference is a pointer, not ownership —
// re-versioning or removing a passage must never touch what someone prayed.
//
// Every statement runs through `runAsUser` (RLS binds `app.current_user_id`) AND carries an
// explicit `user_id = ${userId}` predicate. Belt and braces, matching annotations.ts and
// plan/store.ts: RLS is the boundary, the predicate is what makes a policy failure loud instead of
// silent.

import { runAsUser } from '@/lib/db';

export interface Prayer {
  id: string;
  body: string;
  verse_id: number | null;
  created_at: string;
  updated_at: string;
}

/** Longer than a note's practical length and far short of anything pathological. */
export const PRAYER_MAX_LENGTH = 20_000;

/** The journal: mine, newest first, not deleted. Bounded — never an unbounded result set. */
export async function listPrayers(userId: string, limit = 200): Promise<Prayer[]> {
  const capped = Math.min(Math.max(1, limit), 200);
  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT id, body, verse_id, created_at, updated_at
        FROM prayers
        WHERE user_id = ${userId} AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT ${capped}`,
  ]);
  return rows as Prayer[];
}

export async function getPrayer(userId: string, id: string): Promise<Prayer | null> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT id, body, verse_id, created_at, updated_at
        FROM prayers
        WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL`,
  ]);
  return (rows as Prayer[])[0] ?? null;
}

export async function createPrayer(userId: string, body: string, verseId: number | null): Promise<Prayer> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`INSERT INTO prayers (user_id, body, verse_id)
        VALUES (${userId}, ${body}, ${verseId})
        RETURNING id, body, verse_id, created_at, updated_at`,
  ]);
  // NOT `rows[0]!`. A zero-row return — a missing grant, an RLS refusal, a pooler hiccup — would
  // throw a TypeError somewhere less obvious. Migration 106's whole story was a missing grant that
  // surfaced as an opaque 500, so this says what happened.
  const created = (rows as Prayer[])[0];
  if (!created) throw new Error('prayer insert returned no row');
  return created;
}

export async function updatePrayer(userId: string, id: string, body: string): Promise<boolean> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`UPDATE prayers SET body = ${body}, updated_at = now()
        WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
        RETURNING id`,
  ]);
  return (rows as unknown[]).length === 1;
}

/**
 * Soft delete, matching notes/highlights/bookmarks.
 *
 * A tombstone rather than a hard DELETE so an accidental removal has the same recovery window as
 * everything else the reader owns. Account deletion (`T4`) is what removes the row for real, and
 * must enumerate this table — the block's export/delete coupling.
 */
export async function deletePrayer(userId: string, id: string): Promise<boolean> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`UPDATE prayers SET deleted_at = now()
        WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
        RETURNING id`,
  ]);
  return (rows as unknown[]).length === 1;
}
