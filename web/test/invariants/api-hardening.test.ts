// @vitest-environment node
//
// THE PUBLIC READ SURFACE, AUDITED AS THOUGH THE PASSWORD GATE WERE ALREADY GONE.
//
// Every case here is a defect the 2026-08-02 deep audit confirmed, and the framing is the one
// lens 6 was briefed with: `middleware.ts` is a launch protection scheduled for removal
// (`middleware.ts:10` — "Remove the gate when SEC-1 closes"), so a finding whose only mitigation
// is "you need the password" is a finding, not a clean.
//
// The shape that produced most of these is worth naming, because it is the audit's new watchlist
// entry: a fix applied where the author was looking and nowhere else. `/api/search/works` was
// hardened on 2026-08-02 and its sibling `/api/search/commentaries` — named in that very fix's
// comment as the route that "has always checked Number.isInteger" — had never checked anything.

import { describe, expect, it, vi, beforeEach } from 'vitest';

const searchCommentaries = vi.hoisted(() => vi.fn());
vi.mock('@/lib/commentary-search', () => ({ searchCommentaries }));
const sectionsMocks = vi.hoisted(() => ({ getWorkSectionsPage: vi.fn() }));
vi.mock('@/lib/work', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/work')>()),
  getWorkSectionsPage: sectionsMocks.getWorkSectionsPage,
}));
// The throttle needs a database and is not what these cases are about, so it is a pass-through
// here. That it is WIRED IN AT ALL is asserted below, from source, so mocking it cannot hide its
// removal.
vi.mock('@/lib/public-read-limit', () => ({ publicReadThrottle: async () => null }));

import { GET as commentariesGET } from '@/app/api/search/commentaries/route';
import { GET as sectionsGET } from '@/app/api/work/[slug]/sections/route';
import { clientIp } from '@/lib/client-ip';
import { WORK_TOC_MAX } from '@/lib/work';

const call = (qs: string) =>
  commentariesGET(new Request(`https://x.test/api/search/commentaries?${qs}`) as never);

beforeEach(() => {
  searchCommentaries.mockReset();
  searchCommentaries.mockResolvedValue({ results: [], total: 0, totalCapped: false });
});

describe('/api/search/commentaries validates every number — H9', () => {
  it('refuses a non-integer book, limit or offset instead of 500ing', async () => {
    // Each of these reached SQL: "NaN"::smallint, LIMIT 2.5 (22P02), "1e+21"::bigint.
    // SEED: restore `Number(sp.get('book'))` with no isInteger check -> RED.
    for (const qs of ['q=a&book=abc', 'q=a&limit=2.5', 'q=a&offset=1e21', 'q=a&book=NaN', 'q=a&limit=Infinity']) {
      const res = await call(qs);
      expect(res.status, qs).toBe(400);
    }
    expect(searchCommentaries).not.toHaveBeenCalled();
  });

  it('refuses an out-of-range book — the column is a smallint of 66 values', async () => {
    for (const qs of ['q=a&book=0', 'q=a&book=67', 'q=a&book=-1', 'q=a&offset=-5']) {
      expect((await call(qs)).status, qs).toBe(400);
    }
  });

  it('accepts valid integers and forwards them', async () => {
    // The positive control: without it every refusal above could pass by refusing everything.
    const res = await call('q=grace&book=43&limit=10&offset=20');
    expect(res.status).toBe(200);
    const args = searchCommentaries.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(args.book).toBe(43);
    expect(args.limit).toBe(10);
    expect(args.offset).toBe(20);
  });

  it('bounds free-text filters rather than forwarding an unbounded string', async () => {
    await call(`q=${'x'.repeat(500)}&tradition=${'y'.repeat(500)}`);
    const args = searchCommentaries.mock.calls.at(-1)?.[0] as Record<string, string>;
    expect(args.query.length).toBeLessThanOrEqual(200);
    expect(args.tradition.length).toBeLessThanOrEqual(100);
  });

  it('a DB fault returns the stable envelope, not a raw 500 — and leaks nothing', async () => {
    // The file had no try/catch at all.
    // SEED: remove the try/catch -> the route rejects and this goes RED.
    searchCommentaries.mockRejectedValueOnce(new Error('connection to ep-odd-fog failed: password authentication'));
    const res = await call('q=grace');
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('INTERNAL');
    expect(JSON.stringify(body)).not.toMatch(/ep-odd-fog|password/);
  });
});

