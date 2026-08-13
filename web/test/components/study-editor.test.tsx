// @vitest-environment jsdom
//
// The study doc editor's contract tests (design §7.4, Flow C; S-13; S-10's render half).
//
// What this file asserts, at the level a jsdom render honestly can:
//   1. TYPING SAVES BY ITSELF (E7: auto-save always, never ask) — a text block PATCHes
//      update_text on its own id after the debounce, and the confirmation is the visible
//      "Saved" state, not a toast or a button.
//   2. S-13 — A FAILED WRITE IS VISIBLE AND ITS BUFFER IS NEVER DISCARDED: a 500 from the block
//      route renders "Save failed — Retry" before any later debounce could fire, the textarea
//      keeps the user's words, and Retry re-sends THAT buffer.
//   3. S-10 — A TOMBSTONE KEEPS ATTRIBUTION AND DROPS QUOTE AND LINK: the tombstone fixture
//      carries a resolvable work_slug/ordinal ON PURPOSE, so a render path that adds an
//      Open-in-work link to tombstones goes RED here.
//   4. "+ Text" BETWEEN BLOCKS creates once (POST with the placement captured at insert time)
//      and UPDATEs on the returned id ever after — a keystroke burst must not file duplicates.
//   5. Title inline edit and the pin toggle PATCH the study route; the export trigger is a plain
//      anchor to the server-side export route (the licensing re-check on export stays
//      server-side).
//
// The debounce is REAL TIME here on purpose (the prayer-autosave suite's rule): fake timers
// would also fake the ordering between the timer, the fetch promise, and the pending-save
// chain, which is exactly the machinery under test.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudyEditor, type EditorBlock } from '../../src/components/study-editor';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const NOTICE = 'no longer available in the library';
const STUDY = { id: '11111111-1111-4111-8111-111111111111', title: 'Rahab', pinned: false };

const TEXT1: EditorBlock = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  position: 'V',
  kind: 'text',
  body: 'Rahab hid the spies',
  work_slug: null,
  ordinal: null,
  quote: null,
  attribution: null,
  renderState: 'text',
};

const CLIP: EditorBlock = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  position: 'W',
  kind: 'clipping',
  body: null,
  work_slug: 'matthew-henry-commentary',
  ordinal: 5,
  quote: 'She had heard what God had done, and she believed.',
  attribution: { author: 'Matthew Henry', work_title: 'Commentary on the Whole Bible', reference: 'Joshua 2' },
  renderState: 'clipping',
};

// The slug and ordinal are PRESENT on purpose: a tombstone with a perfectly resolvable target
// must still render no link (S-10).
const TOMB: EditorBlock = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  position: 'X',
  kind: 'clipping',
  body: null,
  work_slug: 'chrysostom-homilies',
  ordinal: 7,
  quote: null,
  attribution: { author: 'John Chrysostom', work_title: 'Homilies on Hebrews', reference: 'Homily 3' },
  renderState: 'tombstone',
};

interface Call { url: string; method: string; body: Record<string, unknown> }

/**
 * Records every request so assertions are about what reached the API, not about UI state.
 * `failPatches` makes every block-update PATCH return 500 — the S-13 failure leg.
 */
function stubApi(opts: { failPatches?: boolean } = {}) {
  const calls: Call[] = [];
  let seq = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      calls.push({ url, method, body });
      if (method === 'POST' && url.endsWith('/blocks')) {
        seq += 1;
        return new Response(
          JSON.stringify({
            block: {
              id: `dddddddd-dddd-4ddd-8ddd-${String(seq).padStart(12, '0')}`,
              position: 'Y',
              kind: 'text',
              body: body.body,
              work_slug: null,
              ordinal: null,
              quote: null,
              attribution: null,
            },
          }),
          { status: 201 },
        );
      }
      if (method === 'PATCH' && opts.failPatches) {
        return new Response(JSON.stringify({ error: { code: 'INTERNAL', message: 'x' } }), { status: 500 });
      }
      if (method === 'PATCH' && url.endsWith('/blocks')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (method === 'PATCH') {
        return new Response(JSON.stringify({ study: { ...STUDY, ...body } }), { status: 200 });
      }
      if (method === 'DELETE') {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ blocks: [], nextAfterPosition: null }), { status: 200 });
    }),
  );
  return calls;
}

