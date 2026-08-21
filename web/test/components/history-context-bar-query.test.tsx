// @vitest-environment jsdom
//
// THE RETURN STRIP NAMES THE STUDY (order 2026-08-20-historians-study-entrance): a reader who
// dug into a book from history results should see the way back labelled with the question they
// were studying — "← Results for “the church at Ephesus”" — not a generic "history results".
// The query rides the same URL that already carries the thread (`fq=` beside `from=hist:`), so
// the strip needs no fetch and no state. What is pinned:
//
//   * With `fq`, the strip names the study and still links to the thread.
//   * Without `fq` (links minted before this shipped, or a stripped share), it degrades to the
//     old copy — never to a blank, and never to a broken label.
//   * Without `from=hist:` it renders nothing at all (the strip is an arrival artifact, not
//     site chrome) — that behavior predates this change and must survive it.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let mockParams = new URLSearchParams();
vi.mock('next/navigation', () => ({ useSearchParams: () => mockParams }));

import { HistoryContextBar } from '@/components/history-context-bar';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe('the history return strip', () => {
  it('names the study when the query rides along', () => {
    mockParams = new URLSearchParams('from=hist:abc123&fq=the church at Ephesus');
    render(<HistoryContextBar />);

    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/ask/abc123?mode=history');
    expect(link.textContent).toContain('Results for');
    expect(link.textContent).toContain('the church at Ephesus');
  });

  it('degrades to the generic label when no query rides along', () => {
    mockParams = new URLSearchParams('from=hist:abc123');
    render(<HistoryContextBar />);

    expect(screen.getByRole('link').textContent).toMatch(/back to history results/i);
  });

  it('renders nothing without a history arrival', () => {
    mockParams = new URLSearchParams('fq=stray');
    const { container } = render(<HistoryContextBar />);

    expect(container.innerHTML).toBe('');
  });
});
