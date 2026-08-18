// @vitest-environment jsdom
//
// THE JOIN — the reader actually hands over the CORPUS KEY, and the right one.
//
// `work-reader-progress-sync.test.tsx` says why this shape of test exists here at all: a feature
// whose server half is proven and whose client half has no CALLER is green everywhere and dead in
// the product (`reading_progress` had a table, an RLS policy and a passing invariant suite for the
// entire life of that bug). The popover suite next door proves the popover posts a reference; it
// would stay green forever with nothing passing it one.
//
// WHAT IS MOCKED AND WHY. Two data sources: the section fetch, and `useTextAnnotation` — the
// selection engine. jsdom has no layout, and a previous attempt in this repo to drive that hook
// through a stubbed `window.getSelection` failed on its own CONTROL case
// (`cross-verse-selection.test.tsx` records it: "a test whose control cannot pass proves nothing").
// Standing in for the selection keeps this test about the WIRING — byId lookup, clip construction,
// the POST — every line of which runs for real.
//
// THE FIXTURE IS THE RED-PROOF. `id` (90210) and `ordinal` (1) are deliberately different numbers.
// Both are integers on the same row and either would satisfy a `sectionId: number` type, but only
// `sections.id` is the key `insertClippingFromSection` looks up (`lib/studies.ts:544`,
// `WHERE s.id = ${clip.sectionId}`). Wiring the ordinal instead would type-check, post cleanly,
// and snapshot A DIFFERENT PASSAGE'S BYTES into the user's study — silently, and permanently,
// because the server writes the quote from whatever row that key names.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingAnnotation } from '@/lib/use-text-annotation';
import type { WorkSectionRow, WorkSource } from '@/lib/work';

// The `mock` prefix satisfies vitest's mock-hoisting rule. Read at RENDER time by the factory's
// returned hook, never at factory time, so the TDZ is not an issue.
let mockPending: PendingAnnotation | null = null;
vi.mock('@/lib/use-text-annotation', () => ({
  useTextAnnotation: () => ({ pending: mockPending, dismiss: () => {} }),
}));
vi.mock('@/lib/auth/client', () => ({
  authClient: { useSession: () => ({ data: { user: { id: 'u-reader' } } }) },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

import { WorkReader } from '@/components/work-reader';
import { LAST_TARGET_KEY_PREFIX } from '@/components/save-to-study';

const SLUG = 'qa-add-to-study';
const STUDY_ID = '3f0f4b3e-1a2b-4c5d-8e9f-0a1b2c3d4e5f';

// id !== ordinal, deliberately. See the header.
const SECTION: WorkSectionRow = {
  id: 90210,
  ordinal: 1,
  unitOrdinal: 1,
  heading: 'Sermon XII',
  verseStart: null,
  verseEnd: null,
  body: 'Now the just shall live by faith, and the whole of the sermon that follows it.',
};

const SOURCE: WorkSource = {
  slug: SLUG,
  title: 'Sermons',
  author: 'John Bunyan',
  tradition: 'Puritan',
  era: '17c',
  license: 'Public Domain',
  source_type: 'sermon',
};

function jsonResponse(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
}

function stubFetch() {
  const calls: { key: string; body: Record<string, unknown> | undefined }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const key = `${init?.method ?? 'GET'} ${url}`;
      calls.push({
        key,
        body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
      });
      if (url.includes('/sections')) return jsonResponse(200, { sections: [SECTION], nextAfter: null });
      if (key.startsWith('POST /api/studies/') && key.endsWith('/blocks')) {
        return jsonResponse(201, { block: { id: 'b-1' } });
      }
      return jsonResponse(200, {});
    }),
  );
  return calls;
}

function renderReader() {
  render(
    <WorkReader
      slug={SLUG}
      source={SOURCE}
      initialOrdinal={null}
      initialScrollPct={0}
      seek={null}
      signedIn
      onOpenToc={() => {}}
      onProgress={() => {}}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

beforeEach(() => {
  // The selection the reader is holding when the popover mounts: a phrase inside SECTION, keyed
  // by the section's corpus id exactly as `work-reader.tsx:308` keys it.
  mockPending = {
    kind: 'section',
    key: String(SECTION.id),
    start: 0,
    end: 31,
    text: 'Now the just shall live by faith',
    rect: { top: 100, bottom: 120, left: 10, right: 200, width: 190, height: 20 },
  };
  vi.stubGlobal('getSelection', () => null);
});

describe('the Book Reader hands the popover a real corpus key', () => {
  it('a selection in a work saves that SECTION to the study, by sections.id', async () => {
    // SEED (red-proof): pass `pendingSection.ordinal` in place of `pendingSection.id` -> RED
    // (posts 1). That mistake is invisible to types, to the route, and to the user.
    const calls = stubFetch();
    window.localStorage.setItem(
      `${LAST_TARGET_KEY_PREFIX}:u-reader`,
      JSON.stringify({ id: STUDY_ID, title: 'Perseverance' }),
    );
    renderReader();

    const save = await screen.findByRole('button', { name: /save to study/i });
    save.click();

    await waitFor(() => {
      const post = calls.find((c) => c.key === `POST /api/studies/${STUDY_ID}/blocks`);
      expect(post, 'no clipping POST left the Book Reader').toBeTruthy();
      expect(post!.body).toEqual({
        kind: 'clipping',
        sectionId: SECTION.id,
        // The reader's own locus label, which the server uses in place of `s.heading`.
        reference: 'Sermon XII',
        // B030: the SELECTION itself, so the block is born opened on the paragraph the reader
        // had their finger on instead of the whole section. A hint to LOCATE with — the server
        // finds it in its own snapshot and stores offsets; this never becomes stored text.
        // SEED: drop matchHint from work-reader.tsx's clip prop, or from save-to-study.tsx's
        // sectionId body branch -> RED here, and the deep-equal names the missing key.
        matchHint: 'Now the just shall live by faith',
      });
      // The S-1 rule is unchanged by B030 and is asserted here, not assumed: a reader surface
      // may send references and hints, never content.
      expect(Object.keys(post!.body as object)).not.toContain('quote');
      expect(Object.keys(post!.body as object)).not.toContain('attribution');
    });
  });

  it('offers nothing when the reader is signed out', async () => {
    // Same rule as the popover's other write verbs: the POST would 401.
    const calls = stubFetch();
    render(
      <WorkReader
        slug={SLUG}
        source={SOURCE}
        initialOrdinal={null}
        initialScrollPct={0}
        seek={null}
        signedIn={false}
        onOpenToc={() => {}}
        onProgress={() => {}}
      />,
    );
    // Wait for the page to have landed, so "absent" is a real absence and not a race with the
    // fetch — otherwise this test passes before the popover could have mounted at all.
    await waitFor(() => expect(calls.some((c) => c.key.includes('/sections'))).toBe(true));
    await waitFor(() => expect(screen.getByRole('link', { name: /sign in to highlight/i })).toBeTruthy());
    expect(screen.queryByRole('button', { name: /save to study/i })).toBeNull();
  });
});
