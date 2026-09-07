// H8 — the readings endpoint was re-entrant (2026-08-20 uploader deep dive).
//
// readings/route.ts writes 'pending' BEFORE kicking the job, while the guard
// (readingsRunRefused) only rejected 'running' — so back-to-back POSTs all passed and each ran a
// ~300 s unindexed corpus scan under maxDuration = 300, with no rate limit on the route. The fix:
// readingsStartRefused refuses a LIVE pending as well as a live running, with the SAME staleness
// escape either way (a kick that died between the 'pending' write and the job's first 'running'
// write must not wedge the feature — the B015 lesson, one state earlier), and the route is
// metered by the corpus-search limiter.
//
// The decision table for the running arm stays pinned by readings-stale-running.test.ts; this
// file pins the pending arm, and drives the REAL route against the dev DB so a revert to the
// narrower predicate goes red here even if the predicate itself survives.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  READINGS_STALE_MS,
  readingsStartRefused,
} from '../../src/lib/user-corpus/readings-store';

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

// Mocked so the 429 leg needs no 31-call burst; the limiter's mechanics have their own suites.
import type { RateLimitResult } from '@/lib/rate-limit';
let searchLimit: RateLimitResult = { ok: true };
vi.mock('@/lib/rate-limit', () => ({
  checkCorpusSearchRateLimit: async () => searchLimit,
}));

const NOW = 1_755_000_000_000; // fixed; the predicate takes `now` so no Date.now stubbing
const iso = (ageMs: number) => new Date(NOW - ageMs).toISOString();

describe('H8 — readingsStartRefused (the pending arm)', () => {
  it('refuses a FRESH pending — the back-to-back POST is the attack', () => {
    // SEED: route the guard back through readingsRunRefused alone -> RED here.
    expect(readingsStartRefused('pending', iso(5_000), NOW)).toBe(true);
    expect(readingsStartRefused('pending', iso(READINGS_STALE_MS - 1), NOW)).toBe(true);
  });

  it('allows a STALE pending — a crashed kick must not wedge the feature forever', () => {
    expect(readingsStartRefused('pending', iso(READINGS_STALE_MS + 1), NOW)).toBe(false);
  });

  it('refuses a CORRUPT timestamp — NaN reads as "live", never as a corpse', () => {
    expect(readingsStartRefused('pending', 'not-a-date', NOW)).toBe(true);
  });

  it('keeps the running arm: fresh refused, stale allowed', () => {
    expect(readingsStartRefused('running', iso(5_000), NOW)).toBe(true);
    expect(readingsStartRefused('running', iso(READINGS_STALE_MS + 1), NOW)).toBe(false);
  });

  it('never refuses a terminal or absent status', () => {
    for (const s of ['ready', 'failed', null] as const) {
      expect(readingsStartRefused(s, iso(0), NOW)).toBe(false);
      expect(readingsStartRefused(s, 'not-a-date', NOW)).toBe(false);
    }
  });
});

// ── the real route, against the dev DB ───────────────────────────────────────────────────────────

const { runAsUser } = await import('@/lib/db');
const readings = await import('@/app/api/user-corpus/documents/[id]/readings/route');
const { runtimeDbUrl } = await import('../helpers/env');

const enabled = Boolean(runtimeDbUrl());
if (!enabled) console.warn('⚠ SKIPPED (visibly): readings route suite needs APP_DATABASE_URL.');

const RUN = `readings-${Date.now().toString(36)}`;
const USER = { id: `${RUN}-user`, email: 'u@example.com' };

async function seedReadyDoc(readingsStatus: 'pending' | 'running' | null): Promise<string> {
  const [rows] = await runAsUser(USER.id, (sql) => [
    sql`INSERT INTO user_documents (user_id, title, status, readings_status)
        VALUES (${USER.id}, 'seeded', 'ready', ${readingsStatus})
        RETURNING id`,
  ]);
  return (rows as { id: string }[])[0]!.id;
}
async function ageReadings(id: string, minutes: number): Promise<void> {
  await runAsUser(USER.id, (sql) => [
    sql`UPDATE user_documents SET updated_at = now() - make_interval(mins => ${minutes})
        WHERE user_id = ${USER.id} AND id = ${id}`,
  ]);
}
function post(id: string): Promise<Response> {
  return readings.POST(
    new Request(`http://localhost/api/user-corpus/documents/${id}/readings`, { method: 'POST' }) as never,
    { params: Promise.resolve({ id }) },
  );
}
async function cleanup(): Promise<void> {
  await runAsUser(USER.id, (sql) => [sql`DELETE FROM user_documents WHERE user_id = ${USER.id}`]).catch(() => undefined);
}

describe.skipIf(!enabled)('H8 — the readings route', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  beforeEach(() => {
    currentUser = USER;
    searchLimit = { ok: true };
  });

  it('409s a POST while a FRESH pending run exists — the exact H8 reproduction', async () => {
    const id = await seedReadyDoc('pending');
    const res = await post(id);
    expect(res.status).toBe(409);
  });

  it('lets a POST through once the pending is STALE (the crashed-kick escape)', async () => {
    const id = await seedReadyDoc('pending');
    await ageReadings(id, 11);
    const res = await post(id);
    // Past the guard the route writes 'pending' and calls after(), which throws outside a real
    // request scope — vitest — so the catch reports 500 and marks the run failed. That is the
    // proof needed here: the guard ALLOWED the restart (production reaches 202 on this path).
    expect(res.status).not.toBe(409);
    const [rows] = await runAsUser(USER.id, (sql) => [
      sql`SELECT readings_status, readings_error FROM user_documents
          WHERE user_id = ${USER.id} AND id = ${id}`,
    ]);
    const r = (rows as { readings_status: string; readings_error: string | null }[])[0]!;
    expect(r.readings_status).toBe('failed');
    expect(r.readings_error).toContain('could not start');
  });

  it('429s when the corpus-search meter refuses, before any document read', async () => {
    searchLimit = { ok: false, limited: 'min', retryAfterSec: 60 };
    const res = await post('does-not-exist');
    expect(res.status).toBe(429);
  });
});
