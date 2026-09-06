// @vitest-environment jsdom
//
// A re-add of an already-open work must not produce a SECOND pane for it.
//
// The desk dedups by WORK identity (`paneKey`, which IGNORES `ordinal` — the ordinal is an initial
// landing position, not which work the pane is). Before that rule reached the dedup sites, two
// panes for the same work that differed only in ordinal survived `decodeDeskReport` as distinct
// panes, and the renderer keyed its children by `paneKey` (`work:slug`, no ordinal) — so two
// same-slug cells shared a React key and React warned:
//   "Encountered two children with the same key … work:adam-clarke".
//
// This file pins the consequence the reader sees: a same-work-different-ordinal URL renders ONE
// pane and emits NO duplicate-key warning. It is the inverse of the bug report's captured failing
// test (which rendered `<DeskPage />` against the shipped source and asserted the warning fired).

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Same stub shape as desk-cap-notice.test.tsx: the desk reads `?p=` through useSearchParams. The
// pane-count assertions below need no router outcome (nothing here clicks a control), but the
// page wires router.replace in callbacks, so the mock must still return a router.
const params = vi.hoisted(() => ({ current: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: () => {} }),
  useSearchParams: () => params.current,
}));

import DeskPage from '@/app/desk/page';

beforeEach(() => {
  // Every work pane fetches its metadata on mount. A promise that never settles holds the panes in
  // their loading state for the whole test: this file is about the desk's pane COUNT and React-key
  // health, not any pane's resolved content, so a settled fetch would only add render churn.
  vi.stubGlobal('fetch', () => new Promise(() => {}));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  params.current = new URLSearchParams();
});

/** Render the desk at a given `?p=` query, capturing any React duplicate-key console errors. */
function renderDeskCapturingKeyWarnings(query: string): { errors: string[] } {
  params.current = new URLSearchParams(query);
  const errors: string[] = [];
  const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => errors.push(a.map(String).join(' ')));
  render(<DeskPage />);
  spy.mockRestore();
  return { errors };
}

describe('a same-work-different-ordinal URL renders one pane and no duplicate-key warning', () => {
  it('collapses bare + ordinal to a single pane and emits no React duplicate-key warning', () => {
    // The exact input from the bug report: `?p=work:adam-clarke&p=work:adam-clarke:8075`. Before the
    // fix, both survived dedup and the renderer keyed both children by `work:adam-clarke`.
    const { errors } = renderDeskCapturingKeyWarnings('p=work:adam-clarke&p=work:adam-clarke:8075');
    expect(screen.getAllByRole('region')).toHaveLength(1);
    expect(errors.find((e) => /Encountered two children with the same key/.test(e))).toBeUndefined();
  });

  it('does not over-collapse: two distinct works still render two panes', () => {
    const { errors } = renderDeskCapturingKeyWarnings('p=work:adam-clarke&p=work:calvin-institutes');
    expect(screen.getAllByRole('region')).toHaveLength(2);
    expect(errors.find((e) => /Encountered two children with the same key/.test(e))).toBeUndefined();
  });

  it('a Scripture pane and a same-work duplicate alongside it keeps both unique kinds', () => {
    // Scripture and a work are different kinds; the Scripture pane must NOT be collapsed by a
    // same-slug work, and the duplicate work must collapse to one. Three `?p=` values, two panes.
    const { errors } = renderDeskCapturingKeyWarnings(
      'p=scripture:jhn/3&p=work:adam-clarke&p=work:adam-clarke:8075',
    );
    expect(screen.getAllByRole('region')).toHaveLength(2);
    expect(errors.find((e) => /Encountered two children with the same key/.test(e))).toBeUndefined();
  });
});
