// @vitest-environment jsdom
//
// F24 — THE DEEP LINK THAT ARRIVES LATE MUST STILL LAND.
//
// On a client-side navigation (search result → /work/[slug]#s{ordinal}), Next.js applies the
// URL — hash included — AFTER the page has mounted: measured live on prod, the hash lands
// ~255ms post-mount, via pushState, which fires no hashchange. The page used to resolve the
// landing position ONCE in a useState initializer, which ran against the PREVIOUS route's
// (empty) hash. The reader then loaded from section 0, and its own scroll-persist
// replaceState'd `#s1` over the incoming deep link ~800ms in — the core loop's payoff
// moment, silently dropped (6/6 trials on prod).
//
// This test mounts the real page with an empty hash, applies the deep-link hash the way a
// late URL application does (post-mount, no event), resolves the work fetch, and asserts:
//   1. the landing re-resolves to the deep link (WorkReader sees landingOrdinal + a seek),
//   2. progress from the pre-landing window neither saves position nor clobbers the hash.

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SLUG = 'qa-landing-work';
const DEEP_ORDINAL = 171;

let signedIn = false;
vi.mock('@/lib/auth/use-signed-in', () => ({ useSignedIn: () => signedIn }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: SLUG }),
  usePathname: () => `/work/${SLUG}`,
}));

// The real WorkReader is DOM-and-scroll machinery jsdom cannot drive. Capture the props the
// page hands it instead — initialOrdinal, landingOrdinal (the glow) and seek (the retarget)
// are the contract under test, and onProgress is called directly exactly as the real reader
// reports from updateActive.
let report: ((ordinal: number, scrollPct: number) => void) | null = null;
const readerProps: { initialOrdinal: unknown; landingOrdinal: unknown; seek: unknown }[] = [];
vi.mock('@/components/work-reader', () => ({
  WorkReader: (props: {
    onProgress: (o: number, p: number) => void;
    initialOrdinal: unknown;
    landingOrdinal: unknown;
    seek: unknown;
  }) => {
    report = props.onProgress;
    readerProps.push({
      initialOrdinal: props.initialOrdinal,
      landingOrdinal: props.landingOrdinal,
      seek: props.seek,
    });
    return null;
  },
}));
vi.mock('@/components/work-toc', () => ({ WorkToc: () => null }));

import WorkPage from '@/app/work/[slug]/page';

const TOC = [{ unitOrdinal: 1, firstId: 1, firstOrdinal: 1, lastOrdinal: 300, sectionCount: 300, heading: 'One', verseStart: null, verseEnd: null }];
const WORK = { source: { slug: SLUG, title: 'A work', author: 'QA', tradition: 'qa', era: 'qa', license: 'Public Domain', source_type: 'sermon' }, toc: TOC };

const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  signedIn = false;
  report = null;
  readerProps.length = 0;
  replaceStateSpy.mockClear();
  window.localStorage.clear();
  window.location.hash = '';
  fetchMock = vi.fn(async () => new Response(JSON.stringify(WORK), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.location.hash = '';
});

describe('WorkPage — client-side navigation deep link (F24)', () => {
  it('re-resolves the landing when the #s{ordinal} hash arrives after mount, and never clobbers it', async () => {
    const view = render(<WorkPage />);

    // The page mounts against the previous route's (empty) hash — the client-nav reality.
    await waitFor(() => expect(report).not.toBeNull());
    expect(readerProps.at(-1)?.landingOrdinal).toBeNull();

    // The URL application arrives late, exactly as Next.js does it (pushState, no event).
    window.location.hash = `#s${DEEP_ORDINAL}`;

    // The pre-landing window reports progress from the wrong page (section 1 of the
    // after=0 fetch). It must NOT save position or replaceState over the deep link.
    act(() => {
      report!(1, 0);
    });

    // The landing must now be honored: glow at the deep ordinal, and a seek retargets there.
    expect(readerProps.at(-1)?.landingOrdinal).toBe(DEEP_ORDINAL);
    expect(readerProps.at(-1)?.seek).toEqual({ ordinal: DEEP_ORDINAL, scrollPct: 0, nonce: expect.any(Number) });

    // The deep-link hash survived: no replaceState wrote #s1 over it, and no position was
    // persisted for the wrong section.
    expect(window.location.hash).toBe(`#s${DEEP_ORDINAL}`);
    expect(replaceStateSpy).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(`work-progress:${SLUG}`)).toBeNull();

    // Once the reader genuinely reaches the deep ordinal, persistence resumes (the guard
    // is a landing gate, not a permanent block).
    act(() => {
      report!(DEEP_ORDINAL, 0);
    });
    expect(window.localStorage.getItem(`work-progress:${SLUG}`)).not.toBeNull();
    expect(JSON.parse(window.localStorage.getItem(`work-progress:${SLUG}`)!)).toMatchObject({
      slug: SLUG,
      ordinal: DEEP_ORDINAL,
    });

    view.unmount();
  });
});
