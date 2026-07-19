'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { decodeVerseId, formatVerseId } from '@bible/verse-id';
import { BOOK_BY_NUM } from '@bible/books';

// --- shapes mirrored from the server (client only renders; server verifier is truth) ---
interface Attribution { author: string; work: string; tradition: string; year?: number }
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

function readerHref(verseId: number): string {
  const { book, chapter } = decodeVerseId(verseId);
  return `/read/${BOOK_BY_NUM.get(book)?.slug ?? 'jhn'}/${chapter}`;
}

export function AskClient() {
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [turns]);

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
        body: JSON.stringify({ question: q }),
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
    } catch {
      patch(id, { stage: 'error', error: 'Network error. Please try again.' });
    } finally {
      setBusy(false);
    }
  }, [busy, patch]);

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.75rem-env(safe-area-inset-bottom)-1px)] max-w-2xl flex-col px-4 pb-4 pt-6 sm:px-6 sm:pb-6 sm:pt-10 md:min-h-[calc(100dvh-1px)]">
      <header className="mb-6 sm:mb-8">
        <h1 className="font-display text-[2rem] font-medium tracking-tight text-stone-900 dark:text-stone-100">Explore the paths</h1>
        <p className="mt-2 font-serif text-[15px] leading-relaxed text-stone-600 dark:text-stone-400">
          Hear what commentators across the traditions have said — quoted, attributed, never interpreted.
          <span className="mt-1.5 block font-sans text-xs tracking-wide text-stone-500 dark:text-stone-500">Currently answering from the Gospels.</span>
        </p>
      </header>

      <div className="flex-1 space-y-8">
        {turns.length === 0 && (
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-500">Try</p>
            <div className="flex flex-col gap-2.5">
              {EXAMPLES.map((ex) => (
                <button key={ex} onClick={() => ask(ex)}
                  className="min-h-[48px] rounded-xl bg-paper px-4 py-2.5 text-left font-serif text-[15px] text-stone-700 shadow-paper transition-all duration-200 ease-gentle hover:text-stone-900 hover:shadow-float active:shadow-paper active:brightness-[0.98] dark:bg-stone-800/70 dark:text-stone-300 dark:shadow-none dark:hover:bg-stone-800 dark:hover:text-stone-100 dark:active:bg-stone-800">
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t) => <TurnView key={t.id} turn={t} />)}
        <div ref={bottomRef} className="scroll-mb-48 md:scroll-mb-36" />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); ask(question); }}
        className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom)+0.25rem)] mt-6 rounded-2xl bg-paper p-3 shadow-float transition-shadow duration-200 ease-gentle focus-within:shadow-deep md:bottom-3 dark:bg-stone-800">
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
          placeholder="Ask a question…"
          rows={2}
          maxLength={500}
          className="focus-quiet w-full resize-none bg-transparent px-1.5 pt-0.5 font-serif text-base leading-relaxed text-stone-900 outline-none placeholder:text-stone-400 dark:text-stone-100 dark:placeholder:text-stone-500"
        />
        <div className="mt-1 flex min-h-[44px] items-center justify-between px-1.5">
          <span className="text-xs text-stone-500 dark:text-stone-400">
            {busy ? 'Consulting the voices…' : <span className="[@media(hover:none)]:hidden">↵ to send · ⇧↵ newline</span>}
          </span>
          <button type="submit" disabled={busy || !question.trim()}
            className="min-h-[44px] rounded-full bg-accent-700 px-6 text-sm font-semibold text-stone-50 transition-colors duration-200 ease-gentle hover:bg-accent-800 active:bg-accent-900 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-0 sm:px-5 sm:py-1.5 dark:bg-accent-500 dark:hover:bg-accent-400">
            Ask
          </button>
        </div>
      </form>
    </div>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  return (
    <div>
      <div className="mb-4 flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-stone-200/80 px-4 py-2.5 font-serif text-[15px] text-stone-900 dark:bg-stone-800 dark:text-stone-100">
          {turn.question}
        </div>
      </div>
      {turn.stage === 'error' ? (
        <div className="rounded-xl bg-accent-50 px-4 py-3 text-sm text-accent-900 shadow-paper dark:bg-accent-950/40 dark:text-accent-200 dark:shadow-none">
          {turn.error}
        </div>
      ) : turn.stage === 'done' && turn.result ? (
        <Answer result={turn.result} />
      ) : (
        <Progress turn={turn} />
      )}
    </div>
  );
}

