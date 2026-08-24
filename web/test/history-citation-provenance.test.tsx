// @vitest-environment jsdom
//
// A COPIED CITATION NAMES THE WORK'S OWN PROVENANCE, NEVER A HARDCODED ONE (W-SEC-CCEL).
//
// The copy-citation button used to append the literal string ` (CCEL)` to EVERY citation —
// Josephus (a CrossWire SWORD module) copied as "(CCEL)", an archive.org work copied as
// "(CCEL)". The sources table is ADR-008/010's provenance registry: every row carries
// `provenance->>'edition'`, and that record — not a string literal in a component — is what a
// citation must name. The assertion below clicks the real button against the real component;
// the edition travels ROW_COLS -> WorkRef -> clipboard, so a break anywhere in that chain
// (column dropped, mapper dropping the field, component reverting to the literal) goes red.
// SEED: restore the hardcoded ` (CCEL)` in history-results.tsx -> RED.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { HistoryResults, type HistoryPayload } from '@/components/history-results';

const writeText = vi.hoisted(() => vi.fn());

const JOSEPHUS_EDITION =
  'The Complete Works of Josephus, tr. William Whiston 1737 (CrossWire SWORD module Josephus, RawGenBook/ThML)';

function payload(): HistoryPayload {
  const section = {
    sectionId: 1, ordinal: 4112, headingPath: ['Book VI', 'Chapter 4'],
    period: [70, 70] as [number, number], excerpt: 'And thus was Jerusalem taken.',
    matched: ['text' as const],
  };
  return {
    interpretation: { entities: [], period: null },
    closest: null,
    results: [
      {
        work: { slug: 'josephus-whiston', title: 'The Complete Works', author: 'Flavius Josephus', edition: JOSEPHUS_EDITION },
        periodSpan: [70, 70],
        sections: [section],
      },
      {
        // No edition recorded — the citation must carry NO provenance suffix, never an invented one.
        work: { slug: 'no-edition-work', title: 'A Work', author: 'An Author', edition: null },
        periodSpan: null,
        sections: [{ ...section, sectionId: 2 }],
      },
    ],
    coverage: { works: 2, sections: 2 },
  };
}

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
});

describe('copy citation derives provenance from the source record', () => {
  it('appends the work’s recorded edition, not a hardcoded (CCEL)', async () => {
    render(<HistoryResults data={payload()} query="temple" threadId={null} />);
    const buttons = screen.getAllByRole('button', { name: 'Copy citation' });
    fireEvent.click(buttons[0]);
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain(JOSEPHUS_EDITION);
    expect(copied).not.toMatch(/^\s*.*\(CCEL\)\s*$/);
  });

  it('a work with no recorded edition copies with no provenance suffix at all', async () => {
    render(<HistoryResults data={payload()} query="temple" threadId={null} />);
    const buttons = screen.getAllByRole('button', { name: 'Copy citation' });
    fireEvent.click(buttons[1]);
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toBe('An Author, A Work, Book VI — Chapter 4');
  });
});
