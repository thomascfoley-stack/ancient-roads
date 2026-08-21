'use client';

// The shared text-annotation selection engine (Library Reader Phase 1; design §3).
// Extracted from verse-display.tsx so BOTH readers run one selection→snap→pending pipeline:
// VerseDisplay resolves selections to a verse container (dataset.verseText) today; the Phase-2
// WorkReader resolves them to a section container (dataset.sectionText). The anchor math is the
// tested core in highlight-range.ts; this hook is the thin DOM subscription around it.
//
// Selection-first: rides selectionchange (works on touch AND mouse; native copy still works).
// The caller decides what to mount over `pending` (the selection popover / docked bar).

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { rangeToOffsetsInContainer, snapToWords } from './highlight-range';

/** Delay before a collapsed/unresolvable selection actually clears `pending`. Live measurement
 *  (2026-08 QA) showed the popover can take >1s to mount under main-thread load; clearing the
 *  instant the selection collapses dropped it under any tap/scroll inside that window, which is
 *  the "flaky highlighter" report. A new valid selection still replaces `pending` immediately. */
export const COLLAPSE_GRACE_MS = 1500;

export type AnnotationTargetKind = 'verse' | 'section';

/** The annotatable container a selection resolved to. */
export interface AnnotationTarget {
  kind: AnnotationTargetKind;
  /** Stable key within the surface: the verse number (as a string) for kind='verse';
   *  the section id for kind='section' (Phase 2). */
  key: string;
  /** Length of the canonical text the container renders (v.text / sections.body). */
  textLen: number;
  container: HTMLElement;
}

/** Walk up from a selection boundary node to its annotatable container, or null when the
 *  selection is not inside one. MUST be referentially stable (useCallback) — the hook's
 *  selectionchange subscription re-binds when it changes. */
export type ResolveTarget = (node: Node) => AnnotationTarget | null;

/** Viewport-coordinate bounding rect of the live selection (the popover anchor). */
export interface SelectionRect {
  top: number;
  left: number;
  bottom: number;
  right: number;
  width: number;
  height: number;
}

export interface PendingAnnotation {
  kind: AnnotationTargetKind;
  key: string;
  /** Word-snapped [start, end) character offsets into the canonical container text —
   *  exactly what persists as span_start/span_end. */
  start: number;
  end: number;
  /** The exact canonical substring those offsets denote (copy actions render this). */
  text: string;
  rect: SelectionRect | null;
}

export function useTextAnnotation(
  rootRef: RefObject<HTMLElement | null>,
  resolveTarget: ResolveTarget,
): { pending: PendingAnnotation | null; dismiss: () => void; raise: (p: PendingAnnotation) => void } {
  const [pending, setPending] = useState<PendingAnnotation | null>(null);
  // In a ref (not the effect closure) so `dismiss` — which lives outside the effect — can cancel
  // a scheduled grace clear too.
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    function cancelGrace() {
      if (graceTimer.current) clearTimeout(graceTimer.current);
      graceTimer.current = null;
    }
    function scheduleClear() {
      cancelGrace();
      graceTimer.current = setTimeout(() => setPending(null), COLLAPSE_GRACE_MS);
    }
    function evaluate() {
      // Any fresh selection event supersedes a scheduled clear; the failure paths below
      // re-schedule it, the valid path leaves it cancelled.
      cancelGrace();
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        scheduleClear();
        return;
      }
      const range = sel.getRangeAt(0);
      const target = resolveTarget(range.startContainer);
      if (!target || !rootRef.current?.contains(target.container)) {
        scheduleClear();
        return;
      }
      // The offset invariant (design §3): the container's text nodes concatenate to exactly
      // the canonical text, so it is recoverable from the DOM (clamped to the canonical length).
      const text = (target.container.textContent ?? '').slice(0, target.textLen);
      const raw = rangeToOffsetsInContainer(range, target.container, target.textLen);
      if (!raw) {
        scheduleClear();
        return;
      }
      const snapped = snapToWords(text, raw.start, raw.end);
      if (!snapped) {
        scheduleClear();
        return;
      }
      const r = range.getBoundingClientRect();
      setPending({
        kind: target.kind,
        key: target.key,
        start: snapped.start,
        end: snapped.end,
        text: text.slice(snapped.start, snapped.end),
        rect: { top: r.top, left: r.left, bottom: r.bottom, right: r.right, width: r.width, height: r.height },
      });
    }
    function onChange() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(evaluate, 60);
    }
    document.addEventListener('selectionchange', onChange);
    return () => {
      document.removeEventListener('selectionchange', onChange);
      if (timer) clearTimeout(timer);
      cancelGrace();
    };
  }, [rootRef, resolveTarget]);

  const dismiss = useCallback(() => {
    if (graceTimer.current) clearTimeout(graceTimer.current);
    graceTimer.current = null;
    window.getSelection()?.removeAllRanges();
    setPending(null);
  }, []);

  // Programmatic raise, for flows that produce a span without a DOM selection (tap mode's
  // two-tap anchor→complete in verse-display.tsx). The caller builds exactly the shape the
  // engine's own evaluate() builds, so the popover cannot tell the two paths apart.
  const raise = useCallback((p: PendingAnnotation) => setPending(p), []);

  return { pending, dismiss, raise };
}