function Progress({ turn }: { turn: Turn }) {
  const rank = STAGE_RANK[turn.stage];
  const refining = turn.stage === 'composing' && turn.attempt > 0;
  const step = (label: string, done: boolean, active: boolean) => (
    <div className="flex items-center gap-2.5">
      {done ? <span className="font-bold text-accent-700 dark:text-accent-300">✓</span>
        : active ? <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-stone-400 border-t-transparent" />
          : <span className="inline-block h-3 w-3 rounded-full border-[1.5px] border-stone-300 dark:border-stone-600" />}
      <span className={done ? 'text-stone-500 dark:text-stone-400' : active ? 'font-medium text-stone-700 dark:text-stone-200' : 'text-stone-400 dark:text-stone-500'}>{label}</span>
    </div>
  );

  return (
    <div className="rounded-2xl bg-paper p-5 shadow-paper dark:bg-stone-800/60 dark:shadow-none">
      <div className="flex flex-col gap-2.5">
        {step('Searching the commentaries', rank >= 1, rank === 0)}
        {rank >= 1 && (
          <div className="flex items-center gap-2.5">
            <span className="font-bold text-accent-700 dark:text-accent-300">✓</span>
            <span className="text-stone-500 dark:text-stone-400">
              Found <b className="text-stone-700 dark:text-stone-200">{turn.sources.length} voices</b> across{' '}
              <b className="text-stone-700 dark:text-stone-200">{turn.traditions} tradition{turn.traditions === 1 ? '' : 's'}</b>
            </span>
          </div>
        )}
        {step(refining ? `Refining the answer (attempt ${turn.attempt + 1})…` : 'Composing a grounded answer', rank >= 3, turn.stage === 'composing')}
        {step('Verifying every quote is word-for-word', rank >= 4, turn.stage === 'verifying')}
      </div>

      {turn.sources.length > 0 && (
        <div className="mt-4 rounded-xl bg-stone-100/90 p-3.5 dark:bg-stone-900/40">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-500">Reading these while I compose</p>
          <div className="flex animate-pulse flex-col gap-2">
            {turn.sources.slice(0, 3).map((s) => (
              <p key={s.sourceId} className="font-serif text-[13px] leading-relaxed text-stone-500 dark:text-stone-400">
                <b className="text-stone-700 dark:text-stone-300">{s.author}</b> — {s.content.slice(0, 130).replace(/\n/g, ' ')}…
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Answer({ result }: { result: TeacherResult }) {
  if (result.kind === 'empty') {
    return (
      <p className="rounded-xl bg-paper px-4 py-3 font-serif text-[15px] text-stone-600 shadow-paper dark:bg-stone-800/60 dark:text-stone-300 dark:shadow-none">
        {result.reason}
      </p>
    );
  }
  if (result.kind === 'fallback') return <><Fallback retrieval={result.retrieval} /><Lanes result={result} /></>;

  const blocks = result.response.blocks;
  const framing = blocks.find((b) => b.type === 'framing') as Extract<Block, { type: 'framing' }> | undefined;
  const voices = blocks.filter((b): b is Extract<Block, { type: 'voice' }> => b.type === 'voice');
  const passages = blocks.find((b) => b.type === 'passages') as Extract<Block, { type: 'passages' }> | undefined;

  return (
    <div className="space-y-6">
      {framing && <p className="font-serif text-base leading-relaxed text-stone-700 dark:text-stone-300">{framing.text}</p>}
      <div className="space-y-6">
        {voices.map((v, i) => (
          <figure key={i} className="border-l-[3px] border-accent-300/80 pl-5 dark:border-accent-800">
            <blockquote className="break-words font-serif text-[17px] leading-[1.7] text-stone-900 dark:text-stone-100">“{v.quote}”</blockquote>
            <figcaption className="mt-2.5 text-sm text-stone-500 dark:text-stone-400">
              <span className="font-semibold text-stone-800 dark:text-stone-200">{v.attribution.author}</span>, {v.attribution.work}
              <span className="ml-2 rounded-full bg-stone-200/70 px-2.5 py-0.5 text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-400">{v.attribution.tradition}</span>
            </figcaption>
            {v.summary && <p className="mt-1.5 text-[13px] text-stone-500 dark:text-stone-500">{v.summary}</p>}
          </figure>
        ))}
      </div>
      <Lanes result={result} />
      {passages && passages.items.length > 0 && (
        <div className="pt-1">
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-500">Passages</p>
          <div className="flex flex-wrap gap-2">
            {passages.items.map((p, i) => (
              <Link key={i} href={readerHref(p.start)}
                className="rounded-full bg-paper px-3.5 py-1.5 text-sm text-stone-700 shadow-paper transition-all duration-200 ease-gentle hover:text-accent-800 hover:shadow-float dark:bg-stone-800 dark:text-stone-200 dark:shadow-none dark:hover:text-accent-300">
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
function LaneSection({ title, note, chunks }: { title: string; note: string; chunks?: LaneChunk[] }) {
  if (!chunks || chunks.length === 0) return null;
  return (
    <div className="pt-2">
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-500">{title}</p>
      <p className="mb-3 text-[13px] italic text-stone-400 dark:text-stone-500">{note}</p>
      <div className="space-y-4">
        {chunks.map((c) => (
          <figure key={c.sourceId} className="border-l-[3px] border-stone-300/70 pl-5 dark:border-stone-700">
            <blockquote className="whitespace-pre-line break-words font-serif text-[15px] leading-relaxed text-stone-700 dark:text-stone-300">
              {c.content.length > 400 ? `${c.content.slice(0, 400)}…` : c.content}
            </blockquote>
            <figcaption className="mt-2 text-sm text-stone-500 dark:text-stone-400">
              <span className="font-semibold text-stone-800 dark:text-stone-300">{c.metadata.author}</span>
              {c.metadata.sourceTitle ? `, ${c.metadata.sourceTitle}` : ''}
              {c.metadata.paraphrase ? <span title="A metrical paraphrase — not the Scripture text itself." className="ml-2 rounded-full bg-accent-700/10 px-2 py-0.5 text-[10px] font-medium text-accent-700 dark:text-accent-300">paraphrase · not Scripture</span> : null}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

function Lanes({ result }: { result: Extract<TeacherResult, { kind: 'composed' | 'fallback' }> }) {
  return (
    <>
      <LaneSection title="Sermons on this theme" note="Preached expositions — not commentary; read them in full for the argument." chunks={result.sermons} />
      <LaneSection title="Theology & confessions" note="Systematic and confessional reflections on this theme." chunks={result.theology} />
      <LaneSection title="Hymns & sacred poetry" note="Sung and poetic responses — and (where marked) a metrical paraphrase, not the Scripture text itself." chunks={result.song_verse} />
    </>
  );
}

function Fallback({ retrieval }: { retrieval: Retrieved[] }) {
  return (
    <div>
      <p className="mb-5 rounded-xl bg-accent-50 px-4 py-3 font-serif text-[15px] text-accent-900 shadow-paper dark:bg-accent-950/30 dark:text-accent-200 dark:shadow-none">
        A grounded answer couldn’t be composed for this one. Here are the sources retrieval found — read them directly.
      </p>
      <div className="space-y-5">
        {retrieval.map((r) => (
          <figure key={r.sourceId} className="border-l-[3px] border-stone-300/80 pl-5 dark:border-stone-700">
            <blockquote className="font-serif text-[15px] leading-relaxed text-stone-700 dark:text-stone-300">
              {r.content.length > 320 ? `${r.content.slice(0, 320)}…` : r.content}
            </blockquote>
            <figcaption className="mt-2 text-sm text-stone-500 dark:text-stone-400">
              <span className="font-semibold text-stone-800 dark:text-stone-300">{r.metadata.author}</span>, {r.metadata.sourceTitle}
              {r.metadata.tradition ? ` · ${r.metadata.tradition}` : ''}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
