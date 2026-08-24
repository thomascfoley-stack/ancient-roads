'use client';
// <VerseRef> — a Scripture reference you can actually read, in place.
//
// Built for the reading-plan day list, where one day of a topical plan cites up to ~18 passages
// and the list was previously a wall of references with no way to read any of them: you could see
// that Nave's cites 1 Kings 18:24-39 under PRAYER, but not what it says, without leaving the plan.
// Deliberately generic — it takes verse ids and a label, not a PlanReading — so search results,
// commentary anchors and /ask answers can adopt it later without a second design pass.
//
// TWO PRESENTATIONS, CHOSEN BY INPUT AND NOT BY WIDTH:
//   hover + fine pointer -> a floating card on hover-intent, dismissed on leave
//   everything else      -> a bottom sheet on tap
// `(hover: hover) and (pointer: fine)` is the honest question — "does this input device have a
// hover state at all" — where a width breakpoint only guesses at it. A touchscreen laptop at
// 1400px has no hover to preview with, and a narrow window on a desktop still does.
//
// The capability defaults to FALSE and is raised in an effect, so the server and the first client
// render agree and no hover-only markup depends on something the server cannot know.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DialogPanel } from '@/lib/use-dialog';
import { createPortal } from 'react-dom';
import { PassageView, type PassageStatus } from '@/components/passage-view';
import { placePopover, type Placement } from '@/lib/popover-position';
import {
  chaptersInSpan,
  FALLBACK_TRANSLATION,
  fetchSpanVerses,
  translationName,
  MAX_PREVIEW_CHAPTERS,
  type PassageTarget,
  type PreviewVerse,
} from '@/lib/verse-preview';

// Long enough that dragging a pointer down a list of 18 references does not fire 18 previews,
// short enough that deliberately resting on one feels answered rather than delayed.
const HOVER_INTENT_MS = 160;
// Grace after leaving the reference, so the pointer can travel into the card without it vanishing.
const LEAVE_GRACE_MS = 140;

type Mode = 'idle' | 'card' | 'sheet';

