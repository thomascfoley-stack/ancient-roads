// D8 (DEEP_SWEEP, P2) — upload dedupe was CHECK-THEN-ACT across two transactions: findByChecksum
// in its own runAsUser txn, then createDocument's insert in another. B11's advisory lock
// serialised the QUOTA check but never re-checked the checksum, so two concurrent uploads of the
// same bytes — a double-tap, or a retry after a timeout, the exact pattern this repo already
// found in production for highlights — both passed dedupe and both inserted. Duplicate documents,
// a second blob, a second PAID embedding batch, and double quota bytes.
//
// The route's own comment presupposed a unique constraint the schema does not have: migration 100
// declares checksum TEXT with no unique index. The re-check now happens inside the lock, which
// closes the race with no migration and therefore no owner-gated production apply.
import { describe, expect, it, vi, beforeEach } from 'vitest';

const runAsUser = vi.fn();
vi.mock('@/lib/db', () => ({ runAsUser: (...a: unknown[]) => runAsUser(...a) }));

const TWIN = {
  id: 'doc-1', user_id: 'u1', title: 'Romans 8', source_filename: 'rom8.docx',
  byte_size: 1000, checksum: 'abc', mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  status: 'ready', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};
const meta = { title: 'Romans 8', filename: 'rom8.docx', byteSize: 1000, checksum: 'abc', mimeType: 'x' };

beforeEach(() => vi.clearAllMocks());

describe('D8 — the loser of a dedupe race gets the existing document, not a duplicate', () => {
  it('throws DuplicateDocument when the insert was blocked and a twin exists', async () => {
    const { createDocument, DuplicateDocument } = await import('@/lib/user-corpus/documents');
    // lock, usage, insert (blocked -> no rows), twin lookup (found)
    runAsUser.mockResolvedValue([[], [{ documents: 1, bytes: 1000 }], [], [TWIN]]);
    await expect(createDocument('u1', meta)).rejects.toBeInstanceOf(DuplicateDocument);
    await expect(createDocument('u1', meta)).rejects.toMatchObject({ existing: { id: 'doc-1' } });
  });

  it('a blocked insert with NO twin is still a quota refusal, not a phantom duplicate', async () => {
    const { createDocument } = await import('@/lib/user-corpus/documents');
    const { QuotaExceeded } = await import('@/lib/user-corpus/quota');
    // 200 documents = at the cap; no twin
    runAsUser.mockResolvedValue([[], [{ documents: 200, bytes: 1000 }], [], []]);
    await expect(createDocument('u1', meta)).rejects.toBeInstanceOf(QuotaExceeded);
  });

  it('a successful insert returns the new document and never consults the twin', async () => {
    const { createDocument } = await import('@/lib/user-corpus/documents');
    runAsUser.mockResolvedValue([[], [{ documents: 1, bytes: 1000 }], [TWIN], []]);
    await expect(createDocument('u1', meta)).resolves.toMatchObject({ id: 'doc-1' });
  });

  // The related half of D8: findByChecksum has no ORDER BY, so once duplicates exist it returns
  // an arbitrary twin. The in-lock lookup is ordered so the answer is stable.
  it('the in-lock twin lookup is deterministically ordered', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../../src/lib/user-corpus/documents.ts', import.meta.url), 'utf8'));
    expect(src).toMatch(/checksum = \$\{meta\.checksum\}\s*\n?\s*ORDER BY created_at ASC, id ASC/);
  });
});
