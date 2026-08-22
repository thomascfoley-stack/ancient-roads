// The one thing the rest of the suite could not prove: @vercel/blob against a LIVE store.
//
// real-files-end-to-end.test.ts substitutes getUserDocument to read bytes from disk, which proves
// the pipeline but leaves the network hop untested. Nothing local substitutes for this, so it
// runs against the real Blob store or it does not run -- and when it does not run it says so
// loudly, because a silently skipped storage test reads exactly like a passing one.
//
// It also proves the leg of §8's cascade that Postgres cannot perform: `document -> sections ->
// embeddings -> anchors -> blob`. The DB cascade is one statement; the blob is outside Postgres,
// and a delete that drops the rows and leaves the file is a privacy bug, not untidiness.
//
//   APP_DATABASE_URL=… npx vitest run test/user-corpus/blob-round-trip.test.ts
//   (BLOB_READ_WRITE_TOKEN is read from web/.env.local if not exported)

import { Buffer } from 'node:buffer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { announceSkip } from '../helpers/loud-skip';
import { deleteUserDocument, getUserDocument, putUserDocument } from '@/lib/user-corpus/blob';
import { runAsUser } from '@/lib/db';
import { createDocument, deleteDocument, getDocument } from '@/lib/user-corpus/documents';
import { drain } from '@/lib/user-corpus/queue';
import { checksum } from '@/lib/user-corpus/sniff';
import { localEnv, runtimeDbUrl } from '../helpers/env';

// The library reads process.env directly, so lift it out of web/.env.local before anything imports it.
const TOKEN = localEnv('BLOB_READ_WRITE_TOKEN');
if (TOKEN && !process.env.BLOB_READ_WRITE_TOKEN) process.env.BLOB_READ_WRITE_TOKEN = TOKEN;

const APP_URL = runtimeDbUrl();
const enabled = Boolean(TOKEN && APP_URL);

// SELF-REPORTED SKIP (2026-08-22). This suite used to skip with a bare console.warn, which put it
// in `ci-skip-ceiling.mjs`'s RESIDUAL bucket: that script defines "secret-caused" as "not
// registered as an artifact skip", so any suite that does not call announceSkip is counted as a
// missing SECRET whatever the real cause. Eight suites were being counted that way and the gate
// was refusing green on the total. announceSkip makes each requirement state its own kind, so the
// count becomes a measurement instead of an elimination — and it cannot launder a secret into an
// exemption: under REQUIRE_SECRETS=1 a missing SECRET throws rather than being recorded.
announceSkip(
  '@vercel/blob against the live store',
  [
    { name: 'BLOB_READ_WRITE_TOKEN', present: Boolean(TOKEN) },
    { name: 'APP_DATABASE_URL', present: Boolean(APP_URL) },
  ],
  'the @vercel/blob network hop — put, get and delete against the real store',
);

const RUN = `blobtest-${Date.now().toString(36)}`;
const USER = `${RUN}-user`;

/** A real .docx, built here so the test carries no fixture and states its own content. */
function docxBytes(text: string): Uint8Array {
  // Reuses the same minimal-zip shape the docx suite builds; a stored (uncompressed) entry keeps
  // this file free of a second deflate implementation.
  const name = Buffer.from('word/document.xml', 'utf8');
  const xml = Buffer.from(`<w:document><w:body><w:p><w:t>${text}</w:t></w:p></w:body></w:document>`, 'utf8');
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(20, 4);
  lh.writeUInt16LE(0, 8); // stored
  lh.writeUInt32LE(xml.length, 18);
  lh.writeUInt32LE(xml.length, 22);
  lh.writeUInt16LE(name.length, 26);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0, 10);
  cd.writeUInt32LE(xml.length, 20);
  cd.writeUInt32LE(xml.length, 24);
  cd.writeUInt16LE(name.length, 28);
  cd.writeUInt32LE(0, 42);
  const local = Buffer.concat([lh, name, xml]);
  const central = Buffer.concat([cd, name]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length, 16);
  return new Uint8Array(Buffer.concat([local, central, eocd]));
}

/**
 * Delete this run's rows AND its blobs.
 *
 * The row-only version of this function leaked 9 blobs across five runs before anyone looked --
 * committing, in the harness, the exact bug the third test asserts against: rows gone, files still
 * on Vercel's storage, named by nothing. Recorded here rather than quietly fixed, because "the
 * cleanup only cleaned the half it could see" is the whole failure mode.
 *
 * It sweeps by PREFIX rather than by the ids it happens to remember, so a test that dies between
 * put and insert still gets cleaned up.
 */
