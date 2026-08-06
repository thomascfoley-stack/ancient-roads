// The only writer of user_documents. Every statement goes through runAsUser, so RLS binds and the
// explicit user_id predicates are a second, independent filter rather than the only one
// (SLICE_1_DATA_MODEL test 1: "verify with two accounts, not by reading policy").

import { runAsUser } from '@/lib/db';
import { deleteUserDocument } from './blob';
import type { DocStatus, DocType, UserDocument } from './types';

interface Row {
  id: string;
  user_id: string;
  title: string;
  doc_type: DocType;
  source_filename: string | null;
  blob_url: string | null;
  byte_size: string | number | null;
  checksum: string | null;
  status: DocStatus;
  parse_error: string | null;
  mime_type: string | null;
  page_count: number | null;
  extractable_chars: number | null;
  attempts: number;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
  // Migration 105 — suggested readings.
  search_categories: string[] | null;
  readings_status: 'pending' | 'running' | 'ready' | 'failed' | null;
  readings_progress: number | null;
  readings_step: string | null;
  readings_error: string | null;
  readings_done_at: string | null;
}

function toDocument(r: Row): UserDocument {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    docType: r.doc_type,
    sourceFilename: r.source_filename,
    blobUrl: r.blob_url,
    // bigint arrives as a string from the driver; Number is exact well past our 25 MB cap.
    byteSize: r.byte_size === null ? null : Number(r.byte_size),
    checksum: r.checksum,
    status: r.status,
    parseError: r.parse_error,
    mimeType: r.mime_type,
    pageCount: r.page_count,
    extractableChars: r.extractable_chars,
    attempts: r.attempts,
    claimedAt: r.claimed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    searchCategories: r.search_categories ?? null,
    readingsStatus: r.readings_status ?? null,
    readingsProgress: r.readings_progress ?? 0,
    readingsStep: r.readings_step ?? null,
    readingsError: r.readings_error ?? null,
    readingsDoneAt: r.readings_done_at ?? null,
  };
}

export async function listDocuments(userId: string): Promise<UserDocument[]> {
  const [rows] = await runAsUser(userId, (sql) => [
    // Bounded: CLAUDE.md forbids unbounded result sets. 200 is far above any plausible personal
    // corpus at this stage and keeps the response one page.
    sql`SELECT * FROM user_documents WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 200`,
  ]);
  return (rows as Row[]).map(toDocument);
}

export async function getDocument(userId: string, id: string): Promise<UserDocument | null> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT * FROM user_documents WHERE user_id = ${userId} AND id = ${id}`,
  ]);
  const r = (rows as Row[])[0];
  return r ? toDocument(r) : null;
}

/** One chunk of the user's own document, in the order they wrote it. */
export interface UserDocumentSection {
  id: string;
  ordinal: number;
  heading: string | null;
  body: string;
}

/**
 * The document's own text, for reading it beside the tradition.
 *
 * BOUNDED, like every other read here (CLAUDE.md: never an unbounded result set). 400 chunks at
 * the ~1200-char packer is roughly a 150-page book — past the point where a single scroll pane is
 * the right surface anyway, and the cap is stated rather than silent.
 */
export async function getDocumentSections(
  userId: string,
  documentId: string,
): Promise<UserDocumentSection[]> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT id, ordinal, heading, body
          FROM user_sections
         WHERE user_id = ${userId} AND document_id = ${documentId}
         ORDER BY ordinal
         LIMIT 400`,
  ]);
  return rows as UserDocumentSection[];
}

export async function findByChecksum(userId: string, sum: string): Promise<UserDocument | null> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT * FROM user_documents WHERE user_id = ${userId} AND checksum = ${sum}`,
  ]);
  const r = (rows as Row[])[0];
  return r ? toDocument(r) : null;
}

/**
 * Create the row in 'queued'. The row exists BEFORE the bytes are parsed and before they are even
 * uploaded to blob storage, on purpose: §8's guarantee is that no document is ever silently
 * dropped, and a document that fails between arriving and being recorded is exactly a silent drop.
 * Recording first means the worst case is a visible row stuck in 'queued', which the drain retries.
 */
export async function createDocument(
  userId: string,
  meta: { title: string; filename: string; byteSize: number; checksum: string; mimeType: string },
): Promise<UserDocument> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`INSERT INTO user_documents (user_id, title, source_filename, byte_size, checksum, mime_type, status)
        VALUES (${userId}, ${meta.title}, ${meta.filename}, ${meta.byteSize}, ${meta.checksum}, ${meta.mimeType}, 'queued')
        RETURNING *`,
  ]);
  return toDocument((rows as Row[])[0]!);
}

export async function setBlobPathname(userId: string, id: string, pathname: string): Promise<void> {
  await runAsUser(userId, (sql) => [
    sql`UPDATE user_documents SET blob_url = ${pathname}, updated_at = now()
        WHERE user_id = ${userId} AND id = ${id}`,
  ]);
}

/**
 * Move a document to a new state. `error` is cleared on every non-failure transition so a retry
 * that succeeds does not leave last time's message sitting under a green status.
 */
export async function setDocStatus(
  userId: string,
  id: string,
  status: DocStatus,
  error?: string | null,
): Promise<void> {
  await runAsUser(userId, (sql) => [
    sql`UPDATE user_documents
        SET status = ${status}, parse_error = ${error ?? null}, updated_at = now()
        WHERE user_id = ${userId} AND id = ${id}`,
  ]);
}

/** Record what the parse actually extracted. Written even when the document is then refused. */
export async function setParseResult(
  userId: string,
  id: string,
  result: { pageCount: number | null; extractableChars: number },
): Promise<void> {
  await runAsUser(userId, (sql) => [
    sql`UPDATE user_documents
        SET page_count = ${result.pageCount}, extractable_chars = ${result.extractableChars}, updated_at = now()
        WHERE user_id = ${userId} AND id = ${id}`,
  ]);
}

/**
 * Full delete: Postgres cascades document -> sections -> {embeddings, anchors} in one statement;
 * the blob is deleted separately because it does not live in Postgres (§8).
 *
 * Blob first, rows second. If the blob delete fails we stop and the row survives, so the user can
 * try again and the file is still accounted for. The other order can orphan a file that no row
 * names, which nothing will ever clean up and no one can find.
 */
export async function deleteDocument(userId: string, id: string): Promise<boolean> {
  const doc = await getDocument(userId, id);
  if (!doc) return false;
  if (doc.blobUrl) await deleteUserDocument(doc.blobUrl);
  await runAsUser(userId, (sql) => [
    sql`DELETE FROM user_documents WHERE user_id = ${userId} AND id = ${id}`,
  ]);
  return true;
}
