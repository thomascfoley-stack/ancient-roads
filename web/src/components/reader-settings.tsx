'use client';

import { useEffect, useRef, useState } from 'react';

const SIZES = ['1rem', '1.125rem', '1.25rem', '1.4rem', '1.6rem']; // S .. XL
const DEFAULT_SIZE_IDX = 1;

export function ReaderSettings() {
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [sizeIdx, setSizeIdx] = useState(DEFAULT_SIZE_IDX);
  const ref = useRef<HTMLDivElement>(null);

  // THE STORED PREFERENCE IS THE TRUTH, NOT THE CLASS.
  //
  // This read `classList.contains('dark')` — i.e. it asked the DOM what the page currently looks
  // like and reported that back as "your setting". Anything else on the page that touches the
  // `dark` class (a component library's own theme handling, an extension, the no-flash script
  // before its removal branch existed) makes this control state something the reader never chose,
  // and then a click "toggles" from a value that was never theirs. A7b walked it: choose Light,
  // reload, the toggle reads Dark. `reader-theme` is what the reader actually picked; read that,
  // and fall back to the class only when they have never picked anything.
  useEffect(() => {
    const stored = localStorage.getItem('reader-theme');
    setDark(stored ? stored === 'dark' : document.documentElement.classList.contains('reader-dark'));
    const cur = localStorage.getItem('reader-size');
    const idx = cur ? SIZES.indexOf(cur) : DEFAULT_SIZE_IDX;
    setSizeIdx(idx >= 0 ? idx : DEFAULT_SIZE_IDX);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function applyDark(next: boolean) {
    setDark(next);
    document.documentElement.classList.toggle('reader-dark', next);
    localStorage.setItem('reader-theme', next ? 'dark' : 'light');
  }

  function applySize(idx: number) {
    const clamped = Math.max(0, Math.min(SIZES.length - 1, idx));
    setSizeIdx(clamped);
    const val = SIZES[clamped]!;
    document.documentElement.style.setProperty('--reading-size', val);
    localStorage.setItem('reader-size', val);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Reading settings"
        className="min-h-[44px] rounded-full bg-white px-3 text-xs font-semibold text-stone-500 shadow-sm transition-colors hover:bg-stone-100 active:bg-stone-200 sm:min-h-0 sm:py-1.5 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
      >
        Aa
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 rounded-xl bg-white p-3 shadow-lg ring-1 ring-stone-200 dark:bg-stone-800 dark:ring-stone-700">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-400">Theme</p>
          <div className="mb-3 flex rounded-lg bg-stone-100 p-0.5 dark:bg-stone-700">
            <button
              onClick={() => applyDark(false)}
              className={`min-h-[40px] flex-1 rounded-md py-1 text-sm font-medium transition-colors ${!dark ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-400'}`}
            >
              Light
            </button>
            <button
              onClick={() => applyDark(true)}
              className={`min-h-[40px] flex-1 rounded-md py-1 text-sm font-medium transition-colors ${dark ? 'bg-stone-900 text-stone-100 shadow-sm' : 'text-stone-500 dark:text-stone-300'}`}
            >
              Dark
            </button>
          </div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-400">Text size</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => applySize(sizeIdx - 1)}
              disabled={sizeIdx === 0}
              className="h-11 w-11 rounded-lg bg-stone-100 text-sm text-stone-600 hover:bg-stone-200 active:bg-stone-300 disabled:opacity-40 dark:bg-stone-700 dark:text-stone-300"
            >
              A−
            </button>
            <div className="flex-1 text-center text-xs text-stone-400">{sizeIdx + 1} / {SIZES.length}</div>
            <button
              onClick={() => applySize(sizeIdx + 1)}
              disabled={sizeIdx === SIZES.length - 1}
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
