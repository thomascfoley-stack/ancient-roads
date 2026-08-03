// @vitest-environment jsdom

// TYPING A VERSE MUST NAVIGATE TO THAT VERSE — Bug 1, filed 2026-08-02.
//
// The omnibox built its navigation href with `bookUrl(book, chapter)` (lib/bible.ts), which emits
// no `#v` anchor at all — it only ever knew book + chapter. So typing "John 3:16" and pressing
// Enter navigated to `/read/jhn/3` and landed on verse 1, even though the reader already honors a
// `#v{n}` fragment with a scroll + highlight ring (see verse-deep-link.test.tsx). The parsed verse
// was computed and then thrown away.
//
// Fixed by routing navigation through the SAME `verseHref` (lib/verse-link.ts) the reader and
// `/library/notes` already use, instead of a second, divergent path that never carried a verse.
// Driven through the real component (typed input -> submit -> router.push), not a copy of the
// href-building logic, so a regression here has to break the shipped component to go unnoticed.

import { cleanup, render, fireEvent, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import { Omnibox, OMNIBOX_OPEN_EVENT } from '@/components/omnibox';

afterEach(() => {
  cleanup();
  push.mockClear();
});

function openAndType(container: HTMLElement, query: string): HTMLFormElement {
  act(() => {
    window.dispatchEvent(new Event(OMNIBOX_OPEN_EVENT));
  });
  const input = container.querySelector('input');
  if (!input) throw new Error('omnibox input not found — component shape changed');
  fireEvent.change(input, { target: { value: query } });
  const form = container.querySelector('form');
  if (!form) throw new Error('omnibox form not found — component shape changed');
  return form;
}

describe('the omnibox navigates to the verse it parsed, not just the chapter', () => {
  it('SEED: revert to `bookUrl(book, chapter)` -> RED. "John 3:16" -> /read/jhn/3#v16', () => {
    const { container } = render(<Omnibox />);
    fireEvent.submit(openAndType(container, 'John 3:16'));
    expect(push).toHaveBeenCalledWith('/read/jhn/3#v16');
  });

  it('a verse range anchors to the RANGE START: "John 3:16-18" -> /read/jhn/3#v16', () => {
    const { container } = render(<Omnibox />);
    fireEvent.submit(openAndType(container, 'John 3:16-18'));
    expect(push).toHaveBeenCalledWith('/read/jhn/3#v16');
  });

  it('a chapter-only reference still resolves to that chapter: "John 3" -> /read/jhn/3', () => {
    // verseHref always emits a `#v` fragment (it has no "no verse" mode), so a chapter-only
    // reference lands on verse 1 of that chapter — the same place the reader already opens to,
    // just now spelled out. Asserted as a prefix so this pins the chapter, not the incidental
    // anchor.
    const { container } = render(<Omnibox />);
    fireEvent.submit(openAndType(container, 'John 3'));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]?.[0]).toMatch(/^\/read\/jhn\/3/);
  });

  it('a bare book name still resolves via the single-completion path: "Genesis" -> /read/gen/1', () => {
    const { container } = render(<Omnibox />);
    fireEvent.submit(openAndType(container, 'Genesis'));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]?.[0]).toMatch(/^\/read\/gen\/1/);
  });
});
