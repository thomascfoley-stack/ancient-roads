'use client';
// History mode of /ask — HISTORY_RETRIEVAL_DESIGN §5 stages 0-1 (entry + empty state) and the
// client half of stage 2. Point, don't fill: this component contains NO generated prose — fixed
// strings and the results renderer only.
import { useState } from 'react';
import { HistoryResults, type HistoryPayload } from './history-results';

const EXAMPLES = ['tell me about Herod', 'what happened in A.D. 70', 'Jerusalem in the first century'];

export function HistoryAsk(): React.ReactElement {
  const [query, setQuery] = useState('');
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

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <form
        className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); void run(query); }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={500}
          placeholder="Ask about people, places, events — e.g. 'the church at Ephesus'"
          className="min-w-0 flex-1 rounded border px-3 py-2"
        />
        <button type="submit" disabled={busy || !query.trim()} className="rounded border px-4 py-2 disabled:opacity-40">
          {busy ? 'Searching…' : 'Search'}
        </button>
      </form>

      {state.kind === 'empty' && (
        <div className="mt-8">
          <p className="text-sm text-muted-foreground">History points you into the sources. It never summarizes.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex} type="button" className="rounded border px-3 py-1 text-sm"
                onClick={() => { setQuery(ex); void run(ex); }}
              >{ex}</button>
            ))}
          </div>
        </div>
      )}
      {state.kind === 'limited' && (
        <div className="mt-8 rounded border p-4 text-sm">
          Too many searches. Try again in about {state.retryAfterSec} seconds.
        </div>
      )}
      {state.kind === 'error' && (
        <div className="mt-8 rounded border p-4 text-sm">
          {state.message}{' '}
          <button type="button" className="underline" onClick={() => void run(query)}>Retry</button>
        </div>
      )}
      {state.kind === 'results' && (
        <HistoryResults data={state.data} query={state.query} threadId={state.threadId} />
      )}
    </div>
  );
}
