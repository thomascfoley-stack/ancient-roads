import { runAsUser } from './db';

// User highlights + notes, anchored to the canonical verse id
// (book*1e6 + chapter*1e3 + verse). Isolation is enforced by BOTH the explicit
// user_id filter (belt) AND Postgres RLS via app.current_user_id (suspenders) —
// every query runs through runAsUser so the RLS session var is set. See docs/USER_DATA.md
// and docs/SECURITY.md (SEC-2).

export interface Highlight {
  id: string;
  verse_id: number;
  verse_end: number | null;
  color: string;
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

export async function getChapterAnnotations(
  userId: string,
  book: number,
  chapter: number,
): Promise<{ highlights: Highlight[]; notes: Note[] }> {
  const [lo, hi] = chapterRange(book, chapter);
  const [highlights, notes] = await runAsUser(userId, (sql) => [
    sql`SELECT id, verse_id, verse_end, color FROM highlights
        WHERE user_id = ${userId} AND verse_id >= ${lo} AND verse_id < ${hi} AND deleted_at IS NULL`,
    sql`SELECT id, verse_id, verse_end, body, updated_at FROM notes
        WHERE user_id = ${userId} AND verse_id >= ${lo} AND verse_id < ${hi} AND deleted_at IS NULL
        ORDER BY verse_id`,
  ]);
  return { highlights: highlights as Highlight[], notes: notes as Note[] };
}

// One active highlight per verse: soft-delete any existing, then insert.
export async function setHighlight(
  userId: string,
  verseId: number,
  color: string,
): Promise<Highlight> {
  const [, inserted] = await runAsUser(userId, (sql) => [
    sql`UPDATE highlights SET deleted_at = now() WHERE user_id = ${userId} AND verse_id = ${verseId} AND deleted_at IS NULL`,
    sql`INSERT INTO highlights (user_id, verse_id, color) VALUES (${userId}, ${verseId}, ${color})
        RETURNING id, verse_id, verse_end, color`,
  ]);
  return (inserted as Highlight[])[0]!;
}

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
        ON CONFLICT (user_id, verse_id) WHERE deleted_at IS NULL
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

// All of a user's notes, newest first (for the "My library" view).
export async function listNotes(userId: string): Promise<Note[]> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT id, verse_id, verse_end, body, updated_at FROM notes
        WHERE user_id = ${userId} AND deleted_at IS NULL ORDER BY updated_at DESC`,
  ]);
  return rows as Note[];
}

// All of a user's highlights, in canonical order (for the "My library" view).
export async function listHighlights(userId: string): Promise<Highlight[]> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT id, verse_id, verse_end, color FROM highlights
        WHERE user_id = ${userId} AND deleted_at IS NULL ORDER BY verse_id`,
  ]);
  return rows as Highlight[];
}
