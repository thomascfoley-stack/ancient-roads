// @vitest-environment jsdom
//
// /studies PAGE-BOUNDARY: no spurious "Older studies" link when a full page IS the last page.
//
// The studies list cursor-paginates a reader's studies ((updated_at, id) before-cursor) and
// gates the "Older studies" link on whether a next page exists. The OLD gate was
// `firstPage.length >= STUDIES_PAGE_LIMIT` — wrong at exact multiples of the page size, where a
// full page is ALSO the last page: the link was rendered, and following it advanced the cursor
// past the end to an empty page (the bug this suite pins). The fix over-fetches ONE probe row
// (limit = STUDIES_PAGE_LIMIT + 1), computes `hasMore = rows.length > STUDIES_PAGE_LIMIT`,
// slices the probe row out of the rendered page, and gates the link on `hasMore` — the same
// limit+1 probe the merged /search works group uses (search/page.tsx).
//
// This suite runs at the same mock layer as studies-signed-out.test.tsx (jsdom, `listStudies`
// mocked, STUDIES_PAGE_LIMIT pinned at 20). The mock honours the (updated_at, id) before-cursor
// against a deterministic dataset, so the page is exercised end-to-end — first-page render,
// href construction, cursor validation, and the second-page render that follows the link that
// the page itself rendered.
//
// SEED: gate `nextHref` on the OLD `firstPage.length >= STUDIES_PAGE_LIMIT` again (and re-clamp
// listStudies to STUDIES_PAGE_LIMIT) → cases 1 and 3 go RED (the spurious link reappears at the
// exact-multiple last page), and case 5 stays green only because it was never the failing case.

import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PAGE_LIMIT = 20; // mirrors the STUDIES_PAGE_LIMIT mock below

// Mutable holder so a case is signed in (the boundary only manifests for a reader).
const session: { user: { id: string; email: string } | null } = { user: null };

// Spreads the REAL @/lib/auth-failure so this mock carries every export the module has, not just
// the ones this file thought of — held by test/invariants/session-mock-surface.test.ts.
vi.mock('@/lib/session', async () => ({
  ...(await import('@/lib/auth-failure')),
  requireUser: async () => {
    if (!session.user) throw new Error('Unauthorized');
    return session.user;
  },
  currentUser: async () => session.user,
}));

// Deterministic dataset: N studies, descending recency (index 0 is most recent). Distinct
// updated_at values so the (updated_at, id) tuple cursor reduces to an updated_at comparison,
// and valid UUIDs so the page's cursor shape-check accepts the href the page itself rendered.
const makeStudies = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    title: `Study ${i}`,
    pinned_at: null as string | null,
    updated_at: `2026-09-12T00:${String(59 - i).padStart(2, '0')}:00.000Z`,
  }));

let dataset = makeStudies(0);

// Mirrors lib/studies.listStudies: clamps at STUDIES_PAGE_LIMIT + 1 (so the page's `limit + 1`
// probe is observable) and honours the before-cursor the way the SQL does — rows strictly behind
// `(before.updatedAt, before.id)`. With distinct updated_at this is `updated_at < before.updatedAt`.
const listStudies = vi.fn(async (...args: unknown[]) => {
  const opts = (args[1] ?? {}) as { before?: { updatedAt: string; id: string }; limit?: number };
  const limit = Math.min(Math.max(1, opts.limit ?? PAGE_LIMIT), PAGE_LIMIT + 1);
  let rows = dataset;
  if (opts.before) rows = dataset.filter((s) => s.updated_at < opts.before!.updatedAt);
  return rows.slice(0, limit);
});
vi.mock('@/lib/studies', () => ({
  listStudies: (...args: unknown[]) => listStudies(...args),
  STUDIES_PAGE_LIMIT: 20,
}));

// The two client components the page composes; neither is the property under test.
vi.mock('@/components/study-editor', () => ({ NewStudyButton: () => <button type="button">New study</button> }));
vi.mock('@/components/study-delete-button', () => ({ DeleteStudyButton: () => <button type="button">Delete</button> }));

import StudiesPage from '../../src/app/studies/page';

const renderPage = async (search?: { beforeUpdatedAt?: string; beforeId?: string }) =>
  render(await StudiesPage({ searchParams: Promise.resolve(search ?? {}) }));

