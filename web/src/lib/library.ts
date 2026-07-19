// The personal Library read/write layer (docs/LIBRARY_READER_DESIGN.md §4/§10.3).
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE PUBLISHED PREDICATE IS LOAD-BEARING. READ THIS BEFORE ADDING A QUERY.
//
// `library_items.source_id` and `reading_progress.source_id` are plain FKs to `sources(id)`. A
// foreign key CANNOT express "…and only while that source is published". So a user shelves a work
// while it is published, the work is later STAGED or QUARANTINED (a licensing action — CLAUDE.md
// treats licensing as existential and fail-closed), and the shelf row SURVIVES.
//
// Every read path here therefore re-asserts `status = 'published'` itself. Drop it from one query
// and that surface will list and LINK a withdrawn work while `/api/work/[slug]` 404s it — an
// inconsistent surface at best, a licensing exposure at worst. Enforced by
// `test/invariants/library-published-boundary.test.ts`, which shelves a work, flips it to
// staged/quarantined behind the user's back, and demands it vanish from every surface.
//
// The predicate FILTERS, it does not delete: re-publishing restores the row. That is deliberate —
// a quarantine is often reversible, and silently destroying a user's shelf on a licensing hold
// would be worse than hiding it.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// User rows are reached through runAsUser (RLS binds via app.current_user_id); the `sources` join
// is public-read corpus. Every query is LIMIT-capped — never an unbounded result set (CLAUDE.md).

import { runAsUser } from './db';

/** The shelf a work sits on. A work is on exactly ONE shelf per user (027 UNIQUE(user_id, source_id)). */
export type Shelf = 'reading' | 'saved' | 'archived';
export const SHELVES: readonly Shelf[] = ['reading', 'saved', 'archived'] as const;

export function isShelf(v: unknown): v is Shelf {
  return typeof v === 'string' && (SHELVES as readonly string[]).includes(v);
}

export interface LibraryItem {
  sourceId: string;
  slug: string;
  title: string;
  author: string | null;
  sourceType: string | null;
  tradition: string | null;
  shelf: Shelf;
  updatedAt: string;
}

export interface ContinueReadingRow {
  sourceId: string;
  slug: string;
  title: string;
  author: string | null;
  lastOrdinal: number;
  percent: number | null;
  updatedAt: string;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const cap = (n: number | undefined): number => Math.min(Math.max(1, n ?? DEFAULT_LIMIT), MAX_LIMIT);

/** A user's shelved works, newest-touched first. PUBLISHED ONLY (see the header). */
export async function listLibraryItems(
  userId: string,
  opts: { shelf?: Shelf; limit?: number } = {},
): Promise<LibraryItem[]> {
  const limit = cap(opts.limit);
  const shelf = opts.shelf ?? null;
  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT li.source_id::text AS "sourceId", s.slug, s.title, s.author,
               s.source_type AS "sourceType", s.tradition, li.shelf, li.updated_at AS "updatedAt"
        FROM library_items li
        JOIN sources s ON s.id = li.source_id
        WHERE li.user_id = ${userId}
          AND s.status = 'published'
          AND (${shelf}::text IS NULL OR li.shelf = ${shelf}::text)
        ORDER BY li.updated_at DESC, li.id DESC
        LIMIT ${limit}`,
  ]);
  return rows as LibraryItem[];
}

/** "Continue reading": the most recently advanced works. PUBLISHED ONLY (see the header). */
export async function listContinueReading(
  userId: string,
  opts: { limit?: number } = {},
): Promise<ContinueReadingRow[]> {
  const limit = cap(opts.limit);
  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT rp.source_id::text AS "sourceId", s.slug, s.title, s.author,
               rp.last_ordinal AS "lastOrdinal", rp.percent, rp.updated_at AS "updatedAt"
        FROM reading_progress rp
        JOIN sources s ON s.id = rp.source_id
        WHERE rp.user_id = ${userId}
          AND s.status = 'published'
        ORDER BY rp.updated_at DESC, rp.id DESC
        LIMIT ${limit}`,
  ]);
  return rows as ContinueReadingRow[];
}

/** Put a work on a shelf (or move it). Upserts on 027's UNIQUE(user_id, source_id). */
export async function setShelf(userId: string, sourceId: string, shelf: Shelf): Promise<void> {
  await runAsUser(userId, (sql) => [
    sql`INSERT INTO library_items (user_id, source_id, shelf) VALUES (${userId}, ${sourceId}, ${shelf})
        ON CONFLICT (user_id, source_id)
        DO UPDATE SET shelf = EXCLUDED.shelf, updated_at = now()`,
  ]);
}

export async function removeFromLibrary(userId: string, sourceId: string): Promise<void> {
  await runAsUser(userId, (sql) => [
    sql`DELETE FROM library_items WHERE user_id = ${userId} AND source_id = ${sourceId}`,
  ]);
}

/** Save the reading cursor for a work. Upserts on 028's UNIQUE(user_id, source_id). */
export async function saveReadingProgress(
  userId: string,
  sourceId: string,
  lastOrdinal: number,
  percent: number | null,
): Promise<void> {
  await runAsUser(userId, (sql) => [
    sql`INSERT INTO reading_progress (user_id, source_id, last_ordinal, percent)
        VALUES (${userId}, ${sourceId}, ${lastOrdinal}, ${percent})
        ON CONFLICT (user_id, source_id)
        DO UPDATE SET last_ordinal = EXCLUDED.last_ordinal, percent = EXCLUDED.percent, updated_at = now()`,
  ]);
}
