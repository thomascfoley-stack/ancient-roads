import { runAsUser } from './db';

// User highlights + notes, anchored to the canonical verse id
// (book*1e6 + chapter*1e3 + verse). Isolation is enforced by BOTH the explicit
// user_id filter (belt) AND Postgres RLS via app.current_user_id (suspenders) —
// every query runs through runAsUser so the RLS session var is set. See docs/USER_DATA.md
// and docs/SECURITY.md (SEC-2).
//
// Highlights are now sub-verse spans (migration 015): span_start/span_end are character offsets
// into the verse text (half-open), NULL/NULL = a legacy whole-verse highlight. A verse may hold
// MULTIPLE active spans (createHighlight inserts; removeHighlightById deletes one). `color` is the
// background; text_color is the independent text tool. `translation` pins the span to the
// translation it was anchored in (offsets are translation-relative).

export interface Highlight {
  id: string;
  verse_id: number;
  verse_end: number | null;
  color: string; // background color key
  text_color: string | null;
  span_start: number | null; // null = whole verse
  span_end: number | null;
  translation: string | null;
}

export interface Note {
  id: string;
  verse_id: number;
  verse_end: number | null;
  body: string;
  updated_at: string;
}

const chapterRange = (book: number, chapter: number): [number, number] => [
  book * 1_000_000 + chapter * 1_000 + 1,
  book * 1_000_000 + chapter * 1_000 + 1000,
];

const pageLimit = (n: number | undefined): number => Math.min(Math.max(n ?? 100, 1), 200);

export async function getChapterAnnotations(
  userId: string,
  book: number,
  chapter: number,
): Promise<{ highlights: Highlight[]; notes: Note[]; bookmarks: Bookmark[] }> {
  const [lo, hi] = chapterRange(book, chapter);
  const [highlights, notes, bookmarks] = await runAsUser(userId, (sql) => [
    // created_at ASC so later spans win the overlap in flattenToSegments (last covering wins).
    // coalesce(background_color, color): new writes set both; legacy rows have only `color`.
    sql`SELECT id, verse_id, verse_end, coalesce(background_color, color) AS color, text_color, span_start, span_end, translation
        FROM highlights
        WHERE user_id = ${userId} AND verse_id >= ${lo} AND verse_id < ${hi} AND deleted_at IS NULL
        ORDER BY created_at`,
    sql`SELECT id, verse_id, verse_end, body, updated_at FROM notes
        WHERE user_id = ${userId} AND verse_id >= ${lo} AND verse_id < ${hi} AND deleted_at IS NULL
        ORDER BY verse_id`,
    // Fetched in the SAME user-scoped session as the other two, so one round trip carries the
    // whole chapter's annotation state and the reader never renders a partial picture.
    sql`SELECT id, verse_id, label, created_at FROM bookmarks
        WHERE user_id = ${userId} AND target_kind = 'verse'
          AND verse_id >= ${lo} AND verse_id < ${hi} AND deleted_at IS NULL
        ORDER BY verse_id`,
  ]);
  return { highlights: highlights as Highlight[], notes: notes as Note[], bookmarks: bookmarks as Bookmark[] };
}

export interface NewHighlight {
  verseId: number;
  color: string; // background color key
  textColor?: string | null;
  spanStart?: number | null; // null = whole verse
  spanEnd?: number | null;
  translation?: string | null;
}

