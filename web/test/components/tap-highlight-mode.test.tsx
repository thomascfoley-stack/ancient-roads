// @vitest-environment jsdom

// TWO-TAP HIGHLIGHTING — the phone flow.
//
// Drag-selecting a phrase on a phone is the app's fussiest gesture: the OS callout fights the
// popover, the handles are small, and a long-press is one tremor away from selecting the verse
// number. Tap mode trades the drag for two taps: tap a word to anchor it, tap another to take
// the whole span between them (either direction — readers do not plan which end they tap
// first), and the EXISTING selection popover opens on that span for the colour pick. There is
// no second popover: the taps produce exactly the `pending` shape the selection engine
// produces, raised through the same hook.
//
// The SelectionPopover is stubbed so the test reads the `pending` props directly — the popover's
// own rendering is covered by its own tests; what is pinned here is the SPAN the taps produce.

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock('@/components/selection-popover', () => ({
  SelectionPopover: ({ pending }: { pending: { start: number; end: number; text: string } }) => (
    <div data-testid="popover" data-start={pending.start} data-end={pending.end}>
      {pending.text}
    </div>
  ),
}));
import { VerseDisplay } from '@/components/verse-display';
import type { ChapterData } from '@/lib/bible';

afterEach(cleanup);

const chapter: ChapterData = {
  book: 43,
  chapter: 3,
  // Token offsets: For 0-3 · God 4-7 · so 8-10 · loved 11-16 · the 17-20 · world. 21-27
  verses: [{ verse: 16, text: 'For God so loved the world.' }],
};

const renderMode = (onExitTapMode = () => {}) =>
  render(
    <VerseDisplay
      data={chapter}
      bookName="John"
      translation="web"
      selectedVerse={null}
      onVerseClick={() => {}}
      tapMode
      onExitTapMode={onExitTapMode}
    />,
  );

const word = (container: HTMLElement, text: string) => {
  const el = [...container.querySelectorAll('[data-tap-word]')].find((w) => w.textContent === text);
  expect(el, `no tappable word "${text}"`).not.toBeUndefined();
  return el!;
};

const popover = (container: HTMLElement) => container.querySelector('[data-testid="popover"]');

describe('tap mode', () => {
  it('renders word-level targets only while the mode is on', () => {
    const { container } = renderMode();
    expect(container.querySelectorAll('[data-tap-word]').length).toBeGreaterThan(0);
    cleanup();
    const plain = render(
      <VerseDisplay
        data={chapter}
        bookName="John"
        translation="web"
        selectedVerse={null}
        onVerseClick={() => {}}
      />,
    );
    expect(plain.container.querySelectorAll('[data-tap-word]')).toHaveLength(0);
  });

  it('the first tap anchors visibly and opens nothing', () => {
    const { container } = renderMode();
    fireEvent.click(word(container, 'God'));
    expect(word(container, 'God').className).toContain('bg-accent-200/80');
    expect(popover(container)).toBeNull();
  });

  it('anchor then a later word opens the popover on the whole span', () => {
    // RED-PROOF: complete with [tap..anchor] unreordered, or hardcode the tap word's own
    // offsets -> RED: the span must run from the anchor to the second tap.
    const { container } = renderMode();
    fireEvent.click(word(container, 'God'));
    fireEvent.click(word(container, 'loved'));
    const p = popover(container);
    expect(p?.getAttribute('data-start')).toBe('4');
    expect(p?.getAttribute('data-end')).toBe('16');
    expect(p?.textContent).toBe('God so loved');
  });

  it('is order-independent: later word first, anchor second, same span', () => {
    // RED-PROOF: drop the min/max normalisation -> RED with start > end.
    const { container } = renderMode();
    fireEvent.click(word(container, 'loved'));
    fireEvent.click(word(container, 'God'));
    const p = popover(container);
    expect(p?.getAttribute('data-start')).toBe('4');
    expect(p?.getAttribute('data-end')).toBe('16');
    expect(p?.textContent).toBe('God so loved');
  });

  it('tapping the anchor word again highlights that one word', () => {
    const { container } = renderMode();
    fireEvent.click(word(container, 'world.'));
    fireEvent.click(word(container, 'world.'));
    const p = popover(container);
    expect(p?.getAttribute('data-start')).toBe('21');
    expect(p?.getAttribute('data-end')).toBe('27');
    expect(p?.textContent).toBe('world.');
  });

  it('Escape exits the mode and clears the anchor', () => {
    const onExit = vi.fn();
    const { container } = renderMode(onExit);
    fireEvent.click(word(container, 'God'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(word(container, 'God').className).not.toContain('bg-accent-200/80');
    expect(popover(container)).toBeNull();
  });
});
