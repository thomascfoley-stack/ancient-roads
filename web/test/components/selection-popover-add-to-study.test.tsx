// @vitest-environment jsdom
//
// "ADD TO STUDY" ON THE READER'S SELECTION POPOVER — AND THE ONE SURFACE IT CANNOT SERVE.
//
// Owner ask (2026-08-17): "we need a high[light] tool to add to study, does this do this now?"
// It did not. `SaveToStudy` was mounted in exactly ONE place, `ask-client.tsx`, so a reader who
// selected a passage in a reader had no route into a study at all.
//
// THE REFERENCE RULE IS WHAT SHAPES THIS FEATURE, so it is what these tests are about.
// `api/studies/[id]/blocks/route.ts:25` states it — "A clipping request carries a REFERENCE
// (sectionId | sourceId | slug), never text" — and :116 enforces it before any branch runs: a
// body carrying `quote` or `attribution` is rejected 400. The TABLE says the same thing one
// layer down (`db/migrations/110_studies.sql:90`):
//
//     CHECK ( kind <> 'clipping' OR (source_id IS NOT NULL OR section_id IS NOT NULL) )
//
// so a clipping that is not a corpus key cannot be STORED, never mind posted. There is no
// scripture column to reference and no client-text path to fall back on.
//
// Which is why the popover takes a `clip` and renders NOTHING without one, and why that is the
// assertion below rather than "the button is there". A Bible verse in `/read` has no corpus key:
// verse text is a static asset (`web/public/bible/{translation}/{book}.json`, built by
// `src/ingest/consolidate-bibles.ts`), never a `sections` row — no `sections.id`, no
// `<register>:<key>`. The honest rendering of "this passage cannot be referenced" is no control,
// not a control that 400s.
//
// The last test is the load-bearing one: the request that actually leaves carries a reference and
// nothing else. That is the CLIENT half of S-1, and it is the half a server-side test cannot see.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Session state is per-test; the name satisfies vitest's mock-hoisting rule.
let mockSession: { data: { user: { id: string } } | null } = { data: { user: { id: 'u-reader' } } };
vi.mock('@/lib/auth/client', () => ({ authClient: { useSession: () => mockSession } }));

import { SelectionPopover } from '@/components/selection-popover';
import { LAST_TARGET_KEY_PREFIX, type ClipRef } from '@/components/save-to-study';
import type { PendingAnnotation } from '@/lib/use-text-annotation';

// TYPED, not shaped by hand — the fixture rationale of bookmark-state-label.test.tsx: an
// `as DOMRect` cast here would hide exactly the drift the annotation asks tsc to catch.
const pending: PendingAnnotation = {
  kind: 'section',
  // A work reader's key IS the corpus `sections.id`, as a string (work-reader.tsx:308).
  key: '90210',
  start: 0,
  end: 31,
  text: 'Now the just shall live by faith',
  rect: { top: 100, bottom: 120, left: 10, right: 200, width: 190, height: 20 },
};

/** The reference a work reader hands over: a real `sections.id`, never text. */
const SECTION_CLIP: ClipRef = { sectionId: 90210, reference: 'Sermon XII' };

const STUDY_ID = '3f0f4b3e-1a2b-4c5d-8e9f-0a1b2c3d4e5f';

function jsonResponse(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
}

