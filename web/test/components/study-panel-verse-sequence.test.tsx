// @vitest-environment jsdom
//
// A027 / A028 — THE STUDY PANEL DID NOT KNOW IT WAS IN A SEQUENCE. Two MAJOR findings from the
// 2026-08-16 QA fleet, and they are one defect seen from two sides:
//
//   A027 — no next/previous control inside the panel, so verse-by-verse reading cost a close, a
//          hunt for the next number on the page behind, and a reopen. Every verse. The panel was
//          already holding a chapter's worth of context it could have stepped through.
//   A028 — the numbers of the neighbouring verses are still LEGIBLE through the 32% scrim and
//          still look like the handles they are, but a click on one landed on the scrim, matched
//          `target === currentTarget`, and closed the panel. Reproduced twice by the reporter.
//
// WHAT THIS FILE CAN AND CANNOT PROVE. `elementsFromPoint` is a LAYOUT query and jsdom implements
// no layout — it does not implement the method at all (measured: `typeof` is `undefined` on a fresh
// jsdom document). So the coordinate -> element-stack mapping is stubbed here, and what is asserted
// is everything on our side of it: given that the browser reports a verse handle under the pointer,
// the panel switches verses instead of closing; given that it reports nothing, the panel still
// closes. The stub is fed the REAL `<sup>` rendered by the REAL VerseDisplay, so the attribute
// contract between the two components is checked rather than assumed — dropping
// `data-verse-handle` from the reading surface turns these red. The pixel-level question (is the
// number actually under the finger) is a browser question and is recorded as such in the WORKLOG,
// the same way drag-handle-swallows-clicks.test.tsx does for pointer capture.
//
// The second half of the file drives the SHIPPED READER PAGE rather than the panel alone, because
// the two properties most likely to rot live in the wiring, not in the panel: which verse is
// "next" (the page derives it from the rendered chapter, so an empty verse is stepped OVER), and
// whether the reader's tab survives a step. A panel-only test would pass with the page passing
// `tab: 'commentaries'` on every navigate, which is precisely the reported experience.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routeRef = vi.hoisted(() => ({
  params: { book: 'jhn', chapter: '1' } as Record<string, string>,
}));
vi.mock('next/navigation', () => ({
  useParams: () => routeRef.params,
  usePathname: () => '/read/jhn/1',
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}));
vi.mock('@/lib/auth/client', () => ({ authClient: { useSession: () => ({ data: null }) } }));

import { StudyPanel, type StudyTab } from '@/components/study-panel';
import { VerseDisplay } from '@/components/verse-display';
import ReaderPage from '@/app/read/[book]/[chapter]/page';
import type { ChapterData } from '@/lib/bible';

// ── the point-to-element stack, which jsdom cannot compute ──────────────────────────────────
// Typed rather than `any`: the method is absent from jsdom's Document, so it is described as the
// optional it actually is here and restored (deleted) afterwards, so no test inherits a stub.
type PointHitTest = { elementsFromPoint?: (x: number, y: number) => Element[] };
function stubStackUnderPointer(stack: Element[]): void {
  (document as unknown as PointHitTest).elementsFromPoint = () => stack;
}
afterEach(() => {
  delete (document as unknown as PointHitTest).elementsFromPoint;
  cleanup();
  vi.unstubAllGlobals();
});

/** `disabled` is read off the ELEMENT, not through jest-dom's `toBeDisabled` — this suite's vitest
 *  config loads no jest-dom, and an `Invalid Chai property` is a thrown error rather than a
 *  failed assertion, which is the shape that quietly turns a real check into noise. */
function stepControl(scope: { getByRole: typeof screen.getByRole }, name: string): HTMLButtonElement {
  return scope.getByRole('button', { name }) as HTMLButtonElement;
}

const annotation = {
  color: null,
  note: '',
  signedIn: false,
  onSetHighlight: () => {},
  onClearHighlight: () => {},
  onSaveNote: () => {},
  onDeleteNote: () => {},
};

