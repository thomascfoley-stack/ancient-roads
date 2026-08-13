'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { formatVerseId } from '@bible/verse-id';
import { verseHref } from '@/lib/verse-link';
import { count } from '@/lib/plural';
import { deskHref, withPane } from '@/lib/desk';
import { SaveToStudy, resolveVoiceSourceId } from '@/components/save-to-study';

// --- shapes mirrored from the server (client only renders; server verifier is truth) ---
interface Attribution { author: string; work: string; slug?: string; tradition: string; year?: number }
type Block =
  | { type: 'framing'; text: string }
  | { type: 'voice'; attribution: Attribution; quote: string; summary?: string; anchors?: { start: number; end: number }[] }
  | { type: 'passages'; items: { start: number; end: number; translation: string }[] }
  | { type: 'prayer_prompt'; text: string };

interface SourcePreview { sourceId: string; author: string; sourceTitle: string; tradition: string | null; content: string; score: number }
interface Retrieved { sourceId: string; score: number; content: string; metadata: { author: string; sourceTitle: string; tradition: string | null } }
// Register-lane chunk (song/verse, sermon, theology) — verbatim corpus text
// surfaced in its OWN labeled section, never blended into the exegetical voices.
interface LaneChunk { sourceId: string; content: string; metadata: { author: string; sourceTitle: string; work?: string; register?: string; paraphrase?: boolean } }
interface Lanes { song_verse?: LaneChunk[]; sermons?: LaneChunk[]; theology?: LaneChunk[] }
type TeacherResult =
  | ({ kind: 'composed'; response: { blocks: Block[] }; retrieval: Retrieved[] } & Lanes)
  | ({ kind: 'fallback'; retrieval: Retrieved[]; violations: { check: string; message: string }[] } & Lanes)
  | { kind: 'empty'; reason: string };

type Stage = 'retrieving' | 'retrieved' | 'composing' | 'verifying' | 'rejected' | 'done' | 'error';
type StreamEvent =
  | { stage: 'retrieving' }
  | { stage: 'retrieved'; sources: SourcePreview[]; traditions: number }
  | { stage: 'composing'; attempt: number }
  | { stage: 'verifying'; attempt: number }
  | { stage: 'rejected'; attempt: number }
  | { stage: 'done'; result: TeacherResult }
  | { stage: 'error'; message: string };

interface Turn {
  id: number;
  question: string;
  stage: Stage;
  attempt: number;
  sources: SourcePreview[];
  traditions: number;
  result?: TeacherResult;
  error?: string;
}

const EXAMPLES = [
  'What does the Gospel of John say about the Word becoming flesh?',
  'How have commentators understood being born again?',
  'Is Jesus really God? Just tell me the answer.',
];

const STAGE_RANK: Record<Stage, number> = { error: -1, retrieving: 0, retrieved: 1, composing: 2, rejected: 2, verifying: 3, done: 4 };

// The desk href for a work slug, opening on an otherwise-empty desk — never null
// unless the slug itself is missing (not every retrieved row has been backfilled
// with one yet; those results render as plain text, not a broken link).
function workHref(slug: string | undefined): string | null {
  return slug ? deskHref(withPane([], { kind: 'work', slug })) : null;
}

// Wraps a result card in a link to its work on the study desk, when a slug is
// known. Renders children unwrapped when it isn't — a result must never look
// clickable and fail to navigate.
function ResultLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) return <>{children}</>;
  return (
    <Link href={href} className="group -mx-2.5 block px-2.5 py-1 transition-colors duration-150 ease-gentle hover:bg-stone-100/80 focus-quiet dark:hover:bg-stone-800/50">
      {children}
    </Link>
  );
}

// Era accents (PRD §4): each voice card takes a 3px era-coloured left border and the
// attribution carries that era's ornament in the same colour, keyed off the attribution's
// year (Early –500, Medieval 501–1500, Reformation 1501–1700, Modern 1701–). `year` is
// optional in the response schema, so a missing year falls back to the Modern neutral
// rather than guessing an era from the free-text tradition string.
const ERAS = {
  early: { border: 'border-l-era-early', ornament: '·', ornamentClass: 'text-era-early' },
  medieval: { border: 'border-l-era-medieval', ornament: '◆', ornamentClass: 'text-era-medieval' },
  reformation: { border: 'border-l-era-reformation', ornament: '§', ornamentClass: 'text-era-reformation' },
  modern: { border: 'border-l-era-modern', ornament: '—', ornamentClass: 'text-era-modern' },
} as const;

