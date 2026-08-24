// The only writer of user_documents. Every statement goes through runAsUser, so RLS binds and the
// explicit user_id predicates are a second, independent filter rather than the only one
// (SLICE_1_DATA_MODEL test 1: "verify with two accounts, not by reading policy").

import { runAsUser } from '@/lib/db';
import { CLAIMED_STATUSES, STALE_CLAIM_MINUTES } from './queue';
import { deleteUserDocument } from './blob';
import { MAX_BYTES_PER_USER, MAX_DOCUMENTS_PER_USER, QuotaExceeded, quotaVerdict } from './quota';
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
  suggested_reference: string | null;
  suggested_date: string | null;
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
    suggestedReference: r.suggested_reference ?? null,
    suggestedDate: r.suggested_date ?? null,
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
 *
 * QUOTA ENFORCEMENT LIVES HERE (B11, owner ruling: option B). The upload route used to run
 * checkUploadQuota and this insert as separate runAsUser calls — separate transactions — so two
 * concurrent uploads both passed the check and both inserted (TOCTOU, the same shape queue.ts's
 * claim and reingest-guard.ts document). Now the usage read and the insert are ONE transaction,
 * and pg_advisory_xact_lock serialises creates per user for its length: this module is the only
 * writer of user_documents, so under the lock the WHERE clause's count/sum cannot change before
 * the insert lands. A refusal throws QuotaExceeded with the same message the pre-flight check
 * always returned; checkUploadQuota keeps that wording via the shared quotaVerdict.
 */
/**
 * D8: thrown when the in-transaction checksum re-check found the file already uploaded — i.e.
 * this caller LOST a dedupe race it could not have seen from outside the lock. Carries the
 * existing document so the route can answer with the same "already uploaded" body its pre-flight
 * `findByChecksum` path returns; the two answers must not disagree.
 */
export class DuplicateDocument extends Error {
  readonly existing: UserDocument;
  constructor(existing: UserDocument) {
    super('document with this checksum already exists');
    this.name = 'DuplicateDocument';
    this.existing = existing;
  }
}

