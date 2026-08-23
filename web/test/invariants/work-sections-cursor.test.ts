// @vitest-environment node
//
// W-SEC-CURSOR (2026-08-22): `GET /api/work/[slug]/sections?after=1e21` returned 500 —
// `Number('1e21')` passes `Number.isInteger`, reaches SQL as the string "1e+21", and
// Postgres throws `invalid input syntax for type integer` (sections.ordinal is INT).
// RED transcript: docs/evidence/swarm-2026-08-22/w-sec-cursor/RED-after-1e21.txt.
// The fix bounds the cursor at the int4 max, matching the route's existing
// param-validation idiom (and api-hardening.test.ts's per-column bounds class).
//
// RED-PROOF: remove the `after > 2147483647` conjunct from the route -> the two
// out-of-range cases below go RED (500-shaped mock-free assertion: the spy IS called
// and the status is not 400).

import { describe, expect, it, vi, beforeEach } from 'vitest';

const getWorkSectionsPage = vi.hoisted(() => vi.fn());
vi.mock('@/lib/work', () => ({ getWorkSectionsPage, WORK_SECTIONS_DEFAULT_LIMIT: 50 }));
// The throttle needs a database and is not what these cases are about (same rationale
// as api-hardening.test.ts; its wiring is asserted there).
vi.mock('@/lib/public-read-limit', () => ({ publicReadThrottle: async () => null }));

import { GET } from '@/app/api/work/[slug]/sections/route';

const call = (qs: string) =>
  GET(
    new Request(`https://x.test/api/work/calvin-institutes/sections?${qs}`),
    { params: Promise.resolve({ slug: 'calvin-institutes' }) },
  );

beforeEach(() => {
  getWorkSectionsPage.mockReset();
  getWorkSectionsPage.mockResolvedValue({ sections: [], nextAfter: null });
});

describe('/api/work/[slug]/sections bounds the keyset cursor at the int4 column range', () => {
  it('refuses a cursor beyond INT range instead of 500ing — after=1e21', async () => {
    const res = await call('after=1e21');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('INVALID_REQUEST');
    expect(getWorkSectionsPage).not.toHaveBeenCalled();
  });

  it('refuses int4-max + 1 — the boundary, not just the reported value', async () => {
    expect((await call('after=2147483648')).status).toBe(400);
    expect(getWorkSectionsPage).not.toHaveBeenCalled();
  });

  it('still refuses the pre-existing invalid shapes', async () => {
    for (const qs of ['after=abc', 'after=-1', 'after=2.5']) {
      expect((await call(qs)).status, qs).toBe(400);
    }
    expect(getWorkSectionsPage).not.toHaveBeenCalled();
  });

  it('accepts a valid cursor and forwards it — the positive control', async () => {
    const res = await call('after=5&limit=2');
    expect(res.status).toBe(200);
    expect(getWorkSectionsPage).toHaveBeenCalledWith('calvin-institutes', { after: 5, limit: 2 });
  });

  it('accepts int4 max itself — the boundary is inclusive', async () => {
    const res = await call('after=2147483647');
    expect(res.status).toBe(200);
    expect(getWorkSectionsPage).toHaveBeenCalledWith('calvin-institutes', { after: 2147483647, limit: 50 });
  });
});
