'use client';

// The Book Reader's sticky chrome (design §2): title · author · tradition · era · license.
// Attribution discipline (§8.6): these fields come from the whitelisted /api/work response —
// `provenance` (host URLs) is never selected server-side, so no host URL can render here.

import { ReaderSettings } from './reader-settings';
import type { WorkSource } from '@/lib/work';

export function WorkHeader({
  source,
  onOpenToc,
  ref,
}: {
  source: WorkSource;
  onOpenToc: () => void;
  /** The reader measures the header's live bottom edge for scroll/progress math (React 19
   *  ref-as-prop). */
  ref?: React.Ref<HTMLElement>;
}) {
  const meta = [source.author, source.tradition, source.era, source.license].filter(Boolean).join(' · ');
  return (
    <header
      ref={ref}
      className="sticky top-0 z-40 border-b border-stone-200 bg-stone-50/95 pb-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] backdrop-blur-sm dark:border-stone-800 dark:bg-stone-950/95"
    >
      <div className="mx-auto flex max-w-2xl items-center gap-2 px-3 sm:px-4">
        <button
          onClick={onOpenToc}
          title="Table of contents"
          className="min-h-[44px] shrink-0 rounded-lg bg-paper px-4 text-sm font-semibold text-stone-800 shadow-paper transition-colors hover:bg-stone-100 active:bg-stone-200 sm:min-h-0 sm:py-1.5 dark:bg-stone-800 dark:text-stone-100 dark:hover:bg-stone-700"
        >
          Contents
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-scripture text-sm font-medium text-stone-800 dark:text-stone-100">
            {source.title}
          </p>
          {meta && (
            <p className="truncate text-[11px] font-medium uppercase tracking-wider text-stone-400 dark:text-stone-500">
              {meta}
            </p>
          )}
        </div>
        <ReaderSettings />
      </div>
    </header>
  );
}
