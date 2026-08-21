// @vitest-environment jsdom

// A NEW HIGHLIGHT BLOOMS ONCE; A HYDRATED ONE NEVER DOES.
//
// When the reader picks a swatch, the mark that appears should acknowledge the act — one quiet
// bloom, then stillness. The failure mode this guards against is the opposite surface of the
// same coin: marks hydrating from the server on page load must NOT bloom, or every chapter
// open becomes a fireworks display of things the reader did long ago. So "fresh" is a signal
// threaded from the write (use-annotation-writes keeps a set of just-painted spans), not a
// property of the span's data — a span the GET returned can never be in it.
//
// Two halves, tested where they live:
//   1. the hook marks a written span fresh, then lets it go stale after the bloom window
//   2. VerseDisplay puts the bloom class on a fresh mark only

import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
import { VerseDisplay, type StoredSpan } from '@/components/verse-display';
import { HIGHLIGHT_BG } from '@/lib/highlight-colors';
import { useAnnotationWrites } from '@/lib/use-annotation-writes';
import type { ChapterData } from '@/lib/bible';

afterEach(cleanup);

const chapter: ChapterData = {
  book: 43,
  chapter: 3,
  verses: [{ verse: 16, text: 'For God so loved the world.' }],
};

const span: StoredSpan = { start: 4, end: 7, color: 'yellow', translation: 'web' };

const renderVerse = (freshSpans?: Set<StoredSpan>) =>
  render(
    <VerseDisplay
      data={chapter}
      bookName="John"
      translation="web"
      selectedVerse={null}
      onVerseClick={() => {}}
      highlights={new Map([[16, [span]]])}
      freshSpans={freshSpans}
    />,
  );

const theMark = (container: HTMLElement) => {
  const mark = container.querySelector(`[data-verse-text] [class*="${HIGHLIGHT_BG['yellow']}"]`);
  expect(mark, 'the highlight mark did not render').not.toBeNull();
  return mark!;
};

describe('VerseDisplay — the bloom belongs to fresh marks only', () => {
  it('a freshly written span blooms', () => {
    // RED-PROOF: drop the freshSpans threading (or the class) -> RED; no mark ever carries it.
    const { container } = renderVerse(new Set([span]));
    expect(theMark(container).className).toContain('animate-highlight-bloom');
  });

  it('the same span hydrating from the server does not', () => {
    // Same data, no fresh signal — the page-load path. A bloom here is the bug.
    const { container } = renderVerse();
    expect(theMark(container).className).not.toContain('animate-highlight-bloom');
  });
});

describe('useAnnotationWrites — the fresh signal', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('marks a written span fresh, then lets it go stale after the bloom window', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        const payload = method === 'GET' ? { highlights: [], notes: [], bookmarks: [] } : {};
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) } as Response);
      }),
    );
    const { result } = renderHook(() => useAnnotationWrites(43, 3, 'web'));
    await act(async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });

    const written = result.current.highlights.get(16) ?? [];
    expect(written).toHaveLength(0);
    expect(result.current.freshSpans.size).toBe(0);

    act(() => result.current.addHighlight(16, { start: 4, end: 7 }, 'yellow'));
    const painted = result.current.highlights.get(16)![0]!;
    expect(result.current.freshSpans.has(painted)).toBe(true);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.freshSpans.has(painted)).toBe(false);
  });
});
