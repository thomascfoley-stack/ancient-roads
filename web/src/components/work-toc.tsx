'use client';

// The Book Reader's TOC drawer (design §2/§10.1): the work's headings grouped by reading
// unit (ADR-026 — a chunked ingest splits one sermon/chapter into several sections sharing a
// unit_ordinal; the unit is what a reader navigates). Reuses the StudyPanel bottom-sheet
// shell idiom: backdrop click-outside, grab handle + useDragDismiss, Escape, body scroll
// lock. Clicking a section navigates to #s{ordinal}.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDragDismiss } from '@/lib/use-drag-dismiss';
import { tocUnitLabel } from '@/lib/work-reader';
import type { WorkTocUnit } from '@/lib/work';

// A chunked ingest repeats the work's title across its chunks and suffixes " (i/n)". The unit
// label is the FIRST chunk's heading, so it arrives carrying "(1/23)" — meaningless on a row that
// represents the whole unit. Strip exactly that suffix (the same marker migration 024's grouping
// key strips), so the TOC reads "TALKS TO FARMERS — PROVERBS 24:30-32" instead of "… (1/23)".
const unitLabel = (label: string): string => label.replace(/\s*\(\d+\/\d+\)\s*$/, '');

export function WorkToc({
  toc,
  currentOrdinal,
  onNavigate,
  onClose,
}: {
  toc: WorkTocUnit[];
  currentOrdinal: number | null;
  onNavigate: (ordinal: number) => void;
  onClose: () => void;
}) {
  const drag = useDragDismiss(onClose);
  const listRef = useRef<HTMLDivElement | null>(null);
  // The SERVER groups now (lib/work.ts): one row per unit, carrying its ordinal RANGE instead of
  // its member rows. This used to call groupTocByUnit(toc) over one row per SECTION, which is why
  // the response scaled with chunking and spurgeon-sermons spent its whole budget on ~150 of
  // 3,540 sermons. Nothing is regrouped here; `toc` IS the unit list.
  const units = toc;

  // BOUNDED RENDER (Phase 4 §B). This drawer used to mount a <button> for EVERY section chunk:
  // Calvin's Institutes mounted 3,448 of them on open — the client-side twin of the repo's
  // "never return an unbounded result set" rule, and a TOC that had stopped being navigation
  // (every row read "TITLE — ref (N/23)"). Now exactly ONE row per unit, and only the EXPANDED
  // unit mounts its chunk rows, so the cost scales with units, not sections.
  // Enforced by test/invariants/work-toc-bounded.test.tsx.
  const unitKeyOf = (u: (typeof units)[number], i: number): number => u.unitOrdinal ?? -(i + 1);
  // "Am I in this unit?" is a RANGE TEST now, not a scan of member rows. A unit owns the
  // contiguous ordinals firstOrdinal..lastOrdinal, so carrying the two bounds answers the same
  // question the rows were being shipped to answer.
  const holds = (u: (typeof units)[number], ord: number | null): boolean =>
    ord !== null && ord >= u.firstOrdinal && ord <= u.lastOrdinal;
  // Open the unit you are actually reading, so "Reading" is visible without hunting.
  const [expanded, setExpanded] = useState<number | null>(() => {
    const i = units.findIndex((u) => holds(u, currentOrdinal));
    const u = i >= 0 ? units[i] : undefined;
    return u && u.sectionCount > 1 ? unitKeyOf(u, i) : null;
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Center the current section in the list on open (one-shot — not on every re-render).
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'center' });
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[88dvh] w-full max-w-2xl flex-col rounded-t-3xl bg-paper pb-[env(safe-area-inset-bottom)] shadow-deep animate-slide-up dark:bg-stone-900"
        style={drag.style}
      >
        {/* Grab handle (drag down to dismiss) */}
        <div aria-hidden className="flex justify-center pt-2.5" {...drag.handleProps}>
          <span className="h-1.5 w-10 rounded-full bg-stone-300/80 dark:bg-stone-700" />
        </div>
        {/* Header */}
        <div
          className="flex items-center justify-between border-b border-stone-200/60 px-5 py-3 dark:border-stone-800"
          {...drag.handleProps}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">Contents</p>
          <button
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-600 active:bg-stone-100 dark:hover:bg-stone-800"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div ref={listRef} className="min-h-[30vh] flex-1 overflow-y-auto overscroll-contain px-3 py-2">
          {units.map((unit, ui) => {
            const key = unitKeyOf(unit, ui);
            const chunked = unit.sectionCount > 1;
            const open = chunked && expanded === key;
            const here = holds(unit, currentOrdinal);
            const label = unitLabel(tocUnitLabel(unit));
            return (
              <div key={key} className="py-0.5">
                <div className="flex items-stretch gap-1">
                  {/* ONE row per unit. Clicking it seeks to the unit's start — the common case. */}
                  <button
                    data-active={here && !open}
                    onClick={() => onNavigate(unit.firstOrdinal)}
                    className={`flex min-h-[44px] flex-1 items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent-50/60 active:bg-accent-50/80 dark:hover:bg-accent-950/30 ${
                      here
                        ? 'bg-accent-50 font-semibold text-accent-800 dark:bg-accent-950/40 dark:text-accent-200'
                        : 'text-stone-700 dark:text-stone-300'
                    }`}
                  >
                    <span className="line-clamp-2">{label}</span>
                    {here && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider">Reading</span>}
                  </button>
                  {/* Only a chunked unit gets a disclosure; only the open one mounts its rows. */}
                  {chunked && (
                    <button
                      aria-expanded={open}
                      aria-label={`${open ? 'Collapse' : 'Expand'} ${label} (${unit.sectionCount} parts)`}
                      onClick={() => setExpanded(open ? null : key)}
                      className="flex min-h-[44px] w-11 shrink-0 items-center justify-center rounded-lg text-[11px] font-medium text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800"
                    >
                      {open ? '−' : unit.sectionCount}
                    </button>
                  )}
                </div>

                {/* A unit's sections are the contiguous ordinals firstOrdinal..lastOrdinal, so the
                    chunk rows are DERIVED rather than shipped. Their per-chunk headings were the
                    unit's title with a "(i/n)" suffix that the label above already strips as
                    meaningless, so "Part i" is what they actually said. */}
                {open &&
                  Array.from({ length: unit.sectionCount }, (_, k) => unit.firstOrdinal + k).map((ord, k) => {
                    const active = ord === currentOrdinal;
                    return (
                      <button
                        key={ord}
                        data-active={active}
                        onClick={() => onNavigate(ord)}
                        className={`ml-4 flex min-h-[40px] w-[calc(100%-1rem)] items-center justify-between gap-3 rounded-lg px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-accent-50/60 dark:hover:bg-accent-950/30 ${
                          active
                            ? 'bg-accent-50 font-semibold text-accent-800 dark:bg-accent-950/40 dark:text-accent-200'
                            : 'text-stone-500 dark:text-stone-400'
                        }`}
                      >
                        <span className="line-clamp-1">{`Part ${k + 1} of ${unit.sectionCount}`}</span>
                        {active && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider">Reading</span>}
                      </button>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
