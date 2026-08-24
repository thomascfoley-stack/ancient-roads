// Cluster A of DEEP_SWEEP (D14, D26, D32, D33) — every /api/* route promises the
// `{ error: { code, message } }` envelope (lib/api-error.ts, docs/API_ERRORS.md). These handlers
// called into the data layer with no try at all, so a Neon hiccup escaped to Next's raw HTML 500.
// The sibling /api/search/commentaries added exactly this wrap on 2026-08-02 with a comment
// saying why; these files were left without it.
//
// Behavioural: the handler is invoked with its store mocked to throw. A source grep cannot tell
// you what a route RETURNS when the DB is down.
import { describe, expect, it, vi, beforeEach } from 'vitest';

const throttle = vi.fn();
const searchSections = vi.fn();
const getWorkWithToc = vi.fn(), getWorkSectionsPage = vi.fn();
const fetchWordArticles = vi.fn();
const listThreads = vi.fn(), deleteThread = vi.fn();
const requireUser = vi.fn();

vi.mock('@/lib/public-read-limit', () => ({ publicReadThrottle: () => throttle(), PUBLIC_READ_PER_MIN: 60 }));
vi.mock('@/lib/search-sections', () => ({ searchSections: (...a: unknown[]) => searchSections(...a) }));
vi.mock('@/lib/work', () => ({
  getWorkWithToc: (...a: unknown[]) => getWorkWithToc(...a),
  getWorkSectionsPage: (...a: unknown[]) => getWorkSectionsPage(...a),
  WORK_SECTIONS_DEFAULT_LIMIT: 100,
}));
vi.mock('@/lib/word-articles', () => ({ fetchWordArticles: (...a: unknown[]) => fetchWordArticles(...a) }));
vi.mock('@/lib/session', () => ({ requireUser: () => requireUser() }));
vi.mock('@/lib/research', () => ({
  listThreads: (...a: unknown[]) => listThreads(...a),
  deleteThread: (...a: unknown[]) => deleteThread(...a),
  isThreadId: (s: unknown) => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s),
}));

const DB_FAULT = new Error('remaining connection slots are reserved');
const params = <T,>(v: T) => ({ params: Promise.resolve(v) });

/** The contract: a JSON body carrying error.code, not an HTML page. */
async function expectEnvelope(res: Response, code = 'INTERNAL') {
  expect(res.status).toBe(code === 'INTERNAL' ? 500 : 400);
  expect(res.headers.get('content-type') ?? '').toMatch(/application\/json/);
  const body = await res.json() as { error?: { code?: string } };
  expect(body.error?.code).toBe(code);
}

beforeEach(() => { vi.clearAllMocks(); throttle.mockResolvedValue(null); requireUser.mockResolvedValue({ id: 'u1' }); });

describe('cluster A — a DB fault returns the envelope, never a raw 500', () => {
  it('D14 /api/search/works', async () => {
    const { GET } = await import('@/app/api/search/works/route');
    searchSections.mockRejectedValue(DB_FAULT);
    await expectEnvelope(await GET(new Request('http://t/api/search/works?q=grace')));
  });

  it('D32 /api/work/[slug]', async () => {
    const { GET } = await import('@/app/api/work/[slug]/route');
    getWorkWithToc.mockRejectedValue(DB_FAULT);
    await expectEnvelope(await GET(new Request('http://t/api/work/x'), params({ slug: 'x' })));
  });

  it('D32 /api/work/[slug]/sections', async () => {
    const { GET } = await import('@/app/api/work/[slug]/sections/route');
    getWorkSectionsPage.mockRejectedValue(DB_FAULT);
    await expectEnvelope(await GET(new Request('http://t/api/work/x/sections'), params({ slug: 'x' })));
  });

  it('D32 /api/word/[strongs]/articles', async () => {
    const { GET } = await import('@/app/api/word/[strongs]/articles/route');
    fetchWordArticles.mockRejectedValue(DB_FAULT);
    await expectEnvelope(await GET(new Request('http://t/api/word/G26/articles'), params({ strongs: 'G26' })));
  });

  it('D33 /api/research GET', async () => {
    const { GET } = await import('@/app/api/research/route');
    listThreads.mockRejectedValue(DB_FAULT);
    // NextRequest exposes nextUrl; the handler reads searchParams off it.
    const req = Object.assign(new Request('http://t/api/research'), { nextUrl: new URL('http://t/api/research') });
    await expectEnvelope(await GET(req as never));
  });

  it('D33 /api/research/[id] DELETE', async () => {
    const { DELETE } = await import('@/app/api/research/[id]/route');
    deleteThread.mockRejectedValue(DB_FAULT);
    await expectEnvelope(await DELETE(new Request('http://t/x', { method: 'DELETE' }) as never,
      params({ id: '11111111-1111-1111-1111-111111111111' })));
  });

  // D26 — the pre-launch site's only public mutation, outside the middleware matcher. A JSON
  // content-type makes req.formData() throw: one curl reaches a raw 500 unauthenticated.
  it('D26 /api/gate: a JSON-bodied POST does not reach a raw 500', async () => {
    const { POST } = await import('@/app/api/gate/route');
    const res = await POST(new Request('http://t/api/gate', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    }) as never);
    expect(res.status, 'a wrong content-type is caller error, not a server crash').toBeLessThan(500);
  });
});