describe('StudyEditor — autosave and save state', () => {
  it('typing in a text block saves by itself (update_text on the block id) and shows Saved', async () => {
    const calls = stubApi();
    render(<StudyEditor study={STUDY} initialBlocks={[TEXT1]} initialNextAfterPosition={null} tombstoneNotice={NOTICE} />);

    const box = screen.getByLabelText('Text block 1');
    fireEvent.change(box, { target: { value: 'Rahab hid the spies, and lied about it' } });

    // SEED: drop the debounce schedule from onTextChange -> RED: nothing ever reaches the API
    // and this wait times out.
    await waitFor(
      () => expect(calls.some((c) => c.method === 'PATCH' && c.body.op === 'update_text')).toBe(true),
      { timeout: 3000 },
    );
    const patch = calls.find((c) => c.method === 'PATCH' && c.body.op === 'update_text')!;
    expect(patch.url).toBe(`/api/studies/${STUDY.id}/blocks`);
    expect(patch.body).toMatchObject({ blockId: TEXT1.id, body: 'Rahab hid the spies, and lied about it' });

    // The visible confirmation (S-13): the quiet "Saved", not a toast, banner, or modal.
    // SEED: never set the 'saved' state -> RED.
    expect(await screen.findByText('Saved')).toBeTruthy();
  });

  it('S-13: a failed write shows Save failed — Retry, keeps the buffer, and Retry resends it', async () => {
    const calls = stubApi({ failPatches: true });
    render(<StudyEditor study={STUDY} initialBlocks={[TEXT1]} initialNextAfterPosition={null} tombstoneNotice={NOTICE} />);

    const box = screen.getByLabelText('Text block 1') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'the spies went out by another way' } });

    // SEED: on a failed write, set the state back to 'clean' (or discard the buffer) -> RED:
    // no failure is ever visible, which is precisely the silent-loss mode S-13 forbids.
    const retry = await screen.findByRole('button', { name: 'Retry' }, { timeout: 3000 });
    expect(screen.getByText(/Save failed/)).toBeTruthy();
    // The buffer is never discarded: the textarea still holds exactly what was typed.
    expect(box.value).toBe('the spies went out by another way');

    // Retry re-sends THE SAME buffer once the route is healthy again.
    vi.restoreAllMocks();
    const calls2 = stubApi();
    fireEvent.click(retry);
    await waitFor(
      () => expect(calls2.some((c) => c.method === 'PATCH' && c.body.op === 'update_text')).toBe(true),
      { timeout: 3000 },
    );
    expect(calls2.find((c) => c.body.op === 'update_text')!.body).toMatchObject({
      blockId: TEXT1.id,
      body: 'the spies went out by another way',
    });
    expect(await screen.findByText('Saved')).toBeTruthy();
    expect(calls).not.toHaveLength(0); // the failing attempt really did go out first
  });
});

describe('StudyEditor — clippings and tombstones', () => {
  it('a clipping renders attribution + quote + Open-in-work; a tombstone drops quote AND link (S-10)', () => {
    stubApi();
    render(
      <StudyEditor study={STUDY} initialBlocks={[CLIP, TOMB]} initialNextAfterPosition={null} tombstoneNotice={NOTICE} />,
    );

    // The clipping: quote, one attribution line, and the deep link the catalog search surface
    // uses — /work/{slug}#s{ordinal}.
    const clipFigure = screen.getByText('She had heard what God had done, and she believed.').closest('figure')!;
    expect(clipFigure.textContent).toContain('Matthew Henry');
    expect(clipFigure.textContent).toContain('Commentary on the Whole Bible');
    expect(clipFigure.textContent).toContain('(Joshua 2)');
    const open = within(clipFigure).getByRole('link', { name: 'Open in work' });
    expect(open.getAttribute('href')).toBe('/work/matthew-henry-commentary#s5');

    // The tombstone: attribution and the shared notice — and NOTHING ELSE. SEED: render the
    // Open-in-work link (or the quote) in the tombstone branch -> RED.
    const tombFigure = screen.getByText(NOTICE).closest('figure')!;
    expect(tombFigure.textContent).toContain('John Chrysostom');
    expect(tombFigure.textContent).toContain('Homilies on Hebrews');
    expect(within(tombFigure).queryByRole('link'), 'a tombstone rendered a link').toBeNull();
    expect(tombFigure.textContent).not.toContain('believed');
  });
});

