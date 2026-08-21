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
import { HistoryResults, type HistoryPayload } from './history-results';

const EXAMPLES = ['tell me about Herod', 'what happened in A.D. 70', 'Jerusalem in the first century'];

export function HistoryAsk({ initialQuery }: { initialQuery?: string } = {}): React.ReactElement {
  const [query, setQuery] = useState(initialQuery ?? '');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<
    | { kind: 'empty' }
    | { kind: 'results'; query: string; data: HistoryPayload; threadId: string | null }
    | { kind: 'error'; message: string }
    | { kind: 'limited'; retryAfterSec: number }
  >({ kind: 'empty' });

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
        setState({ kind: 'error', message: 'Please sign in to search history.' });
        return;
      }
      if (res.status === 429) {
        const b = (await res.json()) as { retryAfterSec?: number };
        setState({ kind: 'limited', retryAfterSec: b.retryAfterSec ?? 60 });
        return;
      }
      if (!res.ok) { setState({ kind: 'error', message: 'History search is unavailable right now.' }); return; }
      const body = (await res.json()) as HistoryPayload & { threadId: string | null };
      setState({ kind: 'results', query: q, data: body, threadId: body.threadId });
      // Persisted thread gets the URL so reload and back both land here (UX-4 parity).
      if (body.threadId) window.history.pushState(null, '', `/ask/${body.threadId}?mode=history`);
    } catch {
      setState({ kind: 'error', message: 'History search is unavailable right now.' });
    } finally { setBusy(false); }
  };

  const ranInitial = useRef(false);
  useEffect(() => {
    if (!initialQuery || ranInitial.current) return;
    ranInitial.current = true;
    void run(initialQuery);
    // `run` is stable in behavior but not in identity; the ref guard is the once-only, and the
    // empty dep list is deliberate — a later edit to the composer must not re-fire the carry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      {state.kind === 'empty' && busy && (
        <p className="mt-8 text-sm text-stone-500 dark:text-stone-400">Searching the historians…</p>
      )}
      {state.kind === 'limited' && (
        <div className="mt-8 border edge p-4 text-sm text-stone-700 dark:text-stone-300">
          Too many searches. Try again in about {state.retryAfterSec} seconds.
        </div>
      )}
      {state.kind === 'error' && (
        <div className="mt-8 border edge p-4 text-sm text-stone-700 dark:text-stone-300">
          {state.message}{' '}
          <button type="button" className="underline hover:text-accent-700 dark:hover:text-accent-300" onClick={() => void run(query)}>Retry</button>
        </div>
      )}
      {state.kind === 'results' && (
        <HistoryResults data={state.data} query={state.query} threadId={state.threadId} />
      )}
    </div>
  );
}