const panelProps = {
  reference: 'John 1:2',
  verseNum: 2,
  verseText: 'The same was in the beginning with God.',
  entries: [],
  originalWords: null,
  lang: null,
  annotation,
  onClose: () => {},
};

// ── A027: the stepping controls ─────────────────────────────────────────────────────────────

describe('A027 — the panel steps through the chapter', () => {
  it('offers no stepping controls at all when the caller cannot navigate', () => {
    // Existing callers (and any future one that opens the panel outside a chapter) must not grow
    // two buttons that lead nowhere. Absence here is the honest state, not a boundary.
    render(<StudyPanel {...panelProps} />);
    expect(screen.queryByRole('button', { name: 'Next verse' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Previous verse' })).toBeNull();
  });

  it('steps forward and back to the verses the caller named', () => {
    // SEED: delete the `{onNavigate && (...)}` block from the panel header -> RED (no such
    // buttons). This is the finding itself: there was no control here at all.
    const onNavigate = vi.fn();
    render(<StudyPanel {...panelProps} prevVerse={1} nextVerse={3} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next verse' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous verse' }));
    // The NAMED neighbours, not `verseNum ± 1` — the two differ wherever the chapter has a verse
    // that renders nothing, and the panel must never invent a verse of its own.
    expect(onNavigate.mock.calls).toEqual([[3], [1]]);
  });

  it('disables the control at each end of the chapter rather than leaving a dead button', () => {
    // SEED: drop `disabled={verse === null}` from VerseStepButton -> RED. A live-looking button
    // that does nothing is the "fake door" class this repo files separately; the constraint on
    // this fix was absent-or-disabled, never dead.
    const onNavigate = vi.fn();
    const { rerender } = render(
      <StudyPanel {...panelProps} verseNum={1} prevVerse={null} nextVerse={2} onNavigate={onNavigate} />,
    );
    const first = stepControl(screen, 'Previous verse');
    expect(first.disabled).toBe(true);
    // React does not deliver a click to a disabled form control, so this also pins that nothing
    // fires — the seed above turns the assertion above red first.
    fireEvent.click(first);
    expect(onNavigate).not.toHaveBeenCalled();

    rerender(
      <StudyPanel {...panelProps} verseNum={9} prevVerse={8} nextVerse={null} onNavigate={onNavigate} />,
    );
    const last = stepControl(screen, 'Next verse');
    expect(last.disabled).toBe(true);
    fireEvent.click(last);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('keeps the reader on their tab when the verse changes underneath', () => {
    // SEED: put `verseNum` back in the panel's `useEffect(() => setTab(defaultTab), [...])` deps
    // -> RED. That dep made the panel re-derive the tab on every step, which left the property
    // resting entirely on the CALLER carrying the tab across. Held here, on the panel's own side.
    const { rerender } = render(<StudyPanel {...panelProps} prevVerse={1} nextVerse={3} onNavigate={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
    expect(screen.getByText(/Save notes to your account/)).toBeTruthy();

    // The verse changes; `defaultTab` does not, because the caller is preserving it.
    rerender(
      <StudyPanel
        {...panelProps}
        reference="John 1:3"
        verseNum={3}
        verseText="All things were made by him."
        prevVerse={2}
        nextVerse={4}
        onNavigate={() => {}}
      />,
    );
    expect(screen.getByText(/Save notes to your account/)).toBeTruthy();
  });

  it('still follows the caller when the caller asks for a different tab', () => {
    // The other half of the rule above, and the reason `defaultTab` STAYS in those deps: the
    // `#v16:study` deep link and WordPanel's "show commentary" both change the tab deliberately.
    const { rerender } = render(<StudyPanel {...panelProps} defaultTab={'notes' as StudyTab} />);
    expect(screen.getByText(/Save notes to your account/)).toBeTruthy();
    rerender(<StudyPanel {...panelProps} defaultTab={'commentaries' as StudyTab} />);
    expect(screen.getByText(/No commentary on this verse yet/)).toBeTruthy();
  });
});

// ── A028: the scrim, and what is underneath it ──────────────────────────────────────────────

const chapter: ChapterData = {
  book: 43,
  chapter: 1,
  verses: [
    { verse: 1, text: 'In the beginning was the Word.' },
    { verse: 2, text: 'The same was in the beginning with God.' },
    { verse: 3, text: 'All things were made by him.' },
  ],
};

/** The reading surface and the open panel, exactly as the reader has them: verse numbers behind a
 *  full-screen scrim. The handles come from the SHIPPED VerseDisplay so the `data-verse-handle`
 *  contract the scrim hit-tests against is proven across both files. */
function renderReadingSurfaceWithPanel(onNavigate: () => void, onClose: () => void) {
  const { container } = render(
    <>
      <VerseDisplay
        data={chapter}
        bookName="John"
        translation="web"
        selectedVerse={2}
        onVerseClick={() => {}}
      />
      <StudyPanel {...panelProps} prevVerse={1} nextVerse={3} onNavigate={onNavigate} onClose={onClose} />
    </>,
  );
  const scrim = screen.getByRole('dialog').parentElement!;
  const handle = (n: number) => container.querySelector(`[data-verse-handle="${n}"]`)!;
  return { scrim, handle };
}

describe('A028 — a click on a neighbouring verse number switches verses', () => {
  it('switches to the verse whose handle is under the pointer, and does not close', () => {
    // SEED (either one, independently): restore the scrim's old
    // `if (e.target === e.currentTarget) onClose()` -> RED; or delete `data-verse-handle` from
    // verse-display.tsx -> RED, because the stack below is queried out of the real DOM.
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    const { scrim, handle } = renderReadingSurfaceWithPanel(onNavigate, onClose);
    expect(handle(3)).toBeTruthy();
    stubStackUnderPointer([scrim, handle(3)]);

    fireEvent.click(scrim, { clientX: 120, clientY: 90 });
    expect(onNavigate).toHaveBeenCalledWith(3);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('still closes on a click that is over nothing but the page', () => {
    // Click-outside-to-close is not traded away for the fix: it is the ONLY behaviour that changes
    // for a handle, and everywhere else the scrim answers exactly as it did.
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    const { scrim } = renderReadingSurfaceWithPanel(onNavigate, onClose);
    stubStackUnderPointer([scrim]);

    fireEvent.click(scrim, { clientX: 5, clientY: 5 });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('closes when the browser cannot answer the question at all', () => {
    // No stub: `elementsFromPoint` is genuinely absent here, which is also the case in any engine
    // that does not implement it. The fallback must be the panel's old behaviour, never a guess at
    // a verse. (Without the typeof guard in the panel this throws instead — jsdom has no such
    // method, so this leg is what proves the guard is load-bearing rather than defensive noise.)
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    const { scrim } = renderReadingSurfaceWithPanel(onNavigate, onClose);
    fireEvent.click(scrim, { clientX: 5, clientY: 5 });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('treats a tap on the OPEN verse’s own handle as closing it again', () => {
    // A deliberate rule, not a gap: switching to the verse already shown would be a click that
    // visibly does nothing, and a second tap on the handle you opened with reads as toggling off.
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    const { scrim, handle } = renderReadingSurfaceWithPanel(onNavigate, onClose);
    stubStackUnderPointer([scrim, handle(2)]); // panelProps.verseNum === 2

    fireEvent.click(scrim, { clientX: 60, clientY: 60 });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close or navigate on a click INSIDE the sheet', () => {
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    const { scrim, handle } = renderReadingSurfaceWithPanel(onNavigate, onClose);
    // Even with a handle reported under the pointer: a click that never reached the scrim is not
    // an outside click, and the target check must run before the hit test.
    stubStackUnderPointer([scrim, handle(3)]);

    fireEvent.click(within(screen.getByRole('dialog')).getByText('John 1:2'), { clientX: 60, clientY: 400 });
    expect(onClose).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });
});

// ── the shipped reader page ─────────────────────────────────────────────────────────────────

const BOOK_FILE = {
  translation: 'web',
  book: 43,
  slug: 'jhn',
  chapters: {
    '1': [
      { verse: 1, text: 'In the beginning was the Word.' },
      { verse: 2, text: 'The same was in the beginning with God.' },
      { verse: 3, text: 'All things were made by him.' },
      // A verse the chapter file carries with no text. VerseDisplay renders nothing for it, so
      // "next" from verse 3 must be verse 5 — a step onto 4 would open an empty panel.
      { verse: 4, text: '' },
      { verse: 5, text: 'And the light shineth in darkness.' },
    ],
  },
};

beforeEach(() => {
  routeRef.params = { book: 'jhn', chapter: '1' };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/bible/web/jhn.json')
        ? new Response(JSON.stringify(BOOK_FILE), { status: 200 })
        : // Commentary, original-language and annotation files are not what these legs are about;
          // 404 sends the real code down its own "no data" branches.
          new Response('', { status: 404 }),
    ),
  );
});

async function openVerse(n: number): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('button', { name: `Verse ${n}, read commentary` }));
  return screen.getByRole('dialog');
}

describe('A027/A028 through the reader page', () => {
  it('walks the chapter from inside the panel, skipping a verse that renders nothing', async () => {
    // SEED: drop the `.filter((v) => v.text)` from `studyNeighbours` -> RED at the John 1:5 step,
    // which lands on the blank verse 4 instead and shows an empty panel.
    render(<ReaderPage />);
    const dialog = await openVerse(2);
    expect(within(dialog).getByText('John 1:2')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Next verse' }));
    expect(within(dialog).getByText('John 1:3')).toBeTruthy();
    expect(within(dialog).getByText(/All things were made by him/)).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Next verse' }));
    expect(within(dialog).getByText('John 1:5')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Previous verse' }));
    expect(within(dialog).getByText('John 1:3')).toBeTruthy();
  });

  it('disables the step at each end of the real chapter', async () => {
    render(<ReaderPage />);
    const dialog = await openVerse(1);
    expect(stepControl(within(dialog), 'Previous verse').disabled).toBe(true);
    expect(stepControl(within(dialog), 'Next verse').disabled).toBe(false);

    // Verse 5 is the last one the chapter renders, so Next has nowhere to go from there.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next verse' })); // 2
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next verse' })); // 3
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next verse' })); // 5
    expect(within(dialog).getByText('John 1:5')).toBeTruthy();
    expect(stepControl(within(dialog), 'Next verse').disabled).toBe(true);
  });

  it('carries the reader’s tab across a step, on the page’s side too', async () => {
    // SEED: make `navigateStudy` pass a fixed `tab: 'commentaries'` -> RED. This is the leg the
    // panel-level tab test cannot make: the page owns `study.tab`, and dropping it there is the
    // shape the reported experience actually had.
    render(<ReaderPage />);
    const dialog = await openVerse(2);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Notes' }));
    expect(within(dialog).getByText(/Save notes to your account/)).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Next verse' }));
    expect(within(dialog).getByText('John 1:3')).toBeTruthy();
    expect(within(dialog).getByText(/Save notes to your account/)).toBeTruthy();
  });

  it('switches verses when a verse number behind the scrim is clicked', async () => {
    render(<ReaderPage />);
    const dialog = await openVerse(2);
    const handle = document.querySelector('[data-verse-handle="3"]')!;
    stubStackUnderPointer([dialog.parentElement!, handle]);

    fireEvent.click(dialog.parentElement!, { clientX: 120, clientY: 90 });
    // Still open — the reported behaviour was that it silently vanished — and now showing the
    // verse that was clicked.
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByText('John 1:3')).toBeTruthy());
  });

  it('still closes when the click lands on the scrim over nothing', async () => {
    render(<ReaderPage />);
    const dialog = await openVerse(2);
    stubStackUnderPointer([dialog.parentElement!]);

    fireEvent.click(dialog.parentElement!, { clientX: 5, clientY: 5 });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
