// @vitest-environment jsdom
//
// F24, the ACCOUNT half. work-landing-client-nav.test.tsx proves a progress report from the
// pre-landing window (section 1 of the after=0 fetch, before a late-arriving #s{ordinal} has
// been honoured) never reaches localStorage or the URL hash. The same wrong position has a
// third sink for a signed-in reader: the account-side `reading_progress` write, which the
// Library hub's "Continue reading" reads back. This pins that sink to the same rule — nothing
// persists until the reader actually reaches the deep link — and that persistence resumes there.
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SLUG = 'qa-landing-sync-work';
const DEEP_ORDINAL = 171;

vi.mock('@/lib/auth/use-signed-in', () => ({ useSignedIn: () => true }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: SLUG }),
  usePathname: () => `/work/${SLUG}`,
}));

let report: ((ordinal: number, scrollPct: number) => void) | null = null;
vi.mock('@/components/work-reader', () => ({
  WorkReader: (props: { onProgress: (o: number, p: number) => void }) => {
    report = props.onProgress;
    return null;
  },
}));
vi.mock('@/components/work-toc', () => ({ WorkToc: () => null }));

import WorkPage from '@/app/work/[slug]/page';

const TOC = [{ unitOrdinal: 1, firstId: 1, firstOrdinal: 1, lastOrdinal: 300, sectionCount: 300, heading: 'One', verseStart: null, verseEnd: null }];
const WORK = { source: { slug: SLUG, title: 'A work', author: 'QA', tradition: 'qa', era: 'qa', license: 'Public Domain', source_type: 'sermon' }, toc: TOC };

function progressCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).includes('/progress'))
    .map(([url, init]) => ({ url: String(url), body: JSON.parse(String((init as RequestInit).body)) as { ordinal: number } }));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  report = null;
  window.localStorage.clear();
  window.location.hash = '';
  fetchMock = vi.fn(async (url: string) =>
    String(url).includes('/progress')
      ? new Response(JSON.stringify({ ok: true }), { status: 200 })
      : new Response(JSON.stringify(WORK), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.location.hash = '';
});

describe('WorkPage — a late deep link and the account-side position (F24)', () => {
  it('never syncs the pre-landing position; syncs once the deep link is reached', async () => {
    render(<WorkPage />);
    await waitFor(() => expect(report).not.toBeNull());

    // The URL application lands after mount (pushState, no event), then the reader reports
    // from the wrong page.
    window.location.hash = `#s${DEEP_ORDINAL}`;
    await act(async () => report!(1, 0));
    await act(async () => {
      await Promise.resolve();
    });
    expect(progressCalls(fetchMock)).toHaveLength(0);

    // Reaching the deep link is the first position worth keeping.
    await act(async () => report!(DEEP_ORDINAL, 0));
    await waitFor(() => expect(progressCalls(fetchMock)).toHaveLength(1));
    expect(progressCalls(fetchMock)[0]!.url).toBe(`/api/work/${SLUG}/progress`);
    expect(progressCalls(fetchMock)[0]!.body.ordinal).toBe(DEEP_ORDINAL);
  });
});
