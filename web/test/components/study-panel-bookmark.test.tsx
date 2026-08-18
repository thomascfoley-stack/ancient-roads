// @vitest-environment jsdom
//
// B022 — THE BOOKMARK FEATURE EXISTS; NO PERSISTENT CHROME ADMITS IT.
//
// The 2026-08-17 QA pass filed "a working bookmark feature does exist — it has no icon or button
// anywhere in persistent chrome; reachable only through an easy-to-miss text-selection popover."
// Verified before fixing (ten findings this cycle were false; this one is not): the only control
// wired to `onToggleBookmark` was SelectionPopover, which renders only while a text selection is
// live. The verse study panel — the chrome a reader actually opens on a verse, which already
// carries the highlight row — offered nothing, even though bookmarked verses carry a visible `⚑`
// (verse-display.tsx) and the write path has been a toggle all along.
//
// So the panel gains the toggle, beside the highlight controls it already shows. The props are
// SIBLINGS of `annotation`, not members of it, because `AnnotationControls` is declared in
// commentary-panel.tsx and shared with that file's own surfaces — widening a shared interface for
// one caller's new control is how optional fields nobody else honours accumulate. Optional, so
// every existing caller (and these suites' fixtures) is untouched.
//
// The labels are B023's convention exactly ("Bookmark" / "Remove bookmark"): the control says
// which way the toggle will go, and the two surfaces must not name the same action differently.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudyPanel } from '../../src/components/study-panel';

vi.mock('../../src/lib/auth/client', () => ({ authClient: { useSession: () => ({ data: null }) } }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function annotation(signedIn: boolean) {
  return {
    color: null,
    note: '',
    signedIn,
    onSetHighlight: () => {},
    onClearHighlight: () => {},
    onSaveNote: () => {},
    onDeleteNote: () => {},
  };
}

const panelProps = {
  reference: 'John 3:16',
  verseNum: 16,
  verseText: 'For God so loved the world',
  entries: [],
  originalWords: null,
  lang: null,
  onClose: () => {},
};

describe('B022 — the study panel offers the bookmark toggle', () => {
  it('renders the toggle and one press toggles the verse', () => {
    // SEED (red-proof): the panel before this change renders NO bookmark control at all -> RED
    // on getByRole.
    const onToggleBookmark = vi.fn();
    render(
      <StudyPanel
        {...panelProps}
        annotation={annotation(true)}
        bookmarked={false}
        onToggleBookmark={onToggleBookmark}
      />,
    );
    const btn = screen.getByRole('button', { name: /^Bookmark$/i });
    fireEvent.click(btn);
    expect(onToggleBookmark).toHaveBeenCalledTimes(1);
  });

  it('says REMOVE when the verse is already bookmarked (B023 convention)', () => {
    // Without this, a static "Bookmark" label would pass test 1 forever and reintroduce exactly
    // the statelessness B023 closed on the popover.
    render(
      <StudyPanel
        {...panelProps}
        annotation={annotation(true)}
        bookmarked
        onToggleBookmark={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /remove bookmark/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Bookmark$/i })).toBeNull();
  });

  it('offers nothing signed out — the row already offers sign-in instead', () => {
    // Same gate as the popover (verse-display.tsx wires onBookmark only when signedIn): an
    // optimistic toggle whose POST will 401 is a control that appears to work and silently
    // does not.
    render(
      <StudyPanel
        {...panelProps}
        annotation={annotation(false)}
        bookmarked={false}
        onToggleBookmark={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /bookmark/i })).toBeNull();
    expect(screen.getByText(/Sign in to highlight/)).toBeTruthy();
  });

  it('offers nothing when the caller wires no handler', () => {
    // Existing callers pass no bookmark props; they must not grow a dead control.
    render(<StudyPanel {...panelProps} annotation={annotation(true)} />);
    expect(screen.queryByRole('button', { name: /bookmark/i })).toBeNull();
  });
});
