// @vitest-environment jsdom

// The Book Reader's paging invariants (docs/LIBRARY_READER_DESIGN.md §2), asserted against
// the mocked fetch calls of the REAL hook the reader mounts — never a lib-only stand-in:
//   * RESUME — given a saved {ordinal, scrollPct}, the initial fetch requests
//     `after = ordinal - 1`, i.e. the keyset page CONTAINING the saved ordinal.
//   * KEYSET WALK — the next page is requested `after = last rendered ordinal`. No offset
//     pagination, ever (the Institutes is 3,448 sections; offsets rot at depth).
//   * PREPEND — the page before the first loaded ordinal is fetched keyset too, so a
//     mid-work resume can scroll up to what came before.

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorkSectionPages } from '@/lib/use-work-sections';
import { WORK_READER_PAGE_LIMIT } from '@/lib/work-reader';
import type { WorkSectionRow, WorkSectionsPage } from '@/lib/work';

const TOTAL = 300; // pretend the work has 300 sections

function makeSections(after: number, limit: number): WorkSectionRow[] {
  const out: WorkSectionRow[] = [];
  for (let o = after + 1; o <= Math.min(TOTAL, after + limit); o++) {
    out.push({ id: o, ordinal: o, unitOrdinal: Math.ceil(o / 10), heading: `Section ${o}`, body: `Body of section ${o}.` });
  }
  return out;
}

/** Fetch mock: a keyset server — `?after=A&limit=L` → the L ordinals above A. */
function stubKeysetFetch() {
  const calls: URL[] = [];
  const mock = vi.fn((input: string | URL | Request): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'https://test.local');
    calls.push(url);
    const after = Number(url.searchParams.get('after') ?? '0');
    const limit = Number(url.searchParams.get('limit') ?? '50');
    const sections = makeSections(after, limit);
    const page: WorkSectionsPage = {
      sections,
      nextAfter: sections.length === limit ? sections[sections.length - 1]!.ordinal : null,
    };
    return Promise.resolve({ ok: true, json: () => Promise.resolve(page) } as Response);
  });
  vi.stubGlobal('fetch', mock);
  return { calls, mock };
}

afterEach(() => vi.unstubAllGlobals());

describe('useWorkSectionPages — resume + keyset walk (§2)', () => {
  it('RESUME: the initial fetch requests the page CONTAINING the saved ordinal', async () => {
    stubKeysetFetch();
    const { result } = renderHook(() => useWorkSectionPages('calvin-institutes'));

    const saved = { ordinal: 137, scrollPct: 0.4 };
    await act(async () => {
      await result.current.loadInitial(saved.ordinal);
    });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0]![0]), 'https://test.local');
    // after = ordinal - 1 → the served page STARTS at the saved ordinal (contains it).
    expect(url.searchParams.get('after')).toBe(String(saved.ordinal - 1));
    expect(url.searchParams.get('limit')).toBe(String(WORK_READER_PAGE_LIMIT));
    expect(url.pathname).toBe('/api/work/calvin-institutes/sections');
    expect(result.current.sections[0]?.ordinal).toBe(saved.ordinal);
    expect(result.current.hasPrev).toBe(true);
    expect(result.current.hasNext).toBe(true);
  });

  it('a fresh work (no saved position) starts at after=0', async () => {
    stubKeysetFetch();
    const { result } = renderHook(() => useWorkSectionPages('x'));
    await act(async () => {
      await result.current.loadInitial(null);
    });
    const url = new URL(String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0]), 'https://test.local');
    expect(url.searchParams.get('after')).toBe('0');
    expect(result.current.hasPrev).toBe(false);
  });

  it('KEYSET: the next page is requested after = last rendered ordinal — never an offset', async () => {
    const { calls } = stubKeysetFetch();
    const { result } = renderHook(() => useWorkSectionPages('x'));
    await act(async () => {
      await result.current.loadInitial(137);
    });
    const lastRendered = result.current.sections[result.current.sections.length - 1]!.ordinal;

    await act(async () => {
      await result.current.loadNext();
    });
    await act(async () => {
      await result.current.loadNext();
    });

    expect(calls).toHaveLength(3);
    expect(calls[1]!.searchParams.get('after')).toBe(String(lastRendered));
    // and the third walk continues from the NEW last rendered ordinal
    expect(calls[2]!.searchParams.get('after')).toBe(String(lastRendered + WORK_READER_PAGE_LIMIT));
    // no offset/page-number pagination anywhere in the walk
    for (const url of calls) {
      expect(url.searchParams.has('offset')).toBe(false);
      expect(url.searchParams.has('page')).toBe(false);
    }
    // pages are ascending and non-overlapping
    expect(result.current.sections[0]!.ordinal).toBe(137);
    expect(result.current.sections).toHaveLength(3 * WORK_READER_PAGE_LIMIT);
    const ordinals = result.current.sections.map((s) => s.ordinal);
    expect([...ordinals].sort((a, b) => a - b)).toEqual(ordinals);
  });

  it('walking to the end flips hasNext off when the route hands back a short page', async () => {
    stubKeysetFetch();
    const { result } = renderHook(() => useWorkSectionPages('x'));
    await act(async () => {
      await result.current.loadInitial(260);
    });
    // Page holds ordinals 260..300 → 41 rows < PAGE → the route's nextAfter is null.
    expect(result.current.hasNext).toBe(false);
    await act(async () => {
      await result.current.loadNext(); // a no-op: nothing left
    });
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it('PREPEND: the earlier page is fetched keyset and never overlaps what is loaded', async () => {
    const { calls } = stubKeysetFetch();
    const { result } = renderHook(() => useWorkSectionPages('x'));
    await act(async () => {
      await result.current.loadInitial(137);
    });

    await act(async () => {
      await result.current.loadPrev();
    });

    expect(calls).toHaveLength(2);
    expect(calls[1]!.searchParams.get('after')).toBe(String(137 - 1 - WORK_READER_PAGE_LIMIT));
    expect(result.current.firstOrdinal).toBe(137 - WORK_READER_PAGE_LIMIT);
    expect(result.current.sections).toHaveLength(2 * WORK_READER_PAGE_LIMIT);
    const ordinals = result.current.sections.map((s) => s.ordinal);
    expect(new Set(ordinals).size).toBe(ordinals.length); // nothing duplicated at the seam
    expect([...ordinals].sort((a, b) => a - b)).toEqual(ordinals);
  });

  it('a failed page load surfaces an error and leaves the walk resumable', async () => {
    stubKeysetFetch();
    const { result } = renderHook(() => useWorkSectionPages('x'));
    await act(async () => {
      await result.current.loadInitial(1);
    });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
      Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response),
    );
    await act(async () => {
      await result.current.loadNext();
    });
    expect(result.current.error).toBeTruthy();
    expect(result.current.sections).toHaveLength(WORK_READER_PAGE_LIMIT); // prior page intact
    await act(async () => {
      await result.current.loadNext(); // retry succeeds against the restored mock
    });
    expect(result.current.error).toBeNull();
    expect(result.current.sections).toHaveLength(2 * WORK_READER_PAGE_LIMIT);
  });
});
