'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { decodeVerseId, formatVerseId } from '@bible/verse-id';
import { BOOK_BY_NUM } from '@bible/books';

// Mirrors the contract blocks the API returns. Kept minimal — the client only
// renders; the server verifier is the source of truth for what is allowed.
interface Attribution {
  author: string;
  work: string;
  tradition: string;
  year?: number;
}
type Block =
  | { type: 'framing'; text: string }
  | { type: 'voice'; attribution: Attribution; quote: string; summary?: string; anchors?: { start: number; end: number }[] }
  | { type: 'passages'; items: { start: number; end: number; translation: string }[] }
  | { type: 'prayer_prompt'; text: string };

interface Retrieved {
  sourceId: string;
  score: number;
  content: string;
  metadata: { author: string; sourceTitle: string; tradition: string | null };
}
type Result =
  | { kind: 'composed'; response: { blocks: Block[] }; retrieval: Retrieved[] }
  | { kind: 'fallback'; retrieval: Retrieved[]; violations: { check: string; message: string }[] }
  | { kind: 'empty'; reason: string };

const EXAMPLES = [
  'What does the Gospel of John say about the Word becoming flesh?',
  'How have commentators understood being born again?',
  'What is the living water Jesus offers?',
];

function readerHref(verseId: number): string {
  const { book, chapter } = decodeVerseId(verseId);
  const slug = BOOK_BY_NUM.get(book)?.slug ?? 'jhn';
  return `/read/${slug}/${chapter}`;
}

export function AskClient() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState('');

  const ask = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setAsked(trimmed);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong.');
      } else {
        setResult(data as Result);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [loading]);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-6">
        <h1 className="font-scripture text-3xl font-medium text-stone-800 dark:text-stone-100">Ask the voices</h1>
        <p className="mt-2 text-sm leading-relaxed text-stone-500 dark:text-stone-400">
          Ask a question and hear what commentators across the traditions have said — quoted, attributed, never interpreted.
          <span className="mt-1 block text-xs text-stone-400">Currently answering from the Gospels.</span>
        </p>
      </header>

      <form
        onSubmit={(e) => { e.preventDefault(); ask(question); }}
        className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm dark:border-stone-700 dark:bg-stone-800"
      >
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ask(question); } }}
          placeholder="e.g. What does John mean by 'the Word became flesh'?"
          rows={3}
          maxLength={500}
          className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-stone-800 placeholder:text-stone-400 outline-none dark:text-stone-100"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-stone-400">{question.length}/500 · ⌘↵ to send</span>
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="rounded-full bg-stone-800 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
          >
            {loading ? 'Consulting…' : 'Ask'}
          </button>
        </div>
      </form>

      {!result && !loading && !error && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">Try</p>
          <div className="flex flex-col gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => { setQuestion(ex); ask(ex); }}
                className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-left text-sm text-stone-600 transition-colors hover:border-stone-300 hover:bg-white dark:border-stone-700 dark:bg-stone-800/50 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="mt-8 flex items-center gap-3 text-sm text-stone-500">
          <span className="h-3 w-3 animate-pulse rounded-full bg-stone-400" />
          Retrieving voices and composing a grounded answer…
        </div>
      )}

      {error && (
        <div className="mt-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-8">
          <p className="mb-4 text-sm text-stone-400">On: <span className="text-stone-600 dark:text-stone-300">{asked}</span></p>
          {result.kind === 'empty' && (
            <p className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600 dark:border-stone-700 dark:bg-stone-800/50 dark:text-stone-300">
              {result.reason}
            </p>
          )}
          {result.kind === 'composed' && <Composed blocks={result.response.blocks} />}
          {result.kind === 'fallback' && <Fallback retrieval={result.retrieval} />}
        </div>
      )}
    </div>
  );
}

function Composed({ blocks }: { blocks: Block[] }) {
  const framing = blocks.find((b) => b.type === 'framing') as Extract<Block, { type: 'framing' }> | undefined;
  const voices = blocks.filter((b): b is Extract<Block, { type: 'voice' }> => b.type === 'voice');
  const passages = blocks.find((b) => b.type === 'passages') as Extract<Block, { type: 'passages' }> | undefined;

  return (
    <div className="space-y-6">
      {framing && (
        <p className="text-[15px] leading-relaxed text-stone-600 dark:text-stone-300">{framing.text}</p>
      )}

      <div className="space-y-5">
        {voices.map((v, i) => (
          <figure key={i} className="border-l-2 border-stone-300 pl-4 dark:border-stone-600">
            <blockquote className="font-scripture text-[17px] leading-relaxed text-stone-800 dark:text-stone-100">
              “{v.quote}”
            </blockquote>
            <figcaption className="mt-2 text-sm text-stone-500 dark:text-stone-400">
              <span className="font-medium text-stone-700 dark:text-stone-200">{v.attribution.author}</span>
              {', '}{v.attribution.work}
              <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                {v.attribution.tradition}
              </span>
            </figcaption>
            {v.summary && <p className="mt-1.5 text-xs text-stone-400">{v.summary}</p>}
          </figure>
        ))}
      </div>

      {passages && passages.items.length > 0 && (
        <div className="border-t border-stone-200 pt-4 dark:border-stone-700">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">Passages</p>
          <div className="flex flex-wrap gap-2">
            {passages.items.map((p, i) => {
              const label = p.start === p.end ? formatVerseId(p.start) : `${formatVerseId(p.start)}–${formatVerseId(p.end).split(' ').pop()}`;
              return (
                <Link
                  key={i}
                  href={readerHref(p.start)}
                  className="rounded-full border border-stone-200 bg-white px-3 py-1 text-sm text-stone-700 transition-colors hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
                >
                  {label} →
                </Link>
              );
            })}
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
              <span className="font-medium text-stone-700 dark:text-stone-300">{r.metadata.author}</span>
              {', '}{r.metadata.sourceTitle}
              {r.metadata.tradition ? ` · ${r.metadata.tradition}` : ''}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
