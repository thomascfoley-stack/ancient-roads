// Per-user upload quotas — UPLOADER_DESIGN §2's beta table, built (2026-08-20 deep dive, H5b).
//
// The design documented these numbers on 2026-08-05 and nothing enforced them: every accepted
// upload buys blob storage plus an embedding batch, unbounded per account. The two limits here
// are the ACCEPT-time pair (documents, bytes); the per-drain chunk/embedding budget is the
// drain's own concern in queue.ts and deliberately not duplicated here.
//
// One query, through runAsUser so RLS binds. `user_documents` deletes are HARD deletes
// (documents.ts deleteDocument issues DELETE; migrations 100/102 define no soft-delete column),
// so a plain count/sum over the user's rows IS the live usage — deleting a document frees quota
// immediately. Rows in 'failed'/'empty' still count: their bytes are still in the blob store and
// the cure (delete or retry) is in the user's hands, so counting them is honest.

import { runAsUser } from '@/lib/db';

// §2 beta numbers (Q3: "adopt; revisit at pricing"). Exported so the H5b suite pins the shipped
// values rather than restating them.
export const MAX_DOCUMENTS_PER_USER = 200;
export const MAX_BYTES_PER_USER = 100 * 1024 * 1024;

export type QuotaVerdict =
  | { ok: true }
  | {
      ok: false;
      limit: 'documents' | 'bytes';
      /** Human-readable, names the limit and the current usage; the route returns it verbatim. */
      message: string;
      documents: number;
      bytes: number;
    };

const MB = 1024 * 1024;

/**
 * May this user accept `incomingBytes` more? Called AFTER the size cap and dedupe, BEFORE
 * createDocument. Throws on a DB fault — the upload route's catch turns that into a 500 with
 * nothing accepted, which is the fail-closed direction for a spend gate.
 */
export async function checkUploadQuota(userId: string, incomingBytes: number): Promise<QuotaVerdict> {
  const [rows] = await runAsUser(userId, (sql) => [
    // COALESCE both ways: sum() over zero rows is NULL, and sum() skips NULL byte_size rows —
    // either surfacing as NULL here would compare as "under quota" forever (the watchlist's
    // three-valued-logic lesson).
    sql`SELECT count(*)::int AS documents, COALESCE(sum(byte_size), 0)::bigint AS bytes
          FROM user_documents
         WHERE user_id = ${userId}`,
  ]);
  const r = (rows as { documents: number; bytes: string | number }[])[0];
  if (!r) throw new Error('quota query returned no row');
  const documents = r.documents;
  const bytes = Number(r.bytes); // bigint arrives as a string; exact well past 100 MB

  if (documents + 1 > MAX_DOCUMENTS_PER_USER) {
    return {
      ok: false,
      limit: 'documents',
      message: `You have reached the limit of ${MAX_DOCUMENTS_PER_USER} documents (you have ${documents}). Delete a document to upload another.`,
      documents,
      bytes,
    };
  }
  if (bytes + incomingBytes > MAX_BYTES_PER_USER) {
    return {
      ok: false,
      limit: 'bytes',
      message: `This file would take you past the ${Math.floor(MAX_BYTES_PER_USER / MB)} MB storage limit (you have used ${(bytes / MB).toFixed(1)} MB). Delete a document to free up space.`,
      documents,
      bytes,
    };
  }
  return { ok: true };
}