export function VerseRef({
  verseStart,
  verseEnd,
  label,
  translation,
  onOpen,
  className,
  active = false,
}: {
  verseStart: number;
  verseEnd: number;
  /** The rendered reference text. The caller owns the formatting — this never re-derives it. */
  label: string;
  translation: string;
  /** Raise this passage into the reader pane. */
  onOpen: (target: PassageTarget) => void;
  className?: string;
  /** Marks this reference as the one already open in the pane. */
  active?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [canHover, setCanHover] = useState(false);
  const [mode, setMode] = useState<Mode>('idle');
  const [status, setStatus] = useState<PassageStatus>('loading');
  const [verses, setVerses] = useState<PreviewVerse[]>([]);
  const [placement, setPlacement] = useState<Placement | null>(null);
  // The translation THIS preview is reading. Starts as the reader's own and can be switched to
  // the fallback when their translation has no such verse, without changing their setting.
  const [activeTx, setActiveTx] = useState(translation);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const enterTimer = useRef<number | null>(null);
  const leaveTimer = useRef<number | null>(null);

  const span = useMemo(() => chaptersInSpan(verseStart, verseEnd), [verseStart, verseEnd]);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    setCanHover(mq.matches);
    const onChange = (e: MediaQueryListEvent) => {
      setCanHover(e.matches);
      // A card raised by hover is dismissed by leaving it. If hover stops existing while one is
      // open — a 2-in-1 folding into tablet mode, a window dragged to a touchscreen — nothing
      // would ever dismiss it, so it strands on top of the page. Observed by resizing mid-hover.
      if (!e.matches) setMode('idle');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const clearTimers = useCallback(() => {
    if (enterTimer.current !== null) window.clearTimeout(enterTimer.current);
    if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
    enterTimer.current = null;
    leaveTimer.current = null;
  }, []);

  // Timers outlive the component if a list re-renders mid-hover; without this the callback fires
  // setState on an unmounted node.
  useEffect(() => clearTimers, [clearTimers]);

  // A different reference (or a different translation) invalidates whatever was fetched.
  useEffect(() => {
    setVerses([]);
    setStatus('loading');
    setActiveTx(translation);
  }, [verseStart, verseEnd, translation]);

  // The fetch is REACTIVE, keyed on what is being shown rather than kicked off by the handler
  // that opened it. An imperative load() fired once from show() could not see a later change of
  // translation, so switching to the fallback left the old empty state on screen until the next
  // hover. Same shape PassagePane already uses.
  useEffect(() => {
    if (mode === 'idle') return;
    if (span.slices.length === 0) {
      setStatus('unresolved');
      return;
    }
    let live = true;
    setStatus('loading');
    fetchSpanVerses(span, activeTx)
      .then((got) => {
        // A slow fetch for a reference the pointer has already left must not overwrite the
        // current one when it finally lands.
        if (!live) return;
        setVerses(got);
        setStatus(got.length > 0 ? 'ready' : 'empty');
      })
      .catch(() => {
        // No silent failure: the view says the passage could not be loaded rather than showing
        // an empty box that reads as "this reference has no text".
        if (live) setStatus('error');
      });
    return () => {
      live = false;
    };
  }, [mode, span, activeTx]);

  const show = useCallback(
    (next: Mode) => {
      clearTimers();
      setMode(next);
    },
    [clearTimers],
  );

  const hide = useCallback(() => {
    clearTimers();
    setMode('idle');
  }, [clearTimers]);

  // Place the card against the trigger, and re-place it when the content arrives (the height
  // changes from skeleton to text) or the page moves under it.
  useLayoutEffect(() => {
    if (mode !== 'card') {
      setPlacement(null);
      return;
    }
    const reposition = () => {
      const trigger = triggerRef.current;
      const card = cardRef.current;
      if (!trigger || !card) return;
      const a = trigger.getBoundingClientRect();
      setPlacement(
        placePopover(
          { top: a.top, left: a.left, bottom: a.bottom, right: a.right, width: a.width, height: a.height },
          { width: card.offsetWidth, height: card.offsetHeight },
          { width: window.innerWidth, height: window.innerHeight },
        ),
      );
    };
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [mode, status, verses.length]);

  useEffect(() => {
    if (mode === 'idle') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, hide]);

  const openPane = () => {
    hide();
    onOpen({ verseStart, verseEnd, label });
  };

  const note = span.truncated
    ? `Showing the first ${MAX_PREVIEW_CHAPTERS} of ${span.totalChapters} chapters. Open it to read the rest.`
    : undefined;

  const body = (
    <PassageView
      status={status}
      verses={verses}
      note={note}
      translationName={translationName(activeTx)}
      fallback={
        activeTx === FALLBACK_TRANSLATION
          ? undefined
          : { name: translationName(FALLBACK_TRANSLATION), onSelect: () => setActiveTx(FALLBACK_TRANSLATION) }
      }
    />
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (canHover ? openPane() : show('sheet'))}
        onPointerEnter={(e) => {
          if (!canHover || e.pointerType === 'touch') return;
          clearTimers();
          enterTimer.current = window.setTimeout(() => show('card'), HOVER_INTENT_MS);
        }}
        onPointerLeave={() => {
          if (!canHover) return;
          clearTimers();
          leaveTimer.current = window.setTimeout(hide, LEAVE_GRACE_MS);
        }}
        aria-expanded={mode !== 'idle'}
        className={`rounded text-left underline decoration-dotted decoration-stone-300 underline-offset-4 transition-colors ease-gentle hover:decoration-accent-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600 dark:decoration-stone-600 ${
          active ? 'text-accent-700 decoration-accent-500 dark:text-accent-300' : ''
        } ${className ?? ''}`}
      >
        {label}
      </button>

      {mounted &&
        mode === 'card' &&
        createPortal(
          <div
            ref={cardRef}
            role="tooltip"
            onPointerEnter={clearTimers}
            onPointerLeave={() => {
              clearTimers();
              leaveTimer.current = window.setTimeout(hide, LEAVE_GRACE_MS);
            }}
            style={{
              position: 'fixed',
              top: placement?.top ?? 0,
              left: placement?.left ?? 0,
              // Until measured, the card is laid out but not painted — otherwise the first frame
              // flashes at 0,0 before placement lands.
              visibility: placement ? 'visible' : 'hidden',
            }}
 className="z-50 w-80 max-w-[calc(100vw-1rem)] rounded-xl border edge bg-paper p-3 dark:bg-stone-900"
          >
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">{label}</p>
            <div className="max-h-64 overflow-y-auto overscroll-contain">{body}</div>
 <p className="mt-2 border-t edge pt-2 text-xs text-stone-500 dark:text-stone-400">
              Click to open it beside the plan
            </p>
          </div>,
          document.body,
        )}

      {mounted &&
        mode === 'sheet' &&
        createPortal(
          // D40 (DEEP_SWEEP): this outer div CLAIMED role="dialog" aria-modal="true" while
          // focus was never moved in and Tab was never trapped — the sheet's own Close and
          // "Open in reader" sat at the END of body's tab order behind the entire
          // focusable page. The promise now lives on the panel that actually enforces it.
          <div className="fixed inset-0 z-50 flex items-end">
            <button
              type="button"
              aria-label="Close passage"
              onClick={hide}
              // PRD §6 scrims: rgba(26,20,15,0.32) light / rgba(251,248,242,0.08) dark, no blur.
              className="absolute inset-0 bg-stone-950/[0.32] dark:bg-stone-50/[0.08]"
            />
            <DialogPanel
              label={label}
              onClose={hide}
              className="relative max-h-[70vh] w-full overflow-y-auto overscroll-contain rounded-t-2xl border-t edge bg-paper p-4 dark:bg-stone-900"
            >
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <p className="font-semibold text-stone-900 dark:text-stone-100">{label}</p>
                <button type="button" onClick={hide} className="text-sm text-stone-500 dark:text-stone-400">
                  Close
                </button>
              </div>
              {body}
              {/* PRD §6 primary CTA: hairline-bordered, square, no fill until hover — and the
                  hover fill is instant (PRD §7: no transition on background). */}
              <button
                type="button"
                onClick={openPane}
                className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center border border-stone-900 px-5 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 dark:border-stone-200 dark:text-stone-200 dark:hover:bg-stone-200 dark:hover:text-stone-900"
              >
                Open in reader
              </button>
            </DialogPanel>
          </div>,
          document.body,
        )}
    </>
  );
}
