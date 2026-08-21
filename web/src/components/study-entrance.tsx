'use client';
// The study entrance (order 2026-08-20-historians-study-entrance): the Historians shelf leads
// with a question instead of a search box, and the question routes into the shipped History
// mode — /ask?mode=history&q=… — which owns retrieval, its eval, and its thread persistence.
// This component is a ROUTER plus a reveal; it must never grow retrieval of its own.
//
// The verb is the contract: "study" promises the reader will do the reading and the product
// will hand them the sources. Example chips submit immediately (History-mode chip behavior,
// deliberately opposite the voices-mode chips, which only fill the composer — see ask-client).
// The classic body-text FTS survives behind the "Exact-phrase search" reveal: demoted, not
// deleted, and it is the real CatalogSearch so the shelf keeps one search implementation.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CatalogSearch } from '@/components/catalog-search';
import type { CatalogId } from '@/lib/catalog-defs';

const EXAMPLES = ['the church at Ephesus', 'what happened in A.D. 70', 'Herod', 'Jerusalem in the first century'];

export function StudyEntrance({
  catalog,
  label,
  traditions,
}: {
  catalog: CatalogId;
  label: string;
  traditions: string[];
}): React.ReactElement {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [phraseOpen, setPhraseOpen] = useState(false);

  const study = (raw: string): void => {
    const query = raw.trim();
    if (!query) return;
    router.push(`/ask?mode=history&q=${encodeURIComponent(query)}`);
  };

  return (
    <div className="mb-8 border edge edge-focus bg-paper p-6 dark:bg-stone-900">
      <p className="font-display text-2xl font-medium tracking-tight text-stone-900 dark:text-stone-100">
        What do you want to study?
      </p>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          study(q);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          type="search"
          inputMode="search"
          maxLength={500}
          placeholder="A person, a place, an event — “the church at Ephesus”"
          aria-label="What do you want to study?"
          className="min-h-[44px] min-w-0 flex-1 border edge bg-transparent px-4 text-base text-stone-800 placeholder:text-stone-500 dark:text-stone-100 dark:placeholder:text-stone-400"
        />
        <button
          type="submit"
          className="min-h-[44px] shrink-0 border border-stone-900 px-5 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-900"
        >
          Study
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-xs text-stone-500 dark:text-stone-400">
          History points you into the sources. It never summarizes.
        </p>
        <button
          type="button"
          aria-expanded={phraseOpen}
          onClick={() => setPhraseOpen((v) => !v)}
          className="text-xs text-stone-500 underline transition-colors ease-gentle hover:text-accent-700 dark:text-stone-400 dark:hover:text-accent-300"
        >
          Exact-phrase search
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => study(ex)}
            className="inline-flex min-h-[36px] items-center border edge px-3 text-xs text-stone-600 transition-colors ease-gentle hover:bg-accent-50/50 dark:text-stone-400 dark:hover:bg-accent-950/20"
          >
            {ex}
          </button>
        ))}
      </div>

      {phraseOpen && (
        <div className="mt-5 border-t edge pt-5">
          <CatalogSearch catalog={catalog} label={label} traditions={traditions} />
        </div>
      )}
    </div>
  );
}
