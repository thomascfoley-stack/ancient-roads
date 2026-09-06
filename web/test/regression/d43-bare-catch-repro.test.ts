// @vitest-environment node
//
// D43 regression guard — an auth-SERVICE outage is not "you are signed out".
//
// `requireUser()` in lib/session.ts throws `AuthServiceUnavailableError` when the Neon Auth
// service is unreachable (5xx / network / misconfiguration), and a plain `Error('Unauthorized')`
// only for a genuinely missing session. Callers MUST translate that distinction:
//   * API routes  → `authFailureResponse(e)`: 503 UPSTREAM_UNAVAILABLE on an outage, 401
//     UNAUTHENTICATED only on a missing session.
//   * The two best-effort library pages → distinguish with `isAuthServiceUnavailable(e)` and
//     render a transient retry banner instead of the sign-in CTA (a signed-in reader during an
//     outage is NOT signed out, and a sign-in flow cannot work while the service is down).
//
// Six call sites stayed on the pre-D43 bare `catch { return 401 | null }` after commit 0648f26b
// widened the error path — /api/annotations/all, /api/history/search, /studies/[id]/feed,
// /studies/[id]/export, /library, /library/books — and commit c11bc844's subject ("all 19 routes
// answer 503 on an outage") overclaimed closure. This suite pins the corrected behaviour so that
// gap cannot silently return.
//
// Behavioural, not source greps: each handler/page is imported and invoked with `requireUser`
// mocked to reject, the same idiom as test/invariants/a1-16-chat-routes.test.ts. authFailureResponse
// and isAuthServiceUnavailable are the REAL shipped helpers — pulled from lib/auth-failure, which
// imports nothing but api-error, so they load here without the Neon Auth SDK. Mocking them would
// have tested the mock.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// requireUser is the only collaborator under control here. Everything else the routes import is
// either pure (api-error, csrf-floor, plural, library-nav) or never reached — the auth catch is
// the FIRST thing every one of these handlers does, so an outage/sign-out returns before any DB
// or model call. The library hub page is the exception: it runs catalogTraditions() for every
// catalog inside Promise.all EVEN WHEN personal() short-circuits, so that one async query is
// stubbed (and listContinueReading/listLibraryItems for the signed-in no-regression cases).
const requireUser = vi.fn();

vi.mock('@/lib/session', async () => {
  const real = await vi.importActual<typeof import('@/lib/auth-failure')>('@/lib/auth-failure');
  return {
    requireUser: () => requireUser(),
    authFailureResponse: real.authFailureResponse,
    isAuthServiceUnavailable: real.isAuthServiceUnavailable,
  };
});

// The hub page's Promise.all runs the catalog leg unconditionally; stub it so an outage rejects
// personal() but the page still resolves the public side. CATALOGS/CATALOG_IDS are pure taxonomy
// and stay real.
vi.mock('@/lib/catalog', async () => {
  const real = await vi.importActual<typeof import('@/lib/catalog')>('@/lib/catalog');
  return { ...real, catalogTraditions: vi.fn().mockResolvedValue([]) };
});

vi.mock('@/lib/library', () => ({
  listContinueReading: vi.fn().mockResolvedValue([]),
  listLibraryItems: vi.fn().mockResolvedValue([]),
}));

import { AuthServiceUnavailableError } from '@/lib/auth-failure';

const outage = () => new AuthServiceUnavailableError(new Error('fetch failed'));
const signedOut = () => new Error('Unauthorized');
const code = async (res: Response) => ((await res.json()) as { error?: { code?: string } }).error?.code;

beforeEach(() => {
  requireUser.mockReset();
});

