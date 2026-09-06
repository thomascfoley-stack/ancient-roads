// @vitest-environment jsdom
//
// NOTES LEAK — an unsaved note typed on verse A carries over to verse B and can be saved onto
// the wrong verse. The StudyPanel stays mounted across a verse step (A027 navigation without
// unmounting the panel), and NotesTab held the textarea in local `useState` synced back to the
// prop only via `useEffect(() => setText(annotation.note), [annotation.note])`. The parent
// passes `note: notes.get(verse) ?? ''`, so two note-less verses share the SAME empty-string
// value; on a step between two such verses the effect sees `'' → ''`, React skips it, and the
// previously-typed draft is never cleared from the textarea. The Save button is wired to the
// CURRENT verse's `onSaveNote`, so a tap on it writes verse A's draft onto verse B.
//
// Reachability preconditions the tests honour: `NotesTab` short-circuits to a sign-in branch on
// `!signedIn` and a load-failed branch on `loadFailed`, so the editor (and this bug) is only
// reachable when `signedIn: true` AND `loadFailed: false`. Every fixture here sets both — this
// file is the only signed-in `NotesTab` editor test in the suite, which is why the leak went
// undetected (the existing `study-panel-verse-sequence` stepping test uses `signedIn: false`).
//
// The fix is `key={verseNum}` on `<NotesTab>` in study-panel.tsx, which remounts the editor per
// verse so `useState(annotation.note)` re-initialises from the new note on every step. Each test
// here pins one behavior that the key is load-bearing for; remove the key and all three go RED.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StudyPanel } from '@/components/study-panel';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A signed-in, loaded `AnnotationControls` fixture; only `note` / `onSaveNote` are overridden
 *  per verse, because those are the surfaces the bug lives on. */
function annotationFor(verse: { note: string; onSaveNote: (body: string) => void }) {
  return {
    color: null,
    note: verse.note,
    signedIn: true,
    loadFailed: false,
    onSetHighlight: () => {},
    onClearHighlight: () => {},
    onSaveNote: verse.onSaveNote,
    onDeleteNote: () => {},
  };
}

const panelProps = {
  reference: 'John 1:1',
  verseText: 'In the beginning was the Word.',
  entries: [],
  originalWords: null,
  lang: null,
  defaultTab: 'notes' as const,
  onClose: () => {},
};

describe('NotesTab — an unsaved draft does not leak across a verse step', () => {
  it('clears the textarea when stepping from a verse with an unsaved draft to one with no note', () => {
    // SEED: remove the `key={verseNum}` from `<NotesTab>` in study-panel.tsx -> RED. Without the
    // key the panel instance (and its `NotesTab` child) is reused across the step, and the
    // `useEffect(() => setText(annotation.note), [annotation.note])` sees `'' → ''` and skips,
    // leaving the draft from verse 1 in the textarea under verse 2's header.
    const { rerender } = render(
      <StudyPanel
        {...panelProps}
        verseNum={1}
        prevVerse={null}
        nextVerse={2}
        onNavigate={() => {}}
        annotation={annotationFor({ note: '', onSaveNote: () => {} })}
      />,
    );

    const ta = screen.getByLabelText('Note on this verse') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'note for verse 1' } });
    expect(ta.value).toBe('note for verse 1');

    // A step: same panel instance, new verse, another `note: ''` — exactly what `navigateStudy`
    // produces on the reader page when two consecutive verses both have no note.
    rerender(
      <StudyPanel
        {...panelProps}
        reference="John 1:2"
        verseNum={2}
        verseText="The same was in the beginning with God."
        prevVerse={1}
        nextVerse={3}
        onNavigate={() => {}}
        annotation={annotationFor({ note: '', onSaveNote: () => {} })}
      />,
    );

    const taAfter = screen.getByLabelText('Note on this verse') as HTMLTextAreaElement;
    expect(taAfter.value).toBe(''); // expected: cleared for the new verse
  });

  it("does not save the leaked draft onto verse B's handler when Save is tapped after a step", () => {
    // SEED: remove `key={verseNum}` from `<NotesTab>` -> RED. With the leak in place the leaked
    // draft keeps the Save button ENABLED under verse 2, and the button is wired to verse 2's
    // `onSaveNote`, so the click writes verse 1's text onto verse 2. This is the corruption class
    // — verse A's draft persisted under verse B's verseId on the server.
    const onSaveVerseOne = vi.fn();
    const onSaveVerseTwo = vi.fn();
    const { rerender } = render(
      <StudyPanel
        {...panelProps}
        verseNum={1}
        prevVerse={null}
        nextVerse={2}
        onNavigate={() => {}}
        annotation={annotationFor({ note: '', onSaveNote: onSaveVerseOne })}
      />,
    );

    fireEvent.change(screen.getByLabelText('Note on this verse'), {
      target: { value: 'note for verse 1' },
    });

    rerender(
      <StudyPanel
        {...panelProps}
        reference="John 1:2"
        verseNum={2}
        verseText="The same was in the beginning with God."
        prevVerse={1}
        nextVerse={3}
        onNavigate={() => {}}
        annotation={annotationFor({ note: '', onSaveNote: onSaveVerseTwo })}
      />,
    );

    // Verse 2 has no note, so Save must be INERT: it must never reach either verse's handler.
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect(onSaveVerseTwo).not.toHaveBeenCalled();
    expect(onSaveVerseOne).not.toHaveBeenCalled();
  });

  it("does not resurrect verse 1's discarded draft when stepping back from verse 2", () => {
    // SEED: remove `key={verseNum}` from `<NotesTab>` -> RED. The `key`-based remount means each
    // return to a verse is a FRESH mount, so an unmounted draft stays discarded. A scheme that
    // preserved the child across steps would surface the stale local state again on the return.
    const { rerender } = render(
      <StudyPanel
        {...panelProps}
        verseNum={1}
        prevVerse={null}
        nextVerse={2}
        onNavigate={() => {}}
        annotation={annotationFor({ note: '', onSaveNote: () => {} })}
      />,
    );
    fireEvent.change(screen.getByLabelText('Note on this verse'), {
      target: { value: 'draft for verse 1' },
    });

    rerender(
      <StudyPanel
        {...panelProps}
        reference="John 1:2"
        verseNum={2}
        verseText="The same was in the beginning with God."
        prevVerse={1}
        nextVerse={3}
        onNavigate={() => {}}
        annotation={annotationFor({ note: '', onSaveNote: () => {} })}
      />,
    );

    // Step BACK to verse 1 (still no server note for verse 1).
    rerender(
      <StudyPanel
        {...panelProps}
        reference="John 1:1"
        verseNum={1}
        prevVerse={null}
        nextVerse={2}
        onNavigate={() => {}}
        annotation={annotationFor({ note: '', onSaveNote: () => {} })}
      />,
    );
    expect((screen.getByLabelText('Note on this verse') as HTMLTextAreaElement).value).toBe('');
  });
});
