// @vitest-environment jsdom
//
// THE BACK SELF-HEAL. Next 16 copies the current route tree onto a replaceState'd history entry,
// so pressing Back from the reader to /ask/<thread> renders the EMPTY /ask page under the thread
// URL. ThreadRestore runs once on mount: if the URL is a thread URL, it router.replace()s onto it,
// which fetches the real thread page. What is pinned:
//
//   * mounted under /ask/<uuid> it replaces exactly once, onto that path — query preserved;
//   * it never fires for /ask itself, nor for /ask/<something that is not a thread id>
//     (a replace there would loop the composer or 404 the reader);
//   * it fires on MOUNT only — a re-render must not replace again.
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const replace = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }) }));

import { ThreadRestore } from '@/components/thread-restore';

const UUID = '6f1d2c3b-4a5e-4f60-8b71-9c2d3e4f5a6b';

function at(url: string): void {
  window.history.replaceState(null, '', url);
}

beforeEach(() => {
  replace.mockClear();
});

afterEach(() => {
  cleanup();
  at('/');
});

describe('ThreadRestore', () => {
  it('replaces onto the thread URL when mounted under /ask/<uuid>', () => {
    at(`/ask/${UUID}`);
    render(<ThreadRestore />);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(`/ask/${UUID}`);
  });

  it('preserves the query string', () => {
    at(`/ask/${UUID}?mode=history`);
    render(<ThreadRestore />);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(`/ask/${UUID}?mode=history`);
  });

  it('never fires on /ask', () => {
    at('/ask');
    render(<ThreadRestore />);
    expect(replace).not.toHaveBeenCalled();
  });

  it('never fires when the id is not a thread id', () => {
    at('/ask/not-a-uuid');
    render(<ThreadRestore />);
    expect(replace).not.toHaveBeenCalled();
  });

  it('never fires for a deeper path', () => {
    at(`/ask/${UUID}/extra`);
    render(<ThreadRestore />);
    expect(replace).not.toHaveBeenCalled();
  });

  it('fires on mount only — a re-render does not replace again', () => {
    at(`/ask/${UUID}`);
    const view = render(<ThreadRestore />);
    view.rerender(<ThreadRestore />);
    view.rerender(<ThreadRestore />);
    expect(replace).toHaveBeenCalledTimes(1);
  });
});
