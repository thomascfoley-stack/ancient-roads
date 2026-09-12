// @vitest-environment jsdom
//
// The remove-clears-orphaned-save-state regression for the My Studies doc editor (S-13).
//
// What this file asserts — the contract that `removeBlock`'s `drop()` helper must clear the
// removed block's entries in the document-level save-state maps, because the header status
// derives `anySaving`/`anyFailed` from `Object.values(saveStates)` over the WHOLE map — not
// intersected with the live `blocks` list. A removed block whose save FAILED (or was mid-save)
// otherwise leaves an orphaned `'failed'`/`'saving'` entry pinning the header on "Save failed
// below" / "Saving…" for the rest of the session with no failed block anywhere to point at.
//
// These are RED-PROOFED regression tests: each fails against the unmodified production code
// (the orphaned entry keeps the header lit after removal) and passes once `drop()` clears the
// removed block's `saveStates`/`saveErrors`/`blockErrors` entries.
//
// Like the neighbor study-editor.test.tsx, the debounce is REAL TIME here on purpose (fake timers
// would also fake the ordering between the timer, the fetch promise, and the save-state writes).

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  trim_start: null,
  trim_end: null,
  renderState: 'text',
};

interface Call { url: string; method: string; body: Record<string, unknown> }

/**
 * Records every request so assertions are about what reached the API, not about UI state.
 *
 * `failPatches: true` makes every block-route PATCH return 500 — the S-13 failure leg used by
 * the all-fail repro.
 *
 * `failAfterNthUpdate`: the Nth `update_text` PATCH and every one after it returns 500; the
 * earlier ones return 200. This lets a repro set `everSaved` with an earlier successful save
 * before failing a later edit, so the post-removal header can be asserted to fall back to
 * "Saved" rather than to nothing.
 */
