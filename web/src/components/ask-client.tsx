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
type TeacherResult =
  | { kind: 'composed'; response: { blocks: Block[] }; retrieval: Retrieved[] }
  | { kind: 'fallback'; retrieval: Retrieved[]; violations: { check: string; message: string }[] }
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
      if (res.status === 401) { patch(id, { stage: 'error', error: 'Please sign in to ask the voices.' }); return; }
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
    <div className="mx-auto flex min-h-[calc(100vh-1px)] max-w-2xl flex-col px-6 pb-4 pt-8">
      <header className="mb-6">
        <h1 className="font-scripture text-3xl font-medium text-stone-800 dark:text-stone-100">Ask the voices</h1>
        <p className="mt-2 text-sm leading-relaxed text-stone-500 dark:text-stone-400">
          Hear what commentators across the traditions have said — quoted, attributed, never interpreted.
          <span className="mt-1 block text-xs text-stone-400">Currently answering from the Gospels.</span>
        </p>
      </header>

      <div className="flex-1 space-y-8">
        {turns.length === 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">Try</p>
            <div className="flex flex-col gap-2">
              {EXAMPLES.map((ex) => (
                <button key={ex} onClick={() => ask(ex)}
                  className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-left text-sm text-stone-600 transition-colors hover:border-stone-300 hover:bg-white dark:border-stone-700 dark:bg-stone-800/50 dark:text-stone-300 dark:hover:bg-stone-800">
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t) => <TurnView key={t.id} turn={t} />)}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); ask(question); }}
        className="sticky bottom-2 mt-6 rounded-xl border border-stone-200 bg-white p-2.5 shadow-sm dark:border-stone-700 dark:bg-stone-800">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(question); } }}
          placeholder="Ask a question…"
          rows={2}
          maxLength={500}
          className="w-full resize-none bg-transparent px-1 text-[15px] leading-relaxed text-stone-800 placeholder:text-stone-400 outline-none dark:text-stone-100"
        />
        <div className="mt-1 flex items-center justify-between px-1">
          <span className="text-xs text-stone-400">{busy ? 'Consulting the voices…' : '↵ to send · ⇧↵ newline'}</span>
          <button type="submit" disabled={busy || !question.trim()}
            className="rounded-full bg-stone-800 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white">
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
      <div className="mb-3 flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-stone-100 px-3.5 py-2 text-[15px] text-stone-800 dark:bg-stone-800 dark:text-stone-100">
          {turn.question}
        </div>
      </div>
      {turn.stage === 'error' ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
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
      {done ? <span className="font-bold text-emerald-600 dark:text-emerald-400">✓</span>
        : active ? <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-stone-400 border-t-transparent" />
          : <span className="inline-block h-3 w-3 rounded-full border-[1.5px] border-stone-300 dark:border-stone-600" />}
      <span className={done ? 'text-stone-500 dark:text-stone-400' : active ? 'font-medium text-stone-700 dark:text-stone-200' : 'text-stone-400'}>{label}</span>
    </div>
  );

  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-700 dark:bg-stone-800/50">
      <div className="flex flex-col gap-2.5">
        {step('Searching the commentaries', rank >= 1, rank === 0)}
        {rank >= 1 && (
          <div className="flex items-center gap-2.5">
            <span className="font-bold text-emerald-600 dark:text-emerald-400">✓</span>
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
        <div className="mt-3.5 border-t border-stone-200 pt-3 dark:border-stone-700">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">Reading these while I compose</p>
          <div className="flex animate-pulse flex-col gap-2">
            {turn.sources.slice(0, 3).map((s) => (
              <p key={s.sourceId} className="text-[13px] leading-relaxed text-stone-500 dark:text-stone-400">
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
      <p className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600 dark:border-stone-700 dark:bg-stone-800/50 dark:text-stone-300">
        {result.reason}
      </p>
    );
  }
  if (result.kind === 'fallback') return <Fallback retrieval={result.retrieval} />;

  const blocks = result.response.blocks;
  const framing = blocks.find((b) => b.type === 'framing') as Extract<Block, { type: 'framing' }> | undefined;
  const voices = blocks.filter((b): b is Extract<Block, { type: 'voice' }> => b.type === 'voice');
  const passages = blocks.find((b) => b.type === 'passages') as Extract<Block, { type: 'passages' }> | undefined;

  return (
    <div className="space-y-5">
      {framing && <p className="text-[15px] leading-relaxed text-stone-600 dark:text-stone-300">{framing.text}</p>}
      <div className="space-y-5">
        {voices.map((v, i) => (
          <figure key={i} className="border-l-2 border-stone-300 pl-4 dark:border-stone-600">
            <blockquote className="font-scripture text-[17px] leading-relaxed text-stone-800 dark:text-stone-100">“{v.quote}”</blockquote>
            <figcaption className="mt-2 text-sm text-stone-500 dark:text-stone-400">
              <span className="font-medium text-stone-700 dark:text-stone-200">{v.attribution.author}</span>, {v.attribution.work}
              <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500 dark:bg-stone-800 dark:text-stone-400">{v.attribution.tradition}</span>
            </figcaption>
            {v.summary && <p className="mt-1.5 text-xs text-stone-400">{v.summary}</p>}
          </figure>
        ))}
      </div>
      {passages && passages.items.length > 0 && (
        <div className="border-t border-stone-200 pt-4 dark:border-stone-700">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">Passages</p>
          <div className="flex flex-wrap gap-2">
            {passages.items.map((p, i) => (
              <Link key={i} href={readerHref(p.start)}
                className="rounded-full border border-stone-200 bg-white px-3 py-1 text-sm text-stone-700 transition-colors hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200">
                {p.start === p.end ? formatVerseId(p.start) : `${formatVerseId(p.start)}–${formatVerseId(p.end).split(' ').pop()}`} →
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Fallback({ retrieval }: { retrieval: Retrieved[] }) {
  return (
    <div>
      <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
        A grounded answer couldn’t be composed for this one. Here are the sources retrieval found — read them directly.
      </p>
      <div className="space-y-4">
        {retrieval.map((r) => (
          <figure key={r.sourceId} className="border-l-2 border-stone-200 pl-4 dark:border-stone-700">
            <blockquote className="text-[15px] leading-relaxed text-stone-700 dark:text-stone-300">
              {r.content.length > 320 ? `${r.content.slice(0, 320)}…` : r.content}
            </blockquote>
            <figcaption className="mt-1.5 text-sm text-stone-500">
              <span className="font-medium text-stone-700 dark:text-stone-300">{r.metadata.author}</span>, {r.metadata.sourceTitle}
              {r.metadata.tradition ? ` · ${r.metadata.tradition}` : ''}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
