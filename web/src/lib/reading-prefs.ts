'use client';

// READING PREFERENCES — theme and text size, in ONE place.
//
// These lived only inside `reader-settings.tsx` (the Aa popover in the reader header). `/settings`
// was a ComingSoon stub behind a first-class nav entry whose own copy promised "your default
// translation, reading theme, and account will live here" (A7b walk, 2026-08-02). Building that
// page by re-implementing the same three controls would have produced two definitions of what
// `reader-theme` means and which sizes exist — the shape this repo's watchlist names more than any
// other. So the logic moved here and BOTH surfaces call it.
//
// WHY THE THEME MARKER IS `reader-dark` AND NOT `dark`: `dark` is owned by next-themes, which
// arrives transitively through the auth UI and rewrites <html>'s class on every load. Measured
// 2026-08-02: with `reader-theme=dark` stored, the class settled at exactly "light". See
// globals.css.

import { useCallback, useEffect, useState } from 'react';

/** The five reading sizes, S..XL. Index, not value, is what the UI moves through. */
export const READING_SIZES = ['1rem', '1.125rem', '1.25rem', '1.4rem', '1.6rem'] as const;
export const DEFAULT_SIZE_IDX = 1;

/** The reading-column widths, narrowest to widest. The default is 84ch (owner direction
 *  2026-08-12: at 66ch the text occupied ~20–25% of a wide desktop window — "it needs to be
 *  taking up a lot more to be useful"). 66ch was the PRD's measure (§3: 65–70 characters);
 *  the PRD's reading surfaces are overridden by that ruling, and the old steps STAY in the
 *  ladder so a stored preference never becomes unresolvable. The wider steps exist by the
 *  same ruling. */
export const READING_MEASURES = ['54ch', '60ch', '66ch', '74ch', '84ch', '96ch', '110ch'] as const;
export const DEFAULT_MEASURE_IDX = 4;

export const THEME_KEY = 'reader-theme';
export const SIZE_KEY = 'reader-size';
export const MEASURE_KEY = 'reader-measure';
/** The class the `dark:` variant keys off (globals.css). NOT `dark` — that one is not ours. */
export const DARK_CLASS = 'reader-dark';

export interface ReadingPrefs {
  dark: boolean;
  sizeIdx: number;
  measureIdx: number;
  /** True once the stored values have been read; false during the first client render. */
  ready: boolean;
  setDark: (next: boolean) => void;
  setSizeIdx: (idx: number) => void;
  setMeasureIdx: (idx: number) => void;
}

/**
 * The reader's saved theme and text size, applied to the document.
 *
 * Initial state is the DEFAULT, never localStorage — a `useState` initializer runs during the
 * first client render, and reading storage there is what produced this codebase's React #418
 * hydration error earlier the same day. Stored values land in an effect, after mount.
 */
export function useReadingPrefs(): ReadingPrefs {
  const [dark, setDarkState] = useState(false);
  const [sizeIdx, setSizeIdxState] = useState(DEFAULT_SIZE_IDX);
  const [measureIdx, setMeasureIdxState] = useState(DEFAULT_MEASURE_IDX);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // The STORED PREFERENCE is the truth, not the class: something else on the page may have
    // written a theme class, and reporting that back would show the reader a setting they never
    // chose. Fall back to the class only when they have never chosen one.
    const storedTheme = localStorage.getItem(THEME_KEY);
    setDarkState(
      storedTheme ? storedTheme === 'dark' : document.documentElement.classList.contains(DARK_CLASS),
    );
    const cur = localStorage.getItem(SIZE_KEY);
    const idx = cur ? (READING_SIZES as readonly string[]).indexOf(cur) : DEFAULT_SIZE_IDX;
    setSizeIdxState(idx >= 0 ? idx : DEFAULT_SIZE_IDX);
    const curMeasure = localStorage.getItem(MEASURE_KEY);
    const mIdx = curMeasure
      ? (READING_MEASURES as readonly string[]).indexOf(curMeasure)
      : DEFAULT_MEASURE_IDX;
    setMeasureIdxState(mIdx >= 0 ? mIdx : DEFAULT_MEASURE_IDX);
    setReady(true);
  }, []);

  const setDark = useCallback((next: boolean) => {
    setDarkState(next);
    document.documentElement.classList.toggle(DARK_CLASS, next);
    localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
  }, []);

  const setSizeIdx = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(READING_SIZES.length - 1, idx));
    setSizeIdxState(clamped);
    const val = READING_SIZES[clamped]!;
    document.documentElement.style.setProperty('--reading-size', val);
    localStorage.setItem(SIZE_KEY, val);
  }, []);

  const setMeasureIdx = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(READING_MEASURES.length - 1, idx));
    setMeasureIdxState(clamped);
    const val = READING_MEASURES[clamped]!;
    document.documentElement.style.setProperty('--reading-measure', val);
    localStorage.setItem(MEASURE_KEY, val);
  }, []);

  return { dark, sizeIdx, measureIdx, ready, setDark, setSizeIdx, setMeasureIdx };
}
