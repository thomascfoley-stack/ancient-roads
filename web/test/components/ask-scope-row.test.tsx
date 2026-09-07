// @vitest-environment jsdom
//
// THE SCOPE CONTROL SURVIVES THE MOVE. Design C (owner, 2026-08-17) made the lane scope always
// visible; the 2026-09-06 redesign moves it from a band above the composer to a line that travels
// with the sticky composer. ADR-023 forbids removing the lanes; §4.7 forbids making them
// display-only. This pins the behaviour that must not change while the markup does: a named group
// of three pressed toggles, and toggling one changes what the NEXT ask sends.
//
// This test is GREEN against the pre-redesign LaneFilter on purpose — it is the guard the move is
// made under. Red-proof: drop `lanes` from the POST body, or the aria-pressed attribute -> RED.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AskClient } from '../../src/components/ask-client';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  Element.prototype.scrollIntoView = vi.fn();
});

function closedStream(lines: string[]) {
  return new ReadableStream({
    start(c) {
      for (const l of lines) c.enqueue(new TextEncoder().encode(l + '\n'));
      c.close();
    },
  });
}

describe('the search scope', () => {
  it('is a named group of three pressed toggles, and a toggle changes the next ask', async () => {
    // Only the ask POST is recorded: other components make body-less GETs on mount.
    const bodies: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (!String(url).includes('/api/ask/stream')) return new Response('{}', { status: 200 });
      if (typeof init?.body === 'string') bodies.push(JSON.parse(init.body));
      return new Response(closedStream([JSON.stringify({ stage: 'done', result: { kind: 'empty', reason: 'ok' } })]), { status: 200 });
    }));
    render(<AskClient />);

    const group = screen.getByRole('group', { name: 'Search these collections' });
    const toggles = within(group).getAllByRole('button', { pressed: true });
    expect(toggles).toHaveLength(3);

    const sermons = toggles.find((b) => /Sermons/.test(b.textContent ?? ''))!;
    fireEvent.click(sermons);
    expect(sermons.getAttribute('aria-pressed')).toBe('false');

    const box = await screen.findByPlaceholderText(/Ask a question/i);
    fireEvent.change(box, { target: { value: 'What is grace?' } });
    fireEvent.submit(box.closest('form')!);
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect((bodies[0] as { lanes: { sermons: boolean; theology: boolean; songVerse: boolean } }).lanes).toEqual({
      sermons: false,
      theology: true,
      songVerse: true,
    });
  });
});
