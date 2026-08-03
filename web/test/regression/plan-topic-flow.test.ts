// Topic-scoped plan, end to end through the REAL route handlers and DB
// (ADR-048 addendum): seed a tiny PUBLISHED topical fixture as the owner,
// match it, create a plan from the pointer, assert the labeled readings
// persisted in the author's order, prove tenancy on the readings table,
// and watch delete cascade — then remove every seeded row (the residue
// gate sweeps qa- sources and fails the whole repo if cleanup lies).
//
// Owner-seeded because app_runtime deliberately cannot write corpus tables
// (migration 010); seedOwnerUrl() is the established helper for exactly
// this (web/test/helpers/env.ts), and it refuses production outright.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { requireDbInCi, seedOwnerUrl } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';

const testUser = `qa-topicplan-${Date.now()}`;
vi.mock('@/lib/session', () => ({
  requireUser: async () => ({ id: testUser, email: 'qa@example.test' }),
  currentUser: async () => ({ id: testUser, email: 'qa@example.test' }),
}));

import { POST as createPlanRoute } from '@/app/api/plans/route';
import { DELETE as deletePlanRoute, GET as getPlanRoute } from '@/app/api/plans/[id]/route';
import { GET as topicsRoute } from '@/app/api/plans/topics/route';
import { getPlan } from '@/lib/plan/store';

const dbUrl = requireDbInCi();
const ownerUrl = seedOwnerUrl();
const SKIP = announceSkip(
  'Topic plan end-to-end (owner-seeded fixture, real handlers, real DB)',
  [
    { name: 'a runtime DB URL (APP_DATABASE_URL)', present: Boolean(dbUrl) },
    { name: 'an owner seed URL (DATABASE_URL, non-prod)', present: Boolean(ownerUrl) },
  ],
  'the topic→plan wiring: match → create → readings → tenancy → cascade',
);

const SLUG = `qa-topical-${Date.now()}`;
// Distinctive so FTS matches ONLY this fixture, never the real corpus.
const HEADING = 'QA ZUGZWANG PERSEVERANCE';
let sourceId = 0;
let sectionId = 0;
let planId = '';

// John 3:16-18, Ps 23:1, Rom 8:28 — real verses with real >=2-author
// coverage on the dev corpus, so the coverage gate passes honestly.
const FIXTURE_ENTRIES: Array<[number, number, string]> = [
  [43_003_016, 43_003_018, 'the love of God'],
  [19_023_001, 19_023_001, 'the shepherd'],
  [45_008_028, 45_008_028, 'all things for good'],
  [43_003_016, 43_003_016, 'again, the love of God'],
];

async function ownerQuery(text: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: ownerUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    return (await client.query(text, params)).rows as Array<Record<string, unknown>>;
  } finally {
    await client.end();
  }
}

