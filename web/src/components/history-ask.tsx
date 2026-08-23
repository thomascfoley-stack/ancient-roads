'use client';
// History mode of /ask — HISTORY_RETRIEVAL_DESIGN §5 stages 0-1 (entry + empty state) and the
// client half of stage 2. Point, don't fill: this component contains NO generated prose — fixed
// strings and the results renderer only.
//
// `initialQuery` is the carried query from the Historians shelf's study entrance
// (order 2026-08-20-historians-study-entrance): the entrance navigates to
// /ask?mode=history&q=…, and landing that reader on an empty page still holding their question
// would be the entrance breaking its promise. Run once on mount, guarded by a ref because
// React strict mode double-invokes effects and a second identical search is a real query.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { HistoryResults, type HistoryPayload } from './history-results';

const EXAMPLES = ['tell me about Herod', 'what happened in A.D. 70', 'Jerusalem in the first century'];

export function HistoryAsk({ initialQuery }: { initialQuery?: string } = {}): React.ReactElement {
  const [query, setQuery] = useState(initialQuery ?? '');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<
    | { kind: 'empty' }
    // `seq` keys the results element so per-search filter state (century, entity chips) cannot
    // survive into the next search — a stale filter silently emptied the new results and rendered
    // "nothing matched" over a corpus that did match (deep-audit client finding 2). The entrance
    // makes back-to-back searches the normal path, so this is a live bug, not a corner.
    | { kind: 'results'; seq: number; query: string; data: HistoryPayload; threadId: string | null }
    | { kind: 'error'; message: string; signIn?: boolean }
    | { kind: 'limited'; retryAfterSec: number }
  >({ kind: 'empty' });
  const searchNo = useRef(0);

  // The wait says so ONCE, at five seconds, and then stops — a ticking counter would turn a slow
  // search into a stopwatch the reader watches. Deliberately NOT "the first search of a session is
  // the slowest": that is true of a cold function and false of the third slow search in a row, and
  // this surface does not guess at things it has not measured.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!busy) { setSlow(false); return; }
    const t = setTimeout(() => setSlow(true), 5_000);
    return () => clearTimeout(t);
  }, [busy]);

  const run = async (raw: string): Promise<void> => {
    const q = raw.trim();
    if (!q || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/history/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      if (res.status === 401) {
        setState({ kind: 'error', message: 'Please sign in to study history.', signIn: true });
        return;
      }
      if (res.status === 429) {
        const b = (await res.json()) as { retryAfterSec?: number };
        setState({ kind: 'limited', retryAfterSec: b.retryAfterSec ?? 60 });
        return;
      }
      if (!res.ok) { setState({ kind: 'error', message: 'History search is unavailable right now.' }); return; }
      const body = (await res.json()) as HistoryPayload & { threadId: string | null };
      setState({ kind: 'results', seq: ++searchNo.current, query: q, data: body, threadId: body.threadId });
      // Persisted thread gets the URL so reload and back both land here (UX-4 parity).
      if (body.threadId) window.history.pushState(null, '', `/ask/${body.threadId}?mode=history`);
    } catch {
      setState({ kind: 'error', message: 'History search is unavailable right now.' });
    } finally { setBusy(false); }
  };

  // The carried query, keyed on its VALUE, not a boolean. App Router reconciles the same /ask
  // segment on a searchParam change rather than remounting, so a boolean once-guard would ignore a
  // genuine second `?q=` while still firing twice under StrictMode's double-invoke. Keying on the
  // value skips the strict-mode repeat (same value) and honours a real change (new value).
  const ranInitialFor = useRef<string | null>(null);
  useEffect(() => {
    if (initialQuery == null || ranInitialFor.current === initialQuery) return;
    ranInitialFor.current = initialQuery;
    setQuery(initialQuery);
    void run(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <form
        className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); void run(query); }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="search"
          inputMode="search"
          maxLength={500}
          placeholder="A person, a place, an event — “the church at Ephesus”"
          aria-label="What do you want to study?"
          className="min-h-[44px] min-w-0 flex-1 border edge bg-transparent px-4 text-base text-stone-800 placeholder:text-stone-500 dark:text-stone-100 dark:placeholder:text-stone-400"
        />
        <button
          type="submit"
          disabled={busy || !query.trim()}
          className="min-h-[44px] shrink-0 border border-stone-900 px-5 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 disabled:opacity-40 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-900"
        >
          {busy ? 'Studying…' : 'Study'}
        </button>
      </form>

      {/* One heading for the surface, so screen-reader heading navigation works in every state
          (results supplies its own visible h1). Voices mode has "Explore the paths"; history mode
          had none until here. */}
      <h1 className="sr-only">Study history</h1>

      {/* Busy is announced in EVERY state, not just the first search: a second search from a
          results screen used to change nothing but the button label while the old results sat
          live underneath (deep-audit client findings 5 + 6).

          THE BAR, added 2026-08-22 from the owner's report that a running search "seems like it's
          paused". One sentence in stone-500 was the entire signal, and the examples hide while
          busy, so asking a question made the page BLANKER for the several seconds a search takes
          (five DB round trips plus an embedding call; the first of a session also pays a cold
          function and two empty 60s caches). Indeterminate on purpose — there is no percentage to
          report, so `role="progressbar"` carries no aria-valuenow. */}
      {busy && (
        <div className="mt-6">
          <div
            role="progressbar"
            aria-label="Searching the historians"
            className="h-[2px] w-full overflow-hidden bg-stone-200 dark:bg-stone-800"
          >
            <div className="progress-travel h-full w-1/3 bg-accent-600 dark:bg-accent-400" />
          </div>
          <p role="status" aria-live="polite" className="mt-2 text-sm text-stone-500 dark:text-stone-400">
            {slow ? 'Still searching the historians…' : 'Searching the historians…'}
          </p>
        </div>
      )}

      {state.kind === 'empty' && !busy && (
        <div className="mt-8">
          <p className="text-sm text-stone-500 dark:text-stone-400">History points you into the sources. It never summarizes.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                className="inline-flex min-h-[36px] items-center border edge px-3 text-xs text-stone-600 transition-colors ease-gentle hover:bg-accent-50/50 dark:text-stone-400 dark:hover:bg-accent-950/20"
                onClick={() => { setQuery(ex); void run(ex); }}
              >{ex}</button>
            ))}
          </div>
        </div>
      )}
      {state.kind === 'limited' && !busy && (
        <div role="status" aria-live="polite" className="mt-8 border edge p-4 text-sm text-stone-700 dark:text-stone-300">
          Too many searches. Try again in about {state.retryAfterSec} seconds.
        </div>
      )}
      {state.kind === 'error' && !busy && (
        <div role="alert" className="mt-8 border edge p-4 text-sm text-stone-700 dark:text-stone-300">
          {state.message}{' '}
          {state.signIn ? (
            // Q1 (the whole point of this branch): tell them how, don't dead-end. A real link.
            <Link href="/auth/sign-in" className="underline hover:text-accent-700 dark:hover:text-accent-300">Sign in</Link>
          ) : (
            <button type="button" className="underline hover:text-accent-700 dark:hover:text-accent-300" onClick={() => void run(query)}>Retry</button>
          )}
        </div>
      )}
      {state.kind === 'results' && (
        <HistoryResults key={state.seq} data={state.data} query={state.query} threadId={state.threadId} />
      )}
    </div>
  );
}
