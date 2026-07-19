'use client';

// The Book Reader's TOC drawer (design §2/§10.1): the work's headings grouped by reading
// unit (ADR-026 — a chunked ingest splits one sermon/chapter into several sections sharing a
// unit_ordinal; the unit is what a reader navigates). Reuses the StudyPanel bottom-sheet
// shell idiom: backdrop click-outside, grab handle + useDragDismiss, Escape, body scroll
// lock. Clicking a section navigates to #s{ordinal}.

import { useEffect, useRef } from 'react';
import { useDragDismiss } from '@/lib/use-drag-dismiss';
import { groupTocByUnit } from '@/lib/work-reader';
import type { WorkTocRow } from '@/lib/work';

export function WorkToc({
  toc,
  currentOrdinal,
  onNavigate,
  onClose,
}: {
  toc: WorkTocRow[];
  currentOrdinal: number | null;
  onNavigate: (ordinal: number) => void;
  onClose: () => void;
}) {
  const drag = useDragDismiss(onClose);
  const listRef = useRef<HTMLDivElement | null>(null);
  const units = groupTocByUnit(toc);

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
          {units.map((unit, ui) => (
            <div key={unit.unitOrdinal ?? ui} className="py-1">
              {/* The unit label is the first heading of the reading unit; a single-section
                  unit needs no redundant group header above its one row. */}
              {unit.rows.length > 1 && (
                <p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-widest text-stone-300 dark:text-stone-600">
                  {unit.label}
                </p>
              )}
              {unit.rows.map((row) => {
                const active = row.ordinal === currentOrdinal;
                return (
                  <button
                    key={row.id}
                    data-active={active}
                    onClick={() => onNavigate(row.ordinal)}
                    className={`flex min-h-[44px] w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent-50/60 active:bg-accent-50/80 dark:hover:bg-accent-950/30 ${
                      active
                        ? 'bg-accent-50 font-semibold text-accent-800 dark:bg-accent-950/40 dark:text-accent-200'
                        : 'text-stone-700 dark:text-stone-300'
                    }`}
                  >
                    <span className="line-clamp-2">{row.heading ?? `Section ${row.ordinal}`}</span>
                    {active && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider">Reading</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