describe('StudyEditor — + Text between blocks', () => {
  it('inserts between blocks, creates once with the captured placement, then updates on the returned id', async () => {
    const calls = stubApi();
    render(
      <StudyEditor study={STUDY} initialBlocks={[TEXT1, CLIP]} initialNextAfterPosition={null} tombstoneNotice={NOTICE} />,
    );

    // Three affordances: above the first block, between the two, below the last. The middle one
    // inserts between TEXT1 and CLIP, so the placement anchor is TEXT1's id.
    fireEvent.click(screen.getAllByRole('button', { name: '+ Text' })[1]!);

    const box = screen.getByLabelText('Text block 2');
    fireEvent.change(box, { target: { value: 'my own words' } });
    // SEED: send no afterBlockId (append instead of insert-between) -> RED here; the doc would
    // grow the block at the END, not where the user asked for it.
    await waitFor(
      () => expect(calls.some((c) => c.method === 'POST' && c.body.kind === 'text')).toBe(true),
      { timeout: 3000 },
    );
    const create = calls.find((c) => c.method === 'POST')!;
    expect(create.url).toBe(`/api/studies/${STUDY.id}/blocks`);
    expect(create.body).toMatchObject({ kind: 'text', body: 'my own words', afterBlockId: TEXT1.id });

    // More typing updates the created block — a second create would file the words twice.
    // NOTE: the create swaps the block's id (local-* -> server id), which is the element's key —
    // React remounts the textarea, so re-query it; the pre-create node is detached.
    fireEvent.change(screen.getByLabelText('Text block 2'), { target: { value: 'my own words, expanded' } });
    await waitFor(
      () => expect(calls.some((c) => c.method === 'PATCH' && c.body.op === 'update_text')).toBe(true),
      { timeout: 3000 },
    );
    // SEED: keep the local id (never adopt the server id) -> RED: the "update" 404s in the real
    // app, and the next debounce creates a duplicate.
    expect(calls.find((c) => c.body.op === 'update_text')!.body).toMatchObject({
      blockId: 'dddddddd-dddd-4ddd-8ddd-000000000001',
      body: 'my own words, expanded',
    });
    expect(calls.filter((c) => c.method === 'POST'), 'a second create — duplicates').toHaveLength(1);
  });
});

describe('StudyEditor — title, pin, export', () => {
  it('the title saves inline on blur, the pin toggle PATCHes, and Export points at the export route', async () => {
    const calls = stubApi();
    render(<StudyEditor study={STUDY} initialBlocks={[TEXT1]} initialNextAfterPosition={null} tombstoneNotice={NOTICE} />);

    const title = screen.getByLabelText('Study title');
    fireEvent.change(title, { target: { value: 'Rahab the harlot' } });
    fireEvent.blur(title);
    // SEED: drop the blur save -> RED; the title edit would go nowhere (E7: never ask).
    await waitFor(
      () => expect(calls.some((c) => c.method === 'PATCH' && c.body.title === 'Rahab the harlot')).toBe(true),
      { timeout: 3000 },
    );
    expect(calls.find((c) => c.body.title)!.url).toBe(`/api/studies/${STUDY.id}`);

    fireEvent.click(screen.getByRole('button', { name: 'Pin' }));
    await waitFor(
      () => expect(calls.some((c) => c.method === 'PATCH' && c.body.pinned === true)).toBe(true),
      { timeout: 3000 },
    );
    expect((await screen.findByRole('button', { name: 'Pinned' })).getAttribute('aria-pressed')).toBe('true');

    // The export trigger is a plain anchor — the serialization and its licensing re-check run
    // server-side in the export route, never in the browser.
    expect(screen.getByRole('link', { name: 'Export' }).getAttribute('href')).toBe(`/studies/${STUDY.id}/export`);
  });
});
