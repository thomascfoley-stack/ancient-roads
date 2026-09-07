'use client';

// /ask, voices mode — the state machine. The pieces it renders live beside it:
//   ask-types.ts        the wire shapes and the Turn
//   ask-empty-state.tsx the first screen (heading, three questions, the door into History)
//   ask-composer.tsx    the sticky composer (box + scope line) — its geometry is test-locked
//   ask-scope-row.tsx   which lanes the next ask searches
//   ask-progress.tsx    the staged panel for a turn in flight
//   ask-answer.tsx      voices, lanes, the Show filter, fallback sources, tombstones, result links
// Split 2026-09-06 (the file was 1,130 lines). `InitialThread` and `SLOW_ANSWER_NOTICE_MS` are
// re-exported so every existing import path stays true.

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { DISPLAY_LOCALE } from '@/lib/locale';
import { useSignedIn } from '@/lib/auth/use-signed-in';
import { isThreadId } from '@/lib/thread-id';
import type { InitialThread, Stage, StreamEvent, Turn } from './ask-types';
import { AskEmptyState } from './ask-empty-state';
import { AskComposer } from './ask-composer';
import type { LaneKey } from './ask-scope-row';
import { Progress, SLOW_ANSWER_NOTICE_MS } from './ask-progress';
import { Answer, RetryButton } from './ask-answer';

export type { InitialThread } from './ask-types';
export { SLOW_ANSWER_NOTICE_MS };

// A017 — THE FRAME IS CONDITIONAL ON THE STAGE; THE MESSAGE WAS NOT, so the banner could paint as
// a bordered box with nothing in it but "Ask again". What renders that box is a `{stage:'error'}`
// event carrying no `message`: the stream is `JSON.parse(line) as StreamEvent` (a CAST over
// external input, not a parse), and `error: ev.message` writes whatever came back — undefined
// included — straight into state. `api/ask/stream/route.ts` always sets a message today, so this
// is latent rather than live; it is guarded here because the guarantee wanted is "a failure always
// says what failed", and that must not depend on a remote field's presence. Falls back to a message
// rather than dropping the frame: the frame carries the retry control and the sign-in link.
const ERROR_FALLBACK = 'Something went wrong. Please try again.';

// Stop's copy. Distinct from L1's "stopped partway" on purpose: that one means the STREAM ended
// without a terminal event; this one means the READER ended it. ask-stop.test.tsx tells them apart.
const STOPPED = 'Stopped before an answer arrived.';

/** "about 60 seconds" / "about 5 minutes" / "about an hour" — never "about 3600 seconds". */
function formatWait(sec: number): string {
  if (sec >= 3600) return 'about an hour';
  if (sec >= 120) return `about ${Math.round(sec / 60)} minutes`;
  return `about ${sec} second${sec === 1 ? '' : 's'}`;
}