const followLink = (name: string | RegExp): { beforeUpdatedAt: string; beforeId: string } => {
  const href = screen.getByRole('link', { name }).getAttribute('href')!;
  const u = new URL(href, 'http://localhost');
  return { beforeUpdatedAt: u.searchParams.get('beforeUpdatedAt')!, beforeId: u.searchParams.get('beforeId')! };
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  session.user = { id: 'user-1', email: 'reader@example.test' };
});

describe('/studies page-boundary: a full page that is the last page renders no "Older studies" link', () => {
  it('an exact multiple of the page size renders no "Older studies" link on the last full page', async () => {
    // Exactly PAGE_LIMIT studies: the first page is full AND is the last page. The OLD
    // `length >= LIMIT` gate rendered the spurious link here; `hasMore` correctly does not.
    dataset = makeStudies(PAGE_LIMIT);
    await renderPage();

    expect(screen.queryByRole('link', { name: /older studies/i }), 'a full last page is not a next page').toBeNull();
    // The fix hides the link, not the content — the full page still renders.
    expect(screen.getByText('Study 0')).toBeTruthy();
    expect(screen.getByText(`Study ${PAGE_LIMIT - 1}`)).toBeTruthy();
  });

  it('one more than the page size renders the link; the probe row is neither shown nor skipped', async () => {
    // PAGE_LIMIT + 1 studies: page 1 is full AND has a next page.
    dataset = makeStudies(PAGE_LIMIT + 1);
    await renderPage();

    const link = screen.getByRole('link', { name: /older studies/i });
    expect(link).toBeTruthy();

    // The probe row (index PAGE_LIMIT, the (PAGE_LIMIT+1)th study) is sliced off `firstPage` and
    // must NOT be rendered on page 1 — only the `hasMore` flag keeps it.
    expect(screen.queryByText(`Study ${PAGE_LIMIT}`), 'the probe row is never rendered').toBeNull();
    expect(screen.getByText(`Study ${PAGE_LIMIT - 1}`), 'the last rendered row is kept').toBeTruthy();

    // The cursor the page rendered points at the last RENDERED row (index PAGE_LIMIT - 1), so the
    // next page's `WHERE (updated_at, id) < (cursor)` must INCLUDE the probe row, not skip it.
    const cursor = followLink(/older studies/i);
    cleanup();
    await renderPage(cursor);

    expect(screen.getByText(`Study ${PAGE_LIMIT}`), 'the probe row lands on the next page, not skipped').toBeTruthy();
    expect(screen.queryByRole('link', { name: /older studies/i }), 'the last page carries no further link').toBeNull();
  });

  it('a second full page at an exact multiple carries no "Older studies" link', async () => {
    // 2 × PAGE_LIMIT studies: page 2 is a full page that is ALSO the last page — the second
    // boundary the OLD `length >= LIMIT` gate got wrong (it rendered the link on page 2 too).
    dataset = makeStudies(2 * PAGE_LIMIT);
    await renderPage();

    expect(screen.getByRole('link', { name: /older studies/i }), 'page 1 has a next page').toBeTruthy();

    const cursor = followLink(/older studies/i);
    cleanup();
    await renderPage(cursor);

    expect(
      screen.queryByRole('link', { name: /older studies/i }),
      'a full last page at a multiple is not a next page',
    ).toBeNull();
    expect(screen.getByText(`Study ${2 * PAGE_LIMIT - 1}`), 'the last study on the last page is shown').toBeTruthy();
  });

  it('a brand-new account with no studies shows the empty state and no link', async () => {
    dataset = makeStudies(0);
    await renderPage();

    expect(screen.queryByRole('link', { name: /older studies/i })).toBeNull();
    expect(screen.getByText(/nothing here yet/i)).toBeTruthy();
  });

  it('more than a full page still renders "Older studies" (the happy path is not regressed)', async () => {
    dataset = makeStudies(PAGE_LIMIT + 5);
    await renderPage();

    expect(
      screen.getByRole('link', { name: /older studies/i }),
      'a full page with more rows still links on',
    ).toBeTruthy();
    // Exactly PAGE_LIMIT rows render, never more — the probe row stays off-screen.
    expect(screen.getByText(`Study ${PAGE_LIMIT - 1}`)).toBeTruthy();
    expect(screen.queryByText(`Study ${PAGE_LIMIT}`)).toBeNull();
  });
});
