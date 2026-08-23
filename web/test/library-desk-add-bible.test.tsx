// @vitest-environment jsdom
//
// UX-1 — THE DESK PICKER OFFERED WORKS ONLY (MASTER.md UX-1). The desk's "+" routes to
// /library?desk=…, which listed catalogs of works and nothing else: a reader who wanted the
// Bible BESIDE the work on their desk had no path to it from the picker (RED screenshot:
// docs/evidence/swarm-2026-08-22/w-ux1/RED-library-desk-picker.png). The pane model already
// holds Scripture (`lib/desk.ts` kind:'scripture') and the desk already adds it in place
// through BookPicker's pick mode — the gap was the picker flow, not the model.
//
// The subject is the REAL hub server component with its three query seams stubbed, the
// harness catalog-row-affordances.test.tsx established — so the affordance is asserted on
// rendered DOM, not on JSX shape in a file.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: () => {} }) }));

const catalogTraditions = vi.hoisted(() => vi.fn());
vi.mock('@/lib/catalog', async (importOriginal) => ({
  // Taxonomy REAL, query stubbed — same reasoning as catalog-row-affordances.test.tsx.
  ...(await importOriginal<typeof import('@/lib/catalog-defs')>()),
  catalogTraditions,
}));
const listContinueReading = vi.hoisted(() => vi.fn());
vi.mock('@/lib/library', () => ({ listContinueReading }));
vi.mock('@/lib/session', () => ({
  // Signed out: the personal section is absent and the corpus half renders.
  requireUser: () => Promise.reject(new Error('unauthenticated')),
}));

import LibraryHubPage from '@/app/library/page';

async function hub(desk?: string): Promise<HTMLElement> {
  const jsx = await LibraryHubPage({ searchParams: Promise.resolve(desk ? { desk } : {}) });
  return render(jsx).container;
}

beforeEach(() => {
  catalogTraditions.mockReset();
  catalogTraditions.mockResolvedValue([{ tradition: 'puritan', works: 1 }]);
  listContinueReading.mockReset();
  listContinueReading.mockResolvedValue([]);
  push.mockReset();
  // The picker's own imports are happier with a fetch that exists (same note as
  // desk-empty-cta-adds-scripture.test.tsx); nothing here awaits it.
  vi.stubGlobal('fetch', () => new Promise(() => {}));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('/library?desk=… offers the Bible beside the works (UX-1)', () => {
  it('a desk-add visit gets a Bible entry point — RED before the fix: works only', async () => {
    const container = await hub('work:josephus-whiston');
    expect(
      within(container).getByRole('button', { name: 'Add a Bible chapter' }),
      'the desk picker has no Bible entry point — UX-1 is open',
    ).toBeTruthy();
  });

  it('an ordinary library visit is unchanged — no desk, no desk affordance', async () => {
    // The positive control's twin: without this, the first case could pass by showing the
    // control to everyone, desk or not.
    const container = await hub();
    expect(within(container).queryByRole('button', { name: 'Add a Bible chapter' })).toBeNull();
  });

  it('picking a book and chapter APPENDS a Scripture pane to the desk that was carried in', async () => {
    const container = await hub('work:josephus-whiston');
    fireEvent.click(within(container).getByRole('button', { name: 'Add a Bible chapter' }));

    // Pick mode, not reader links — the regression the desk's own test guards, on this surface.
    const dialog = screen.getByRole('dialog', { name: /choose a book or chapter/i });
    expect(
      dialog.querySelector('a[href^="/read"]'),
      'the picker is not in pick mode — its cells still navigate to the reader',
    ).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: 'John' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '3' }));

    // The whole point: the work already on the desk SURVIVES and the chapter lands beside it.
    expect(push).toHaveBeenCalledTimes(1);
    expect(String(push.mock.calls[0]?.[0])).toBe('/desk?p=work%3Ajosephus-whiston&p=scripture%3Ajhn%2F3');
  });
});
