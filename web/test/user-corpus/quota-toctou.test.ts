// B11 — upload quota TOCTOU (#116). Owner ruling 2026-08-23: option B — quota enforcement moves
// INSIDE createDocument, so the usage check and the insert are one transaction, serialised per
// user by pg_advisory_xact_lock(hashtext(userId)). Before the fix the route ran checkUploadQuota
// and createDocument as separate runAsUser calls, and two concurrent uploads both passed the
// check and both inserted.
//
// Runs against the real dev DB (the helpers/env pattern): the property under test IS
// concurrency, and no mock can hold an advisory lock. The byte quota is the sharper edge (BUG_SWEEP
// B11: an overshoot costs real embedding spend), so the byte leg comes first.
//
// Red-proof: against the unfixed createDocument both concurrent calls succeed and both
// "exactly one succeeds" assertions fail.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { runAsUser } = await import('@/lib/db');
const { createDocument } = await import('@/lib/user-corpus/documents');
const { MAX_BYTES_PER_USER, MAX_DOCUMENTS_PER_USER } = await import('@/lib/user-corpus/quota');
const { runtimeDbUrl } = await import('../helpers/env');

const enabled = Boolean(runtimeDbUrl());
if (!enabled) console.warn('⚠ SKIPPED (visibly): quota TOCTOU suite needs APP_DATABASE_URL.');

const RUN = `toctou-${Date.now().toString(36)}`;
const BYTE_USER = `${RUN}-bytes`;
const DOC_USER = `${RUN}-docs`;

function meta(tag: string, byteSize: number) {
  return {
    title: tag,
    filename: `${tag}.txt`,
    byteSize,
    checksum: `${RUN}-${tag}-${Math.random().toString(36).slice(2)}`,
    mimeType: 'txt',
  };
}

/** Settle a createDocument into { ok, doc | error } so both racers can be inspected. */
async function settle(p: Promise<unknown>): Promise<{ ok: true } | { ok: false; error: Error }> {
  try {
    await p;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e as Error };
  }
}

async function usage(userId: string): Promise<{ documents: number; bytes: number }> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT count(*)::int AS documents, COALESCE(sum(byte_size), 0)::bigint AS bytes
          FROM user_documents WHERE user_id = ${userId}`,
  ]);
  const r = (rows as { documents: number; bytes: string | number }[])[0]!;
  return { documents: r.documents, bytes: Number(r.bytes) };
}

async function cleanup(): Promise<void> {
  for (const u of [BYTE_USER, DOC_USER]) {
    await runAsUser(u, (sql) => [sql`DELETE FROM user_documents WHERE user_id = ${u}`]).catch(() => undefined);
  }
}

describe.skipIf(!enabled)('B11 — upload quota TOCTOU', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it('byte quota: two concurrent creates with room for exactly one — exactly one succeeds', async () => {
    const room = 1024;
    await runAsUser(BYTE_USER, (sql) => [
      sql`INSERT INTO user_documents (user_id, title, byte_size, status)
          VALUES (${BYTE_USER}, 'seed', ${MAX_BYTES_PER_USER - room}::bigint, 'ready')`,
    ]);

    const results = await Promise.all([
      settle(createDocument(BYTE_USER, meta('b1', room))),
      settle(createDocument(BYTE_USER, meta('b2', room))),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    // The refusal is the byte-limit message the route has always returned (H5b wording).
    const refused = results.find((r) => !r.ok) as { ok: false; error: Error } | undefined;
    expect(refused?.error.message).toMatch(/100 ?MB/i);

    const after = await usage(BYTE_USER);
    expect(after.bytes).toBeLessThanOrEqual(MAX_BYTES_PER_USER);
    expect(after.documents).toBe(2); // the seed plus exactly one winner
  }, 30_000);

  it('document quota: two concurrent creates at the cap − 1 — exactly one succeeds', async () => {
    await runAsUser(DOC_USER, (sql) => [
      sql`INSERT INTO user_documents (user_id, title, byte_size, status)
          SELECT ${DOC_USER}, 'seed-' || i, 10, 'ready'
            FROM generate_series(1, ${MAX_DOCUMENTS_PER_USER - 1}) AS s(i)`,
    ]);

    const results = await Promise.all([
      settle(createDocument(DOC_USER, meta('d1', 10))),
      settle(createDocument(DOC_USER, meta('d2', 10))),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const refused = results.find((r) => !r.ok) as { ok: false; error: Error } | undefined;
    expect(refused?.error.message).toContain(String(MAX_DOCUMENTS_PER_USER));

    const after = await usage(DOC_USER);
    expect(after.documents).toBe(MAX_DOCUMENTS_PER_USER);
  }, 30_000);
});