export function AskClient({ initialThread }: { initialThread?: InitialThread } = {}) {
  // Q1: renders the composer's sign-in notice. `useSignedIn` is the shared source and is
  // deliberately NOT a fetch — see its header for the four features a failed request used to
  // revoke. Its `mounted` guard means one render returns false, which is the correct direction
  // here: a signed-in reader sees the notice for one frame, never the reverse.
  const signedIn = useSignedIn();
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>(() =>
    (initialThread?.turns ?? []).map((t, i) =>
      t.result
        ? { id: -(i + 1), question: t.question, stage: 'done' as Stage, attempt: 0, sources: [], traditions: 0, result: t.result, askedAt: t.askedAt, withdrawnIds: t.withdrawnIds }
        : { id: -(i + 1), question: t.question, stage: 'error' as Stage, attempt: 0, sources: [], traditions: 0, error: 'This ask never finished. Ask it again below.', askedAt: t.askedAt },
    ),
  );
  const [busy, setBusy] = useState(false);
  const [lanes, setLanes] = useState<Record<LaneKey, boolean>>({ sermons: true, theology: true, songVerse: true });
  const nextId = useRef(1);
  // The thread this session appends to. Seeded by /ask/[id]; set by the first `thread` event on
  // /ask — where the URL is then swapped with replaceState (§4.3: a fresh ask must not leave an
  // empty /ask between the reader and their result on back). Mirrored into state so result links
  // minted after the event carry `from=ask:<id>` — the return strip's way back.
  const threadIdRef = useRef<string | null>(initialThread?.id ?? null);
  const [threadId, setThreadId] = useState<string | null>(initialThread?.id ?? null);
  // The in-flight request, so Stop can abort it. One at a time (single-flight, below).
  const abortRef = useRef<AbortController | null>(null);
  // When the current ask was submitted. Ask and Stop share one button slot, and `busy` flushes
  // synchronously on submit — so the second click of a double-click (or a repeated Space on the
  // reused node) would land on Stop and abort the ask it just started (deep-audit 2026-09-06).
  // A Stop inside this window is ignored; a deliberate Stop is never that fast.
  const submittedAt = useRef(0);
  const STOP_GUARD_MS = 300;

  // Scroll ONCE per appended turn, to its heading — not on every stream patch, and not to the
  // bottom sentinel (UX_POLISH_AUDIT P3: the old effect keyed on `turns` chased the scroll on every
  // event). A stored thread opens at its first turn: `lastCount` starts at the seeded length.
  const lastCount = useRef(turns.length);
  useEffect(() => {
    if (turns.length > lastCount.current) {
      const last = turns[turns.length - 1];
      if (last) document.getElementById(`ask-turn-${last.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    lastCount.current = turns.length;
  }, [turns.length, turns]);

  // Prefill from ?q= (the reader's "Ask Ancient Paths" hand-off). Prefill ONLY — never
  // auto-submit, so a reload or shared link can't spend a teacher run uninvited.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) setQuestion(q);
  }, []);

  const patch = useCallback((id: number, p: Partial<Turn>) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...p } : t)));
  }, []);

  // `replaceId` — retry a FAILED turn in its own slot instead of appending a second copy of the
  // same question (A010). Only the error path passes it: a COMPLETED answer also offers "Ask
  // again" (the fallback control), and replacing there would destroy an answer the reader has.
  const ask = useCallback(async (raw: string, replaceId?: number) => {
    const q = raw.trim();
    if (!q || busy) return;
    const id = replaceId ?? nextId.current++;
    const fresh: Turn = { id, question: q, stage: 'retrieving', attempt: 0, sources: [], traditions: 0 };
    setTurns((prev) =>
      replaceId !== undefined && prev.some((t) => t.id === replaceId)
        ? prev.map((t) => (t.id === replaceId ? fresh : t))
        : [...prev, fresh],
    );
    setQuestion('');
    setBusy(true);
    submittedAt.current = Date.now();

    const ac = new AbortController();
    abortRef.current = ac;
    // Only a turn that has not terminated may be moved by an abort: a Stop that lands after `done`
    // must never overwrite an answer the reader already has (same functional guard as L1's).
    const markStopped = () =>
      setTurns((prev) => prev.map((t) => (t.id === id && t.stage !== 'done' && t.stage !== 'error' ? { ...t, stage: 'error', error: STOPPED } : t)));

    try {
      const res = await fetch('/api/ask/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, lanes, ...(threadIdRef.current ? { threadId: threadIdRef.current } : {}) }),
        signal: ac.signal,
      });
      if (res.status === 401) { patch(id, { stage: 'error', error: 'Please sign in to explore the paths.', needsSignIn: true }); return; }
      if (!res.ok) {
        // The API envelope (api-error.ts) carries a safe message and, on a 429/503, when to try
        // again — in the body as `retryAfterSec` and in the `Retry-After` header. A rate limit used
        // to collapse into the generic error with an instant retry that re-failed against the same
        // limit (UX_POLISH_AUDIT P2); now the turn says what happened and the retry control waits.
        let message = ERROR_FALLBACK;
        let retryAfterSec: number | undefined;
        try {
          const data = (await res.json()) as { error?: { message?: string; retryAfterSec?: number } | string; message?: string };
          if (typeof data.error === 'string') message = data.error;
          else if (typeof data.error?.message === 'string') message = data.error.message;
          else if (typeof data.message === 'string') message = data.message;
          const bodySec = typeof data.error === 'object' ? data.error?.retryAfterSec : undefined;
          if (typeof bodySec === 'number' && Number.isFinite(bodySec) && bodySec > 0) retryAfterSec = bodySec;
        } catch {
          // an unparseable body keeps the generic message
        }
        if (retryAfterSec === undefined) {
          const header = Number(res.headers.get('Retry-After'));
          if (Number.isFinite(header) && header > 0) retryAfterSec = header;
        }
        // Clamped: a value minted in front of the origin (a proxy, a WAF) could exceed the 2^31 ms
        // timer ceiling, which browsers fire immediately — a re-render loop in the reader's own
        // tab. The origin itself only ever sends 30 / 60 / 3600 (rate-limit.ts).
        if (retryAfterSec !== undefined) retryAfterSec = Math.min(retryAfterSec, 86_400);
        if ((res.status === 429 || res.status === 503) && retryAfterSec !== undefined) {
          patch(id, { stage: 'error', error: `${message} Try again in ${formatWait(retryAfterSec)}.`, retryAt: Date.now() + retryAfterSec * 1000 });
        } else {
          patch(id, { stage: 'error', error: message });
        }
        return;
      }
      if (!res.body) { patch(id, { stage: 'error', error: ERROR_FALLBACK }); return; }

      const reader = res.body.getReader();
      // Belt and braces: a real browser rejects the pending read() on abort; a test double's
      // Response body does not honour the signal. Cancelling the reader resolves the read as done
      // in both, so the loop below exits either way.
      ac.signal.addEventListener('abort', () => { void reader.cancel().catch(() => undefined); }, { once: true });
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let ev: StreamEvent;
          try { ev = JSON.parse(line) as StreamEvent; } catch { continue; }
          switch (ev.stage) {
            case 'retrieved': patch(id, { stage: 'retrieved', sources: ev.sources, traditions: ev.traditions }); break;
            case 'composing': patch(id, { stage: 'composing', attempt: ev.attempt }); break;
            case 'verifying': patch(id, { stage: 'verifying', attempt: ev.attempt }); break;
            case 'rejected': patch(id, { stage: 'rejected', attempt: ev.attempt }); break;
            case 'done': patch(id, { stage: 'done', result: ev.result }); break;
            case 'thread':
              // The id is server-trusted, but it is about to become part of a URL and a link —
              // shape-checked here so a malformed event can never relabel the page.
              if (!threadIdRef.current && isThreadId(ev.threadId)) {
                threadIdRef.current = ev.threadId;
                setThreadId(ev.threadId);
                // replaceState, not push: back from a result must not land on an empty /ask.
                // (Next copies the current route tree onto this entry, so a later Back renders the
                // /ask page under the thread URL — thread-restore.tsx heals that on remount.)
                window.history.replaceState(null, '', `/ask/${ev.threadId}`);
              }
              break;
            case 'outcome': patch(id, { askOutcomeId: ev.askOutcomeId }); break;
            case 'saved': patch(id, { saved: ev.ok }); break;
            case 'error': patch(id, { stage: 'error', error: ev.message }); break;
            default: patch(id, { stage: 'retrieving' });
          }
        }
      }
      // The reader ended it. Checked BEFORE the L1 guard below, whose copy would otherwise claim
      // the stream failed. Honest limit: the route does not read the request signal, so Stop stops
      // waiting — the server finishes on its own, and the thread row already exists.
      if (ac.signal.aborted) { markStopped(); return; }
      // L1 — THE TERMINAL-STATE GUARD, and the hole it closes is not an exception. The `catch`
      // below covers throws; it does NOT cover the stream simply ENDING without a `done` or `error`
      // event — a truncated response, an intermediary giving up, a handler that returns without
      // emitting. Nothing throws, so nothing is caught: the loop exits, `busy` clears, and the turn
      // would sit on `retrieving` forever with no answer, no error and no retry. Reached only when
      // the stream closed mid-flight, so a completed answer is untouched.
      setTurns((prev) =>
        prev.map((t) =>
          t.id === id && t.stage !== 'done' && t.stage !== 'error'
            ? { ...t, stage: 'error', error: 'The answer stopped partway. Please try again.' }
            : t,
        ),
      );
    } catch {
      // An abort before the headers arrive rejects the fetch itself.
      if (ac.signal.aborted) markStopped();
      else patch(id, { stage: 'error', error: 'Network error. Please try again.' });
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setBusy(false);
    }
  }, [busy, patch, lanes]);

  const stop = useCallback(() => {
    if (Date.now() - submittedAt.current < STOP_GUARD_MS) return;
    abortRef.current?.abort();
  }, []);
  const toggleLane = useCallback((key: LaneKey, value: boolean) => {
    setLanes((prev) => ({ ...prev, [key]: value }));
  }, []);

  // The column's minimum height belongs to the PAGE (app/ask/page.tsx), which wraps the mode
  // toggle AND this component in it. Sizing this column alone to the viewport left the toggle
  // outside the measure, so the document was always ~50px taller than the scrollport and the sticky
  // composer sat over the bottom of the "centred" invitation on every first visit.
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-4 pt-6 sm:px-6 sm:pb-6 sm:pt-10">
      <div className={turns.length === 0 ? 'flex flex-1 flex-col justify-center' : 'flex-1 space-y-8'}>
        {turns.length === 0 && <AskEmptyState onPick={setQuestion} />}

        {/* THE ANSWER WAS SILENT. /ask streams retrieval, composition, verification and the finished
            answer, and NONE of it was announced: a screen-reader user pressed Ask and heard nothing
            until they went looking. `polite` rather than `assertive` so it waits for a pause. */}
        <div aria-live="polite" aria-busy={busy} className={turns.length === 0 ? 'sr-only' : 'space-y-8'}>
          {/* Retry re-asks THIS turn's question, not whatever is in the composer — `ask` clears the
              composer on submit, so by the time a turn can fail its question exists only on the
              turn itself. Replace in place ONLY when retrying a failure; a completed answer's retry
              appends. */}
          {turns.map((t) => (
            <TurnView
              key={t.id}
              turn={t}
              threadId={threadId}
              onRetry={() => ask(t.question, t.stage === 'error' ? t.id : undefined)}
              busy={busy}
            />
          ))}
        </div>
      </div>

      <AskComposer
        question={question}
        onChange={setQuestion}
        onSubmit={() => { void ask(question); }}
        onStop={stop}
        busy={busy}
        signedIn={signedIn}
        lanes={lanes}
        onToggleLane={toggleLane}
      />
    </div>
  );
}

function TurnView({ turn, threadId, onRetry, busy }: { turn: Turn; threadId: string | null; onRetry: () => void; busy: boolean }) {
  const inFlight = turn.stage !== 'done' && turn.stage !== 'error';
  // A 429 said when to try again: the retry control waits for that moment. One timer, armed only
  // while a wait is pending (L1b's "one timer" shape).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (turn.retryAt === undefined || turn.retryAt <= now) return;
    // Delay from the wall clock, not from `now`: `now` is the mount-time reading, and a 429 on a
    // turn that has been mounted a while would otherwise wait (elapsed + retryAfter) while the
    // copy promises only the latter.
    const t = setTimeout(() => setNow(Date.now()), Math.max(0, turn.retryAt - Date.now()));
    return () => clearTimeout(t);
  }, [turn.retryAt, now]);
  const waiting = turn.retryAt !== undefined && now < turn.retryAt;

  return (
    <div id={`ask-turn-${turn.id}`} className="scroll-mt-6">
      {/* The chat-style bubble is replaced with the mockup's editorial treatment: a small-caps
          label over the question set in EB Garamond. */}
      <div className="mb-6">
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">Question</p>
        <p className="max-w-[62ch] font-display text-2xl leading-snug text-stone-900 dark:text-stone-100">{turn.question}</p>
        {/* THE WORKING SIGNAL. Owner, 2026-09-06: "when something is running it's not discernible
            that it's running." A 2px travelling bar under the question, from the first committed
            frame of a submission until the stream terminates. The house indeterminate idiom
            (`.progress-travel`, globals.css) — the one motion the PRD exempts from its fade-only
            budget, because "a still line is precisely what 'it looks like it's paused' means".
            Indeterminate on purpose: no `aria-valuenow`, no percentage, no countdown (L1b) —
            inventing a number would be a lie about progress on a surface whose whole contract is
            not inventing things. */}
        {inFlight && (
          <div role="progressbar" aria-label="Answering" className="mt-3 h-[2px] w-full overflow-hidden bg-stone-200 dark:bg-stone-800">
            <div className="progress-travel h-full w-1/3 bg-accent-600 dark:bg-accent-400" />
          </div>
        )}
        {/* A stored turn is a TRANSCRIPT (§4.5): dated, historical, never "the answer, now". A live
            turn whose save failed says so (§4.6 saved signal) — silence would turn "I lost my
            question" into "I lost it and believed I hadn't". */}
        {turn.askedAt && (
          <p className="mt-1 font-sans text-xs tracking-wide text-stone-500 dark:text-stone-500">
            Asked {new Date(turn.askedAt).toLocaleDateString(DISPLAY_LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })} · historical record
          </p>
        )}
        {turn.saved === false && (
          <p className="mt-1 font-sans text-xs tracking-wide text-amber-700 dark:text-amber-400">
            This turn wasn’t saved to your research history. The answer below is complete.
          </p>
        )}
      </div>
      {turn.stage === 'error' ? (
        <div role="alert" className="border border-red-300/60 bg-red-50/60 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          {/* A017 — `trim()`, not `??`: an empty or whitespace-only message is the same empty box as
              a missing one, and `??` would let '' through. See ERROR_FALLBACK above. */}
          {turn.error?.trim() ? turn.error : ERROR_FALLBACK}
          {/* Q1 — the 401 asked the reader to sign in and offered only "Ask again", which re-fails
              identically (2026-08-16 QA fleet; the most-repeated finding of the run). The way out
              belongs in the failure itself, not elsewhere in the nav. */}
          {turn.needsSignIn && (
            <p className="mt-2">
              <Link href="/auth/sign-in" className="font-semibold underline underline-offset-2 hover:text-red-900 dark:hover:text-red-100">
                Sign in to ask
              </Link>
            </p>
          )}
          {/* An error told the reader to "please try again" and gave them nothing to try it with —
              the question is already gone from the composer by then (`ask` clears it). */}
          <RetryButton onRetry={onRetry} busy={busy} tone="error" disabled={waiting} />
        </div>
      ) : turn.stage === 'done' && turn.result ? (
        <Answer
          result={turn.result}
          onRetry={onRetry}
          busy={busy}
          contextTitle={turn.question}
          withdrawnIds={turn.withdrawnIds}
          askOutcomeId={turn.askOutcomeId}
          linkCtx={{ threadId, question: turn.question }}
        />
      ) : (
        <Progress turn={turn} />
      )}
    </div>
  );
}
