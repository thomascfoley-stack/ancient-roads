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
//
// GENERALISED for /ask arrivals (the result-card deep link into the reader): `from=ask:<id>`
// links back to the thread itself, labelled with the question when `fq=` rides along. The
// `from` value is a URL param, so its shape is PARSED (kind:id, id = [A-Za-z0-9-]{1,64}) and
// anything else renders nothing — never a link built from an unvalidated segment. Dismissal is
// PER THREAD: the strip stays mounted across /work/a -> /work/b, so a dismissal for one arrival
// must not hide the next, and a `hist:` dismissal must not hide an `ask:` arrival.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

const THREAD = '6f1d2c3b-4a5e-4f60-8b71-9c2d3e4f5a6b';

describe('the /ask return strip', () => {
  it('links back to the thread and names the question when it rides along', () => {
    mockParams = new URLSearchParams(`from=ask:${THREAD}&fq=who is the good shepherd`);
    render(<HistoryContextBar />);

    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe(`/ask/${THREAD}`);
    expect(link.textContent).toContain('Back to');
    expect(link.textContent).toContain('who is the good shepherd');
    // Not the history copy — a thread arrival is not a history-results arrival.
    expect(link.textContent).not.toMatch(/history results|mode=history/i);
  });

  it('degrades to a generic label without the question', () => {
    mockParams = new URLSearchParams(`from=ask:${THREAD}`);
    render(<HistoryContextBar />);

    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe(`/ask/${THREAD}`);
    expect(link.textContent).toMatch(/back to your question/i);
  });

  it('caps a long question in the label', () => {
    const long = 'x'.repeat(200);
    mockParams = new URLSearchParams(`from=ask:${THREAD}&fq=${long}`);
    render(<HistoryContextBar />);

    const text = screen.getByRole('link').textContent ?? '';
    expect(text.length).toBeLessThan(200);
    expect(text).toContain('…');
  });

  it('renders nothing for a `from` that is not kind:id — no link from an unvalidated segment', () => {
    for (const from of ['ask:../evil', 'ask:', 'ask:a/b', 'ask:' + 'a'.repeat(65), 'evil:abc', 'ask:abc?x=1', 'abc']) {
      mockParams = new URLSearchParams();
      mockParams.set('from', from);
      const { container, unmount } = render(<HistoryContextBar />);
      expect(container.innerHTML, from).toBe('');
      unmount();
    }
  });

  it('gives the dismiss button a 44px hit area', () => {
    mockParams = new URLSearchParams(`from=ask:${THREAD}`);
    render(<HistoryContextBar />);

    const cls = screen.getByRole('button', { name: /dismiss/i }).className;
    expect(cls).toContain('min-h-[44px]');
    expect(cls).toContain('min-w-[44px]');
  });
});

describe('dismissal is per thread', () => {
  const A = `from=ask:${THREAD}`;
  const B = 'from=ask:0a1b2c3d-1111-4222-8333-444455556666';

  it('dismissing A does not hide B; returning to A stays hidden', () => {
    mockParams = new URLSearchParams(A);
    const view = render(<HistoryContextBar />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByRole('link')).toBeNull();

    // The strip stays mounted across /work/a -> /work/b: a re-render with a new arrival.
    mockParams = new URLSearchParams(B);
    view.rerender(<HistoryContextBar />);
    expect(screen.getByRole('link').getAttribute('href')).toBe('/ask/0a1b2c3d-1111-4222-8333-444455556666');

    mockParams = new URLSearchParams(A);
    view.rerender(<HistoryContextBar />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('a dismissed thread stays dismissed across a remount within the session', () => {
    mockParams = new URLSearchParams(A);
    const first = render(<HistoryContextBar />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    first.unmount();

    render(<HistoryContextBar />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('a hist dismissal does not hide an ask arrival for the same id', () => {
    mockParams = new URLSearchParams(`from=hist:${THREAD}`);
    const view = render(<HistoryContextBar />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByRole('link')).toBeNull();

    mockParams = new URLSearchParams(`from=ask:${THREAD}`);
    view.rerender(<HistoryContextBar />);
    expect(screen.getByRole('link').getAttribute('href')).toBe(`/ask/${THREAD}`);
  });
});
