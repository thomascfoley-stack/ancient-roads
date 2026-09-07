// @vitest-environment jsdom
//
// FOUR POPOVERS THAT A KEYBOARD COULD NOT LEAVE.
//
// `lib/use-dialog.tsx` has carried the contract since the thirteen-sheet sweep — focus in on open,
// Tab cycles inside, Escape closes, focus returns to the trigger. Four surfaces never adopted it,
// and three of them had NO Escape handler at all, so the only way out on a keyboard was to tab
// blindly through the page behind an open panel:
//
//   1. reader-header.tsx  — the translation dropdown (WEB/BSB/KJV/…). Closed on outside MOUSEDOWN
//      only, which a keyboard never produces.
//   2. reader-settings.tsx — the `Aa` popover. Same: one mousedown listener, nothing else.
//   3. save-to-study.tsx  — the study picker. This one HAD `role="dialog"`, an Escape handler and
//      a focus return already; what it lacked was the trap, so Tab walked out of an open picker
//      into the page beneath while its click-away scrim still covered the screen.
//   4. study-editor.tsx   — the Export menu. A bare `<details>`: Escape does not close a details
//      element, and nothing closed it on an outside click either, so it stayed open over the
//      document until the reader found the summary again.
//
// NONE of the four announced its state: `grep -c aria-expanded` over these files returned 0 before
// this branch except for save-to-study's, so a screen-reader user was told "button, Aa" with no
// word about a panel opening.
//
// WHAT THIS FILE ASSERTS, and the seam it is honest about: the ARIA wiring and the keyboard
// contract, both exercised through a real render. jsdom has no layout, so `visibleFocusable`'s
// `offsetParent` filter is emulated the way `use-dialog-stage-swap.test.tsx` does it — connected
// means visible. Without that, EVERY element reads as hidden and the trap assertions would be
// vacuous.
//
// The Export menu is deliberately held to a LOWER bar than the other three, and the difference is
// stated rather than smoothed over: it is a disclosure, not a modal. Escape closes it and focus
// comes back to the summary; Tab is NOT trapped, because trapping a two-link menu behind a
// document is the wrong behaviour, not the missing one.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// jsdom reports offsetParent as null for every element, so useDialog's visibility filter would
// treat an attached panel as hidden and its Tab branch would be untestable. Same emulation as
// use-dialog-stage-swap.test.tsx: connected is visible.
Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
  configurable: true,
  get(this: HTMLElement) {
    return this.isConnected ? document.body : null;
  },
});

let mockSession: { data: { user: { id: string } } | null } = { data: { user: { id: 'u-test' } } };
vi.mock('@/lib/auth/client', () => ({ authClient: { useSession: () => mockSession } }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/ask',
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}));

import { BOOKS, TRANSLATIONS } from '@/lib/bible';
import { ReaderHeader } from '@/components/reader-header';
import { ReaderSettings } from '@/components/reader-settings';
import { SaveToStudy } from '@/components/save-to-study';
import { StudyEditor } from '@/components/study-editor';

const JOHN = BOOKS.find((b) => b.name === 'John')!;
const KJV = TRANSLATIONS.find((t) => t.abbr === 'KJV')!;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

beforeEach(() => {
  mockSession = { data: { user: { id: 'u-test' } } };
});

/** Escape as the browser delivers it: from whatever currently holds focus, so a capture-phase
 *  listener on `document` and a React `onKeyDown` on the panel are both exercised for real. */
function pressEscape(): void {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
}

