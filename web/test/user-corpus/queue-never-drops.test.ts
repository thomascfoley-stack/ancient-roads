// The queue's central promise (§8): "Status, never silently dropped."
//
// Runs against a real Postgres, because every property here is about concurrency and predicate
// coverage and none of them survive being mocked: SKIP LOCKED cannot be simulated, and the whole
// failure mode under test is a row that NO query returns.
//
// Uses documents with blob_url NULL on purpose. That makes every outcome deterministic without a
// Blob store, and it exercises the path that matters most -- a document the pipeline cannot parse
// must end in a STATED failure, never in silence.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runAsUser } from '@/lib/db';
import { createDocument, getDocument, listDocuments, setDocStatus } from '@/lib/user-corpus/documents';
import { MAX_ATTEMPTS, STALE_CLAIM_MINUTES, drain, queueStats, reapExhausted } from '@/lib/user-corpus/queue';
import { runtimeDbUrl, seedOwnerUrl } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';

const APP_URL = runtimeDbUrl();
// Only the lock-holder in the SKIP LOCKED test uses this. It must be an INDEPENDENT connection:
// the point is a lock held by someone other than the drain.
const OWNER_URL = seedOwnerUrl();
const RUN = `qtest-${Date.now().toString(36)}`;
const USER_A = `${RUN}-A`;
const USER_B = `${RUN}-B`;

// Visible skip, never a silent one: a suite that quietly does not run reads as a passing suite.
const describeDb = APP_URL ? describe : describe.skip;
if (!APP_URL) {
  console.warn(
    '⚠ SKIPPED (visibly): user-corpus queue suite has no APP_DATABASE_URL. ' +
      'Set it to the lane-b app_runtime URL to run these.',
  );
}

// …AND THE SUITE HAS TWO PRECONDITIONS, NOT ONE. The guard above covers APP_URL, which is all
// seven other cases need. The SKIP LOCKED case additionally needs OWNER_URL, because it must hold
// a row lock from a connection that is NOT the drain's. With OWNER_URL undefined, that test built
// `new Client({ connectionString: undefined })`, which is not an error — pg falls back to libpq
// defaults and dials localhost:5432. On a machine with no local Postgres that is ECONNREFUSED, so
// a MISSING CREDENTIAL was reported as a FAILING INVARIANT: an unearned RED, and the exact mirror
// of the unearned green this file's own header warns about. It is the failure the QA ledger
// carried as "pre-existing ECONNREFUSED in user-corpus/queue-never-drops" for the life of the
// branch, because it looks like a broken queue and is a missing env var.
const SKIP_LOCK_CASE = announceSkip(
  'user-corpus queue — FOR UPDATE SKIP LOCKED under a concurrent lock holder',
  [{ name: 'DATABASE_URL (an independent owner connection, via seedOwnerUrl)', present: Boolean(OWNER_URL) }],
  'that a drain steps over a row another worker holds instead of blocking on it',
);

async function seedQueued(userId: string, title: string) {
  return createDocument(userId, {
    title,
    filename: `${title}.txt`,
    byteSize: 100,
    checksum: `${RUN}-${title}-${Math.random().toString(36).slice(2)}`,
    mimeType: 'txt',
  });
}

async function cleanup() {
  for (const u of [USER_A, USER_B]) {
    await runAsUser(u, (sql) => [sql`DELETE FROM user_documents WHERE user_id = ${u}`]).catch(() => undefined);
  }
}