async function cleanup() {
  await runAsUser(USER, (sql) => [sql`DELETE FROM user_documents WHERE user_id = ${USER}`]).catch(() => undefined);
  try {
    const { del, list } = await import('@vercel/blob');
    const { blobs } = await list({ token: process.env.BLOB_READ_WRITE_TOKEN, prefix: `user-corpus/${USER}` });
    if (blobs.length) await del(blobs.map((b) => b.url), { token: process.env.BLOB_READ_WRITE_TOKEN });
  } catch {
    // Cleanup must never fail the suite; residue is caught by the assertion below instead.
  }
}

describe.skipIf(!enabled)('@vercel/blob against the live store', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it('stores and returns the exact bytes, then deletes them', async () => {
    const docId = `${RUN}-roundtrip`;
    // Binary, not text: a store or a transport that mangles encoding would pass a string test and
    // corrupt every PDF and .docx the product will ever hold.
    const original = new Uint8Array(4096);
    for (let i = 0; i < original.length; i++) original[i] = (i * 7 + (i >> 3)) & 0xff;

    const pathname = await putUserDocument(USER, docId, original);
    expect(pathname).toContain(USER);

    const returned = await getUserDocument(pathname);
    expect(returned.byteLength).toBe(original.byteLength);
    // Compare by checksum rather than length: a truncated or re-encoded blob keeps its length in
    // plenty of failure modes and this is the assertion that would notice.
    expect(await checksum(returned)).toBe(await checksum(original));

    await deleteUserDocument(pathname);
    // Deleted means gone. getUserDocument refuses loudly rather than returning empty bytes, which
    // would otherwise reach the parser and be reported to the user as "no readable text" -- a
    // storage fault wearing the costume of a scanned document.
    await expect(getUserDocument(pathname)).rejects.toThrow();
  }, 60_000);

  it('runs the WHOLE pipeline with real storage: upload -> blob -> drain -> parse -> chunking', async () => {
    await cleanup();
    const bytes = docxBytes('The plowman plows for sowing and opens and harrows his ground.');
    const sum = await checksum(bytes);

    const doc = await createDocument(USER, {
      title: 'round trip', filename: 'roundtrip.docx', byteSize: bytes.byteLength, checksum: sum, mimeType: 'docx',
    });
    const pathname = await putUserDocument(USER, doc.id, bytes);
    await runAsUser(USER, (sql) => [
      sql`UPDATE user_documents SET blob_url = ${pathname} WHERE user_id = ${USER} AND id = ${doc.id}`,
    ]);

    // The drain fetches from the real store, parses, and writes status. No substitution anywhere.
    const result = await drain(USER, 1);
    expect(result.processed).toBe(1);

    const after = await getDocument(USER, doc.id);
    expect(after?.status).toBe('chunking'); // parsed, not indexed — steps 3 and 4 do not exist yet
    expect(after?.status).not.toBe('ready');
    expect(after?.extractableChars ?? 0).toBeGreaterThan(0);
  }, 60_000);

  it('deleting a document deletes its blob — the cascade leg Postgres cannot do', async () => {
    await cleanup();
    const bytes = docxBytes('Deletion is a real cascade.');
    const doc = await createDocument(USER, {
      title: 'to delete', filename: 'd.docx', byteSize: bytes.byteLength, checksum: await checksum(bytes), mimeType: 'docx',
    });
    const pathname = await putUserDocument(USER, doc.id, bytes);
    await runAsUser(USER, (sql) => [
      sql`UPDATE user_documents SET blob_url = ${pathname} WHERE user_id = ${USER} AND id = ${doc.id}`,
    ]);

    // Precondition: it is really there, so "gone" afterwards means something.
    expect((await getUserDocument(pathname)).byteLength).toBe(bytes.byteLength);

    expect(await deleteDocument(USER, doc.id)).toBe(true);

    expect(await getDocument(USER, doc.id)).toBeNull();
    // SEED: remove the deleteUserDocument call from deleteDocument -> RED. The row vanishes, the
    // user's file stays on Vercel's storage forever, and nothing in the database still names it.
    await expect(getUserDocument(pathname)).rejects.toThrow();
  }, 60_000);

  it('leaves no blobs of its own behind', async () => {
    // The suite is not allowed to commit the bug it tests for. This ran red the first time: the
    // cleanup deleted rows only, and five runs had left 9 orphaned blobs in the store.
    await cleanup();
    const { list } = await import('@vercel/blob');
    const { blobs } = await list({ token: process.env.BLOB_READ_WRITE_TOKEN, prefix: `user-corpus/${USER}` });
    expect(blobs.map((b) => b.pathname)).toEqual([]);
  }, 60_000);
});