describe('D43 — an auth-service outage is not "signed out"', () => {
  describe('#1 GET /api/annotations/all', () => {
    it('answers 503 UPSTREAM_UNAVAILABLE on an auth-service outage', async () => {
      requireUser.mockRejectedValue(outage());
      const { GET } = await import('@/app/api/annotations/all/route');
      const res = await GET();
      // SEED: restore `catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }`
      // -> this reads 401 and goes RED.
      expect(res.status).toBe(503);
      expect(await code(res)).toBe('UPSTREAM_UNAVAILABLE');
    });

    it('answers 401 UNAUTHENTICATED only when the session is genuinely missing', async () => {
      requireUser.mockRejectedValue(signedOut());
      const { GET } = await import('@/app/api/annotations/all/route');
      const res = await GET();
      expect(res.status).toBe(401);
      expect(await code(res)).toBe('UNAUTHENTICATED');
    });
  });

  describe('#2 POST /api/history/search', () => {
    const post = () =>
      new Request('http://x/api/history/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'ephesus' }),
      });

    it('answers 503 UPSTREAM_UNAVAILABLE on an auth-service outage', async () => {
      requireUser.mockRejectedValue(outage());
      const { POST } = await import('@/app/api/history/search/route');
      const res = await POST(post());
      // SEED: restore `catch { return NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }`
      // -> this reads 401 and goes RED.
      expect(res.status).toBe(503);
      expect(await code(res)).toBe('UPSTREAM_UNAVAILABLE');
    });

    it('answers 401 UNAUTHENTICATED only when the session is genuinely missing', async () => {
      requireUser.mockRejectedValue(signedOut());
      const { POST } = await import('@/app/api/history/search/route');
      const res = await POST(post());
      expect(res.status).toBe(401);
      expect(await code(res)).toBe('UNAUTHENTICATED');
    });
  });

  describe('#3 GET /studies/[id]/feed', () => {
    const ctx = () => ({ params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000000' }) });
    const req = () => new Request('http://x/studies/00000000-0000-4000-8000-000000000000/feed');

    it('answers 503 UPSTREAM_UNAVAILABLE on an auth-service outage', async () => {
      requireUser.mockRejectedValue(outage());
      const { GET } = await import('@/app/studies/[id]/feed/route');
      const res = await GET(req() as never, ctx() as never);
      // SEED: restore `catch { return apiError('UNAUTHENTICATED') }` -> this reads 401 and goes RED.
      expect(res.status).toBe(503);
      expect(await code(res)).toBe('UPSTREAM_UNAVAILABLE');
    });

    it('answers 401 UNAUTHENTICATED only when the session is genuinely missing', async () => {
      requireUser.mockRejectedValue(signedOut());
      const { GET } = await import('@/app/studies/[id]/feed/route');
      const res = await GET(req() as never, ctx() as never);
      expect(res.status).toBe(401);
      expect(await code(res)).toBe('UNAUTHENTICATED');
    });
  });

  describe('#4 GET /studies/[id]/export', () => {
    const ctx = () => ({ params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000000' }) });
    const req = () =>
      new Request('http://x/studies/00000000-0000-4000-8000-000000000000/export?format=pdf');

    it('answers 503 UPSTREAM_UNAVAILABLE on an auth-service outage', async () => {
      requireUser.mockRejectedValue(outage());
      const { GET } = await import('@/app/studies/[id]/export/route');
      const res = await GET(req() as never, ctx() as never);
      // SEED: restore `catch { return apiError('UNAUTHENTICATED') }` -> this reads 401 and goes RED.
      expect(res.status).toBe(503);
      expect(await code(res)).toBe('UPSTREAM_UNAVAILABLE');
    });

    it('answers 401 UNAUTHENTICATED only when the session is genuinely missing', async () => {
      requireUser.mockRejectedValue(signedOut());
      const { GET } = await import('@/app/studies/[id]/export/route');
      const res = await GET(req() as never, ctx() as never);
      expect(res.status).toBe(401);
      expect(await code(res)).toBe('UNAUTHENTICATED');
    });
  });

  describe('#5 /library page (server component)', () => {
    const renderPage = async () => {
      const { default: LibraryHubPage } = await import('@/app/library/page');
      const el = await LibraryHubPage({ searchParams: Promise.resolve({}) });
      return renderToStaticMarkup(el);
    };

    it('renders the sign-in CTA when the session is genuinely missing', async () => {
      requireUser.mockRejectedValue(signedOut());
      const html = await renderPage();
      expect(html).toContain('/auth/sign-in');
      expect(html).toMatch(/Sign in/);
    });

    it('renders a transient banner, NOT the sign-in CTA, on an auth-service outage', async () => {
      requireUser.mockRejectedValue(outage());
      const html = await renderPage();
      // SEED: restore `catch { return null }` -> the outage renders the sign-in CTA and this goes RED.
      expect(html).not.toContain('/auth/sign-in');
      expect(html).toContain('couldn’t reach your shelf');
    });

    it('still renders the public catalogue on an outage (Promise.all resolves, public side stays)', async () => {
      requireUser.mockRejectedValue(outage());
      const html = await renderPage();
      expect(html).toContain('All items');
    });

    it('does not render the sign-in CTA for a signed-in reader (no regression)', async () => {
      requireUser.mockResolvedValue({ id: 'u1', email: 'u@example.test' });
      const html = await renderPage();
      expect(html).not.toContain('/auth/sign-in');
      expect(html).not.toContain('couldn’t reach your shelf');
    });
  });

  describe('#6 /library/books page (server component)', () => {
    const renderPage = async () => {
      const { default: MyBooksPage } = await import('@/app/library/books/page');
      const el = await MyBooksPage();
      return renderToStaticMarkup(el);
    };

    it('renders the sign-in CTA when the session is genuinely missing', async () => {
      requireUser.mockRejectedValue(signedOut());
      const html = await renderPage();
      expect(html).toContain('/auth/sign-in');
      expect(html).toMatch(/Sign in/);
    });

    it('renders a transient message, NOT the sign-in CTA, on an auth-service outage', async () => {
      requireUser.mockRejectedValue(outage());
      const html = await renderPage();
      // SEED: restore `catch { return null }` -> the outage renders the sign-in CTA and this goes RED.
      expect(html).not.toContain('/auth/sign-in');
      expect(html).toContain('couldn’t reach your shelf');
    });

    it('does not render the sign-in CTA for a signed-in reader (no regression)', async () => {
      requireUser.mockResolvedValue({ id: 'u1', email: 'u@example.test' });
      const html = await renderPage();
      expect(html).not.toContain('/auth/sign-in');
      expect(html).not.toContain('couldn’t reach your shelf');
    });
  });
});
