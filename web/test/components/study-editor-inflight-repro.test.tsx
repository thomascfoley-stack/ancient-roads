// @vitest-environment jsdom
//
// The in-flight-create regression for the My Studies doc editor (S-13: the draft IS the buffer).
//
// What this file asserts — the contract a create-success path must hold when the user keeps
// typing WHILE the first create POST is still in flight (a normal edit rhythm: type, pause long
// enough to fire the debounced create, keep typing):
//   1. The controlled textarea does NOT snap back to the server-echoed (in-flight) body; it keeps
//      showing the latest draft (the words typed since the POST fired).
//   2. The in-flight words actually reach the server: after the create resolves, a PATCH on the
//      new server id carries the full draft — in BOTH the fast-POST branch (the trailing debounce
//      never re-entered saveText) AND the slow-POST branch (the trailing debounce set `pending`).
//   3. Continued typing after the create resolves is sourced from the preserved (full) visible
//      value, so it does not overwrite the rescued server state — the final server state still
//      includes the in-flight words.
//
// Like the neighbor study-editor.test.tsx, the debounce is REAL TIME here on purpose (fake timers
// would also fake the ordering between the timer, the fetch promise, and the pending-save chain —
// the exact machinery under test). The create POST is held open in a Deferred that the test
// resolves at the chosen moment, simulating network latency overlapping continued typing.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudyEditor } from '../../src/components/study-editor';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const NOTICE = 'no longer available in the library';
const STUDY = { id: '11111111-1111-4111-8111-111111111111', title: 'Rahab', pinned: false };

interface Call { url: string; method: string; body: Record<string, unknown> }

/** A controllable promise: the create POST is held in `createDeferred` until the test resolves
 *  it, simulating the network round-trip overlapping continued typing. */
function makeDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

/**
 * Records every request so assertions are about what reached the API. The FIRST POST /blocks is
 * held open in the returned `createDeferred`; PATCHes resolve immediately (the rescue path).
 * The POST echoes `body.body` VERBATIM, matching the real server (route.ts stores body.body raw,
 * insertTextBlock INSERTs ${body} untrimmed).
 */
function stubApi() {
  const calls: Call[] = [];
  let seq = 0;
  const createDeferred = makeDeferred();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      calls.push({ url, method, body });
      if (method === 'POST' && url.endsWith('/blocks')) {
        seq += 1;
        const echoedBody = typeof body.body === 'string' ? body.body : '';
        await createDeferred.promise; // hold the create in flight; the test types during this window
        return new Response(
          JSON.stringify({
            block: {
              id: `dddddddd-dddd-4ddd-8ddd-${String(seq).padStart(12, '0')}`,
              position: 'Y',
              kind: 'text',
              body: echoedBody, // the in-flight (older) body — what the server stores
              work_slug: null,
              ordinal: null,
              quote: null,
              attribution: null,
              trim_start: null,
              trim_end: null,
            },
          }),
          { status: 201 },
        );
      }
      if (method === 'PATCH' && url.endsWith('/blocks')) {
        if (body.op === 'move') return new Response(JSON.stringify({ ok: true, position: 'Vk' }), { status: 200 });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (method === 'PATCH') return new Response(JSON.stringify({ study: { ...STUDY, ...body } }), { status: 200 });
      if (method === 'DELETE') return new Response(JSON.stringify({ ok: true }), { status: 200 });
      return new Response(JSON.stringify({ blocks: [], nextAfterPosition: null }), { status: 200 });
    }),
  );
  return { calls, createDeferred };
}

/** Seeds the ghost composer with `seed`, waits for the debounced create POST to be IN FLIGHT
 *  (recorded in calls and awaiting the deferred), then returns the seeded textarea. */
async function seedAndHoldPost(opts: {
  calls: Call[];
  createDeferred: { resolve: () => void };
  seed: string;
}): Promise<HTMLTextAreaElement> {
  const ghost = screen.getByLabelText('Keep writing at the end of the document');
  fireEvent.change(ghost, { target: { value: opts.seed } });

  // The ghost becomes a real local-* block (Text block 1); the 500ms debounce schedules the POST.
  const box = screen.getByLabelText('Text block 1') as HTMLTextAreaElement;
  expect(box.value).toBe(opts.seed);

  // Wait for the POST to be in flight (recorded, then awaiting createDeferred).
  await waitFor(
    () => expect(opts.calls.some((c) => c.method === 'POST' && c.url.endsWith('/blocks'))).toBe(true),
    { timeout: 3000 },
  );
  return box;
}

const updateTextPatches = (calls: Call[]) =>
  calls.filter((c) => c.method === 'PATCH' && c.body.op === 'update_text');

const bodyOf = (c: Call) => String(c.body.body);

