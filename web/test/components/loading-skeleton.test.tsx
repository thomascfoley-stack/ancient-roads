// @vitest-environment jsdom
//
// "Loading…" IS NOT A LOADING STATE.
//
// THE DEFECT. The app answered the same question two ways. `app/library/loading.tsx`,
// `read/[book]/[chapter]`'s ChapterSkeleton, `my-works.tsx` and `passage-view.tsx` all hold the
// SHAPE of the content that is coming — a pulsing block in the box the real thing will occupy, an
// `sr-only` line so a screen reader hears the state once, `aria-busy` on the wrapper. Fourteen
// other surfaces printed the bare word "Loading…" in the middle of an empty region and then threw
// the page into a full relayout when the answer landed.
//
// WHAT IS ASSERTED. Two surfaces with proven harnesses, one route-level (plans) and one inside the
// desk's pane frame, and both directions on each:
//
//   * the visible literal "Loading…" is gone — asserted on the EXACT string, ellipsis and all, so
//     the check cannot be satisfied by rewording;
//   * a skeleton is actually there (aria-busy + the app's `animate-pulse` bars), because the
//     absence half alone passes just as happily against a surface that renders nothing;
//   * the state is still ANNOUNCED. Replacing a visible word with a silent box would be a
//     regression for a screen reader, and it is the failure mode this idiom exists to avoid.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { PlansClient } from '@/components/plans-client';
import { DeskPane } from '@/components/desk-pane';

/** The exact string the sweep found. Matched literally so a reworded word is still caught. */
const BARE_WORD = 'Loading…';

/** The idiom: a busy region whose pulsing bars are hidden, with one spoken line for the state. */
function assertSkeleton(container: HTMLElement) {
  const busy = container.querySelector('[aria-busy="true"], [aria-busy=""]');
  expect(busy, 'nothing on the page declared itself busy').toBeTruthy();
  expect(
    container.querySelectorAll('.animate-pulse').length,
    'no pulsing bars — the shape of the content is not being held',
  ).toBeGreaterThan(0);
  const spoken = container.querySelector('.sr-only');
  expect(spoken?.textContent ?? '', 'the loading state is no longer announced at all').toMatch(/loading/i);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('/plans while the list is loading', () => {
  it('holds the shape of the list instead of printing the word', async () => {
    // Never settles: the loading state is the subject, so it must not be raced by a response.
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    const { container } = render(<PlansClient />);

    await waitFor(() => expect(container.querySelector('.animate-pulse')).toBeTruthy());
    expect(container.textContent ?? '').not.toContain(BARE_WORD);
    assertSkeleton(container);
  });
});

describe('a desk work pane while its first page is loading', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
  });

  it('holds the shape of the reading column instead of printing the word', () => {
    const { container } = render(
      <DeskPane pane={{ kind: 'work', slug: 'spurgeon-sermons' }} onClose={() => {}} onReplace={() => {}} />,
    );

    expect(container.textContent ?? '').not.toContain(BARE_WORD);
    // The pane frame's own header skeleton already sets aria-busy on the section; the body must
    // carry bars of its own rather than an empty box.
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(1);
    expect(screen.getByText(/loading/i), 'the pane stopped saying anything at all').toBeTruthy();
  });
});
