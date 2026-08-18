// @vitest-environment jsdom
//
// AUDIT #7 — ON A THREAD WITH WITHDRAWALS, AN UNRESOLVABLE VOICE FAILS CLOSED.
//
// The §4.4 belt on a reopened /ask/[id] thread was `if (voiceSid && gone.has(voiceSid))` — so a
// voice whose sourceId could NOT be resolved skipped the withdrawal check entirely and rendered
// its stored quote. The one fail-OPEN path in a subsystem whose stated rule is fail-closed
// everywhere else (servedOf tombstones on error; resolveServability's header says the re-check
// outranks the stored bytes). And unresolvability is not exotic: the verifier passes a quote on a
// normalized match while the resolver used raw/whitespace-collapsed `includes`, so one smart quote
// of typographic drift passed verification and failed resolution.
//
// THE SCOPE IS DELIBERATE AND NARROW: `gone` is non-empty only on a STORED thread that has known
// withdrawals. A live turn withdraws nothing, so an unresolvable voice there is harmless and must
// keep rendering — tombstoning fresh verifier-passed voices would be a mass false positive. The
// rule: withdrawals present + cannot prove this voice is not among them = attribution without the
// quote.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AskClient, type InitialThread } from '../../src/components/ask-client';

vi.mock('../../src/lib/auth/client', () => ({ authClient: { useSession: () => ({ data: null }) } }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({})));
});

// One retrieval row; the voice quotes a DIFFERENT passage with typographic drift, so neither the
// quote tier nor the single-author attribution tier can place it — resolveVoiceSourceId → null.
function thread(withdrawnIds: string[]): InitialThread {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    turns: [{
      question: 'What is grace?',
      askedAt: '2026-08-17T00:00:00.000Z',
      withdrawnIds,
      result: {
        kind: 'composed',
        response: {
          blocks: [{
            type: 'voice',
            attribution: { author: 'John Gill', work: 'Exposition', tradition: 'reformed' },
            quote: 'Grace is the free favour of God — unmerited.',
          }],
        },
        retrieval: [
          { sourceId: 'src-A', score: 1, content: 'An entirely different passage about faith.', metadata: { author: 'John Gill', sourceTitle: 'Exposition', tradition: 'reformed' } },
          { sourceId: 'src-B', score: 0.9, content: 'Another passage.', metadata: { author: 'John Gill', sourceTitle: 'Exposition', tradition: 'reformed' } },
        ],
      },
    }],
  };
}

describe('audit #7 — the withdrawal belt fails closed on unresolvable voices', () => {
  it('withdrawals present + unresolvable voice = attribution, no quote', () => {
    // SEED: restore `voiceSid && gone.has(voiceSid)` -> RED (the quote renders).
    render(<AskClient initialThread={thread(['src-B'])} />);
    expect(screen.getByText(/John Gill/)).toBeTruthy();
    expect(
      screen.queryByText(/free favour of God/),
      'an unresolvable voice rendered its quote past a thread with known withdrawals',
    ).toBeNull();
  });

  it('NO withdrawals = the unresolvable voice still renders — live turns must not regress', () => {
    // The narrowing that keeps this from tombstoning every fresh verifier-passed voice.
    render(<AskClient initialThread={thread([])} />);
    expect(screen.getByText(/free favour of God/)).toBeTruthy();
  });

  it('a RESOLVABLE withdrawn voice still tombstones — the original belt is untouched', () => {
    const t = thread(['src-A']);
    // Make the quote resolvable to src-A by containing it verbatim.
    (t.turns[0]!.result as { retrieval: { content: string }[] }).retrieval[0]!.content =
      'Grace is the free favour of God — unmerited. And more text.';
    render(<AskClient initialThread={t} />);
    expect(screen.queryByText(/free favour of God/)).toBeNull();
  });
});