function stubApi(opts: { failPatches?: boolean; failAfterNthUpdate?: number } = {}) {
  const calls: Call[] = [];
  let seq = 0;
  let updateSeq = 0;
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
              trim_start: null,
              trim_end: null,
            },
          }),
          { status: 201 },
        );
      }
      if (method === 'PATCH' && url.endsWith('/blocks')) {
        if (body.op === 'move') {
          return new Response(JSON.stringify({ ok: true, position: 'Vk' }), { status: 200 });
        }
        // op: 'update_text' (trim never runs in these repros).
        if (opts.failPatches) {
          return new Response(JSON.stringify({ error: { code: 'INTERNAL', message: 'x' } }), { status: 500 });
        }
        if (opts.failAfterNthUpdate !== undefined) {
          updateSeq += 1;
          if (updateSeq >= opts.failAfterNthUpdate) {
            return new Response(JSON.stringify({ error: { code: 'INTERNAL', message: 'x' } }), { status: 500 });
          }
        }
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

/** Confirms removal of the block at index 0 (block 1): open the confirm, then click Remove. */
async function confirmRemove() {
  fireEvent.click(screen.getByRole('button', { name: 'Remove block 1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
}

describe('StudyEditor — remove clears orphaned save state (S-13 header)', () => {
  it('removing a block whose save FAILED clears "Save failed below" from the header', async () => {
    const calls = stubApi({ failPatches: true });
    render(<StudyEditor study={STUDY} initialBlocks={[TEXT1]} initialNextAfterPosition={null} tombstoneNotice={NOTICE} />);

    const box = screen.getByLabelText('Text block 1') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'the spies went out by another way' } });

    // The failure is shown loud on the block and quietly in the header — same as the S-13 test.
    await screen.findByRole('button', { name: 'Retry' }, { timeout: 3000 });
    expect(screen.getByText('Save failed below')).toBeTruthy();

    // Remove the failed block (DELETE 200 -> drop()).
    await confirmRemove();
    await waitFor(
      () => expect(calls.some((c) => c.method === 'DELETE')).toBe(true),
      { timeout: 3000 },
    );
    await waitFor(
      () => expect(screen.queryByLabelText('Text block 1')).toBeNull(),
      { timeout: 3000 },
    );

    // SEED: leave the orphaned 'failed' entry in saveStates -> RED: the header stays pinned on
    // "Save failed below" with no failed block left anywhere to point at. With the fix, drop()
    // clears the removed block's save state so anyFailed is recomputed off only live blocks.
    expect(screen.queryByText('Save failed below')).toBeNull();
    // No per-block failure alert survives the removal either (the alert lived on the removed
    // block's render branch).
    for (const alert of screen.queryAllByRole('alert')) {
      expect(alert.textContent).not.toContain('Save failed');
    }
  });

  it('after a prior successful save, removing a later-failed block drops the header back to "Saved"', async () => {
    // First update_text PATCH succeeds (everSaved <- true), the second fails — so the post-fix
    // header falls back to "Saved" rather than to nothing.
    const calls = stubApi({ failAfterNthUpdate: 2 });
    render(<StudyEditor study={STUDY} initialBlocks={[TEXT1]} initialNextAfterPosition={null} tombstoneNotice={NOTICE} />);

    const box = screen.getByLabelText('Text block 1') as HTMLTextAreaElement;

    // Edit 1 -> PATCH 200 -> the block and the header read "Saved" (everSaved <- true).
    fireEvent.change(box, { target: { value: 'Rahab hid the spies, and lied' } });
    await waitFor(
      () => expect(calls.some((c) => c.method === 'PATCH' && c.body.op === 'update_text')).toBe(true),
      { timeout: 3000 },
    );
    expect((await screen.findAllByText('Saved')).length).toBeGreaterThan(0);

    // Edit 2 -> PATCH 500 -> "Save failed below" in the header, "Save failed — Retry" on the block.
    fireEvent.change(box, { target: { value: 'Rahab hid the spies, and lied about it' } });
    await screen.findByRole('button', { name: 'Retry' }, { timeout: 3000 });
    expect(screen.getByText('Save failed below')).toBeTruthy();

    // Remove the failed block (DELETE 200 -> drop()).
    await confirmRemove();
    await waitFor(
      () => expect(calls.some((c) => c.method === 'DELETE')).toBe(true),
      { timeout: 3000 },
    );
    await waitFor(
      () => expect(screen.queryByLabelText('Text block 1')).toBeNull(),
      { timeout: 3000 },
    );

    // SEED: leave the orphaned 'failed' entry -> RED: the header stays on "Save failed below"
    // (or would render nothing if everSaved were false). With the fix, drop() clears the
    // block's save state, so anyFailed is false and everSaved stays true -> the header drops
    // back to the quiet "Saved" status, matching the document's true state.
    expect(screen.queryByText('Save failed below')).toBeNull();
    expect(screen.getAllByText('Saved').length).toBeGreaterThan(0);
  });

  it('removing a local (unsaved) block that failed its CREATE clears the header too', async () => {
    // A never-saved local block whose POST create 500s (non-201) sets saveStates[local-*]='failed'.
    // Removing a local block does not hit the server (drop() runs immediately), so this also
    // covers the isLocal() branch of removeBlock — the same drop() that must clear the entry.
    const calls: Call[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
        calls.push({ url, method, body });
        if (method === 'POST' && url.endsWith('/blocks')) {
          return new Response(JSON.stringify({ error: { code: 'INTERNAL', message: 'x' } }), { status: 500 });
        }
        if (method === 'DELETE') return new Response(JSON.stringify({ ok: true }), { status: 200 });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );

    render(<StudyEditor study={STUDY} initialBlocks={[]} initialNextAfterPosition={null} tombstoneNotice={NOTICE} />);
    // Seed the ghost composer; the first keystroke creates a local-* block and schedules the POST.
    const ghost = screen.getByLabelText('Keep writing at the end of the document');
    fireEvent.change(ghost, { target: { value: 'A doomed draft' } });
    const box = screen.getByLabelText('Text block 1') as HTMLTextAreaElement;
    expect(box.value).toBe('A doomed draft');

    // The create POST fails (500) -> saveStates[local-1] = 'failed' -> header reads "Save failed below".
    await screen.findByRole('button', { name: 'Retry' }, { timeout: 3000 });
    expect(screen.getByText('Save failed below')).toBeTruthy();

    // Remove the local block: isLocal(id) -> drop() runs immediately (no DELETE).
    await confirmRemove();
    await waitFor(
      () => expect(screen.queryByLabelText('Text block 1')).toBeNull(),
      { timeout: 3000 },
    );

    // SEED: drop() never clears saveStates -> RED: "Save failed below" stays pinned though the
    // block is gone. With the fix, the orphaned local-* entry is cleared and the header reflects
    // only the (now-empty) document.
    expect(screen.queryByText('Save failed below')).toBeNull();
  });

  it('removing one of two failed blocks leaves the OTHER block failure showing (G7)', async () => {
    // Two text blocks, both PATCHes 500. Removing ONLY block 1 must NOT clear block 2's header
    // contribution: "Save failed below" stays (block 2 is still failed), and block 2's per-block
    // "Save failed — Retry" alert is still present. Then removing block 2 clears the header.
    //
    // NOTE: aria-labels are `Text block ${i+1}` by index, so after removing the first block the
    // survivor is re-labeled "Text block 1". Track blocks by their textarea VALUE, not by index.
    const calls = stubApi({ failPatches: true });
    const TEXT2: EditorBlock = { ...TEXT1, id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', position: 'W' };
    render(
      <StudyEditor study={STUDY} initialBlocks={[TEXT1, TEXT2]} initialNextAfterPosition={null} tombstoneNotice={NOTICE} />,
    );

    const box1 = screen.getByLabelText('Text block 1') as HTMLTextAreaElement;
    const box2 = screen.getByLabelText('Text block 2') as HTMLTextAreaElement;
    fireEvent.change(box1, { target: { value: 'edit one' } });
    fireEvent.change(box2, { target: { value: 'edit two' } });

    // Both blocks failed; the header is lit and both Retry buttons exist.
    await screen.findAllByRole('button', { name: 'Retry' }, { timeout: 3000 });
    expect(screen.getByText('Save failed below')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(2);

    // Remove ONLY the first block by clicking its Remove control (the first "Remove block N"
    // button in document order), then confirming. Block 1's textarea starts with "edit one".
    const removeButtons = screen.getAllByRole('button', { name: /Remove block \d+/ });
    fireEvent.click(removeButtons[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(
      () => expect(calls.some((c) => c.method === 'DELETE' && c.url.includes(encodeURIComponent(TEXT1.id)))).toBe(true),
      { timeout: 3000 },
    );
    // The first block is gone: its "edit one" textarea is no longer in the document.
    await waitFor(
      () => expect(screen.queryByDisplayValue('edit one')).toBeNull(),
      { timeout: 3000 },
    );

    // SEED: a fix that clears ALL saveStates (rather than per-id) -> RED here, and a fix that
    // doesn't clear anything stays RED on G1. With the correct per-id fix, block 2's failure is
    // untouched, so the header is STILL lit and block 2's Retry is still there.
    expect(screen.getByText('Save failed below')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.getByDisplayValue('edit two')).toBeTruthy();
    // Exactly one text block remains (block 2, now re-indexed to "Text block 1").
    expect(screen.getAllByLabelText(/Text block/)).toHaveLength(1);

    // Now remove the remaining block (block 2, the sole block); the header must clear.
    fireEvent.click(screen.getByRole('button', { name: 'Remove block 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(
      () => expect(screen.queryByDisplayValue('edit two')).toBeNull(),
      { timeout: 3000 },
    );
    expect(screen.queryByText('Save failed below')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});
