// @vitest-environment jsdom

// The Show filter (ASK_HISTORY_DESIGN §4.7, owner-ruled variant A, 2026-08-16) and the
// stored-thread rendering, exercised as REAL interactions in a DOM — not grepped for.
// The signed-in browser walk cannot run locally (Neon Auth secrets are production-only,
// WORKLOG 2026-08-16), so the interactions the DoD requires are proven here and the
// end-to-end walk is the owner's post-deploy step.
//
// RED-PROOFS (seeded and watched fail, 2026-08-16, incl. the post-inspector re-proofs):
//   filter: inverted the `show()` guard on the sermons section → hide/unhide cases red.
//   voice tombstone: removed the `gone.has(voiceSid)` branch → composed tombstone case red.
//   fallback tombstone (I1-H1): the case below was written against the PRE-FIX build and
//     watched fail (quote rendered); green only after Fallback learned `gone`.
//   counts (I2-L1): count span deleted → chip-count case red.
//   Show all (I2-L2): made unconditional → only-while-hidden case red.
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AskClient, type InitialThread } from '@/components/ask-client';

afterEach(cleanup);

// jsdom has no scrollIntoView; the client calls it on mount (an effect, not the behavior
// under test).
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});

// Two turns: a composed one (voice tombstone keyed by the retrieval row the voice resolves
// to via resolveVoiceSourceId — the quote text appears in ret-2's content) and a FALLBACK one
// (I1-H1: fallback retrieval rows must tombstone too).
const THREAD: InitialThread = {
  id: '11111111-2222-4333-8444-555555555555',
  turns: [
    {
      question: 'who is the good shepherd?',
      askedAt: '2026-08-14T12:00:00Z',
      withdrawnIds: ['ret-2', 'srm-2'],
      result: {
        kind: 'composed',
        response: {
          blocks: [
            { type: 'framing', text: 'Voices across the traditions address John 10.' },
            {
              type: 'voice',
              attribution: { author: 'Augustine of Hippo', work: 'Homilies on John', slug: 'augustine-homilies', tradition: 'Patristic', year: 410 },
              quote: 'He is the good shepherd who lays down his life for the sheep.',
            },
            {
              type: 'voice',
              attribution: { author: 'John Calvin', work: 'A Withdrawn Work', slug: 'withdrawn-work', tradition: 'Reformed', year: 1550 },
              quote: 'WITHDRAWN COMPOSED QUOTE MUST NOT RENDER.',
            },
          ],
        },
        retrieval: [
          { sourceId: 'ret-1', score: 1, content: 'He is the good shepherd who lays down his life for the sheep.', metadata: { author: 'Augustine of Hippo', sourceTitle: 'Homilies on John', tradition: 'Patristic' } },
          { sourceId: 'ret-2', score: 1, content: 'WITHDRAWN COMPOSED QUOTE MUST NOT RENDER.', metadata: { author: 'John Calvin', sourceTitle: 'A Withdrawn Work', tradition: 'Reformed' } },
        ],
        sermons: [
          { sourceId: 'srm-1', content: 'He calleth his own sheep by name.', metadata: { author: 'C. H. Spurgeon', sourceTitle: 'Sermons', work: 'spurgeon-sermons', register: 'sermon' } },
          { sourceId: 'srm-2', content: 'WITHDRAWN LANE QUOTE MUST NOT RENDER.', metadata: { author: 'B. Withdrawn', sourceTitle: 'Gone Sermons', work: 'gone-sermons', register: 'sermon' } },
        ],
        theology: [
          { sourceId: 'thl-1', content: 'The office of a shepherd is a burden of care.', metadata: { author: 'John Calvin', sourceTitle: 'Institutes', work: 'calvin-institutes', register: 'theology' } },
        ],
      },
    },
    {
      question: 'a question that fell back',
      askedAt: '2026-08-15T12:00:00Z',
      withdrawnIds: ['fb-2'],
      result: {
        kind: 'fallback',
        violations: [],
        retrieval: [
          { sourceId: 'fb-1', score: 1, content: 'A servable fallback source.', metadata: { author: 'Matthew Henry', sourceTitle: 'Commentary', tradition: 'Puritan' } },
          { sourceId: 'fb-2', score: 1, content: 'WITHDRAWN FALLBACK QUOTE MUST NOT RENDER.', metadata: { author: 'W. Gone', sourceTitle: 'Withdrawn Work', tradition: 'Reformed' } },
        ],
      },
    },
  ],
};

function renderThread() {
  return render(<AskClient initialThread={THREAD} />);
}

const chipOf = (label: string) =>
  screen.queryAllByRole('button', { pressed: true }).find((c) => c.textContent?.includes(label));

