// H5b — per-user upload quotas (2026-08-20 uploader deep dive; UPLOADER_DESIGN §2).
//
// The design documented a quota table (200 documents / 100 MB per user) that was never built:
// `grep -rni quota web/src` returned nothing while every accepted upload buys storage and an
// embedding batch. This suite proves the shipped checkUploadQuota against the real user_documents
// table (seeded through runAsUser, so RLS binds), and the upload route's wiring: 429 when the
// spend meter refuses, 403 naming the limit and the current usage when the quota does, dedupe
// answered BEFORE quota (a re-upload adds nothing to usage).
//
// NOTE (2026-08-30): this suite still covers the ORIGINAL /api/user-corpus/upload route, which
// remains mounted for small files (< 4 MB, the platform body cap). The product's upload path is
// now the two-call direct-to-Blob flow (upload-url → PUT → upload-complete). The quota ENFORCEMENT
// is the same — createDocument's transaction throws QuotaExceeded in both paths — but the NEW
// pre-flight check in upload-url (checkUploadQuota before the presign) has no test coverage here.
// A dedicated suite for the new routes' pre-flight is the follow-up.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let currentUser: { id: string; email: string } | null = null;
// Spreads the REAL @/lib/auth-failure so this mock carries every export the route imports, not
// just the ones this file thought of — see the note in library-shelf-round-trip.test.ts. Held by
// test/invariants/session-mock-surface.test.ts.
vi.mock('@/lib/session', async () => ({
  ...(await import('@/lib/auth-failure')),
  requireUser: async () => {
    if (!currentUser) throw new Error('Unauthorized');
    return currentUser;
  },
  getUser: async () => currentUser,
}));

const BYTES = new Map<string, Uint8Array>();
vi.mock('@/lib/user-corpus/blob', () => ({
  getUserDocument: async (p: string) => {
    const b = BYTES.get(p);
    if (!b) throw new Error(`no bytes for ${p}`);
    return b;
  },
  putUserDocument: async (u: string, d: string, bytes: Uint8Array) => {
    const p = `user-corpus/${u}/${d}`;
    BYTES.set(p, bytes);
    return p;
  },
  deleteUserDocument: async (p: string) => { BYTES.delete(p); },
  blobPathname: (u: string, d: string) => `user-corpus/${u}/${d}`,
}));

// The meter is MOCKED here so the quota legs are deterministic and the 429 leg is reachable
// without 11 real uploads; the limiter's own mechanics live in upload-rate-limit.test.ts.
import type { RateLimitResult } from '@/lib/rate-limit';
let uploadLimit: RateLimitResult = { ok: true };
vi.mock('@/lib/rate-limit', () => ({
  checkCorpusUploadRateLimit: async () => uploadLimit,
}));

const { runAsUser } = await import('@/lib/db');
const { MAX_BYTES_PER_USER, MAX_DOCUMENTS_PER_USER, checkUploadQuota } = await import('@/lib/user-corpus/quota');
const upload = (await import('@/app/api/user-corpus/upload/route')).POST;
const byId = await import('@/app/api/user-corpus/documents/[id]/route');
const { runtimeDbUrl } = await import('../helpers/env');

const enabled = Boolean(runtimeDbUrl());
if (!enabled) console.warn('⚠ SKIPPED (visibly): quota suite needs APP_DATABASE_URL.');

const RUN = `quota-${Date.now().toString(36)}`;
// u3 is the NULL-byte_size leg's own account: it seeds a row AT the byte cap, so it must not
// share a user with the count/limit tests above.
const USERS = [0, 1, 2, 3].map((n) => ({ id: `${RUN}-u${n}`, email: `u${n}@example.com` }));

function txt(body: string): Uint8Array {
  return new TextEncoder().encode(body);
}
function uploadReq(bytes: Uint8Array, filename: string): Request {
  const fd = new FormData();
  fd.append('file', new File([bytes as unknown as BlobPart], filename));
  return new Request('http://localhost/api/user-corpus/upload', { method: 'POST', body: fd });
}

