'use client';

import { useEffect, useRef, useState } from 'react';

const SIZES = ['1rem', '1.125rem', '1.25rem', '1.4rem', '1.6rem']; // S .. XL
const DEFAULT_SIZE_IDX = 1;

export function ReaderSettings() {
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [sizeIdx, setSizeIdx] = useState(DEFAULT_SIZE_IDX);
  const ref = useRef<HTMLDivElement>(null);

  // Sync initial state from what the no-flash script already applied.
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
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
    document.documentElement.classList.toggle('dark', next);
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
        className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-stone-500 shadow-sm transition-colors hover:bg-stone-100 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
      >
        Aa
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 rounded-xl bg-white p-3 shadow-lg ring-1 ring-stone-200 dark:bg-stone-800 dark:ring-stone-700">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-400">Theme</p>
          <div className="mb-3 flex rounded-lg bg-stone-100 p-0.5 dark:bg-stone-700">
            <button
              onClick={() => applyDark(false)}
              className={`flex-1 rounded-md py-1 text-sm font-medium transition-colors ${!dark ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-400'}`}
            >
              Light
            </button>
            <button
              onClick={() => applyDark(true)}
              className={`flex-1 rounded-md py-1 text-sm font-medium transition-colors ${dark ? 'bg-stone-900 text-stone-100 shadow-sm' : 'text-stone-500 dark:text-stone-300'}`}
            >
              Dark
            </button>
          </div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-400">Text size</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => applySize(sizeIdx - 1)}
              disabled={sizeIdx === 0}
              className="h-8 w-8 rounded-lg bg-stone-100 text-sm text-stone-600 hover:bg-stone-200 disabled:opacity-40 dark:bg-stone-700 dark:text-stone-300"
            >
              A−
            </button>
            <div className="flex-1 text-center text-xs text-stone-400">{sizeIdx + 1} / {SIZES.length}</div>
            <button
              onClick={() => applySize(sizeIdx + 1)}
              disabled={sizeIdx === SIZES.length - 1}
              className="h-8 w-8 rounded-lg bg-stone-100 text-base text-stone-700 hover:bg-stone-200 disabled:opacity-40 dark:bg-stone-700 dark:text-stone-200"
            >
              A+
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
