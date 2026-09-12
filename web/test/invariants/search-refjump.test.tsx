// @vitest-environment jsdom

// SEARCH REFERENCE-JUMP CARRIES THE VERSE ANCHOR FOR VERSE-LED SEQUENCES — F15, filed 2026-09-12.
//
// The /search page renders a "Go to <ref> →" jump link (F15) above the text results when the typed
// query parses as a Bible reference. The link was built inline with a
// `kind === 'verse' || kind === 'verse_range'` branch, so a verse-led SEQUENCE whose first segment
// is verse-granular — e.g. `John 3:16, 17` — computed the verse and then threw it away, landing
// the reader on `/read/jhn/3` (chapter root, no anchor) while the label promised `John 3:16, 17`.
// The omnibox (the canonical reference-navigation surface) carries the anchor for the same input
// via the shared `verseHref`. The search page was the sole outlier with its own inline anchor
// policy — the exact defect class `lib/verse-link.ts` documents and `omnibox-verse-anchor.test.tsx`
// red-proofs ("a second, divergent path that never carried a verse").
//
// Fixed by routing the jump through `searchJumpHref` (`lib/search-ref-jump.ts`), which gates the
// `#v<verse>` anchor on whether the first segment is verse-granular
// (`range.end % 1000 !== CHAPTER_END_SENTINEL`), so verse-led sequences keep their anchor while
// chapter-led kinds still target the chapter root — preserving the reader's F-144 saved-position
// restore, which is gated on `if (window.location.hash) return;` (`read/[book]/[chapter]/page.tsx`)
// and would be silently overridden by a blanket `#v1`. `searchJumpHref` is the SHIPPED function the
// page calls; this test does not re-declare the predicate, so seeding the page with the bug turns
// the assertions below red (the false-confidence-audit standard: introduce the bug, watch red,
// revert, watch green).
//
// Red-proof: restore the old inline branch in `search-ref-jump.ts` (gate on
// `kind === 'verse' || 'verse_range'` instead of the `CHAPTER_END_SENTINEL` end-signal). The
// verse-led-sequence assertions (`John 3:16, 17` → `#v16`, `John 14:6, 15:5` → `#v6`,
// `1 Corinthians 13:4-7, 13` → `#v4`, `John 3:1, 7` → `#v1`) and their rendered-`<a href>`
// counterparts all go red; the chapter-led boundary cases stay green.

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CHAPTER_END_SENTINEL, parseRef } from '@bible/ref-parse';
import { decodeVerseId, encodeVerseId } from '@bible/verse-id';
import { searchJumpHref } from '@/lib/search-ref-jump';
import { verseHref } from '@/lib/verse-link';

// ── module mocks for the SearchPage render: no DB, no auth, no throttle. The real
// `@bible/ref-parse` and `@/lib/search-ref-jump` are NOT mocked — the render drives the shipped
// parser→helper→<Link> path, the whole point of the wiring test (the existing
// search-corpus-paged-past-end.test.tsx mocks parseRef to null precisely to suppress this jump;
// this test does the opposite and lets it run).
vi.mock('@/lib/session', async () => ({
  ...(await import('@/lib/auth-failure')),
  currentUser: async () => null,
}));
vi.mock('@/lib/public-read-limit', () => ({
  publicReadPageThrottle: async () => null,
}));
vi.mock('@/lib/search-sections', () => ({
  searchSections: async () => ({ results: [], total: 0, totalCapped: false }),
}));
vi.mock('@/lib/search-lexicons', () => ({
  searchLexicons: async () => ({ results: [], total: 0, totalCapped: false }),
}));
vi.mock('@/lib/search-personal', () => ({
  searchStudies: async () => ({ rows: [], total: 0, totalCapped: false }),
  searchPrayers: async () => ({ rows: [], total: 0, totalCapped: false }),
  searchNotes: async () => ({ rows: [], total: 0, totalCapped: false }),
}));
vi.mock('@/lib/user-corpus/search', () => ({ keywordSearch: async () => [] }));
vi.mock('@/lib/user-corpus/access', () => ({ uploadDenial: () => null }));

import SearchPage from '@/app/search/page';
import type { RawSearchParams } from '@/lib/search-groups';

afterEach(cleanup);

/** The first segment's end verse (mod 1000) for a typed query — the verse-granularity signal. */
function firstEndMod(query: string): number {
  const r = parseRef(query);
  if (!r.ok) throw new Error(`${query} did not parse`);
  const first = r.ref.ranges[0];
  if (!first) throw new Error(`${query} parsed with no ranges`);
  return first.end % 1000;
}