function eraOf(year?: number) {
  if (year == null) return ERAS.modern;
  if (year <= 500) return ERAS.early;
  if (year <= 1500) return ERAS.medieval;
  if (year <= 1700) return ERAS.reformation;
  return ERAS.modern;
}

// Which register lanes to search, alongside the always-on commentary answer.
// History has no retrieval lane yet (historian works are shelf-only) — shown
// disabled rather than omitted, so the full category list is visible.
type LaneKey = 'sermons' | 'theology' | 'songVerse';
const LANE_OPTIONS: { key: LaneKey; label: string }[] = [
  { key: 'sermons', label: 'Sermons' },
  { key: 'theology', label: 'Theology & Confessions' },
  { key: 'songVerse', label: 'Hymns & Sacred Poetry' },
];

function LaneFilter({ lanes, onToggle }: { lanes: Record<LaneKey, boolean>; onToggle: (key: LaneKey, value: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const activeCount = LANE_OPTIONS.filter((o) => lanes[o.key]).length;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs font-medium text-stone-500 transition-colors duration-150 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
      >
        <span>Choose what to search — Commentary + {activeCount} of {LANE_OPTIONS.length} collections</span>
        <span aria-hidden="true" className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <ul className="edge mt-2 flex flex-col gap-1.5 border bg-stone-50 p-3 dark:bg-stone-950">
          {LANE_OPTIONS.map((o) => (
            <li key={o.key}>
              <label className="flex min-h-[28px] items-center gap-2 text-sm text-stone-700 dark:text-stone-300">
                {/* `accent-*`, not `text-*`. The class here used to be `text-accent-700
                    focus:ring-accent-600`, which is the @tailwindcss/forms idiom — and that
                    plugin is NOT installed (checked package.json), so both classes were inert
                    and every one of these boxes rendered in native browser blue against a
                    terracotta app. A dead class that looks like the fix is worse than no class:
                    it reads as handled. `accent-color` is plain CSS and needs no plugin. */}
                <input
                  type="checkbox"
                  checked={lanes[o.key]}
                  onChange={(e) => onToggle(o.key, e.target.checked)}
                  className="h-4 w-4 rounded border-stone-300 accent-accent-700 dark:border-stone-600 dark:bg-stone-900 dark:accent-accent-500"
                />
                {o.label}
              </label>
            </li>
          ))}
          <li>
            <label title="Historical works aren't searchable here yet." className="flex min-h-[28px] items-center gap-2 text-sm text-stone-400 dark:text-stone-600">
              <input type="checkbox" checked={false} disabled className="h-4 w-4 rounded border-stone-300 dark:border-stone-700" />
              History <span className="text-xs italic">(coming soon)</span>
            </label>
          </li>
        </ul>
      )}
    </div>
  );
}

/**
 * When to tell the reader this answer is taking longer than usual.
 *
 * **The block said ~15s. That number came from a premise INSTR measured false** — it was written
 * for "~18s success, ~45s failure", and the real series was **104s / 58s / 64s** (WORKLOG
 * 2026-08-07). At 15s the line would appear on every single request, so copy that claims an
 * exception would in fact be describing the norm. A message that is false whenever it is shown is
 * worse than no message.
 *
 * DERIVED, and stated as provisional: 90s sits above both the measured median (64s) and mean
 * (~75s) and below the observed maximum (104s), so it fires on a genuinely slow tail rather than
 * on an ordinary wait. **n=3.** That is a weak basis and it is recorded as one — the honest claim
 * is "above typical for every request we have measured", not "the 90th percentile". Re-derive when
 * there is a real latency series; the owner may override on sight.
 */
export const SLOW_ANSWER_NOTICE_MS = 90_000;