export async function createDocument(
  userId: string,
  meta: { title: string; filename: string; byteSize: number; checksum: string; mimeType: string },
): Promise<UserDocument> {
  const [, usageRows, rows, twinRows] = await runAsUser(userId, (sql) => [
    sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`,
    // Same COALESCE-both-ways read as checkUploadQuota; kept as its own statement so a refusal
    // can name the live usage in the message.
    sql`SELECT count(*)::int AS documents, COALESCE(sum(byte_size), 0)::bigint AS bytes
          FROM user_documents
         WHERE user_id = ${userId}`,
    sql`INSERT INTO user_documents (user_id, title, source_filename, byte_size, checksum, mime_type, status)
        SELECT ${userId}, ${meta.title}, ${meta.filename}, ${meta.byteSize}, ${meta.checksum}, ${meta.mimeType}, 'queued'
        WHERE (SELECT count(*) FROM user_documents WHERE user_id = ${userId}) + 1 <= ${MAX_DOCUMENTS_PER_USER}
          AND (SELECT COALESCE(sum(byte_size), 0) FROM user_documents WHERE user_id = ${userId}) + ${meta.byteSize} <= ${MAX_BYTES_PER_USER}
          -- D8 (DEEP_SWEEP): dedupe was CHECK-THEN-ACT across two transactions — findByChecksum in
          -- its own txn, then this insert in another. B11's advisory lock serialised the QUOTA but
          -- never re-checked the checksum, so two concurrent uploads of the same file (double-tap,
          -- retry-after-timeout — the exact pattern this repo already found in prod for highlights)
          -- both missed dedupe and both inserted: duplicate documents, double blob, double PAID
          -- embedding batch, double quota bytes. Re-checked here, inside the lock, where it holds.
          -- The route's comment already presupposed a constraint the schema does not have
          -- (migration 100 declares checksum TEXT with no unique index); this closes the race
          -- without a migration, which would need an owner-gated production apply.
          AND NOT EXISTS (
            SELECT 1 FROM user_documents WHERE user_id = ${userId} AND checksum = ${meta.checksum}
          )
        RETURNING *`,
    // The twin, if one already existed. ORDER BY is deliberate: findByChecksum has none, so once
    // duplicates exist it returns an ARBITRARY one (D8's related finding). Oldest wins here.
    sql`SELECT * FROM user_documents
         WHERE user_id = ${userId} AND checksum = ${meta.checksum}
         ORDER BY created_at ASC, id ASC LIMIT 1`,
  ]);
  const inserted = (rows as Row[])[0];
  if (!inserted) {
    // D8: a lost dedupe race is NOT a quota refusal. Distinguish them before reading the verdict,
    // or the loser of the race is told their library is full.
    const twin = (twinRows as Row[])[0];
    if (twin) throw new DuplicateDocument(toDocument(twin));
    const u = (usageRows as { documents: number; bytes: string | number }[])[0];
    if (!u) throw new Error('quota query returned no row');
    const verdict = quotaVerdict(u.documents, Number(u.bytes), meta.byteSize);
    if (verdict.ok) throw new Error('createDocument: insert returned no row but usage is within quota');
    throw new QuotaExceeded(verdict);
  }
  return toDocument(inserted);
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
/**
 * D9 (DEEP_SWEEP): requeue a document for retry, atomically, and only if no worker is holding it.
 *
 * The retry route used to call setDocStatus('queued') and resetAttempts as TWO transactions on a
 * row a worker might be actively processing, then kick a drain — so the same document went to a
 * second worker. Both parse and embed it (double paid embedding), and their storeSections
 * DELETE+INSERT pairs are not mutually exclusive under READ COMMITTED, leaving both generations
 * of user_sections until a later re-index heals it.
 *
 * ONE statement, and the claim predicate is the same shape claimNext uses to reclaim a stale row,
 * built from the queue's own CLAIMED_STATUSES so the two lists cannot drift apart. A row whose
 * claim is still fresh is simply not matched, and the caller reports "already running" rather
 * than silently seizing it.
 *
 * Returns false when nothing was requeued.
 */
/**
 * D11 (DEEP_SWEEP): can re-uploading these bytes REPAIR this existing document, rather than
 * bouncing off dedupe?
 *
 * Two cases, and both are dead ends today:
 *  - `blobUrl` null — the row was created before putUserDocument and the put threw. It counts
 *    against quota, the drain fails it with "Please upload it again", and re-uploading returns
 *    the same broken row. The retry route 409s because there is no blob to re-parse.
 *  - `status === 'failed'` — re-uploading the bytes returned the failed row unchanged, so the
 *    natural retry gesture silently no-opped.
 *
 * Exported so the route's branch is the same predicate the tests assert, rather than one typed
 * again in a test file — which would test the test.
 */
export function isHealable(doc: { blobUrl: string | null; status: string }): boolean {
  return !doc.blobUrl || doc.status === 'failed';
}

export async function requeueForRetry(userId: string, id: string): Promise<boolean> {
  const claimed: string[] = [...CLAIMED_STATUSES];
  const [rows] = await runAsUser(userId, (sql) => [
    sql`UPDATE user_documents
           SET status = 'queued', parse_error = NULL, attempts = 0,
               claimed_at = NULL, updated_at = now()
         WHERE user_id = ${userId} AND id = ${id}
           AND NOT (status = ANY(${claimed})
                    AND claimed_at IS NOT NULL
                    AND claimed_at > now() - (${STALE_CLAIM_MINUTES} || ' minutes')::interval)
        RETURNING id`,
  ]);
  return (rows as unknown[]).length > 0;
}

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
  result: {
    pageCount: number | null;
    extractableChars: number;
    /** Display-only chips (migration 124) — never read back into title or behaviour. */
    suggestedReference?: string | null;
    suggestedDate?: string | null;
  },
): Promise<void> {
  await runAsUser(userId, (sql) => [
    sql`UPDATE user_documents
        SET page_count = ${result.pageCount}, extractable_chars = ${result.extractableChars},
            suggested_reference = COALESCE(${result.suggestedReference ?? null}, suggested_reference),
            suggested_date = COALESCE(${result.suggestedDate ?? null}::date, suggested_date),
            updated_at = now()
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
