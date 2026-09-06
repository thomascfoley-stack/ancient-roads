// @vitest-environment jsdom
//
// Routing regression for the My Works search box. One box routes a passage reference (e.g.
// "Romans 8") to the verse-presence scan and everything else to the fused keyword+semantic search.
// The routing decision used to be a client-side shape regex, `looksLikeRef`, that over-matches:
// any "<word> <space> <digit>" shape passes it, so "sermon 1" was routed to `?ref=`, where the
// server's whole-input `parseRef` contractually rejects it with a 400 ("Could not read 'sermon 1'
// as a passage.") and the fused path never runs — a dead-end the box was designed to fall through.
//
// The fix is an AND-gate: route to `?ref=` only when BOTH the shape regex AND `parseRef` agree.
// This test pins that decision against the real `parseRef` (the same import the route handler and
// the component now share), across all four (looksLikeRef, parseRef.ok) quadrants, so the client
// and server cannot silently re-disagree about what counts as a passage reference.
//
// SEED: restore the old routing (`const url = looksLikeRef ? ?ref=… : ?q=…`, no `parsed.ok` gate)
//   and the quadrant-A rows go RED — "sermon 1" routes to `?ref=sermon%201` instead of `?q=`. The
//   quadrant-B and quadrant-D rows stay GREEN, proving the AND-gate is what the test depends on.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/auth/client', () => ({
  authClient: { useSession: () => ({ data: { user: { id: 'u-test' } } }) },
}));

import { MyWorksClient } from '../../src/components/my-works';

const DOC = {
  id: 'doc-1',
  title: 'My sermon on John 10',
  status: 'ready',
  created_at: '2026-08-17T00:00:00.000Z',
  bytes: 4096,
};

let searchUrls: string[];

beforeEach(() => {
  searchUrls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('/api/user-corpus/search')) {
        searchUrls.push(u);
        return Response.json({ mode: 'fused', q: '', hits: [] });
      }
      return Response.json({ documents: [DOC] });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function paramsOf(u: string): URLSearchParams {
  return new URL(u, 'http://localhost').searchParams;
}

async function submitQuery(query: string): Promise<void> {
  render(<MyWorksClient />);
  await screen.findByText('My sermon on John 10');
  fireEvent.change(screen.getByLabelText('Search your works'), { target: { value: query } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  await waitFor(() => {
    expect(searchUrls.length, 'a /api/user-corpus/search request was issued').toBeGreaterThan(0);
  });
}

describe('My Works search routing — the looksLikeRef ∧ parseRef AND-gate', () => {
  // Quadrant key: (looksLikeRef, parseRef.ok).
  //   A (true, false): shape-matched-but-unparseable — the bug. Before the fix these went to ?ref=
  //     and the server 400'd with no retry on the fused path. The fix routes them to ?q=.
  //   B (true, true): parser-confirmed passage. Must STILL route to ?ref=, carrying the NORMALIZED
  //     reference (parsed.ref.display), not the raw query.
  //   C (false, false): not a reference shape. Fused search, unchanged.
  //   D (false, true): a bare book name/abbreviation parses but lacks the trailing `\s+\d` the regex
  //     requires, so looksLikeRef=false. Must STAY on ?q= — the regex's conservative pre-filter is
  //     what keeps "Romans" (whole-book presence) from hijacking a fused-search intent.
  const cases: Array<[string, 'q' | 'ref', string | null]> = [
    // A — shape-true / parser-false → fused search (was: ?ref= → 400 dead-end).
    ['sermon 1', 'q', null],
    ['prayer 3', 'q', null],
    ['grace 2 corinthians', 'q', null],
    ['faith 1 john', 'q', null],
    ['hebrews 11 faith', 'q', null],
    ['love 1 corinthians 13', 'q', null],
    ['Mark 2 grace', 'q', null],
    ['John 3 grace', 'q', null],
    // B — parser-confirmed passages keep the presence scan, normalized.
    ['John 3:16', 'ref', 'John 3:16'],
    ['Romans 8', 'ref', 'Romans 8'],
    ['romans 8 28', 'ref', 'Romans 8:28'],
    // C — no reference shape → fused.
    ['the gospel', 'q', null],
    ['what did I say about grace', 'q', null],
    // D — bare book names / abbreviations stay fused (the pre-filter's job, not the parser's).
    ['Romans', 'q', null],
    ['John', 'q', null],
    ['1 John', 'q', null],
    ['Rom', 'q', null],
  ];

  it.each(cases)('routes %j to ?%s (expected=%j)', async (query, param, expected) => {
    await submitQuery(query);
    const u = searchUrls.at(-1)!;
    const p = paramsOf(u);
    if (param === 'q') {
      expect(p.get('ref'), 'must NOT route to the presence endpoint').toBeNull();
      expect(p.get('q'), 'must carry the typed query to fused search').toBe(query);
    } else {
      expect(p.get('q'), 'must NOT carry a fused-search query').toBeNull();
      expect(p.get('ref'), 'must carry the normalized reference').toBe(expected);
    }
  });
});
