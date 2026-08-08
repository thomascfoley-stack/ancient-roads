'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { READING_CATEGORIES, type ReadingCategoryId } from '@/lib/user-corpus/suggested-readings';
import { DISPLAY_LOCALE } from '@/lib/locale';

// Suggested readings: pick what to search, watch it search, read what it found.
//
// THE PERCENTAGE IS REAL. The job weights each category by its ROW COUNT (sermons 162k,
// commentaries 133k, theology 35k, hymns 6.9k, poetry 4.1k) and writes progress as each finishes,
// so the bar moves in proportion to work actually done and names the category it is on. The owner
// asked for "a loading percentage, who cares what it is" — this is that, and it happens to be
// true, which costs nothing extra and cannot embarrass itself by sitting at 99%.

interface Reading {
  category: ReadingCategoryId;
  author: string;
  work: string;
  workTitle: string | null;
  tradition: string | null;
  similarity: number;
}

interface State {
  status: 'pending' | 'running' | 'ready' | 'failed' | null;
  progress: number;
  step: string | null;
  error: string | null;
  doneAt: string | null;
  categories: ReadingCategoryId[];
  count: number;
  readings: Reading[];
}

const LABEL = new Map(READING_CATEGORIES.map((c) => [c.id, c.label]));

export function SuggestedReadings({ documentId, docReady }: { documentId: string; docReady: boolean }) {
  const [state, setState] = useState<State | null>(null);
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<ReadingCategoryId[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const polling = useRef(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/user-corpus/documents/${documentId}/readings`);
    if (!r.ok) return null;
    const d = (await r.json()) as State;
    setState(d);
    setChosen(d.categories);
    return d;
  }, [documentId]);

  useEffect(() => { void load(); }, [load]);

  // Poll only while the job is moving — the same rule the status wall uses. A permanent interval
  // on a finished search is a request every two seconds forever, on every open tab.
  useEffect(() => {
    if (!state || (state.status !== 'running' && state.status !== 'pending')) return;
    if (polling.current) return;
    polling.current = true;
    const t = setInterval(() => { void load(); }, 2000);
    return () => { clearInterval(t); polling.current = false; };
  }, [state, load]);

  const run = useCallback(
    async (categories: ReadingCategoryId[]) => {
      setBusy(true);
      setNote(null);
      try {
        const r = await fetch(`/api/user-corpus/documents/${documentId}/readings`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ categories }),
        });
        if (!r.ok) {
          const d = (await r.json().catch(() => ({}))) as { error?: string };
          setNote(d.error ?? 'That search could not be started.');
          return;
        }
        setPicking(false);
        await load();
      } finally {
        setBusy(false);
      }
    },
    [documentId, load],
  );

  const running = state?.status === 'running' || state?.status === 'pending';
  const byCategory = READING_CATEGORIES
    .map((c) => [c, (state?.readings ?? []).filter((r) => r.category === c.id)] as const)
    .filter(([, rows]) => rows.length > 0);

  return (
    <div className="mt-8 border-t border-stone-200 pt-6 dark:border-stone-700">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg text-stone-700 dark:text-stone-200">
          {state && state.count > 0 ? `${state.count} suggested readings` : 'Suggested readings'}
        </h3>
        {docReady && !running && (
          <button
            type="button"
            onClick={() => setPicking((p) => !p)}
            className="min-h-[44px] rounded-full px-3 text-[13px] font-semibold text-stone-600 hover:text-accent-800 dark:text-stone-300"
          >
            {picking ? 'Cancel' : 'Choose what to search'}
          </button>
        )}
      </div>
      <p className="mb-3 mt-1 font-serif text-[13px] leading-relaxed text-stone-500 dark:text-stone-400">
        {/* The claim, kept narrow: matched by meaning, never called citations. A citation is
            something the author did; these are works the author has not read yet. */}
        Matched by meaning across the whole library, not by a passage you cited — places to look,
        not sources you quoted.
      </p>

      {note && <p role="alert" className="mb-3 font-serif text-[14px] text-amber-800 dark:text-amber-300">{note}</p>}

      {picking && (
        <div className="mb-4 rounded-xl bg-paper px-4 py-3 shadow-paper dark:bg-stone-800 dark:shadow-none">
          <ul className="space-y-1.5">
            {READING_CATEGORIES.map((c) => (
              <li key={c.id}>
                <label className="flex min-h-[36px] items-center gap-2.5 font-serif text-[15px] text-stone-700 dark:text-stone-200">
                  <input
                    type="checkbox"
                    checked={chosen.includes(c.id)}
                    onChange={(e) =>
                      setChosen((prev) => (e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id)))
                    }
                    className="h-4 w-4 accent-accent-700"
                  />
                  {c.label}
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] leading-relaxed text-stone-500 dark:text-stone-400">
            Searched one at a time, largest first. Everything takes about a minute and a half —
            it reads every work rather than sampling, so the answer is exact.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(chosen)}
            className="mt-3 min-h-[44px] rounded-full bg-stone-900 px-4 text-[14px] font-medium text-paper disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
          >
            {busy ? 'Starting…' : 'Search'}
          </button>
        </div>
      )}

      {running ? (
        <div>
          <div className="mb-1.5 flex items-baseline justify-between font-serif text-[14px] text-stone-600 dark:text-stone-300">
            <span>{state?.step ? `Searching ${state.step.toLowerCase()}…` : 'Starting the search…'}</span>
            <span className="tabular-nums text-stone-500 dark:text-stone-400">{state?.progress ?? 0}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={state?.progress ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Searching the library"
            className="h-2 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700"
          >
            <div
              className="h-full rounded-full bg-accent-700 transition-[width] duration-700 ease-gentle"
              style={{ width: `${Math.max(2, state?.progress ?? 0)}%` }}
            />
          </div>
        </div>
      ) : state?.status === 'failed' ? (
        <p role="alert" className="font-serif text-[14px] text-amber-800 dark:text-amber-300">
          The search failed: {state.error ?? 'no reason recorded'}
        </p>
      ) : !state ? (
        <p role="status" className="font-serif text-[14px] text-stone-500 dark:text-stone-400">Loading…</p>
      ) : byCategory.length === 0 ? (
        <div>
          <p className="font-serif text-[14px] text-stone-500 dark:text-stone-400">
            {state.status === 'ready'
              ? 'Nothing in the library was found for the categories you chose.'
              : 'No search has been run on this document yet.'}
          </p>
          {docReady && !picking && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(chosen.length ? chosen : state.categories)}
              className="mt-3 min-h-[44px] rounded-full bg-stone-900 px-4 text-[14px] font-medium text-paper disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
            >
              {busy ? 'Starting…' : 'Find suggested readings'}
            </button>
          )}
        </div>
      ) : (
        <>
          {byCategory.map(([cat, rows]) => (
            <div key={cat.id} className="mb-4 last:mb-0">
              <p className="mb-1.5 text-micro font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                {LABEL.get(cat.id)} · {rows.length}
              </p>
              <ul className="space-y-1.5">
                {rows.map((v) => (
                  <li key={`${v.author}|${v.work}`} className="font-serif text-[14px] text-stone-600 dark:text-stone-300">
                    <span className="text-stone-800 dark:text-stone-100">{v.author}</span>
                    {v.workTitle && <span className="text-stone-500 dark:text-stone-400">, {v.workTitle}</span>}
                    <span className="ml-2 text-[12px] tabular-nums text-stone-500 dark:text-stone-400">
                      {v.similarity.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {state.doneAt && (
            // Nothing re-runs these when the corpus grows, so say when the answer was computed
            // rather than let a reader assume it is current.
            <p className="mt-3 text-[12px] text-stone-500 dark:text-stone-400">
              Searched {new Date(state.doneAt).toLocaleDateString(DISPLAY_LOCALE)} ·{' '}
              {state.categories.map((c) => LABEL.get(c) ?? c).join(', ')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