describe.skipIf(SKIP)('Topic plan end-to-end (owner-seeded fixture, real handlers, real DB)', () => {
  beforeAll(async () => {
    const src = await ownerQuery(
      `INSERT INTO sources (slug, title, author, year_written, source_type, tradition, era, license, provenance, status)
       VALUES ($1, 'QA Topical Fixture', 'QA Fixture', 2026, 'topical_index', 'reference', 'modern', 'Public Domain',
               '{"url":"qa://fixture"}'::jsonb, 'published')
       RETURNING id`, [SLUG]);
    sourceId = Number(src[0]!.id);
    const sec = await ownerQuery(
      `INSERT INTO sections (source_id, ordinal, heading, body, unit_ordinal)
       VALUES ($1, 1, $2, 'qa fixture body for the topical plan flow test', 1)
       RETURNING id`, [sourceId, HEADING]);
    sectionId = Number(sec[0]!.id);
    for (let i = 0; i < FIXTURE_ENTRIES.length; i++) {
      const [vs, ve, label] = FIXTURE_ENTRIES[i]!;
      await ownerQuery(
        `INSERT INTO topical_entries (section_id, ordinal, label, verse_id_start, verse_id_end)
         VALUES ($1, $2, $3, $4, $5)`, [sectionId, i + 1, label, vs, ve]);
    }
  }, 60_000);

  afterAll(async () => {
    // Every step independent (one failure must not skip the rest) but NOT
    // silent: empty catches here would let a failed final DELETE strand a
    // PUBLISHED qa source while the suite reported green, and the strand
    // would only surface later in a different gate. So: demote to 'staged'
    // FIRST — after that no partial teardown can leave a published fixture —
    // then delete, logging anything swallowed.
    const problems: string[] = [];
    const step = async (what: string, fn: () => Promise<unknown>) => {
      try { await fn(); } catch (e) { problems.push(`${what}: ${(e as Error).message}`); }
    };
    if (sourceId && ownerUrl) {
      await step('demote fixture to staged', () => ownerQuery(`UPDATE sources SET status = 'staged' WHERE id = $1`, [sourceId]));
    }
    if (planId) {
      await step('delete plan', () => deletePlanRoute(new NextRequest('http://localhost'), { params: Promise.resolve({ id: planId }) }));
    }
    if (sourceId && ownerUrl) {
      await step('delete topical_entries', () => ownerQuery(`DELETE FROM topical_entries WHERE section_id = $1`, [sectionId]));
      await step('delete sections', () => ownerQuery(`DELETE FROM sections WHERE source_id = $1`, [sourceId]));
      await step('delete sources', () => ownerQuery(`DELETE FROM sources WHERE id = $1`, [sourceId]));
    }
    if (problems.length > 0) {
      console.error(`⚠ TEARDOWN INCOMPLETE (fixture rows may survive):\n  ${problems.join('\n  ')}`);
    }
  }, 60_000);

  it('matchTopics surfaces the published fixture through the real route', async () => {
    const res = await topicsRoute(new NextRequest(`http://localhost/api/plans/topics?q=${encodeURIComponent('zugzwang perseverance')}`));
    expect(res.status).toBe(200);
    const { matches } = (await res.json()) as { matches: Array<{ workSlug: string; sectionId: number; heading: string; entryCount: number }> };
    const mine = matches.find((m) => m.workSlug === SLUG);
    expect(mine).toBeDefined();
    expect(mine!.heading).toBe(HEADING);
    expect(mine!.sectionId).toBe(sectionId);
    expect(mine!.entryCount).toBe(4);
  }, 30_000);

  it('creates a plan from the pointer: verified title, labeled readings in order', async () => {
    const res = await createPlanRoute(new NextRequest('http://localhost/api/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spec: { scope: { kind: 'topic', workSlug: SLUG, sectionId }, weeks: 2, daysPerWeek: 2, startDate: '2026-08-03' } }),
    }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { plan: { id: string; title: string } };
    planId = body.plan.id;
    expect(body.plan.title).toBe(`${HEADING} (QA Topical Fixture) in 2 weeks`);

    const got = await getPlanRoute(new NextRequest('http://localhost'), { params: Promise.resolve({ id: planId }) });
    const detail = (await got.json()) as {
      days: Array<{ day_index: number }>;
      readings: Array<{ day_index: number; ordinal: number; verse_start: number; label: string | null }>;
    };
    expect(detail.days).toHaveLength(4);
    expect(detail.readings).toHaveLength(4); // 4 entries over 4 days = 1 each
    // The author's printed order survives bucketing and persistence.
    expect(detail.readings.map((r) => r.verse_start)).toEqual(FIXTURE_ENTRIES.map(([vs]) => vs));
    expect(detail.readings.map((r) => r.label)).toEqual(FIXTURE_ENTRIES.map(([, , l]) => l));
  }, 30_000);

  it('a stale/staged pointer refuses with a reason, never 500', async () => {
    // SEED: drop loadTopic's status='published' predicate and this creates a
    // plan from an unpublished work — the licensing gate breached.
    await ownerQuery(`UPDATE sources SET status = 'staged' WHERE id = $1`, [sourceId]);
    try {
      const res = await createPlanRoute(new NextRequest('http://localhost/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec: { scope: { kind: 'topic', workSlug: SLUG, sectionId }, weeks: 1, daysPerWeek: 2, startDate: '2026-08-03' } }),
      }));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { refused?: boolean; reason?: string };
      expect(body.refused).toBe(true);
      expect(body.reason).toMatch(/not available/);
    } finally {
      await ownerQuery(`UPDATE sources SET status = 'published' WHERE id = $1`, [sourceId]);
    }
  }, 30_000);

  it('user B cannot read the readings (tenancy through the store)', async () => {
    expect(await getPlan(`qa-topicplan-other-${Date.now()}`, planId)).toBeNull();
  }, 30_000);

  it('deleting the plan cascades the readings away', async () => {
    const res = await deletePlanRoute(new NextRequest('http://localhost'), { params: Promise.resolve({ id: planId }) });
    expect(res.status).toBe(200);
    const rows = await ownerQuery(`SELECT count(*)::int AS n FROM plan_day_readings WHERE plan_id = $1`, [planId]);
    expect(Number(rows[0]!.n)).toBe(0);
    planId = '';
  }, 30_000);
});