/** The reader href the SHIPPED search-jump helper produces for a typed query (null if not a ref). */
function jumpHrefFor(query: string): string | null {
  const r = parseRef(query);
  return r.ok ? searchJumpHref(r.ref) : null;
}

/** The reader href the SHIPPED omnibox path produces for the same query, for parity comparison.
 *  Mirrors omnibox.tsx: decode firstRange.start, route through verseHref. */
function omniboxHrefFor(query: string): string | null {
  const r = parseRef(query);
  if (!r.ok) return null;
  const first = r.ref.ranges[0];
  if (!first) return null;
  const { book, chapter, verse } = decodeVerseId(first.start);
  return verseHref(encodeVerseId({ book, chapter, verse }));
}

/** Render the SHIPPED async SearchPage against the stubbed engine modules (no DB, real parser). */
async function searchPage(params: RawSearchParams): Promise<HTMLElement> {
  const jsx = await SearchPage({ searchParams: Promise.resolve(params) });
  return render(jsx).container;
}

/** The href of the "Go to <ref> →" jump link in a rendered /search page, or null if absent. */
function jumpLinkHref(container: HTMLElement): string | null {
  const a = [...container.querySelectorAll('a')].find((el) => /Go to .+→/.test(el.textContent ?? ''));
  return a ? a.getAttribute('href') : null;
}

describe('the parser verse-granularity signal the fix gates on', () => {
  // Pin the parser signal the fix relies on: a first segment is verse-granular iff its end verse
  // is not the chapter-end sentinel (a real verse number, never 999). Chapter-led kinds
  // (chapter, chapter_range, book, chapter-led sequence) end at the sentinel; verse / verse_range
  // / verse-led-sequence do not. `John 3:1, 7` is the load-bearing boundary: its verse is 1
  // (indistinguishable from a chapter-led verse:1 by value alone) but its end is v(3,1), not the
  // sentinel — so the end-signal, not the verse value, marks it verse-led.
  const chapterLed = ['John 3', 'John 3-4', 'John 3, 4', 'John', 'Genesis'];
  const verseLed = [
    'John 3:16',
    'John 3:16-18',
    'John 3:16, 17',
    'John 14:6, 15:5',
    '1 Corinthians 13:4-7, 13',
    'John 3:1, 7',
  ];

  it.each(chapterLed)('chapter-led %s ends at the sentinel (no anchor; F-144 restore runs)', (q) => {
    expect(firstEndMod(q)).toBe(CHAPTER_END_SENTINEL);
  });
  it.each(verseLed)('verse-led %s ends at a real verse, not the sentinel (anchor required)', (q) => {
    expect(firstEndMod(q)).not.toBe(CHAPTER_END_SENTINEL);
  });
});

describe('searchJumpHref — shipped helper carries the verse anchor for verse-led segments', () => {
  it('SEED: revert to the kind branch -> RED. verse-led sequence John 3:16, 17 -> #v16', () => {
    expect(jumpHrefFor('John 3:16, 17')).toBe('/read/jhn/3#v16');
  });
  it('a cross-chapter verse-led sequence anchors at its first verse: John 14:6, 15:5 -> #v6', () => {
    expect(jumpHrefFor('John 14:6, 15:5')).toBe('/read/jhn/14#v6');
  });
  it('a range-then-single verse-led sequence anchors at the range start: 1 Corinthians 13:4-7, 13 -> #v4', () => {
    expect(jumpHrefFor('1 Corinthians 13:4-7, 13')).toBe('/read/1co/13#v4');
  });
  it('a verse-led sequence starting at verse 1 still anchors (end-signal, not verse value): John 3:1, 7 -> #v1', () => {
    expect(jumpHrefFor('John 3:1, 7')).toBe('/read/jhn/3#v1');
  });

  it('non-regression — a single verse still anchors: John 3:16 -> #v16', () => {
    expect(jumpHrefFor('John 3:16')).toBe('/read/jhn/3#v16');
  });
  it('non-regression — a verse range anchors at the range start: John 3:16-18 -> #v16', () => {
    expect(jumpHrefFor('John 3:16-18')).toBe('/read/jhn/3#v16');
  });

  it('F-144 preserved — a chapter-only ref targets the chapter root with NO hash: John 3 -> /read/jhn/3', () => {
    expect(jumpHrefFor('John 3')).toBe('/read/jhn/3');
  });
  it('F-144 preserved — a chapter range targets the start chapter root: John 3-4 -> /read/jhn/3', () => {
    expect(jumpHrefFor('John 3-4')).toBe('/read/jhn/3');
  });
  it('F-144 preserved — a chapter-led SEQUENCE targets the first chapter root (not verse 1): John 3, 4 -> /read/jhn/3', () => {
    expect(jumpHrefFor('John 3, 4')).toBe('/read/jhn/3');
  });
  it('F-144 preserved — a bare book targets its first chapter root with NO hash: John -> /read/jhn/1', () => {
    expect(jumpHrefFor('John')).toBe('/read/jhn/1');
  });
  it('F-144 preserved — a second book lands at its own first chapter root: Genesis -> /read/gen/1', () => {
    expect(jumpHrefFor('Genesis')).toBe('/read/gen/1');
  });

  it('a non-reference query yields no jump href: grace -> null', () => {
    expect(jumpHrefFor('grace')).toBeNull();
  });
});