/** Seed `n` bare rows of `bytesEach` for `userId` — through runAsUser, so RLS admits them. */
async function seedRows(userId: string, n: number, bytesEach: number | null): Promise<void> {
  await runAsUser(userId, (sql) => [
    sql`INSERT INTO user_documents (user_id, title, byte_size, status)
        SELECT ${userId}, 'seed-' || i, ${bytesEach}::bigint, 'ready'
          FROM generate_series(1, ${n}) AS s(i)`,
  ]);
}
async function rowCount(userId: string): Promise<number> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT count(*)::int AS n FROM user_documents WHERE user_id = ${userId}`,
  ]);
  return (rows as { n: number }[])[0]?.n ?? 0;
}
async function cleanup(): Promise<void> {
  for (const u of USERS) {
    await runAsUser(u.id, (sql) => [sql`DELETE FROM user_documents WHERE user_id = ${u.id}`]).catch(() => undefined);
  }
  BYTES.clear();
}

describe.skipIf(!enabled)('H5b — upload quotas', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  beforeEach(() => {
    currentUser = USERS[0]!;
    uploadLimit = { ok: true };
  });

  describe('checkUploadQuota', () => {
    it('exports the §2 beta numbers: 200 documents, 100 MB', () => {
      expect(MAX_DOCUMENTS_PER_USER).toBe(200);
      expect(MAX_BYTES_PER_USER).toBe(100 * 1024 * 1024);
    });

    it('allows an empty account, and reports zero usage', async () => {
      const v = await checkUploadQuota(USERS[0]!.id, 1024);
      expect(v).toEqual({ ok: true });
    });

    it('refuses the upload that would EXCEED the document cap, naming limit and usage', async () => {
      await seedRows(USERS[1]!.id, MAX_DOCUMENTS_PER_USER, 10);
      const v = await checkUploadQuota(USERS[1]!.id, 1024);
      expect(v.ok).toBe(false);
      if (!v.ok) {
        expect(v.limit).toBe('documents');
        expect(v.message).toContain(String(MAX_DOCUMENTS_PER_USER)); // the limit
        expect(v.documents).toBe(MAX_DOCUMENTS_PER_USER); // the usage
      }
    });

    it('allows the upload that lands EXACTLY at the byte cap, refuses one byte more', async () => {
      const used = MAX_BYTES_PER_USER - 1024;
      await seedRows(USERS[2]!.id, 2, used / 2);
      expect((await checkUploadQuota(USERS[2]!.id, 1024)).ok).toBe(true);
      const over = await checkUploadQuota(USERS[2]!.id, 1025);
      expect(over.ok).toBe(false);
      if (!over.ok) {
        expect(over.limit).toBe('bytes');
        expect(over.bytes).toBe(used);
        expect(over.message).toMatch(/100 ?MB/i);
      }
    });

    it('rows with NULL byte_size count as zero bytes, never as a NULL that poisons the sum', async () => {
      // SUM over any NULL-carrying set must not surface as NULL -> Number(NULL)=0 -> silent allow
      // at any usage. The SQL watchlist's three-valued-logic lesson, applied to the quota.
      //
      // SEEDED OVER THE CAP, WHICH IS THE WHOLE POINT. The first version added one NULL row to a
      // near-empty account and asserted `{ok:true}` — the same answer a broken sum gives, so the
      // assertion was constant against itself (false-confidence audit, 2026-09-07). A NULL row is
      // only observable ALONGSIDE rows that already exceed the cap.
      //
      // AND THE COALESCE ITSELF IS NOT WHAT THIS PROVES — measured, not assumed. Removing
      // `COALESCE(…, 0)` from quota.ts does NOT redden this or any test, for two reasons the
      // original comment got wrong: SQL `sum()` SKIPS nulls rather than being poisoned by one, so
      // a mixed set still totals correctly; and where `sum()` genuinely is null (zero rows, or
      // every row null) the driver hands back `null` and `Number(null)` is already 0 — the same
      // value the COALESCE would supply. The COALESCE is belt, and no behaviour distinguishes it.
      // What this test DOES prove is that the byte total is really consulted and really refuses
      // with a null row present: replace the sum with a constant and it goes red.
      const user = USERS[3]!.id;
      await runAsUser(user, (sql) => [
        sql`INSERT INTO user_documents (user_id, title, byte_size, status)
            VALUES (${user}, 'over-the-cap', ${MAX_BYTES_PER_USER}, 'ready')`,
      ]);
      // The control: without the NULL row, this account is already refused.
      const before = await checkUploadQuota(user, 1024);
      expect(before.ok, 'the fixture is not over the cap — the NULL row below would prove nothing').toBe(false);

      await runAsUser(user, (sql) => [
        sql`INSERT INTO user_documents (user_id, title, byte_size, status)
            VALUES (${user}, 'no-size', NULL, 'failed')`,
      ]);
      const after = await checkUploadQuota(user, 1024);
      expect(after.ok, 'a NULL byte_size poisoned the sum and the quota stopped refusing').toBe(false);
      if (!after.ok) {
        expect(after.limit).toBe('bytes');
        // And the NULL row contributed zero rather than erasing the total.
        expect(after.bytes).toBe(MAX_BYTES_PER_USER);
      }
    });
  });

  describe('route wiring', () => {
    it('upload returns 429 when the spend meter refuses, and creates NO row', async () => {
      uploadLimit = { ok: false, limited: 'min', retryAfterSec: 60 };
      const before = await rowCount(USERS[0]!.id);
      const res = await upload(uploadReq(txt('a sermon on patience'), 'p.txt') as never);
      expect(res.status).toBe(429);
      expect(typeof ((await res.json()) as { error: unknown }).error).toBe('string'); // H6: the client renders `error` as a string
      expect(await rowCount(USERS[0]!.id)).toBe(before);
    });

    it('retry is metered BEFORE any read — 429 even for an id that does not exist', async () => {
      uploadLimit = { ok: false, limited: 'day', retryAfterSec: 3600 };
      const res = await byId.POST(
        new Request('http://localhost/api/user-corpus/documents/none', { method: 'POST' }) as never,
        { params: Promise.resolve({ id: 'none' }) },
      );
      expect(res.status).toBe(429);
    });

    it('at the document cap: a DUPLICATE re-upload still answers 200, a new file gets the 403', async () => {
      // Dedupe before quota, deliberately: identical bytes return the existing document and add
      // nothing to usage. Upload one real file first, fill to the cap, then re-send the same bytes.
      const original = txt('the original sermon body, uploaded before the account filled');
      const first = await upload(uploadReq(original, 'original.txt') as never);
      expect(first.status).toBe(201);

      const have = await rowCount(USERS[0]!.id);
      await seedRows(USERS[0]!.id, MAX_DOCUMENTS_PER_USER - have, 10);

      const dup = await upload(uploadReq(original, 'original-again.txt') as never);
      expect(dup.status).toBe(200);
      expect(((await dup.json()) as { duplicateOf?: string }).duplicateOf).toBeTruthy();

      const fresh = await upload(uploadReq(txt('a different sermon entirely'), 'new.txt') as never);
      expect(fresh.status).toBe(403);
      const body = (await fresh.json()) as { error: string; code: string };
      expect(body.code).toBe('quota_exceeded');
      expect(body.error).toContain(String(MAX_DOCUMENTS_PER_USER));
      expect(await rowCount(USERS[0]!.id)).toBe(MAX_DOCUMENTS_PER_USER);
    });
  });
});