export function AskClient() {
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [lanes, setLanes] = useState<Record<LaneKey, boolean>>({ sermons: true, theology: true, songVerse: true });
  const nextId = useRef(1);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [turns]);

  // Prefill from ?q= (the reader's "Ask Ancient Paths" hand-off). Prefill ONLY — never
  // auto-submit, so a reload or shared link can't spend a teacher run uninvited.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) setQuestion(q);
  }, []);

  const patch = useCallback((id: number, p: Partial<Turn>) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...p } : t)));
  }, []);

  const ask = useCallback(async (raw: string) => {
    const q = raw.trim();
    if (!q || busy) return;
    const id = nextId.current++;
    setTurns((prev) => [...prev, { id, question: q, stage: 'retrieving', attempt: 0, sources: [], traditions: 0 }]);
    setQuestion('');
    setBusy(true);

    try {
      const res = await fetch('/api/ask/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, lanes }),
      });
      if (res.status === 401) { patch(id, { stage: 'error', error: 'Please sign in to explore the paths.' }); return; }
      if (!res.ok || !res.body) { patch(id, { stage: 'error', error: 'Something went wrong. Please try again.' }); return; }

      const reader = res.body.getReader();
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
            case 'error': patch(id, { stage: 'error', error: ev.message }); break;
            default: patch(id, { stage: 'retrieving' });
          }
        }
      }
      // L1 — THE TERMINAL-STATE GUARD, and the hole it closes is not an exception.
      //
      // The block's invariant is that every submission resolves to exactly one of two terminal
      // states. The `catch` below covers throws; it does NOT cover the stream simply ENDING
      // without a `done` or `error` event — a truncated response, an intermediary giving up, a
      // handler that returns without emitting. Nothing throws, so nothing is caught: the loop
      // exits, `busy` clears, and the turn sits on `retrieving` forever with no answer, no error
      // and no retry. INSTR measured this endpoint at 58-104s, squarely in the range where a proxy
      // abandons a stream.
      //
      // Reached only when the stream closed mid-flight, so a completed answer is untouched.
      setTurns((prev) =>
        prev.map((t) =>
          t.id === id && t.stage !== 'done' && t.stage !== 'error'
            ? { ...t, stage: 'error', error: 'The answer stopped partway. Please try again.' }
            : t,
        ),
      );
    } catch {
      patch(id, { stage: 'error', error: 'Network error. Please try again.' });
    } finally {
      setBusy(false);
    }
  }, [busy, patch, lanes]);

  const toggleLane = useCallback((key: LaneKey, value: boolean) => {
    setLanes((prev) => ({ ...prev, [key]: value }));
  }, []);

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.75rem-env(safe-area-inset-bottom)-1px)] max-w-2xl flex-col px-4 pb-4 pt-6 sm:px-6 sm:pb-6 sm:pt-10 md:min-h-[calc(100dvh-1px)]">
      <header className="mb-6 sm:mb-8">
        <h1 className="font-display text-3xl font-medium tracking-tight text-stone-900 dark:text-stone-100">Explore the paths</h1>
        <p className="mt-2 font-serif text-base leading-relaxed text-stone-600 dark:text-stone-400">
          Hear what commentators across the traditions have said, quoted and attributed, never interpreted.
          {/* EXPECTATION SET BEFORE THE WAIT, not during it. A first answer can take the better
              part of a minute, because retrieval, composition and a word-for-word verification
              pass all happen before anything is shown. Unannounced, that reads as a stall; named
              here, it reads as the checking the line above just promised. */}
          <span className="mt-1.5 block font-sans text-xs tracking-wide text-stone-500 dark:text-stone-500">
            Currently answering from the Gospels. An answer usually takes 15–45 seconds — every quote is verified before you see it.
          </span>
        </p>
        <LaneFilter lanes={lanes} onToggle={toggleLane} />
      </header>

      {/* EMPTY STATE IS COMPOSED, NOT TOP-ALIGNED. This was `flex-1` with the examples pinned
          to the top, so a first visit was a small heading, three floating cards, and roughly
          400px of nothing above a composer stuck to the bottom edge. It read as a stock
          chatbot. Centring the invitation in the space it actually has makes the screen one
          thing instead of two things separated by a void.

          The examples were three `rounded-xl bg-paper shadow-paper` cards, the same "three
          boxes in a stack" the landing page and the library have already been moved off.
          They are a hairline-separated list now, in the reading face, so they read as
          questions a person might ask rather than as buttons. */}
      <div className={turns.length === 0 ? 'flex flex-1 flex-col justify-center' : 'flex-1 space-y-8'}>
        {turns.length === 0 && (
          <div className="pb-8">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-500">
              Ask about a verse, a phrase, or a question
            </p>
            {/* `.edge` hairlines, not a `divide-stone-200 dark:divide-stone-800` pair — the
                pair's dark half loses the cascade (see THE EDGE in globals.css). */}
            <ul className="edge border-t">
              {EXAMPLES.map((ex) => (
                <li key={ex} className="edge border-b">
                  <button
                    onClick={() => ask(ex)}
                    className="group flex min-h-[56px] w-full items-center gap-3 py-3 text-left font-serif text-lg leading-snug text-stone-500 transition-colors ease-gentle hover:text-accent-700 dark:text-stone-400 dark:hover:text-accent-300"
                  >
                    <span className="flex-1">{ex}</span>
                    <span aria-hidden className="shrink-0 transition-colors ease-gentle group-hover:text-accent-700 dark:group-hover:text-accent-300">&rarr;</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* THE ANSWER WAS SILENT. /ask streams retrieval, composition, verification and the
            finished answer, and NONE of it was announced: a screen-reader user pressed Ask and
            heard nothing until they went looking. Failure was the only announced state.
            `polite` rather than `assertive` so it waits for a pause instead of interrupting. */}
        <div aria-live="polite" aria-busy={busy} className={turns.length === 0 ? 'sr-only' : 'space-y-8'}>
          {/* Retry re-asks THIS turn's question, not whatever is in the composer — `ask` clears
              the composer on submit, so by the time a turn can fail its question exists only on
              the turn itself. */}
          {turns.map((t) => <TurnView key={t.id} turn={t} onRetry={() => ask(t.question)} busy={busy} />)}
        </div>
        <div ref={bottomRef} className="scroll-mb-48 md:scroll-mb-36" />
      </div>

      {/* PRD §5 composer: parchment surface, one 1px vellum hairline, square corners, no
          shadow. `.edge` owns the hairline and is unlayered, so a `focus-within:border-*`
          utility could never override it — focus is shown with the PRD's antique-gold
          outline (§10) instead of a border-colour swap. */}
      <form onSubmit={(e) => { e.preventDefault(); ask(question); }}
        className="edge sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom)+0.25rem)] mt-6 border bg-stone-50 p-3 focus-within:outline-2 focus-within:outline-solid focus-within:outline-accent-600 md:bottom-3 dark:bg-stone-950 dark:focus-within:outline-accent-400">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(question); } }}
          onFocus={(e) => {
            // Keep the composer visible above the on-screen keyboard (iOS
            // scrolls the container; give it a nudge once the keyboard is up).
            const el = e.currentTarget;
            setTimeout(() => el.scrollIntoView({ block: 'end', behavior: 'smooth' }), 300);
          }}
          // PRD §5 Ask: the placeholder is 18px Literata italic in ink-wash gray.
          placeholder="Ask a question…"
          aria-label="Ask a question"
          rows={2}
          maxLength={500}
          className="focus-quiet w-full resize-none bg-transparent px-1.5 pt-0.5 font-serif text-lg leading-relaxed text-stone-900 outline-none placeholder:italic placeholder:text-stone-500 dark:text-stone-100 dark:placeholder:text-stone-400"
        />
        <div className="mt-1 flex min-h-[44px] items-center justify-between px-1.5">
          <span className="text-xs text-stone-500 dark:text-stone-400">
            {busy ? 'Thinking…' : <span className="[@media(hover:none)]:hidden">↵ to send · ⇧↵ newline</span>}
          </span>
          {/* The mockup's solid-ink Ask button; hover fills to antique gold (PRD §6). The
              44px touch target holds at every size (no `sm:min-h-0`). */}
          <button type="submit" disabled={busy || !question.trim()}
            className="min-h-[44px] bg-stone-900 px-6 text-sm font-semibold tracking-[0.02em] text-stone-50 transition-colors duration-200 ease-gentle hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-accent-400">
            Ask
          </button>
        </div>
      </form>
    </div>
  );
}

