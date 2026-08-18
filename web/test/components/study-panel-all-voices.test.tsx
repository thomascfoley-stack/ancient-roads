// @vitest-environment jsdom
//
// Q3 — THE VOICES THE PANEL COUNTS ARE THE VOICES THE PANEL CAN SHOW.
//
// A QA-fleet session opened John 1:1 and read "Showing 10 of 11 voices" with no way to reach the
// 11th. The count is honest and the cap is deliberate — `pickDiverse` rotates over tradition
// buckets so ten slots are not spent on one school — but the panel stated a shortfall and offered
// nothing to do about it, which reads as a broken control rather than a considered selection.
//
// The 11th voice is NOT a retrieval question and this is NOT a retrieval change: `entries` already
// arrives holding all of them, so every one is in the client's hands and merely unrendered. That
// distinction is what keeps this block inside Lane C — a change to what the panel RETRIEVES would
// carry the accuracy diagnostic with it (CLAUDE.md).
//
// ORDER IS APPEND-ONLY, and that is the reason for `[...diverse, ...rest]` rather than a re-run of
// pickDiverse at the larger size: expanding must not reshuffle the ten already on screen under the
// reader's eyes. Test 3 pins that, because it is the property a later "simplification" would break
// without failing anything else.
//
// Also pinned here: the unexplained Gethsemane line that used to sit at the foot of EVERY panel,
// on every verse, with no connection to the verse open (two sessions filed it independently).

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudyPanel } from '../../src/components/study-panel';
import type { CommentaryEntry } from '../../src/lib/bible';

vi.mock('../../src/lib/auth/client', () => ({ authClient: { useSession: () => ({ data: null }) } }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// Distinct traditions and authors so `pickDiverse` has no reason to drop any of them for
// similarity — the cap, not the diversity rule, is what this test is about.
function entries(n: number): CommentaryEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    verseStart: 1,
    verseEnd: 1,
    author: `Author ${i + 1}`,
    year: 1500 + i,
    tradition: `Tradition ${i + 1}`,
    sourceTitle: `Work ${i + 1}`,
    sourceUrl: `https://example.test/${i + 1}`,
    text: `Comment number ${i + 1} on this verse.`,
  }));
}

const props = {
  reference: 'John 1:1',
  verseNum: 1,
  verseText: 'In the beginning was the Word',
  originalWords: null,
  lang: null,
  onClose: () => {},
  annotation: {
    color: null,
    note: '',
    signedIn: false,
    onSetHighlight: () => {},
    onClearHighlight: () => {},
    onSaveNote: () => {},
    onDeleteNote: () => {},
  },
};

describe('Q3 — a stated shortfall comes with a way to close it', () => {
  it('11 voices: ten render, and the 11th is reachable', () => {
    // SEED: drop the expand control, leaving the bare "Showing 10 of 11" line -> RED.
    render(<StudyPanel {...props} entries={entries(11)} />);

    expect(screen.queryByText(/Comment number 11 on this verse/)).toBeNull();
    const more = screen.getByRole('button', { name: /show all 11 voices/i });
    fireEvent.click(more);
    expect(screen.getByText(/Comment number 11 on this verse/)).toBeTruthy();
  });

  it('10 or fewer: no control, because nothing is withheld', () => {
    // Without this the fix could be an always-on button that expands nothing, which would pass
    // test 1 forever.
    render(<StudyPanel {...props} entries={entries(10)} />);
    expect(screen.queryByRole('button', { name: /show all/i })).toBeNull();
    expect(screen.queryByText(/Showing \d+ of \d+ voices/)).toBeNull();
  });

  it('expanding APPENDS — the ten already on screen do not reorder', () => {
    render(<StudyPanel {...props} entries={entries(12)} />);
    const before = screen.getAllByText(/Comment number \d+ on this verse/).map((n) => n.textContent);
    fireEvent.click(screen.getByRole('button', { name: /show all 12 voices/i }));
    const after = screen.getAllByText(/Comment number \d+ on this verse/).map((n) => n.textContent);
    expect(after.slice(0, before.length), 'the visible order changed under the reader').toEqual(before);
    expect(after.length).toBe(12);
  });
});

describe('Q3 — the panel does not end with an unrelated quotation', () => {
  it('no Gethsemane line on a panel opened at John 1:1', () => {
    render(<StudyPanel {...props} entries={entries(3)} />);
    expect(screen.queryByText(/Nevertheless, not as I will/)).toBeNull();
  });
});