describe('/api/work/[slug]/sections bounds the keyset cursor — W-SEC-CURSOR', () => {
  // `ordinal` is a Postgres INT (db/migrations/006_sources_sections.sql). `Number('1e21')`
  // passes Number.isInteger and reached SQL as `ordinal > '1e+21'` -> 22P02 -> the handler
  // threw and Next 500'd (red-live.log, live dev DB).
  // SEED: drop the `after > INT4_MAX` clause from the route -> RED (the mock answers 200).
  const callSections = (qs: string) =>
    sectionsGET(
      new Request(`https://x.test/api/work/matthew-henry/sections?${qs}`) as never,
      { params: Promise.resolve({ slug: 'matthew-henry' }) },
    );

  beforeEach(() => {
    sectionsMocks.getWorkSectionsPage.mockReset();
    sectionsMocks.getWorkSectionsPage.mockResolvedValue({ sections: [], nextAfter: null });
  });

  it('refuses an after beyond the INT ordinal range instead of 500ing', async () => {
    for (const qs of ['after=1e21', 'after=2147483648', 'after=Infinity']) {
      const res = await callSections(qs);
      expect(res.status, qs).toBe(400);
    }
    expect(sectionsMocks.getWorkSectionsPage).not.toHaveBeenCalled();
  });

  it('still accepts a valid cursor — the positive control', async () => {
    const res = await callSections('after=2147483647');
    expect(res.status).toBe(200);
    expect(sectionsMocks.getWorkSectionsPage).toHaveBeenCalledWith('matthew-henry', {
      after: 2147483647,
      limit: expect.any(Number),
    });
  });
});

describe('clientIp trusts the platform header, not the caller — H13', () => {
  const req = (h: Record<string, string>) => ({ headers: { get: (n: string) => h[n] ?? null } });

  it('prefers x-vercel-forwarded-for, which the platform overwrites', () => {
    expect(
      clientIp(req({ 'x-vercel-forwarded-for': '9.9.9.9', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' })),
    ).toBe('9.9.9.9');
  });

  it('takes the RIGHTMOST x-forwarded-for hop, not the client-controlled leftmost', () => {
    // Each proxy APPENDS what it saw. The left end is whatever the caller sent — spoofing it
    // gave an attacker a fresh throttle bucket per value.
    // SEED: restore `xff.split(',')[0]` -> RED.
    expect(clientIp(req({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('returns null rather than a shared "unknown" bucket when no trusted source exists', () => {
    // 'unknown' put every header-less visitor in ONE bucket, so real anonymous users throttled
    // each other while a header-setting attacker got a fresh bucket per value.
    // SEED: return 'unknown' instead of null -> RED.
    expect(clientIp(req({}))).toBeNull();
    expect(clientIp(req({ 'x-forwarded-for': '  ' }))).toBeNull();
  });
});

describe('result sets are bounded — H11', () => {
  it('the table of contents has a cap at all', () => {
    // getWorkWithToc had NO LIMIT: john-gill is 28,843 rows from an unauthenticated route that
    // is the reader's first call, in a file whose own header says "NEVER an unbounded response".
    // SEED: delete the LIMIT $2 -> the export disappears and this goes RED.
    expect(Number.isInteger(WORK_TOC_MAX)).toBe(true);
    expect(WORK_TOC_MAX).toBeGreaterThan(0);
    expect(WORK_TOC_MAX).toBeLessThanOrEqual(10_000);
  });
});

describe('the public read routes are throttled at all — H3', () => {
  // Mocking the throttle above makes these cases readable; it also means a deletion of the
  // throttle would go unnoticed by them. So the wiring is checked from source, comment-stripped
  // so a file that merely EXPLAINS its throttle cannot satisfy it.
  const ROUTES = [
    'src/app/api/search/works/route.ts',
    'src/app/api/search/commentaries/route.ts',
    'src/app/api/work/[slug]/route.ts',
    'src/app/api/work/[slug]/sections/route.ts',
    // 2026-08-17 pre-deploy audit #9: /api/health was unauthenticated, unthrottled and
    // force-dynamic, with one count(*) per request against the SAME Neon endpoint the
    // fail-closed ask limiter depends on — the exact coupling H3 describes, on a fifth route.
    'src/app/api/health/route.ts',
  ];

  it.each(ROUTES)('%s calls publicReadThrottle', async (rel) => {
    // Resolved from THIS FILE, not process.cwd(). cwd differs between `vitest` run inside web/
    // and `vitest --config web/vitest.config.ts` run from the repo root — which is exactly how
    // `npm run audit` invokes it. The first version used cwd, passed locally and failed the gate
    // with ENOENT. A path-resolution bug in a test is still a broken test.
    // Until 2026-08-02 all four had no requireUser, no rate limit and nothing CDN-cacheable, while
    // each request is a full-text or keyset query over 72,863 sections. They share a database with
    // the paid /api/ask pipeline whose limiter now fails CLOSED — so a flood on the free routes
    // took the paid one down with it.
    // SEED: delete the call from any one -> RED for that route only.
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const { codeOnly } = await import('../../../scripts/lib/source-scan.mjs');
    const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const code = codeOnly(readFileSync(path.join(WEB, rel), 'utf8'));
    expect(code, `${rel} does not call publicReadThrottle`).toMatch(/publicReadThrottle\s*\(/);
  });
});
