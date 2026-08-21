// @vitest-environment jsdom
//
// OPTION B — THE EXPERIMENT (owner ruling 2026-08-21: "…and b as the experiment"). The gesture
// itself costs nothing: double-clicking a word natively selects it, native selection raises the
// popover, and the popover now answers with the Greek (option A) — verified live. What was
// missing is that nobody would ever KNOW, so B ships as teaching: the reader's one first-run
// hint carries the double-tap line. What is pinned:
//
//   * The first-run hint teaches the gesture ("double-tap…Greek or Hebrew").
//   * It still teaches what it always taught (verse numbers, phrase selection) — the line was
//     added, nothing replaced.
//   * Dismissal still sticks (localStorage), so the experiment never nags.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {} }) }));

import { VerseDisplay } from '@/components/verse-display';
import type { ChapterData } from '@/lib/bible';

const data: ChapterData = {
  book: 'John', slug: 'jhn', chapter: 1,
  verses: [{ verse: 1, text: 'In the beginning was the Word.' }],
} as never;

function mount() {
  return render(
    <VerseDisplay
      data={data}
      bookName="John"
      translation="asv"
      selectedVerse={null}
      onVerseClick={() => {}}
    />,
  );
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('Option B — the gesture is taught, once', () => {
  it('the first-run hint teaches double-tap → Greek/Hebrew, alongside what it always taught', () => {
    mount();
    const hint = screen.getByText(/double-tap/i).closest('div')!;
    expect(hint.textContent).toMatch(/greek or hebrew/i);
    expect(hint.textContent).toMatch(/verse\s?number/i);
    expect(hint.textContent).toMatch(/phrase/i);
  });

  it('dismissal sticks — the experiment never nags', () => {
    const first = mount();
    fireEvent.click(screen.getByRole('button', { name: /got it/i }));
    expect(screen.queryByText(/double-tap/i)).toBeNull();
    first.unmount();

    mount(); // a fresh visit
    expect(screen.queryByText(/double-tap/i)).toBeNull();
  });
});