/** Records every request; answers the block POST 201 and anything else with an empty object. */
function stubFetch() {
  const calls: { key: string; body: Record<string, unknown> | undefined }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${String(input)}`;
      calls.push({
        key,
        body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
      });
      if (key.startsWith('POST /api/studies/') && key.endsWith('/blocks')) {
        return jsonResponse(201, { block: { id: 'b-1' } });
      }
      return jsonResponse(200, {});
    }),
  );
  return calls;
}

function renderPopover(props: { clip?: ClipRef; signedIn?: boolean } = {}) {
  render(
    <SelectionPopover
      pending={pending}
      contextLabel="John Bunyan · The Pilgrim's Progress · Sermon XII"
      signedIn={props.signedIn ?? true}
      clip={props.clip}
      clipTitle="The Pilgrim's Progress · Sermon XII"
      onHighlight={() => {}}
      onAsk={() => {}}
      onDismiss={() => {}}
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
  mockSession = { data: { user: { id: 'u-reader' } } };
  // jsdom has no layout; the popover measures the live selection rect to place itself. With
  // `pos` unresolved the desktop card stays `visibility: hidden` and therefore out of the
  // accessibility tree, so every query below lands on the mobile bar — the same mechanics the
  // B023/B024/B046 suites rely on, and the reason a single `getByRole` is unambiguous here.
  vi.stubGlobal('getSelection', () => null);
});

describe('the reader popover offers "Add to study" exactly where a reference exists', () => {
  it('renders the shared Save-to-study verb when the surface supplies a clip reference', () => {
    // SEED (red-proof): drop the `clip` prop from selection-popover.tsx -> RED. That is the
    // state of the file before this change: the verb existed only on /ask.
    stubFetch();
    renderPopover({ clip: SECTION_CLIP });
    expect(screen.getByRole('button', { name: /save to study/i })).toBeTruthy();
  });

  it('renders NOTHING on a surface with no corpus key for the selection (the Bible reader)', () => {
    // THE SCOPE GAP, PINNED. `/read` selects Scripture, which is a static asset with no
    // `sections` row and no embeddings key, so `verse-display.tsx` passes no clip. A control
    // here would be a control that cannot work: the POST has nothing to send, the route would
    // 400, and the table's own CHECK would refuse the row even if it did not.
    //
    // SEED (red-proof): render the affordance unconditionally -> RED.
    stubFetch();
    renderPopover({});
    expect(screen.queryByRole('button', { name: /save to study/i })).toBeNull();
  });

  it('renders nothing when signed out, even with a clip', () => {
    // The POST would 401. The popover already gates highlight/bookmark/clear on `signedIn` for
    // exactly this reason: "a control that appears to work and silently does not".
    //
    // SEED (red-proof): gate on `clip` alone, dropping `signedIn` -> RED.
    stubFetch();
    mockSession = { data: null };
    renderPopover({ clip: SECTION_CLIP, signedIn: false });
    expect(screen.queryByRole('button', { name: /save to study/i })).toBeNull();
    // and the signed-out reader still gets the surface's existing invitation to sign in
    expect(screen.getByRole('link', { name: /sign in to highlight/i })).toBeTruthy();
  });

  it('one tap posts a REFERENCE and nothing else — no quote, no text, no attribution', () => {
    // E7 ("always auto-save, never ask"): with a stored last target the first tap saves. The
    // body is the whole point of this test — `route.ts:116` rejects `quote`/`attribution`
    // outright, so a client that sent the selected TEXT would fail closed, and this asserts the
    // client never tries.
    //
    // SEED (red-proof): add `text: pending.text` to the posted body -> RED on the toEqual.
    const calls = stubFetch();
    window.localStorage.setItem(
      `${LAST_TARGET_KEY_PREFIX}:u-reader`,
      JSON.stringify({ id: STUDY_ID, title: 'Perseverance' }),
    );
    renderPopover({ clip: SECTION_CLIP });

    fireEvent.click(screen.getByRole('button', { name: /save to study/i }));

    return waitFor(() => {
      const post = calls.find((c) => c.key === `POST /api/studies/${STUDY_ID}/blocks`);
      expect(post, 'no clipping POST left the popover').toBeTruthy();
      // toEqual, not toMatchObject: an EXTRA key is the failure this test exists to catch.
      expect(post!.body).toEqual({ kind: 'clipping', sectionId: 90210, reference: 'Sermon XII' });
    });
  });

  it('clamps an over-long reference rather than posting one the route will 400', () => {
    // CLIP_REFERENCE_MAX is 300 (lib/studies.ts:50) and lives in a server-only module, so the
    // bound is restated in the popover — same reason save-to-study.tsx restates
    // STUDY_TITLE_MAX. A work section's heading is free text from ingest and can exceed it; an
    // unclamped reference turns a working affordance into a 400 on exactly the works with long
    // headings.
    //
    // SEED (red-proof): pass `clip` straight through without clamping -> RED (length 400).
    const calls = stubFetch();
    window.localStorage.setItem(
      `${LAST_TARGET_KEY_PREFIX}:u-reader`,
      JSON.stringify({ id: STUDY_ID, title: 'Perseverance' }),
    );
    renderPopover({ clip: { sectionId: 90210, reference: 'H'.repeat(400) } });

    fireEvent.click(screen.getByRole('button', { name: /save to study/i }));

    return waitFor(() => {
      const post = calls.find((c) => c.key === `POST /api/studies/${STUDY_ID}/blocks`);
      expect(post, 'no clipping POST left the popover').toBeTruthy();
      expect(String(post!.body!.reference)).toHaveLength(300);
    });
  });
});