// Idempotent-create lookup (2026-08 live QA: prod carried TWO identical rows for the same
// user/verse/span/color/translation — the double-submit path, a retry after a timeout or a
// double-tap, INSERTed a twin every time). The route SELECTs first and returns the existing row
// instead of inserting. Read-then-branch is accepted here: unlike notes/bookmarks there is no
// unique index over these columns, so ON CONFLICT has nothing to hang on, and adding one is a
// migration this fix deliberately does not take. `IS NOT DISTINCT FROM` so legacy NULL/NULL
// whole-verse spans match; the coalesce on color mirrors the read path so a legacy row with only
// `color` set still dedupes. The oldest match wins — it is the id any reader already holds.
export async function findHighlight(userId: string, h: NewHighlight): Promise<Highlight | null> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT id, verse_id, verse_end, coalesce(background_color, color) AS color, text_color, span_start, span_end, translation
        FROM highlights
        WHERE user_id = ${userId} AND verse_id = ${h.verseId} AND deleted_at IS NULL
          AND coalesce(background_color, color) = ${h.color}
          AND span_start IS NOT DISTINCT FROM ${h.spanStart ?? null}
          AND span_end IS NOT DISTINCT FROM ${h.spanEnd ?? null}
          AND translation IS NOT DISTINCT FROM ${h.translation ?? null}
        ORDER BY created_at LIMIT 1`,
  ]);
  return (rows as Highlight[])[0] ?? null;
}

// Insert ONE highlight span. Multiple active spans per verse are allowed (no sibling delete) —
// that is the multi-span rework. `color` and `background_color` are both set so a reader on the
// pre-migration schema still renders the right background during the deploy gap.
export async function createHighlight(userId: string, h: NewHighlight): Promise<Highlight> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`INSERT INTO highlights (user_id, verse_id, color, background_color, text_color, span_start, span_end, translation)
        VALUES (${userId}, ${h.verseId}, ${h.color}, ${h.color}, ${h.textColor ?? null}, ${h.spanStart ?? null}, ${h.spanEnd ?? null}, ${h.translation ?? null})
        RETURNING id, verse_id, verse_end, coalesce(background_color, color) AS color, text_color, span_start, span_end, translation`,
  ]);
  return (rows as Highlight[])[0]!;
}

// Soft-delete one span by id (RLS + user_id filter both scope it to the owner).
export async function removeHighlightById(userId: string, id: string): Promise<void> {
  await runAsUser(userId, (sql) => [
    sql`UPDATE highlights SET deleted_at = now() WHERE user_id = ${userId} AND id = ${id} AND deleted_at IS NULL`,
  ]);
}

// Clear ALL active spans on a verse (the whole-verse "clear" affordance).
export async function removeHighlight(userId: string, verseId: number): Promise<void> {
  await runAsUser(userId, (sql) => [
    sql`UPDATE highlights SET deleted_at = now() WHERE user_id = ${userId} AND verse_id = ${verseId} AND deleted_at IS NULL`,
  ]);
}

// One active note per verse, enforced by the unique partial index idx_notes_user_verse
// (user_id, verse_id) WHERE deleted_at IS NULL. Single-statement atomic upsert — no
// read-then-branch — so it fits one runAsUser transaction over the stateless HTTP driver.
// See db/migrations/002_notes_unique_active.sql.
export async function upsertNote(
  userId: string,
  verseId: number,
  body: string,
): Promise<Note> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`INSERT INTO notes (user_id, verse_id, body) VALUES (${userId}, ${verseId}, ${body})
        ON CONFLICT (user_id, verse_id) WHERE deleted_at IS NULL AND target_kind = 'verse'
        DO UPDATE SET body = EXCLUDED.body, updated_at = now()
        RETURNING id, verse_id, verse_end, body, updated_at`,
  ]);
  return (rows as Note[])[0]!;
}

export async function removeNote(userId: string, verseId: number): Promise<void> {
  await runAsUser(userId, (sql) => [
    sql`UPDATE notes SET deleted_at = now() WHERE user_id = ${userId} AND verse_id = ${verseId} AND deleted_at IS NULL`,
  ]);
}

// ── bookmarks ────────────────────────────────────────────────────────────────────────────────
// The table, its RLS policy and its USER_TABLE_SPEC entry all shipped with migration 026; the
// WRITE PATH did not. `onBookmark` in selection-popover.tsx had zero call sites, so the button it
// gates never rendered and the feature existed everywhere except where a reader could reach it
// (A7b walk, 2026-08-02).
//
// A bookmark is a PLACE, not an annotation: no body, no colour, no offsets. So it toggles rather
// than accumulating — a verse is bookmarked or it is not, and pressing it twice leaves no trail.
// `target_kind = 'verse'` is written explicitly to satisfy the table's XOR check, which forbids a
// row that carries both a verse and a section.

export interface Bookmark {
  id: string;
  verse_id: number;
  label: string | null;
  created_at: string;
}

/**
 * Add a bookmark, or return the one already there.
 *
 * SINGLE-STATEMENT UPSERT, for the reason `upsertNote` above states: a read-then-branch does not
 * fit one runAsUser transaction over the stateless HTTP driver, and between the SELECT and the
 * INSERT another request can land. My first version did exactly that, and it was worse than slow
 * — migration 026 carries `idx_bookmarks_user_verse` UNIQUE (user_id, verse_id) WHERE deleted_at
 * IS NULL AND target_kind = 'verse', so the loser of that race got a duplicate-key error and the
 * reader got a 500 for pressing a toggle twice quickly.
 *
 * `DO UPDATE SET label = coalesce(EXCLUDED.label, bookmarks.label)` rather than DO NOTHING: DO
 * NOTHING returns no row, so the caller would have to re-read to answer at all, which reopens the
 * two-statement problem it was meant to close. A re-bookmark with no label leaves an existing
 * label alone.
 */
export async function createBookmark(userId: string, verseId: number, label?: string | null): Promise<Bookmark> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`INSERT INTO bookmarks (user_id, target_kind, verse_id, label)
        VALUES (${userId}, 'verse', ${verseId}, ${label ?? null})
        ON CONFLICT (user_id, verse_id) WHERE deleted_at IS NULL AND target_kind = 'verse'
        DO UPDATE SET label = coalesce(EXCLUDED.label, bookmarks.label)
        RETURNING id, verse_id, label, created_at`,
  ]);
  return (rows as Bookmark[])[0]!;
}

/** Soft-delete, matching highlights and notes — `deleted_at`, never a hard DELETE. */
export async function removeBookmark(userId: string, verseId: number): Promise<void> {
  await runAsUser(userId, (sql) => [
    sql`UPDATE bookmarks SET deleted_at = now()
        WHERE user_id = ${userId} AND target_kind = 'verse' AND verse_id = ${verseId} AND deleted_at IS NULL`,
  ]);
}

export interface BookmarkCursor {
  createdAt: string;
  id: string;
}

/** A user's bookmarks, newest first, PAGINATED — never unbounded (CLAUDE.md). */
export async function listBookmarks(
  userId: string,
  limit?: number,
  cursor?: BookmarkCursor,
): Promise<Bookmark[]> {
  const lim = pageLimit(limit);
  const [rows] = await runAsUser(userId, (sql) => [
    cursor
      ? sql`SELECT id, verse_id, label, created_at FROM bookmarks
            WHERE user_id = ${userId} AND deleted_at IS NULL AND target_kind = 'verse'
              AND (created_at, id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)
            ORDER BY created_at DESC, id DESC LIMIT ${lim}`
      : sql`SELECT id, verse_id, label, created_at FROM bookmarks
            WHERE user_id = ${userId} AND deleted_at IS NULL AND target_kind = 'verse'
            ORDER BY created_at DESC, id DESC LIMIT ${lim}`,
  ]);
  return rows as Bookmark[];
}

export interface NoteCursor {
  updatedAt: string;
  id: string;
}
export interface HighlightCursor {
  createdAt: string;
  id: string;
}

// All of a user's notes, newest first, PAGINATED (never unbounded — CLAUDE.md). Keyset on
// (updated_at DESC, id DESC) via idx_notes_user_updated_id. Pass the last row's cursor to page on.
export async function listNotes(
  userId: string,
  limit?: number,
  cursor?: NoteCursor,
): Promise<Note[]> {
  const lim = pageLimit(limit);
  const [rows] = await runAsUser(userId, (sql) => [
    cursor
      ? sql`SELECT id, verse_id, verse_end, body, updated_at FROM notes
            WHERE user_id = ${userId} AND deleted_at IS NULL AND target_kind = 'verse'
              AND (updated_at, id) < (${cursor.updatedAt}::timestamptz, ${cursor.id}::uuid)
            ORDER BY updated_at DESC, id DESC LIMIT ${lim}`
      : sql`SELECT id, verse_id, verse_end, body, updated_at FROM notes
            WHERE user_id = ${userId} AND deleted_at IS NULL AND target_kind = 'verse'
            ORDER BY updated_at DESC, id DESC LIMIT ${lim}`,
  ]);
  return rows as Note[];
}

// All of a user's highlights, newest first, PAGINATED. Keyset on (created_at DESC, id DESC)
// via idx_highlights_user_created.
export async function listHighlights(
  userId: string,
  limit?: number,
  cursor?: HighlightCursor,
): Promise<Highlight[]> {
  const lim = pageLimit(limit);
  const [rows] = await runAsUser(userId, (sql) => [
    cursor
      ? sql`SELECT id, verse_id, verse_end, coalesce(background_color, color) AS color, text_color, span_start, span_end, translation
            FROM highlights
            WHERE user_id = ${userId} AND deleted_at IS NULL AND target_kind = 'verse'
              AND (created_at, id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)
            ORDER BY created_at DESC, id DESC LIMIT ${lim}`
      : sql`SELECT id, verse_id, verse_end, coalesce(background_color, color) AS color, text_color, span_start, span_end, translation
            FROM highlights
            WHERE user_id = ${userId} AND deleted_at IS NULL AND target_kind = 'verse'
            ORDER BY created_at DESC, id DESC LIMIT ${lim}`,
  ]);
  return rows as Highlight[];
}
