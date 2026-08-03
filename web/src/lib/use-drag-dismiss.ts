'use client';

import { useCallback, useRef, useState } from 'react';

// Drag-to-dismiss for bottom sheets. Attach `handleProps` to the sheet's
// header/handle area and `style` to the sheet itself; dragging down past the
// threshold (or flicking) calls onDismiss, otherwise the sheet springs back.
export function useDragDismiss(onDismiss: () => void) {
  const [dy, setDy] = useState(0);
  const dragging = useRef(false);
  const startY = useRef(0);
  const lastY = useRef(0);
  const lastT = useRef(0);
  const velocity = useRef(0);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // A press that STARTS on a control belongs to that control, not to the sheet. Without this
    // guard the `setPointerCapture` below retargets every subsequent pointer event (pointerup
    // included) to the element carrying handleProps, so the browser computes the click target as
    // the header rather than the button inside it and the button's onClick NEVER FIRES. Every
    // close button that sits inside a drag handle was therefore dead: study-panel, work-toc,
    // mobile-nav, and the word-study sheet all spread handleProps onto a header that contains
    // their X. Dragging the header's empty space still works, because that target is not a control.
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea, [role="button"]')) {
      return;
    }
    dragging.current = true;
    startY.current = e.clientY;
    lastY.current = e.clientY;
    lastT.current = e.timeStamp;
    velocity.current = 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dt = e.timeStamp - lastT.current;
    if (dt > 0) velocity.current = (e.clientY - lastY.current) / dt;
    lastY.current = e.clientY;
    lastT.current = e.timeStamp;
    setDy(Math.max(0, e.clientY - startY.current));
  }, []);

  const onPointerUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    setDy((current) => {
      if (current > 110 || velocity.current > 0.55) {
        onDismiss();
        return current;
      }
      return 0;
    });
  }, [onDismiss]);

  return {
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      style: { touchAction: 'none' as const },
    },
    style: {
      transform: dy ? `translateY(${dy}px)` : undefined,
      transition: dragging.current ? 'none' : 'transform 0.25s cubic-bezier(0.32, 0, 0.24, 1)',
    },
  };
}