describe('searchJumpHref — no longer diverges from the canonical omnibox path for verse-led refs', () => {
  // For verse-granular first segments, the search jump now matches the omnibox's verseHref target
  // — the bug was precisely that it did not. (For chapter-led refs the search page INTENTIONALLY
  // omits the hash to preserve F-144; the omnibox always emits #v1 on a fresh open with no saved
  // position to honor. That divergence is by design and is NOT asserted as parity here.)
  const verseLed = [
    'John 3:16',
    'John 3:16-18',
    'John 3:16, 17',
    'John 14:6, 15:5',
    '1 Corinthians 13:4-7, 13',
    'John 3:1, 7',
  ];
  it.each(verseLed)('the search jump matches the omnibox target for verse-led %s', (q) => {
    expect(jumpHrefFor(q)).toBe(omniboxHrefFor(q));
  });
});

describe('SearchPage — the shipped page renders the jump link with the correct href', () => {
  it('SEED: revert searchJumpHref to the kind branch -> RED. John 3:16, 17 renders #v16', async () => {
    const container = await searchPage({ q: 'John 3:16, 17' });
    expect(jumpLinkHref(container)).toBe('/read/jhn/3#v16');
  });
  it('a cross-chapter verse-led sequence renders #v6: John 14:6, 15:5', async () => {
    const container = await searchPage({ q: 'John 14:6, 15:5' });
    expect(jumpLinkHref(container)).toBe('/read/jhn/14#v6');
  });
  it('a verse-led sequence starting at verse 1 renders #v1: John 3:1, 7 (not chapter root)', async () => {
    const container = await searchPage({ q: 'John 3:1, 7' });
    expect(jumpLinkHref(container)).toBe('/read/jhn/3#v1');
  });

  it('F-144 preserved in the rendered link — chapter-only John 3 -> /read/jhn/3 (no hash)', async () => {
    const container = await searchPage({ q: 'John 3' });
    expect(jumpLinkHref(container)).toBe('/read/jhn/3');
  });
  it('F-144 preserved in the rendered link — chapter-led sequence John 3, 4 -> /read/jhn/3', async () => {
    const container = await searchPage({ q: 'John 3, 4' });
    expect(jumpLinkHref(container)).toBe('/read/jhn/3');
  });

  it('non-regression rendered — a single verse: John 3:16 -> /read/jhn/3#v16', async () => {
    const container = await searchPage({ q: 'John 3:16' });
    expect(jumpLinkHref(container)).toBe('/read/jhn/3#v16');
  });

  it('the jump label echoes the full parsed reference, contradicting neither the query nor the target', async () => {
    const container = await searchPage({ q: 'John 3:16, 17' });
    const a = [...container.querySelectorAll('a')].find((el) => /Go to .+→/.test(el.textContent ?? ''));
    expect(a, 'the Go-to jump link renders for a verse-led sequence').toBeTruthy();
    // The label carries the WHOLE typed reference, including the second segment — it does not
    // collapse to the chapter the way the old chapter-root target did.
    expect(a!.textContent).toBe('Go to John 3:16, 17 →');
  });

  it('a non-reference query renders no "Go to …" jump link', async () => {
    const container = await searchPage({ q: 'grace' });
    expect(jumpLinkHref(container)).toBeNull();
  });
});
