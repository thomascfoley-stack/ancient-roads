// @vitest-environment jsdom
//
// THREE SURFACES THAT SAID SOMETHING UNTRUE. One line each, no shared mechanism — what they share
// is the shape: a string or an href that was right when it was written and quietly stopped being
// right, and that no check was watching.
//
//   4b  /library/[catalog] with filters on and nothing matching said "No works here yet." The
//       shelf is full; the FILTERS excluded everything. The reader is told the library is empty
//       and given no hint that a chip they lit is the reason.
//   4c  /about's "Log in" button pointed at /home, which is the post-sign-in destination, not the
//       sign-in form. The one public page a stranger lands on had a broken front door.
//   4d  My Works reported "Uploads are not available" on the surface that was RULED never to be
//       called Uploads (UX_REMEDIATION §2; the counted noun is "items", the surface is "My Works").
//
// SEEDS: restore each original string/href and the matching case goes red.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── 4b: the catalog page's DB layer and its client children ────────────────────────────────
const listCatalogWorks = vi.fn(async () => ({ works: [], total: 0, totalCapped: false }));
const catalogTraditions = vi.fn(async () => [
  { tradition: 'Reformed', works: 12 },
  { tradition: 'Patristic', works: 8 },
]);

vi.mock('@/lib/catalog', async (importOriginal) => {
  // CATALOGS / isCatalogId / isSubFilterOf are pure lookups — keep the REAL ones so this test
  // cannot pass against a catalog definition the product does not have. Only the two DB calls
  // are replaced.
  const actual = await importOriginal<typeof import('@/lib/catalog')>();
  return {
    ...actual,
    listCatalogWorks: (...a: unknown[]) => listCatalogWorks(...(a as [])),
    catalogTraditions: (...a: unknown[]) => catalogTraditions(...(a as [])),
  };
});

vi.mock('@/lib/db', () => ({ getDb: () => ({ query: async () => [] }) }));
vi.mock('@/components/catalog-search', () => ({ CatalogSearch: () => null }));
vi.mock('@/components/study-entrance', () => ({ StudyEntrance: () => null }));
vi.mock('@/lib/work', () => ({ findWorkOrdinalForVerseId: async () => null }));

// ── 4c/4d: the client-component collaborators ──────────────────────────────────────────────
vi.mock('@/components/marketing/footer', () => ({ MarketingFooter: () => null }));
vi.mock('../../src/lib/auth/client', () => ({
  authClient: { useSession: () => ({ data: { user: { id: 'u-test' } } }) },
}));

import CatalogPage from '../../src/app/library/[catalog]/page';
import AboutPage from '../../src/app/about/page';
import { MyWorksClient } from '../../src/components/my-works';

const renderCatalog = async (searchParams: Record<string, string>) =>
  render(
    await CatalogPage({
      params: Promise.resolve({ catalog: 'commentaries' }),
      searchParams: Promise.resolve(searchParams),
    }),
  );

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  listCatalogWorks.mockResolvedValue({ works: [], total: 0, totalCapped: false });
});

describe('4b — an empty filtered shelf does not claim the shelf is empty', () => {
  it('blames the filters, not the library, and offers a way out', async () => {
    const { container } = await renderCatalog({ tradition: 'Reformed' });

    expect(
      screen.queryByText(/no works here yet/i),
      'the shelf has works — the filters excluded them',
    ).toBeNull();
    expect(container.textContent, 'it names the real cause').toMatch(/no items match these filters/i);

    // The way out is a control, not a sentence telling the reader to go find one. It must land on
    // this catalog with the tradition dropped.
    const clear = screen.getByRole('link', { name: /clear filters/i });
    const href = clear.getAttribute('href') ?? '';
    expect(href).toContain('/library/commentaries');
    expect(href, 'clearing means the filter is gone from the URL').not.toContain('tradition=');

    // The counted noun is locked to "items" for user-visible strings (UX_REMEDIATION §2.2).
    expect(container.textContent).not.toMatch(/no works match/i);
  });

  it('still says the shelf is empty when it genuinely is, with no filters on', async () => {
    await renderCatalog({});
    expect(screen.getByText(/no works here yet/i)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /clear filters/i })).toBeNull();
  });

  it('keeps the paging message for an over-run page', async () => {
    await renderCatalog({ page: '3' });
    expect(screen.getByText(/no works on this page/i)).toBeTruthy();
  });
});

describe('4c — /about’s sign-in button goes to the sign-in form', () => {
  it('points at /auth/sign-in, not the post-sign-in destination', () => {
    render(<AboutPage />);
    const link = screen.getByRole('link', { name: /log in/i });
    expect(
      link.getAttribute('href'),
      '/home is where you land AFTER signing in; a stranger clicking this needs the form',
    ).toBe('/auth/sign-in');
  });
});

describe('4d — My Works does not call itself Uploads', () => {
  it('names the surface by its ruled name when the account cannot use it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 500 })),
    );
    render(<MyWorksClient />);

    const line = await waitFor(() => screen.getByText(/is not available on this account yet/i));
    expect(line.textContent).toMatch(/my works/i);
    expect(line.textContent, 'the surface was ruled never to be called Uploads').not.toMatch(/uploads/i);
    vi.unstubAllGlobals();
  });
});
