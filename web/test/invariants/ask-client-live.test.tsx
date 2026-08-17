// @vitest-environment jsdom

// Exhaustive-pass part 2 (owner directive 2026-08-16, task #31): the LIVE ask path —
// the streaming state machine, the thread-URL swap, the saved signal, the follow-up body —
// exercised through a mocked NDJSON fetch, which is the layer inspector 2's M3 named as
// wholly untested. Findings documented before fixes in build-findings-2026-08-16.md.
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AskClient, type InitialThread } from '@/components/ask-client';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});

type Ev = Record<string, unknown>;
function ndjsonResponse(events: Ev[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder();
      for (const e of events) c.enqueue(enc.encode(JSON.stringify(e) + '\n'));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
}

const DONE_EMPTY: Ev = { stage: 'done', result: { kind: 'empty', reason: 'nothing found for the fixture' } };
const THREAD_EV: Ev = { stage: 'thread', threadId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' };

function mockAskFetch(events: Ev[]) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} });
    return ndjsonResponse(events);
  }));
  return calls;
}

async function askLive(question = 'live question') {
  render(<AskClient />);
  fireEvent.change(screen.getByLabelText('Ask a question'), { target: { value: question } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  await waitFor(() => expect(screen.queryByText(/nothing found for the fixture|stopped partway|failed to answer/)).toBeTruthy(), { timeout: 3000 });
}

describe('live ask path — stream, thread URL, saved signal (exhaustive pass)', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/ask');
  });

  it('L1: the thread event swaps the URL to /ask/{id} via replaceState — no new history entry', async () => {
    mockAskFetch([THREAD_EV, DONE_EMPTY, { stage: 'saved', ok: true }]);
    const before = window.history.length;
    await askLive();
    expect(window.location.pathname).toBe('/ask/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    expect(window.history.length).toBe(before);
  });

  it('L2: without a thread event the URL stays /ask (persistence down ≠ broken ask)', async () => {
    mockAskFetch([DONE_EMPTY, { stage: 'saved', ok: false }]);
    await askLive();
    expect(window.location.pathname).toBe('/ask');
  });

  it('L3: saved:false renders the not-saved notice; saved:true renders none', async () => {
    mockAskFetch([DONE_EMPTY, { stage: 'saved', ok: false }]);
    await askLive();
    expect(screen.getByText(/wasn’t saved to your research history/)).toBeTruthy();
    cleanup();
    mockAskFetch([THREAD_EV, DONE_EMPTY, { stage: 'saved', ok: true }]);
    await askLive();
    expect(screen.queryByText(/wasn’t saved/)).toBeNull();
  });

  it('L4: the follow-up POST carries the threadId from the first ask', async () => {
    const calls = mockAskFetch([THREAD_EV, DONE_EMPTY, { stage: 'saved', ok: true }]);
    await askLive('first');
    expect(calls[0]!.body.threadId).toBeUndefined();
    fireEvent.change(screen.getByLabelText('Ask a question'), { target: { value: 'second' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    await waitFor(() => expect(calls.length).toBe(2));
    expect(calls[1]!.body.threadId).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
  });

  it('L5: a stream that ends with no done/error resolves to the terminal-state guard', async () => {
    mockAskFetch([{ stage: 'retrieving' }]);
    await askLive();
    expect(screen.getByText(/stopped partway/)).toBeTruthy();
  });

  it('L6: an error event renders the error and a retry that re-asks THIS question', async () => {
    const calls = mockAskFetch([{ stage: 'error', message: 'The teacher failed to answer. Please try again.' }]);
    await askLive('the question to retry');
    fireEvent.click(screen.getByRole('button', { name: /Ask again/ }));
    await waitFor(() => expect(calls.length).toBe(2));
    expect(calls[1]!.body.question).toBe('the question to retry');
  });

  it('L7: a 401 renders the sign-in prompt, not a crash', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    render(<AskClient />);
    fireEvent.change(screen.getByLabelText('Ask a question'), { target: { value: 'q' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    await waitFor(() => expect(screen.getByText(/sign in/i)).toBeTruthy());
  });

  it('L8: an initialThread mounts with its id armed — the FIRST live ask already appends', async () => {
    const calls = mockAskFetch([DONE_EMPTY, { stage: 'saved', ok: true }]);
    const initialThread: InitialThread = {
      id: '99999999-8888-4777-8666-555555555555',
      turns: [{ question: 'stored q', askedAt: '2026-08-14T12:00:00Z', result: { kind: 'empty', reason: 'stored' }, withdrawnIds: [] }],
    };
    render(<AskClient initialThread={initialThread} />);
    fireEvent.change(screen.getByLabelText('Ask a question'), { target: { value: 'follow-up' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0]!.body.threadId).toBe('99999999-8888-4777-8666-555555555555');
  });

  it('L9: filter state is ephemeral — a remount starts with everything visible (§4.7)', async () => {
    const initialThread: InitialThread = {
      id: '99999999-8888-4777-8666-555555555555',
      turns: [{
        question: 'q', askedAt: '2026-08-14T12:00:00Z', withdrawnIds: [],
        result: {
          kind: 'fallback', violations: [],
          retrieval: [{ sourceId: 'r1', score: 1, content: 'VISIBLE SOURCE TEXT', metadata: { author: 'A', sourceTitle: 'T', tradition: null } }],
          sermons: [{ sourceId: 's1', content: 'SERMON TEXT', metadata: { author: 'B', sourceTitle: 'S' } }],
        },
      }],
    };
    const { unmount } = render(<AskClient initialThread={initialThread} />);
    const chip = screen.queryAllByRole('group', { name: 'Show collections' })
      .flatMap((g) => within(g).queryAllByRole('button', { pressed: true }))
      .find((c) => c.textContent?.includes('Sermons'))!;
    fireEvent.click(chip);
    expect(screen.queryByText('SERMON TEXT')).toBeNull();
    unmount();
    render(<AskClient initialThread={initialThread} />);
    expect(screen.getByText('SERMON TEXT')).toBeTruthy();
  });

  it('L10: a live composed answer renders voices AND the Show row appears with it', async () => {
    mockAskFetch([THREAD_EV, {
      stage: 'done',
      result: {
        kind: 'composed',
        response: { blocks: [
          { type: 'framing', text: 'One voice speaks.' },
          { type: 'voice', attribution: { author: 'Augustine', work: 'Homilies', tradition: 'Patristic', year: 410 }, quote: 'LIVE QUOTE RENDERS.' },
        ] },
        retrieval: [{ sourceId: 'r1', score: 1, content: 'LIVE QUOTE RENDERS.', metadata: { author: 'Augustine', sourceTitle: 'Homilies', tradition: 'Patristic' } }],
      },
    }, { stage: 'saved', ok: true }]);
    render(<AskClient />);
    fireEvent.change(screen.getByLabelText('Ask a question'), { target: { value: 'q' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    await waitFor(() => expect(screen.getByText(/LIVE QUOTE RENDERS/)).toBeTruthy());
    // Scoped to the Show group: unscoped, this would go vacuously green if the search band
    // ever rendered Commentary as a pressed button (mutation-verifier finding, 2026-08-17).
    expect(
      screen.queryAllByRole('group', { name: 'Show collections' })
        .flatMap((g) => within(g).queryAllByRole('button', { pressed: true }))
        .some((c) => c.textContent?.includes('Commentary')),
    ).toBe(true);
  });

  it('L11: a live turn never shows the historical-record stamp', async () => {
    mockAskFetch([THREAD_EV, DONE_EMPTY, { stage: 'saved', ok: true }]);
    await askLive();
    expect(screen.queryByText(/historical record/)).toBeNull();
  });

  it('L12: a malformed NDJSON line is skipped without killing the stream', async () => {
    const calls = mockAskFetch([]);
    void calls;
    vi.stubGlobal('fetch', vi.fn(async () => {
      const enc = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(enc.encode('THIS IS NOT JSON\n'));
          c.enqueue(enc.encode(JSON.stringify(DONE_EMPTY) + '\n'));
          c.close();
        },
      });
      return new Response(body, { status: 200 });
    }));
    render(<AskClient />);
    fireEvent.change(screen.getByLabelText('Ask a question'), { target: { value: 'q' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    await waitFor(() => expect(screen.getByText(/nothing found for the fixture/)).toBeTruthy());
  });
});
