// setSearchCategories failure must not wedge the document in 'pending'.
//
// The H8 fix (957c8601) intentionally placed claimReadingsStart BEFORE setSearchCategories to
// preserve the staleness escape hatch for crashed kicks: running setSearchCategories first would
// bump updated_at and make a stale crashed-kick 'pending' look fresh, wedging the escape hatch
// shut. But setSearchCategories was left OUTSIDE the try-catch that wraps the after() scheduling.
// The claim has ALREADY flipped the row to 'pending' with a fresh updated_at, so a transient DB
// error during that UPDATE exited through the framework error path with no recovery code — the
// document sat 'pending' with error=NULL for the full READINGS_STALE_MS (10 min) window, every
// retry 409'd, and the staleness escape hatch could not reach it (updated_at was fresh).
//
// The fix keeps the H8 ordering (claim, then setSearchCategories) but moves setSearchCategories
// INSIDE the try so its throw lands in the same catch as after()'s — setReadingsState('failed').
// This file pins both halves: a source check (setSearchCategories is inside the try, a revert goes
// red even with no DB) and a behavioural check (a thrown setSearchCategories is reported 'failed'
// to the row, not wedged 'pending').

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── source check (no DB) ────────────────────────────────────────────────────────────────────────

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

// Comments stripped so the route is judged on what it DOES, not what it mentions — the comments on
// the fix itself name `setSearchCategories` and `after()`, and without stripping those mentions
// would defeat an index-based ordering check. Same regex the route invariants use.
const stripComments = (s: string) => s.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
const ROUTE_SRC = stripComments(
  readFileSync(path.join(SRC, 'app/api/user-corpus/documents/[id]/readings/route.ts'), 'utf8'),
);

describe('setSearchCategories is inside the after()-try (structural)', () => {
  // The bug: `await setSearchCategories(...)` ran BEFORE `try { after(...) }`. A revert to that
  // shape must go red here even on a machine with no DB. Anchored at the claim CALL site — not the
  // import, which lists both claimReadingsStart and setSearchCategories and would mislead the
  // indices — so `await claimReadingsStart(` (call) skips the top-of-file import line.
  it('order is claim → try { → setSearchCategories → after(', () => {
    const claimIdx = ROUTE_SRC.indexOf('await claimReadingsStart(');
    expect(claimIdx, 'the claim call site must exist').toBeGreaterThan(-1);

    const tryIdx = ROUTE_SRC.indexOf('try {', claimIdx);
    expect(tryIdx, 'a try { must follow the claim call').toBeGreaterThan(-1);

    const setCatIdx = ROUTE_SRC.indexOf('setSearchCategories', tryIdx);
    expect(setCatIdx, 'setSearchCategories must be inside the try (after try {)').toBeGreaterThan(-1);

    const afterIdx = ROUTE_SRC.indexOf('after(', setCatIdx);
    expect(afterIdx, 'after( must follow setSearchCategories inside the try').toBeGreaterThan(-1);

    // The invariant the bug broke: setSearchCategories must NOT precede the try that wraps after().
    expect(tryIdx).toBeLessThan(setCatIdx);
    expect(setCatIdx).toBeLessThan(afterIdx);
  });
});

// ── the real route, against the dev DB ───────────────────────────────────────────────────────────

let currentUser: { id: string; email: string } | null = null;
vi.mock('@/lib/session', () => ({
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

// Conditionally throw from setSearchCategories to reproduce the transient-DB-error path. Everything
// else in readings-store stays REAL (importOriginal): claimReadingsStart and setReadingsState run
// against the dev DB exactly as in production, so this asserts the fix's contract — that the catch
// block's setReadingsState('failed') actually LANDS in the row — not a mock asserting against a
// mock (the watchlist's tautology shape).
let setSearchCategoriesShouldThrow = false;
vi.mock('@/lib/user-corpus/readings-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/user-corpus/readings-store')>();
  return {
    ...actual,
    setSearchCategories: async (...args: Parameters<typeof actual.setSearchCategories>) => {
      if (setSearchCategoriesShouldThrow) throw new Error('database unavailable');
      return actual.setSearchCategories(...args);
    },
  };
});

const { runAsUser } = await import('@/lib/db');
const readings = await import('@/app/api/user-corpus/documents/[id]/readings/route');
const { runtimeDbUrl } = await import('../helpers/env');

const enabled = Boolean(runtimeDbUrl());
if (!enabled) console.warn('⚠ SKIPPED (visibly): readings setSearchCategories-failure suite needs APP_DATABASE_URL.');

const RUN = `readings-setcat-${Date.now().toString(36)}`;
const USER = { id: `${RUN}-user`, email: 'u@example.com' };

async function seedReadyDoc(): Promise<string> {
  const [rows] = await runAsUser(USER.id, (sql) => [
    sql`INSERT INTO user_documents (user_id, title, status, readings_status)
        VALUES (${USER.id}, 'seeded', 'ready', NULL)
        RETURNING id`,
  ]);
  return (rows as { id: string }[])[0]!.id;
}
async function readRow(id: string): Promise<{ readings_status: string; readings_error: string | null }> {
  const [rows] = await runAsUser(USER.id, (sql) => [
    sql`SELECT readings_status, readings_error
        FROM user_documents WHERE user_id = ${USER.id} AND id = ${id}`,
  ]);
  return (rows as { readings_status: string; readings_error: string | null }[])[0]!;
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

describe.skipIf(!enabled)('setSearchCategories failure — the real route against the dev DB', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  beforeEach(() => {
    currentUser = USER;
    searchLimit = { ok: true };
    setSearchCategoriesShouldThrow = false;
  });

  it('marks the row FAILED (not pending) when setSearchCategories throws', async () => {
    const id = await seedReadyDoc();
    setSearchCategoriesShouldThrow = true;

    const res = await post(id);

    // The catch returns 500 — not 202 (would mean it slipped through) and not 409 (refused).
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeTruthy();

    // The bug left this row 'pending' with error=NULL. The fix must land 'failed' with a message.
    const r = await readRow(id);
    expect(r.readings_status).toBe('failed');
    expect(r.readings_error).toContain('could not start the search');
    expect(r.readings_error).toContain('database unavailable');
  });
});
