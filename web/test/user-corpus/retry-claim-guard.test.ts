// D9 (DEEP_SWEEP) — per-doc retry was allowed mid-parse, so two workers could process one
// document.
//
// POST /documents/[id] gated only on `status === 'empty'` and a missing blobUrl, never on a
// terminal status. It then did setDocStatus('queued') + resetAttempts as TWO separate
// transactions on a row a worker may be actively holding, and kicked a drain. claimNext's claim
// was committed long ago and no lock is held during processOne, so the same row went to a second
// worker: both parse and embed the whole document (double DeepInfra spend), and their two
// storeSections DELETE+INSERT transactions are not mutually exclusive under READ COMMITTED —
// an interleaved commit leaves both generations of user_sections and search returns every chunk
// twice.
//
// The UI offers exactly this: my-works.tsx shows Retry on any doc stuck >5 min, and 5 min is also
// STALE_CLAIM_MINUTES — but a LIVE worker on a large PDF is legitimately past 5 minutes with a
// fresh claim. The stale-claim reclaim shares the shape and is guarded by the age window; the
// retry path had no guard at all. It also happily re-parsed a `ready` document.
//
// The fix is ONE atomic CAS: requeue only when the row is not currently claimed (or its claim is
// stale). Same predicate shape as claimNext's own reclaim, so the two cannot disagree.
import { describe, expect, it, vi, beforeEach } from 'vitest';

const runAsUser = vi.fn();
vi.mock('@/lib/db', () => ({ runAsUser: (...a: unknown[]) => runAsUser(...a) }));

beforeEach(() => vi.clearAllMocks());

describe('D9 — retry cannot seize a document a worker is holding', () => {
  it('reports false when the CAS matched no row (a live claim)', async () => {
    const { requeueForRetry } = await import('@/lib/user-corpus/documents');
    runAsUser.mockResolvedValue([[]]);
    expect(await requeueForRetry('u1', 'doc-1')).toBe(false);
  });

  it('reports true when the CAS took the row', async () => {
    const { requeueForRetry } = await import('@/lib/user-corpus/documents');
    runAsUser.mockResolvedValue([[{ id: 'doc-1' }]]);
    expect(await requeueForRetry('u1', 'doc-1')).toBe(true);
  });

  it('is ONE statement — status and attempts cannot be reset in separate transactions', async () => {
    const { requeueForRetry } = await import('@/lib/user-corpus/documents');
    runAsUser.mockResolvedValue([[{ id: 'doc-1' }]]);
    await requeueForRetry('u1', 'doc-1');
    expect(runAsUser).toHaveBeenCalledTimes(1);
    const statements = runAsUser.mock.calls[0]![1](
      new Proxy(() => 'STMT', { get: () => () => 'STMT', apply: () => 'STMT' }) as never,
    );
    expect(statements, 'two statements is two transactions, which is the defect').toHaveLength(1);
  });

  it('the guard uses the same claimed-status vocabulary as the queue', async () => {
    const { CLAIMED_STATUSES } = await import('@/lib/user-corpus/queue');
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../../src/lib/user-corpus/documents.ts', import.meta.url), 'utf8'));
    expect(src, 'a hand-typed status list would drift from the queue').toMatch(/CLAIMED_STATUSES/);
    expect([...CLAIMED_STATUSES]).toEqual(['parsing', 'chunking', 'embedding']);
  });
});