function TurnView({ turn, onRetry, busy }: { turn: Turn; onRetry: () => void; busy: boolean }) {
  return (
    <div>
      {/* The chat-style bubble is replaced with the mockup's editorial treatment: a
          small-caps label over the question set in EB Garamond. */}
      <div className="mb-6">
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">Question</p>
        <p className="max-w-[62ch] font-display text-2xl leading-snug text-stone-900 dark:text-stone-100">{turn.question}</p>
      </div>
      {turn.stage === 'error' ? (
        <div role="alert" className="border border-red-300/60 bg-red-50/60 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          {turn.error}
          {/* An error told the reader to "please try again" and gave them nothing to try it
              with — the question is already gone from the composer by then (`ask` clears it),
              so trying again meant retyping it. */}
          <RetryButton onRetry={onRetry} busy={busy} tone="error" />
        </div>
      ) : turn.stage === 'done' && turn.result ? (
        <Answer result={turn.result} onRetry={onRetry} busy={busy} contextTitle={turn.question} />
      ) : (
        <Progress turn={turn} />
      )}
    </div>
  );
}

function RetryButton({ onRetry, busy, tone }: { onRetry: () => void; busy: boolean; tone: 'error' | 'fallback' }) {
  return (
    <button
      type="button"
      onClick={onRetry}
      disabled={busy}
      className={`mt-3 inline-flex min-h-[44px] items-center border px-3 text-xs font-semibold transition-colors ease-gentle disabled:cursor-not-allowed disabled:opacity-40 ${
        tone === 'error'
          ? 'border-red-300/70 hover:bg-red-100/60 dark:border-red-900/70 dark:hover:bg-red-950/50'
          : 'border-accent-300/70 text-accent-900 hover:bg-accent-100/60 dark:border-accent-800 dark:text-accent-200 dark:hover:bg-accent-950/50'
      }`}
    >
      {busy ? 'Asking…' : 'Ask again'}
    </button>
  );
}