describe('StudyEditor — typing during an in-flight text-block create (FAST-POST)', () => {
  it('keeps the latest draft in the textarea (S-13: the draft IS the buffer)', async () => {
    const { calls, createDeferred } = stubApi();
    render(<StudyEditor study={STUDY} initialBlocks={[]} initialNextAfterPosition={null} tombstoneNotice={NOTICE} />);

    const box = await seedAndHoldPost({ calls, createDeferred, seed: 'Rahab hid' });

    // The user keeps typing DURING the in-flight window. The textarea snapshot shows the full
    // draft before the create resolves.
    fireEvent.change(box, { target: { value: 'Rahab hid the spies' } });
    expect((screen.getByLabelText('Text block 1') as HTMLTextAreaElement).value).toBe('Rahab hid the spies');

    // Resolve the create FAST (before the trailing 500ms debounce fires): the bug's fast-POST
    // branch, where `buf.pending` is never set and the `finally` clause does not re-save.
    createDeferred.resolve();

    // After the create resolves and the local-* -> server-id swap remounts the textarea, the
    // controlled value must be the DRAFT ('Rahab hid the spies'), not the server-echoed in-flight
    // body ('Rahab hid'). SEED: setBlocks replaces the block with the server echo verbatim -> RED:
    // the textarea visibly snaps back to what was sent, not what was typed.
    await waitFor(
      () => expect((screen.getByLabelText('Text block 1') as HTMLTextAreaElement).value).toBe('Rahab hid the spies'),
      { timeout: 3000 },
    );
    expect((screen.getByLabelText('Text block 1') as HTMLTextAreaElement).value).not.toBe('Rahab hid');
  });

  it('persists the in-flight words: a PATCH on the new id carries the full draft (no data loss)', async () => {
    const { calls, createDeferred } = stubApi();
    render(<StudyEditor study={STUDY} initialBlocks={[]} initialNextAfterPosition={null} tombstoneNotice={NOTICE} />);

    const box = await seedAndHoldPost({ calls, createDeferred, seed: 'Rahab' });

    fireEvent.change(box, { target: { value: 'Rahab hid the spies' } });
    createDeferred.resolve();

    // The fix re-arms the pending save on the new server id, so a PATCH carries the full draft
    // even in the fast-POST branch (where the trailing debounce never re-entered saveText).
    // SEED: retire the local key before re-arming / never set pending -> RED: the dangling
    // saveText(local-*) timer no-ops against the deleted buffer, and no PATCH ever carries
    // "the spies".
    await waitFor(
      () =>
        expect(
          updateTextPatches(calls).some((c) => bodyOf(c) === 'Rahab hid the spies'),
        ).toBe(true),
      { timeout: 3000 },
    );
    expect(updateTextPatches(calls).some((c) => bodyOf(c).includes('the spies'))).toBe(true);
    expect(calls.filter((c) => c.method === 'POST'), 'no duplicate create — words filed once').toHaveLength(1);
  });
});

describe('StudyEditor — typing during an in-flight text-block create (SLOW-POST)', () => {
  it('preserves the visible draft AND rescues the server; continued typing does not erase it', async () => {
    const { calls, createDeferred } = stubApi();
    render(<StudyEditor study={STUDY} initialBlocks={[]} initialNextAfterPosition={null} tombstoneNotice={NOTICE} />);

    const box = await seedAndHoldPost({ calls, createDeferred, seed: 'Rahab hid' });

    fireEvent.change(box, { target: { value: 'Rahab hid the spies' } });

    // Wait for the trailing 500ms debounce to fire DURING the in-flight window: saveText re-enters,
    // sees `buf.inFlight`, and sets `buf.pending = true`. Real time, per the suite's rule.
    await new Promise((r) => { setTimeout(r, 650); });

    // Now resolve the create (slow): the `finally` clause PATCHes the full draft to the new id.
    createDeferred.resolve();

    // The rescue PATCH carries the full draft (the slow-POST finally/pending path — present
    // even in the buggy code). Crucially, the FIX keeps the PATCH firing under the new id.
    await waitFor(
      () => expect(updateTextPatches(calls).some((c) => bodyOf(c) === 'Rahab hid the spies')).toBe(true),
      { timeout: 3000 },
    );

    // The visible textarea must ALSO show the full draft (unconditional on timing). SEED:
    // setBlocks swaps in the server echo -> RED: the rescue reaches the server but the textarea
    // snaps back to the in-flight body, so the next keystroke is sourced from the truncated value.
    await waitFor(
      () => expect((screen.getByLabelText('Text block 1') as HTMLTextAreaElement).value).toBe('Rahab hid the spies'),
      { timeout: 3000 },
    );
    expect((screen.getByLabelText('Text block 1') as HTMLTextAreaElement).value).not.toBe('Rahab hid');

    // The user continues typing, sourced from the preserved (full) visible value. The next PATCH
    // appends to the full draft, so the rescued words survive on the server — they are NOT
    // overwritten by a keystroke sourced from a truncated visible value.
    const visible = screen.getByLabelText('Text block 1') as HTMLTextAreaElement;
    fireEvent.change(visible, { target: { value: 'Rahab hid the spies and saved' } });

    await waitFor(
      () =>
        expect(
          updateTextPatches(calls).some((c) => bodyOf(c) === 'Rahab hid the spies and saved'),
        ).toBe(true),
      { timeout: 3000 },
    );

    const patches = updateTextPatches(calls);
    const lastPatchBody = bodyOf(patches[patches.length - 1]!);
    // The final server state is the latest full draft and still includes the in-flight words.
    expect(lastPatchBody).toBe('Rahab hid the spies and saved');
    expect(updateTextPatches(calls).some((c) => bodyOf(c) === 'Rahab hid the spies')).toBe(true);
    expect(lastPatchBody).toContain('the spies');
  });
});
