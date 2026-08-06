// Raw-file storage for uploads (Vercel Blob).
//
// PRIVATE, NOT PUBLIC. `access: 'private'` is not a default to drift off -- a user's sermon
// manuscript is the most sensitive thing this product will ever hold, and `access: 'public'`
// publishes it at a URL that needs no credential. Unguessable is not private: an unguessable URL
// leaks by being pasted, logged, put in a Referer header, or read out of the `blob_url` column by
// anything that can see one row. The four tables are behind RLS; the bytes they describe must not
// be reachable without it.
//
// WHY THE PATHNAME IS STORED, NOT THE URL. Private blobs are read back through the SDK by
// pathname with the token. Persisting a URL would invite someone to fetch it directly, which
// either fails confusingly or, if access ever regressed to public, succeeds and quietly serves the
// file to anyone. The column is named `blob_url` in migration 100; the value is a pathname. Named
// here rather than renamed, because renaming a column mid-slice costs a migration and the comment
// is where the reader actually is.

import { Buffer } from 'node:buffer';
import { del, get, put } from '@vercel/blob';
import { UploadRefused } from './types';

function token(): string {
  const t = process.env.BLOB_READ_WRITE_TOKEN;
  if (!t) {
    // Loud rather than silent. A pipeline that "succeeds" while retaining nothing would leave
    // every document unretryable and nobody would find out until a retry was needed.
    throw new Error(
      'BLOB_READ_WRITE_TOKEN is not set. Uploads need a Vercel Blob store; refusing to accept a ' +
        'document whose bytes cannot be retained (retry would be impossible).',
    );
  }
  return t;
}

/** Deterministic, user-scoped, and collision-free without a random suffix (the id is a uuid). */
export function blobPathname(userId: string, documentId: string): string {
  return `user-corpus/${userId}/${documentId}`;
}

export async function putUserDocument(userId: string, documentId: string, bytes: Uint8Array): Promise<string> {
  const pathname = blobPathname(userId, documentId);
  const result = await put(pathname, Buffer.from(bytes), {
    access: 'private',
    token: token(),
    // The id already makes this unique; a random suffix would make the pathname unrecoverable
    // from (userId, documentId) and force a second column to remember it.
    addRandomSuffix: false,
    // Never let the browser sniff-and-render a stored upload.
    contentType: 'application/octet-stream',
  });
  return result.pathname;
}

/** Read the original bytes back. This is what makes retry a retry rather than a re-upload. */
export async function getUserDocument(pathname: string): Promise<Uint8Array> {
  const result = await get(pathname, { access: 'private', token: token() });
  if (!result?.stream) {
    // The row names a blob that is not there. Loud, because the alternative is returning empty
    // bytes, which parse would then report as "no readable text" -- a storage fault wearing the
    // costume of a scanned document, and the user would be told to OCR a file that is fine.
    throw new UploadRefused('corrupt', 'The stored file could not be found. Please upload it again.');
  }
  const chunks: Uint8Array[] = [];
  const reader = result.stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/**
 * Delete the stored bytes. The DB cascade (document -> sections -> embeddings -> anchors) is one
 * statement; the blob is outside Postgres and is the one leg of §8's cascade that the database
 * cannot perform. A delete that drops the rows and leaves the file is a privacy bug, not untidiness.
 */
export async function deleteUserDocument(pathname: string): Promise<void> {
  await del(pathname, { token: token() });
}

export { UploadRefused };