describe('reader-header — the translation dropdown', () => {
  function renderHeader() {
    return render(
      <ReaderHeader
        book={JOHN}
        chapter={1}
        translation={KJV}
        onTranslationChange={() => {}}
        interlinear={false}
        onToggleInterlinear={() => {}}
      />,
    );
  }

  it('the trigger says a panel hangs off it, and whether it is open', () => {
    renderHeader();
    const trigger = screen.getByRole('button', { name: 'KJV' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('opens with focus inside it, and Escape closes it and hands focus back', () => {
    renderHeader();
    const trigger = screen.getByRole('button', { name: 'KJV' });
    trigger.focus();
    fireEvent.click(trigger);

    const panel = screen.getByRole('dialog', { name: /translation/i });
    expect(panel.contains(document.activeElement)).toBe(true);

    pressEscape();
    expect(screen.queryByRole('dialog', { name: /translation/i })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('Tab cycles inside the open list rather than walking out to the page behind', () => {
    renderHeader();
    const trigger = screen.getByRole('button', { name: 'KJV' });
    trigger.focus();
    fireEvent.click(trigger);

    const panel = screen.getByRole('dialog', { name: /translation/i });
    const stops = [...panel.querySelectorAll<HTMLElement>('button')];
    expect(stops.length).toBeGreaterThan(1);

    stops[stops.length - 1]!.focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(document.activeElement).toBe(stops[0]);

    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(stops[stops.length - 1]);
  });
});

describe('reader-settings — the Aa popover', () => {
  it('the trigger says a panel hangs off it, and whether it is open', () => {
    render(<ReaderSettings />);
    const trigger = screen.getByRole('button', { name: 'Aa' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('opens with focus inside it, and Escape closes it and hands focus back', () => {
    render(<ReaderSettings />);
    const trigger = screen.getByRole('button', { name: 'Aa' });
    trigger.focus();
    fireEvent.click(trigger);

    const panel = screen.getByRole('dialog', { name: /reading settings/i });
    expect(panel.contains(document.activeElement)).toBe(true);

    pressEscape();
    expect(screen.queryByRole('dialog', { name: /reading settings/i })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('Tab cycles inside the open popover', () => {
    render(<ReaderSettings />);
    const trigger = screen.getByRole('button', { name: 'Aa' });
    trigger.focus();
    fireEvent.click(trigger);

    const panel = screen.getByRole('dialog', { name: /reading settings/i });
    const stops = [...panel.querySelectorAll<HTMLElement>('button:not([disabled])')];
    expect(stops.length).toBeGreaterThan(1);

    stops[stops.length - 1]!.focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(document.activeElement).toBe(stops[0]);
  });
});

describe('save-to-study — the study picker', () => {
  const clip = { sourceId: 'commentary:jhn:1:1-5:Matthew Henry' };
  const STUDIES = [
    { id: 's-1', title: 'Rahab', pinned_at: null, updated_at: '2026-08-01T00:00:00Z' },
    { id: 's-2', title: 'Perseverance', pinned_at: null, updated_at: '2026-07-01T00:00:00Z' },
  ];

  function stubStudiesFetch() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ studies: STUDIES }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })),
    );
  }

  it('Escape closes the picker and hands focus back to Save to study', async () => {
    stubStudiesFetch();
    render(<SaveToStudy clip={clip} />);
    const trigger = screen.getByRole('button', { name: 'Save to study' });
    trigger.focus();
    fireEvent.click(trigger);

    await screen.findByRole('button', { name: /Rahab/ });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    // PRECONDITION: focus actually LEFT the trigger for the picker. Without this line the
    // restore assertion below could not fail — if the dialog never took focus, `activeElement`
    // was the trigger the whole time (deep audit, 2026-09-07).
    await waitFor(() => expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true));

    pressEscape();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('Tab cycles inside the open picker rather than walking out behind the scrim', async () => {
    stubStudiesFetch();
    render(<SaveToStudy clip={clip} />);
    const trigger = screen.getByRole('button', { name: 'Save to study' });
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByRole('button', { name: /Rahab/ });

    const panel = screen.getByRole('dialog', { name: /choose a study/i });
    const stops = [...panel.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')];
    expect(stops.length).toBeGreaterThan(1);

    stops[stops.length - 1]!.focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(document.activeElement).toBe(stops[0]);
  });
});

describe('study-editor — the Export menu', () => {
  const STUDY = { id: '11111111-1111-4111-8111-111111111111', title: 'Rahab', pinned: false };

  function renderEditor() {
    return render(
      <StudyEditor study={STUDY} initialBlocks={[]} initialNextAfterPosition={null} tombstoneNotice="gone" />,
    );
  }

  it('the summary says a menu hangs off it, and whether it is open', () => {
    renderEditor();
    const trigger = screen.getByText('Export');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('Escape closes it and hands focus back to Export', () => {
    renderEditor();
    const trigger = screen.getByText('Export');
    trigger.focus();
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    // A disclosure does not move focus into itself, so the reader Tabs into it. Put focus on the
    // first item BEFORE Escape: otherwise the restore assertion below cannot fail, because focus
    // never left the summary (deep audit, 2026-09-07).
    const firstItem = trigger.closest('details')?.querySelector<HTMLElement>('a, button:not(summary)');
    expect(firstItem, 'the export menu renders no focusable item').toBeTruthy();
    firstItem!.focus();
    expect(document.activeElement).toBe(firstItem);

    fireEvent.keyDown(firstItem!, { key: 'Escape' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });
});