describeDb('the queue never silently drops a document', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it('a new upload is visible as queued immediately, before anything parses it', async () => {
    // §8's ordering guarantee: the row exists before the work does, so a crash mid-pipeline leaves
    // a visible row rather than nothing at all.
    const doc = await seedQueued(USER_A, 'first');
    expect(doc.status).toBe('queued');
    expect(doc.attempts).toBe(0);
    const stats = await queueStats(USER_A);
    expect(stats.depth).toBeGreaterThanOrEqual(1);
  });

  it('a document whose bytes were never stored FAILS with a reason, rather than being skipped', async () => {
    // The silent-drop shape: blob_url is NULL, so it can never be parsed. The wrong behaviour is
    // for the drain to skip it and leave it queued forever, which looks like "still working".
    const doc = await seedQueued(USER_A, 'no-blob');
    const result = await drain(USER_A, 5);
    expect(result.processed).toBeGreaterThanOrEqual(1);

    const after = await getDocument(USER_A, doc.id);
    expect(after?.status).toBe('failed');
    expect(after?.parseError).toBeTruthy();
    // The reason has to be actionable, not just present.
    expect(after?.parseError).toMatch(/upload/i);
  });

  it.skipIf(SKIP_LOCK_CASE)('skips a row another worker holds, instead of blocking on it', async () => {
    // WHY THIS SHAPE, AND NOT "run two drains and check for a double-claim". That version was
    // written first and it is a FALSE-CONFIDENCE TEST: with FOR UPDATE SKIP LOCKED deleted from
    // claimNext it went red twice and then PASSED, because whether two drains actually collide is
    // a matter of timing. A check that only sometimes fails when the bug is present cannot be
    // said to have been watched fail (THE_LOOP rule 4); it just has a good day.
    //
    // So this asserts SKIP LOCKED's actual semantics, which are deterministic: a locked row is
    // SKIPPED, not waited on. An independent connection holds a real row lock on the document the
    // ordering would otherwise pick first; the drain must take the second one and return promptly.
    // SEED: remove FOR UPDATE SKIP LOCKED -> the drain BLOCKS on the held lock and this fails on
    // the timeout, every single time.
    await cleanup();
    const first = await seedQueued(USER_A, 'locked-first');
    // Distinct creation timestamps, so `ORDER BY claimed_at NULLS FIRST, created_at` has a
    // defined answer and "the drain took the other one" means something.
    await new Promise((r) => setTimeout(r, 25));
    const second = await seedQueued(USER_A, 'unlocked-second');

    const { Client } = (await import('pg')).default;
    const holder = new Client({ connectionString: OWNER_URL, ssl: { rejectUnauthorized: false } });
    await holder.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM user_documents WHERE id = $1 FOR UPDATE', [first.id]);

      const result = await Promise.race([
        drain(USER_A, 1),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('drain BLOCKED on a locked row — FOR UPDATE SKIP LOCKED is missing')),
            8000,
          ),
        ),
      ]);
      expect(result.processed).toBe(1);
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined);
      await holder.end().catch(() => undefined);
    }

    // The locked one was left strictly alone; the other was taken.
    const a = await getDocument(USER_A, first.id);
    const b = await getDocument(USER_A, second.id);
    expect(a?.status).toBe('queued');
    expect(a?.attempts).toBe(0);
    expect(b?.attempts).toBe(1);
    expect(b?.status).toBe('failed');
  }, 20_000);

  it('processes every document exactly once across repeated drains', async () => {
    // The complementary property, stated where it can be checked deterministically: sequential
    // drains must converge, with each document claimed exactly once and none left behind.
    await cleanup();
    const docs = await Promise.all([
      seedQueued(USER_A, 'batch-1'),
      seedQueued(USER_A, 'batch-2'),
      seedQueued(USER_A, 'batch-3'),
    ]);
    const first = await drain(USER_A, 10);
    const second = await drain(USER_A, 10);

    expect(first.processed).toBe(docs.length);
    // Nothing left to do, and nothing re-claimed: these are terminal failures, not retryable.
    expect(second.processed).toBe(0);

    const all = await listDocuments(USER_A);
    const mine = all.filter((d) => docs.some((s) => s.id === d.id));
    expect(mine).toHaveLength(docs.length);
    for (const d of mine) {
      expect(d.attempts).toBe(1);
      expect(d.status).toBe('failed');
    }
  });

  it('an exhausted document is RETIRED, not left invisible in parsing', async () => {
    // The trap this closes. claimNext ignores rows at attempts >= MAX_ATTEMPTS, so without
    // reapExhausted such a row sits in 'parsing' where no query returns it and no user is told.
    // SEED: delete the reapExhausted call from drain() -> RED.
    await cleanup();
    const doc = await seedQueued(USER_A, 'exhausted');
    await runAsUser(USER_A, (sql) => [
      sql`UPDATE user_documents
          SET status = 'parsing',
              attempts = ${MAX_ATTEMPTS},
              claimed_at = now() - (${STALE_CLAIM_MINUTES + 1} || ' minutes')::interval,
              parse_error = 'transient blob error'
          WHERE user_id = ${USER_A} AND id = ${doc.id}`,
    ]);

    // Confirm the premise: the claim predicate genuinely cannot see it any more.
    const beforeReap = await drain(USER_A, 5);
    expect(beforeReap.reaped).toBe(1);

    const after = await getDocument(USER_A, doc.id);
    expect(after?.status).toBe('failed');
    expect(after?.parseError).toContain('Gave up after');
    // The original cause survives into the retirement message, or the user is told only that it
    // gave up and never why.
    expect(after?.parseError).toContain('transient blob error');
  });

  it('a stale claim from a dead worker is reclaimed rather than stranded', async () => {
    // A serverless function killed at its ceiling leaves a row in 'parsing' with nobody holding
    // it. SEED: remove the stale-claim branch from claimNext -> RED, the row is never claimed again.
    await cleanup();
    const doc = await seedQueued(USER_A, 'stale');
    await runAsUser(USER_A, (sql) => [
      sql`UPDATE user_documents
          SET status = 'parsing', attempts = 1,
              claimed_at = now() - (${STALE_CLAIM_MINUTES + 1} || ' minutes')::interval
          WHERE user_id = ${USER_A} AND id = ${doc.id}`,
    ]);
    const result = await drain(USER_A, 5);
    expect(result.processed).toBe(1);
    const after = await getDocument(USER_A, doc.id);
    expect(after?.attempts).toBe(2);
    expect(after?.status).toBe('failed');
  });

  it('a FRESH claim is left alone — the reclaim is by age, not by status', async () => {
    // The other side. Without this, a reclaim rule that grabbed every 'parsing' row would pass
    // the test above while double-processing every document that is legitimately in flight.
    await cleanup();
    const doc = await seedQueued(USER_A, 'in-flight');
    await runAsUser(USER_A, (sql) => [
      sql`UPDATE user_documents SET status = 'parsing', attempts = 1, claimed_at = now()
          WHERE user_id = ${USER_A} AND id = ${doc.id}`,
    ]);
    const result = await drain(USER_A, 5);
    expect(result.processed).toBe(0);
    const after = await getDocument(USER_A, doc.id);
    expect(after?.status).toBe('parsing');
    expect(after?.attempts).toBe(1);
  });

  it("one user's drain never touches another user's queue", async () => {
    // RLS binds the drain to one user; this is the behavioural half of that claim, over the queue
    // rather than over a plain SELECT.
    await cleanup();
    const mine = await seedQueued(USER_A, 'mine');
    const theirs = await seedQueued(USER_B, 'theirs');

    await drain(USER_A, 10);

    expect((await getDocument(USER_A, mine.id))?.status).toBe('failed');
    // B's document is untouched: still queued, never claimed.
    const b = await getDocument(USER_B, theirs.id);
    expect(b?.status).toBe('queued');
    expect(b?.attempts).toBe(0);
    // And A cannot see it at all.
    expect(await getDocument(USER_A, theirs.id)).toBeNull();
  });

  it('reapExhausted reports nothing to do when there is nothing to do', async () => {
    // Guards against a reaper that "succeeds" by retiring healthy rows.
    await cleanup();
    const doc = await seedQueued(USER_A, 'healthy');
    expect(await reapExhausted(USER_A)).toBe(0);
    expect((await getDocument(USER_A, doc.id))?.status).toBe('queued');
    await setDocStatus(USER_A, doc.id, 'queued', null);
  });
});
