'use client';

// The Aa popover in the reader header. The theme/size LOGIC is not here — it lives in
// `useReadingPrefs` (lib/reading-prefs.ts) because /settings offers the same three controls, and
// two implementations of "what reader-theme means" is the defect shape this repo names most often.
// What remains here is the popover: its open/close, its outside-click, its layout.

import { useEffect, useRef, useState } from 'react';
import { READING_SIZES, useReadingPrefs } from '@/lib/reading-prefs';

export function ReaderSettings() {
  const [open, setOpen] = useState(false);
  const { dark, sizeIdx, setDark, setSizeIdx } = useReadingPrefs();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    // Anchored popover, so Escape and focus return but no focus trap. Outside-click was the
    // only way to dismiss this, which is a pointer-only exit from a keyboard-reachable control.
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        ref.current?.querySelector('button')?.focus();
      }
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const applyDark = setDark;
  const applySize = setSizeIdx;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Reading settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Reading settings: theme and text size"
        className="flex min-h-[44px] items-center rounded-lg bg-paper px-3 text-xs font-semibold text-stone-500 shadow-paper transition-colors ease-gentle hover:bg-stone-100 active:bg-stone-200 sm:min-h-8 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
      >
        Aa
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 rounded-xl bg-paper p-3 shadow-float ring-1 ring-stone-200 dark:bg-stone-800 dark:ring-stone-700">
          <p className="mb-1.5 text-micro font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Theme</p>
          <div className="mb-3 flex rounded-lg bg-stone-100 p-0.5 dark:bg-stone-700">
            <button
              onClick={() => applyDark(false)}
              className={`min-h-[40px] flex-1 rounded-md py-1 text-sm font-medium transition-colors ease-gentle ${!dark ? 'bg-paper text-stone-800 shadow-paper' : 'text-stone-500 dark:text-stone-400'}`}
            >
              Light
            </button>
            <button
              onClick={() => applyDark(true)}
              className={`min-h-[40px] flex-1 rounded-md py-1 text-sm font-medium transition-colors ease-gentle ${dark ? 'bg-stone-900 text-stone-100 shadow-paper' : 'text-stone-500 dark:text-stone-300'}`}
            >
              Dark
            </button>
          </div>
          <p className="mb-1.5 text-micro font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Text size</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => applySize(sizeIdx - 1)}
              disabled={sizeIdx === 0}
              className="h-11 w-11 rounded-lg bg-stone-100 text-sm text-stone-600 hover:bg-stone-200 active:bg-stone-300 disabled:opacity-40 dark:bg-stone-700 dark:text-stone-300"
            >
              A−
            </button>
            <div className="flex-1 text-center text-xs text-stone-500 dark:text-stone-400">{sizeIdx + 1} / {READING_SIZES.length}</div>
            <button
              onClick={() => applySize(sizeIdx + 1)}
              disabled={sizeIdx === READING_SIZES.length - 1}
              className="h-11 w-11 rounded-lg bg-stone-100 text-base text-stone-700 hover:bg-stone-200 active:bg-stone-300 disabled:opacity-40 dark:bg-stone-700 dark:text-stone-200"
            >
              A+
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