describe('§4.7 Show filter + stored-thread rendering (variant A)', () => {
  it('stored turns render dated and historical, voices and lanes present', () => {
    renderThread();
    expect(screen.getAllByText(/historical record/).length).toBe(2);
    expect(screen.getByText(/lays down his life/)).toBeTruthy();
    expect(screen.getByText(/calleth his own sheep/)).toBeTruthy();
  });

  it('§4.4 COMPOSED: a withdrawn row keeps its attribution and LOSES its quote', () => {
    renderThread();
    expect(screen.queryByText(/WITHDRAWN COMPOSED QUOTE/)).toBeNull();
    expect(screen.getAllByText(/no longer part of the served corpus/).length).toBeGreaterThan(0);
  });

  it('§4.4 LANE chunks tombstone by sourceId (I1-H1 family)', () => {
    renderThread();
    expect(screen.queryByText(/WITHDRAWN LANE QUOTE/)).toBeNull();
  });

  it('§4.4 FALLBACK turns tombstone too (I1-H1 — the licensing case)', () => {
    renderThread();
    expect(screen.queryByText(/WITHDRAWN FALLBACK QUOTE/)).toBeNull();
    // The servable fallback source still renders — tombstoning is per row, never per turn.
    expect(screen.getByText(/A servable fallback source/)).toBeTruthy();
  });

  it('chips carry REAL counts (I2-L1) and only registers that returned rows get one', () => {
    renderThread();
    // Composed turn: Commentary 2 voices, Sermons 2 chunks, Theology 1. No Hymns, no History.
    expect(chipOf('Commentary')?.textContent).toMatch(/Commentary\s*2/);
    expect(chipOf('Sermons')?.textContent).toMatch(/Sermons\s*2/);
    expect(chipOf('Theology & Confessions')?.textContent).toMatch(/1/);
    const labels = screen.queryAllByRole('button', { pressed: true }).map((c) => c.textContent ?? '');
    expect(labels.some((l) => l.includes('Hymns'))).toBe(false);
    expect(labels.some((l) => l.includes('History') && !l.includes('Hymns'))).toBe(false);
  });

  it('the FALLBACK turn gets a Show row even with one register (owner ruling: no suppression)', () => {
    renderThread();
    // Turn 2 has only Commentary (2 retrieval rows) — its chip must still render.
    const commentaryChips = screen.queryAllByRole('button', { pressed: true }).filter((c) => c.textContent?.includes('Commentary'));
    expect(commentaryChips.length).toBe(2); // one per turn
  });

  it('unchecking Sermons hides that section INSTANTLY; rechecking restores it', () => {
    renderThread();
    const sermonChip = chipOf('Sermons')!;
    fireEvent.click(sermonChip);
    expect(screen.queryByText(/calleth his own sheep/)).toBeNull();
    expect(screen.getByText(/lays down his life/)).toBeTruthy();
    fireEvent.click(sermonChip);
    expect(screen.getByText(/calleth his own sheep/)).toBeTruthy();
  });

  it('"only" isolates; "Show all" appears ONLY while something is hidden (I2-L2) and restores', () => {
    renderThread();
    expect(screen.queryByText('Show all')).toBeNull(); // nothing hidden yet
    const sermonsOnly = screen.getAllByTitle(/Show only Sermons/)[0]!;
    fireEvent.click(sermonsOnly);
    expect(screen.getByText(/calleth his own sheep/)).toBeTruthy();
    expect(screen.queryByText(/lays down his life/)).toBeNull();
    expect(screen.queryByText(/burden of care/)).toBeNull();
    fireEvent.click(screen.getByText('Show all'));
    expect(screen.getByText(/lays down his life/)).toBeTruthy();
    expect(screen.getByText(/burden of care/)).toBeTruthy();
    expect(screen.queryByText('Show all')).toBeNull(); // gone again once everything shows
  });

  it('hiding Commentary hides the framing paragraph with it (deviation D3)', () => {
    renderThread();
    expect(screen.getByText(/Voices across the traditions/)).toBeTruthy();
    fireEvent.click(chipOf('Commentary')!);
    expect(screen.queryByText(/Voices across the traditions/)).toBeNull();
  });

  it('hiding every register states so — never a silently blank pane', () => {
    renderThread();
    for (const label of ['Commentary', 'Sermons', 'Theology']) {
      let chip = chipOf(label);
      while (chip) { fireEvent.click(chip); chip = chipOf(label); }
    }
    expect(screen.getAllByText(/Everything is hidden/).length).toBeGreaterThan(0);
  });
});