function Progress({ turn }: { turn: Turn }) {
  const rank = STAGE_RANK[turn.stage];

  // L1b — one timer, one line, inside the progress indicator itself. No spinner, no
  // percentage, no countdown (all three forbidden by the block). Threshold derived from
  // measurement, not from the block's ~15s — see SLOW_ANSWER_NOTICE_MS.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_ANSWER_NOTICE_MS);
    return () => clearTimeout(t);
  }, []);
  const refining = turn.stage === 'composing' && turn.attempt > 0;

  // PRD §5 progress steps: 1px hairline connectors between steps, centred under the 12px
  // indicator column (hence ml-[6px]).
  const connector = <div aria-hidden="true" className="edge ml-[6px] h-2.5 border-l" />;

  const step = (label: string, done: boolean, active: boolean) => (
    <div className="flex items-center gap-2.5 py-1.5">
      {/* The completed check is candle-flame amber — one of flame's three sanctioned uses
          (the Ask stage check). The ACTIVE step is an opacity-pulsing ring, not a spinner:
          the PRD bans spinners outright and budgets motion as fade/pulse only. */}
      {done ? <span className="flex h-3 w-3 items-center justify-center text-sm font-bold text-flame">✓</span>
        : active ? <span className="inline-block h-3 w-3 animate-pulse rounded-full border-[1.5px] border-accent-500" />
          : <span className="inline-block h-3 w-3 rounded-full border-[1.5px] border-stone-400" />}
      {/* Two tiers of text colour, not three. `done` and `pending` used to differ (stone-500/400
          vs stone-400/500), but that second pair measured 2.54:1 on light and 3.58:1 on dark —
          both under WCAG AA's 4.5:1 for normal text. The distinction is not lost: the icon
          column above already says which tier a step is in, with a flame ✓, a pulsing ring, or
          an empty ring — three different SHAPES, so the signal was never colour-only anyway. */}
      <span className={`text-sm ${active ? 'font-medium text-stone-700 dark:text-stone-200' : 'text-stone-500 dark:text-stone-400'}`}>{label}</span>
    </div>
  );

  return (
    <div className="py-2">
      <div className="flex flex-col">
        {step('Searching the commentaries', rank >= 1, rank === 0)}
        {connector}
        {rank >= 1 && (
          <div className="flex items-center gap-2.5 py-1.5">
            <span className="flex h-3 w-3 items-center justify-center text-sm font-bold text-flame">✓</span>
            <span className="text-sm text-stone-500 dark:text-stone-400">
              Found <b className="text-stone-700 dark:text-stone-200">{count(turn.sources.length, 'voice')}</b> across{' '}
              <b className="text-stone-700 dark:text-stone-200">{turn.traditions} tradition{turn.traditions === 1 ? '' : 's'}</b>
            </span>
          </div>
        )}
        {rank >= 1 && connector}
        {step(refining ? `Refining the answer (attempt ${turn.attempt + 1})…` : 'Composing a grounded answer', rank >= 3, turn.stage === 'composing')}
        {connector}
        {step('Verifying every quote is word-for-word', rank >= 4, turn.stage === 'verifying')}
        {slow && (
          <p role="status" className="mt-1 font-serif text-sm leading-relaxed text-stone-500 dark:text-stone-400">
            This one is taking longer than usual — still verifying every quote.
          </p>
        )}
      </div>

      {turn.sources.length > 0 && (
        <div className="edge mt-4 border-t pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-500">Reading these while I compose</p>
          <div className="flex animate-pulse flex-col gap-2">
            {turn.sources.slice(0, 3).map((s) => (
              <p key={s.sourceId} className="font-serif text-sm leading-relaxed text-stone-500 dark:text-stone-400">
                <b className="text-stone-700 dark:text-stone-300">{s.author}</b>. {s.content.slice(0, 130).replace(/\n/g, ' ')}…
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Answer({ result, onRetry, busy, contextTitle }: { result: TeacherResult; onRetry: () => void; busy: boolean; contextTitle?: string }) {
  if (result.kind === 'empty') {
    return (
      <p className="max-w-[62ch] font-serif text-lg leading-relaxed text-stone-500 dark:text-stone-400">
        {result.reason}
      </p>
    );
  }
  if (result.kind === 'fallback') return <><Fallback retrieval={result.retrieval} onRetry={onRetry} busy={busy} contextTitle={contextTitle} /><Lanes result={result} contextTitle={contextTitle} /></>;

  const blocks = result.response.blocks;
  const framing = blocks.find((b) => b.type === 'framing') as Extract<Block, { type: 'framing' }> | undefined;
  const voices = blocks.filter((b): b is Extract<Block, { type: 'voice' }> => b.type === 'voice');
  const passages = blocks.find((b) => b.type === 'passages') as Extract<Block, { type: 'passages' }> | undefined;

  // PRD §5 answer reveal: staggered fade-in, opacity only — framing first, each voice card
  // 60ms after the last, then the register lanes, then the passage list.
  const hasLanes = Boolean(result.sermons?.length || result.theology?.length || result.song_verse?.length);
  const laneDelay = (voices.length + 1) * 60;
  const passageDelay = laneDelay + (hasLanes ? 60 : 0);

  return (
    <div className="space-y-6">
      {framing && (
        <p className="edge animate-fade-in border-t pt-6 font-serif text-lg leading-relaxed text-stone-700 dark:text-stone-300">{framing.text}</p>
      )}
      <div className="space-y-6">
        {voices.map((v, i) => {
          const era = eraOf(v.attribution.year);
          // Save to study (design §7.5, R3). A voice block's section_id is PROMPT-LOCAL (an
          // index into the composer's re-sorted voice subset), never a corpus key, so the
          // saveable source_id is resolved against this turn's retrieval rows. An
          // unresolvable voice renders NO affordance rather than guessing — a guess would
          // save the wrong passage's bytes (see save-to-study.tsx).
          const saveSourceId = resolveVoiceSourceId(result.retrieval, v);
          return (
            <div key={i}>
              {/* PRD: a 1px hairline rule above each voice card. It cannot be a border-t on the
                  figure itself — `.edge` is unlayered and would repaint the 3px era rail too. */}
              <div aria-hidden="true" className="edge mb-6 border-t" />
              <ResultLink href={workHref(v.attribution.slug)}>
                <figure
                  className={`animate-fade-in border-l-[3px] pl-5 ${era.border}`}
                  style={{ animationDelay: `${(i + 1) * 60}ms`, animationFillMode: 'backwards' }}
                >
                  {/* PRD §5: the quote is 17px Literata at 1.75 line-height, 62ch measure.
                      17px sits between the type ladder's 16/18 steps, so it stays a literal. */}
                  <blockquote className="max-w-[62ch] break-words font-serif text-[17px] leading-[1.75] text-stone-900 dark:text-stone-100">“{v.quote}”</blockquote>
                  <figcaption className="small-caps mt-2.5 font-serif text-sm tracking-[0.05em] text-stone-500 dark:text-stone-400">
                    <span className="font-semibold text-stone-800 group-hover:text-accent-800 dark:text-stone-200 dark:group-hover:text-accent-300">{v.attribution.author}</span>
                    <span aria-hidden="true" className={`ml-1.5 text-xs ${era.ornamentClass}`}>{era.ornament}</span>
                    {`, ${v.attribution.work}`}
                    <span className="ml-2">{v.attribution.tradition}</span>
                    {v.attribution.slug && <span className="ml-2 text-xs text-stone-400 opacity-0 transition-opacity group-hover:opacity-100 dark:text-stone-500">Open on desk →</span>}
                  </figcaption>
                  {v.summary && <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-500">{v.summary}</p>}
                </figure>
              </ResultLink>
              {/* The affordance sits OUTSIDE the ResultLink — a button inside an anchor is
                  invalid HTML — aligned with the card text (link px-2.5 + figure pl-5). */}
              {saveSourceId && (
                <SaveToStudy className="ml-[30px]" clip={{ sourceId: saveSourceId }} contextTitle={contextTitle} />
              )}
            </div>
          );
        })}
      </div>
      {hasLanes && (
        <div className="animate-fade-in" style={{ animationDelay: `${laneDelay}ms`, animationFillMode: 'backwards' }}>
          <Lanes result={result} contextTitle={contextTitle} />
        </div>
      )}
      {passages && passages.items.length > 0 && (
        <div className="animate-fade-in pt-1" style={{ animationDelay: `${passageDelay}ms`, animationFillMode: 'backwards' }}>
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">Passages</p>
          {/* PRD passage rows also spec a 17px preview line, but the passages block carries
              only verse-id ranges — no text — so the hairline-separated row is the 14px
              antique-gold reference alone. */}
          <div className="edge border-t">
            {passages.items.map((p, i) => (
              <Link key={i} href={verseHref(p.start)}
                className="edge flex min-h-[44px] items-center border-b py-2.5 font-sans text-sm text-accent-600 transition-colors ease-gentle hover:text-accent-700 hover:underline dark:text-accent-400 dark:hover:text-accent-300">
                {p.start === p.end ? formatVerseId(p.start) : `${formatVerseId(p.start)}–${formatVerseId(p.end).split(' ').pop()}`} →
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// The register LANES (song/verse, sermon, theology) — each a DISTINCT labeled
// section of verbatim corpus text, never blended into the exegetical voices and
// never part of the composed answer (sermon-lane slice 2026-07-18). Attribution
// is author + work only — never a host URL. A paraphrase-tagged item (metrical
// psalter) is marked as such, never presented as Scripture.
function LaneSection({ title, note, chunks, contextTitle }: { title: string; note: string; chunks?: LaneChunk[]; contextTitle?: string }) {
  if (!chunks || chunks.length === 0) return null;
  return (
    <div className="pt-2">
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-500">{title}</p>
      <p className="mb-3 text-sm italic text-stone-500 dark:text-stone-400">{note}</p>
      <div className="space-y-4">
        {chunks.map((c) => (
          <div key={c.sourceId}>
            <ResultLink href={workHref(c.metadata.work)}>
              {/* The neutral rail is a single stone-500 class, not a `stone-300 dark:stone-700`
                  pair — the pair's dark half loses the cascade (see THE EDGE in globals.css),
                  and 500 reads in both themes. */}
              <figure className="border-l-[3px] border-l-stone-500 pl-5">
                <blockquote className="whitespace-pre-line break-words font-serif text-base leading-relaxed text-stone-700 dark:text-stone-300">
                  {c.content.length > 400 ? `${c.content.slice(0, 400)}…` : c.content}
                </blockquote>
                <figcaption className="mt-2 text-sm text-stone-500 dark:text-stone-400">
                  <span className="font-semibold text-stone-800 group-hover:text-accent-800 dark:text-stone-300 dark:group-hover:text-accent-300">{c.metadata.author}</span>
                  {c.metadata.sourceTitle ? `, ${c.metadata.sourceTitle}` : ''}
                  {c.metadata.paraphrase ? <span title="A metrical paraphrase, not the Scripture text itself." className="ml-2 bg-accent-700/10 px-2 py-0.5 text-micro font-medium text-accent-700 dark:text-accent-300">paraphrase · not Scripture</span> : null}
                  {c.metadata.work && <span className="ml-2 text-xs text-stone-400 opacity-0 transition-opacity group-hover:opacity-100 dark:text-stone-500">Open on desk →</span>}
                </figcaption>
              </figure>
            </ResultLink>
            {/* Save to study (design §7.5, R3) — lane chunks carry their corpus sourceId
                directly, so no resolution step is needed here. Outside the ResultLink, as
                with the voice cards above. */}
            <SaveToStudy className="ml-[30px]" clip={{ sourceId: c.sourceId }} contextTitle={contextTitle} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Lanes({ result, contextTitle }: { result: Extract<TeacherResult, { kind: 'composed' | 'fallback' }>; contextTitle?: string }) {
  return (
    <>
      <LaneSection title="Sermons on this theme" note="Preached expositions, not commentary. Read them in full for the argument." chunks={result.sermons} contextTitle={contextTitle} />
      <LaneSection title="Theology & confessions" note="Systematic and confessional reflections on this theme." chunks={result.theology} contextTitle={contextTitle} />
      <LaneSection title="Hymns & sacred poetry" note="Sung and poetic responses, and (where marked) a metrical paraphrase, not the Scripture text itself." chunks={result.song_verse} contextTitle={contextTitle} />
    </>
  );
}

function Fallback({ retrieval, onRetry, busy, contextTitle }: { retrieval: Retrieved[]; onRetry: () => void; busy: boolean; contextTitle?: string }) {
  return (
    <div>
      {/* WHY, and a way forward. This block used to be one apologetic sentence and a dead end:
          no reason, and nothing to press. A reader who has just waited through three visible
          "Refining the answer" attempts is owed both — and the reason here is a GOOD one, so
          saying it out loud turns an apparent failure into the guarantee working. The wording
          stays at the level of the product promise and does not surface raw verifier
          `violations`, which name internal checks and would read as a stack trace. */}
      <div className="edge mb-5 border p-4">
        <p className="font-serif text-base text-stone-800 dark:text-stone-200">
          A grounded answer couldn’t be composed for this one. Here are the sources we found. Read them directly.
        </p>
        <p className="mt-2 font-sans text-xs leading-relaxed text-stone-500 dark:text-stone-400">
          Every quote is checked word-for-word against the original before it is shown. This
          draft didn’t pass that check, so the sources are given to you unedited rather than an
          answer we can’t stand behind. Asking again often composes cleanly.
        </p>
        <RetryButton onRetry={onRetry} busy={busy} tone="fallback" />
      </div>
      <div className="space-y-5">
        {retrieval.map((r) => (
          <div key={r.sourceId}>
            <figure className="border-l-[3px] border-l-stone-500 pl-5">
              <blockquote className="font-serif text-base leading-relaxed text-stone-700 dark:text-stone-300">
                {r.content.length > 320 ? `${r.content.slice(0, 320)}…` : r.content}
              </blockquote>
              <figcaption className="mt-2 text-sm text-stone-500 dark:text-stone-400">
                <span className="font-semibold text-stone-800 dark:text-stone-300">{r.metadata.author}</span>, {r.metadata.sourceTitle}
                {r.metadata.tradition ? ` · ${r.metadata.tradition}` : ''}
              </figcaption>
            </figure>
            {/* Save to study here too — R3 is "one verb on EVERY surfaced item", and the
                fallback's unedited source list is a surfaced list. sourceId is direct. */}
            <SaveToStudy className="ml-5" clip={{ sourceId: r.sourceId }} contextTitle={contextTitle} />
          </div>
        ))}
      </div>
    </div>
  );
}
