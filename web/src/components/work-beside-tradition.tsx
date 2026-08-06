'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fetchCommentary, type CommentaryEntry } from '@/lib/bible';
import { decodeVerseId, formatVerseId } from '@bible/verse-id';
import { BOOK_BY_NUM } from '@bible/books';

// One sermon, read beside the voices on the passages it engages.
//
// LEFT: the tradition. RIGHT: the sermon. Both scroll independently on a wide screen and stack on
// a narrow one, because two 50%-width columns on a phone is two unreadable columns.
//
// WHERE THE COMMENTARY TEXT COMES FROM, and why there is no new endpoint: the reader already
// serves whole chapters of commentary as static JSON (`/commentaries/<book>/<chapter>.json`, read
// through `fetchCommentary`, which filters to published authors). The tradition-gap join returns
// an author, a work and a verseId; that is enough to fetch the chapter and pull out this author's
// entry. Adding a per-voice text endpoint would have been a second way to serve the same rows,
// with its own licensing filter to keep in step — this repo's most-punished shape.

interface Voice {
  author: string;
  work: string;
  tradition: string;
  origin: 'corpus';
  verseId: number;
  sourceId: string;
}
interface Section {
  id: string;
  ordinal: number;
  heading: string | null;
  body: string;
}
interface Doc {
  id: string;
  title: string;
  status: string;
}

type EntryState = { loading: true } | { loading: false; entries: CommentaryEntry[]; error?: string };

/** Markdown syntax out of displayed prose. A .md upload is stored exactly as written. */
function plain(s: string): string {
  return s
    .replace(/(^|\s)#{1,6}\s+/g, '$1')
    .replace(/\*\*(\S(?:[^*]*\S)?)\*\*/g, '$1')
    .replace(/\*(\S(?:[^*]*\S)?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

export function WorkBesideTradition({ documentId }: { documentId: string }) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [passages, setPassages] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, EntryState>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [dRes, vRes] = await Promise.all([
          fetch(`/api/user-corpus/documents/${documentId}?sections=1`),
          fetch(`/api/user-corpus/documents/${documentId}/voices`),
        ]);
        if (!alive) return;
        if (dRes.status === 404) { setError('That document could not be found.'); return; }
        if (!dRes.ok) { setError('That document could not be loaded.'); return; }
        const d = (await dRes.json()) as { document: Doc; sections?: Section[] };
        setDoc(d.document);
        setSections(d.sections ?? []);
        if (vRes.ok) {
          const v = (await vRes.json()) as { voices: Voice[]; rangesConsidered: number; pending: boolean };
          setVoices(v.voices);
          setPassages(v.rangesConsidered);
          setPending(v.pending);
        } else {
          setVoices([]);
        }
      } catch {
        if (alive) setError('That document could not be loaded. Check your connection and try again.');
      }
    })();
    return () => { alive = false; };
  }, [documentId]);

  // One row per author+work, carrying every passage of this document they speak on. The join
  // returns a row per (author, work) already; grouping here keeps a voice that touches three of
  // the sermon's passages as ONE entry with three references, not three near-identical rows.
  const grouped = useMemo(() => {
    const by = new Map<string, { author: string; work: string; tradition: string; verseIds: number[] }>();
    for (const v of voices ?? []) {
      const key = `${v.author}|${v.work}`;
      const g = by.get(key) ?? { author: v.author, work: v.work, tradition: v.tradition, verseIds: [] };
      if (!g.verseIds.includes(v.verseId)) g.verseIds.push(v.verseId);
      by.set(key, g);
    }
    return [...by.values()].sort((a, b) => a.author.localeCompare(b.author));
  }, [voices]);

  const toggle = useCallback(
    async (key: string, author: string, verseIds: number[]) => {
      if (open[key]) {
        setOpen((o) => { const n = { ...o }; delete n[key]; return n; });
        return;
      }
      setOpen((o) => ({ ...o, [key]: { loading: true } }));
      try {
        // Every chapter this voice speaks on for this document, de-duplicated.
        const chapters = [...new Set(verseIds.map((id) => {
          const { book, chapter } = decodeVerseId(id);
          return `${BOOK_BY_NUM.get(book)?.slug ?? ''}:${chapter}`;
        }))].filter((c) => !c.startsWith(':'));
        const found: CommentaryEntry[] = [];
        for (const c of chapters) {
          const [slug, chapter] = c.split(':');
          const data = await fetchCommentary(slug!, Number(chapter));
          if (!data) continue;
          for (const e of data.entries) {
            if (e.author !== author) continue;
            // Keep only entries that actually cover a verse this document anchors.
            const covers = verseIds.some((id) => {
              const { verse, chapter: ch } = decodeVerseId(id);
              return ch === Number(chapter) && verse >= e.verseStart && verse <= e.verseEnd;
            });
            if (covers) found.push(e);
          }
        }
        setOpen((o) => ({
          ...o,
          [key]: found.length
            ? { loading: false, entries: found }
            : { loading: false, entries: [], error: 'This voice is recorded on the passage, but its text is not in the reader for this chapter.' },
        }));
      } catch {
        setOpen((o) => ({ ...o, [key]: { loading: false, entries: [], error: 'That commentary could not be loaded.' } }));
      }
    },
    [open],
  );

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-6">
        <p role="alert" className="font-serif text-[15px] text-amber-800 dark:text-amber-300">{error}</p>
        <Link href="/library/uploads" className="mt-4 inline-block text-[15px] underline underline-offset-2">Back to My Works</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
      <header className="mb-5">
        <Link href="/library/uploads" className="text-[13px] text-stone-500 underline underline-offset-2 hover:text-stone-700 dark:text-stone-400">
          ← My Works
        </Link>
        <h1 className="mt-2 font-display text-2xl font-medium text-stone-800 sm:text-3xl dark:text-stone-100">
          {doc?.title ?? 'Loading…'}
        </h1>
        {voices !== null && !pending && (
          <p className="mt-1 font-serif text-[14px] text-stone-500 dark:text-stone-400">
            {/* Worded as narrowly as the panel it came from: these are the voices ON the passages
                this document anchors, never "what you missed" — Slice 1 does not measure the
                complement, and claiming it would be the product asserting something it has not. */}
            {grouped.length} {grouped.length === 1 ? 'voice' : 'voices'} from the library on {passages}{' '}
            {passages === 1 ? 'passage' : 'passages'} this document anchors
          </p>
        )}
      </header>

      {/* Two panes side by side from `lg` up; stacked below, because two columns on a phone is
          two unreadable columns. Each pane scrolls on its own so the sermon does not drag the
          tradition along with it. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* ── LEFT: the works ───────────────────────────────────────────────────────────────── */}
        <section aria-labelledby="voices-heading" className="min-w-0">
          <h2 id="voices-heading" className="mb-3 font-display text-lg text-stone-700 dark:text-stone-200">
            The tradition
          </h2>
          <div className="lg:max-h-[calc(100vh-13rem)] lg:overflow-y-auto lg:pr-2">
            {voices === null ? (
              <p role="status" className="font-serif text-[15px] text-stone-500 dark:text-stone-400">Reading the tradition…</p>
            ) : pending ? (
              <p className="font-serif text-[15px] text-stone-500 dark:text-stone-400">This document is still being indexed.</p>
            ) : passages === 0 ? (
              <p className="font-serif text-[15px] leading-relaxed text-stone-500 dark:text-stone-400">
                No scripture was detected in this document, so there are no passages to look up.
              </p>
            ) : grouped.length === 0 ? (
              <p className="font-serif text-[15px] leading-relaxed text-stone-500 dark:text-stone-400">
                No one in the library writes on the {passages === 1 ? 'passage' : 'passages'} this document anchors.
              </p>
            ) : (
              <ul className="space-y-2">
                {grouped.map((g) => {
                  const key = `${g.author}|${g.work}`;
                  const st = open[key];
                  return (
                    <li key={key} className="rounded-xl bg-paper shadow-paper dark:bg-stone-800 dark:shadow-none">
                      <button
                        type="button"
                        aria-expanded={Boolean(st)}
                        onClick={() => void toggle(key, g.author, g.verseIds)}
                        className="flex w-full items-baseline justify-between gap-3 px-4 py-3 text-left"
                      >
                        <span className="min-w-0">
                          <span className="font-serif text-[15px] text-stone-800 dark:text-stone-100">{g.author}</span>
                          {g.work && <span className="ml-1 font-serif text-[14px] text-stone-500 dark:text-stone-400">, {g.work}</span>}
                          <span className="mt-0.5 block text-[13px] text-stone-400 dark:text-stone-500">
                            {g.tradition && <span className="uppercase tracking-wide">{g.tradition}</span>}
                            {g.tradition && ' · '}
                            {g.verseIds.slice(0, 4).map((v) => formatVerseId(v)).join(', ')}
                            {g.verseIds.length > 4 && ` +${g.verseIds.length - 4}`}
                          </span>
                        </span>
                        <span aria-hidden className="shrink-0 text-stone-400">{st ? '−' : '+'}</span>
                      </button>
                      {st && (
                        <div className="border-t border-stone-100 px-4 py-3 dark:border-stone-700">
                          {st.loading ? (
                            <p role="status" className="font-serif text-[14px] text-stone-500 dark:text-stone-400">Loading…</p>
                          ) : st.error ? (
                            <p className="font-serif text-[14px] text-stone-500 dark:text-stone-400">{st.error}</p>
                          ) : (
                            <ul className="space-y-4">
                              {st.entries.map((e, i) => (
                                <li key={`${e.sourceUrl}-${e.verseStart}-${i}`}>
                                  <p className="mb-1 text-micro font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                                    {e.sourceTitle}
                                  </p>
                                  <p className="whitespace-pre-line font-serif text-[15px] leading-relaxed text-stone-700 dark:text-stone-300">
                                    {e.text}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* ── RIGHT: the sermon ─────────────────────────────────────────────────────────────── */}
        <section aria-labelledby="work-heading" className="min-w-0">
          <h2 id="work-heading" className="mb-3 font-display text-lg text-stone-700 dark:text-stone-200">
            Your work
          </h2>
          <div className="rounded-xl bg-paper px-5 py-6 shadow-paper sm:px-8 lg:max-h-[calc(100vh-13rem)] lg:overflow-y-auto dark:bg-stone-900 dark:shadow-none">
            {doc === null ? (
              <p role="status" className="font-serif text-[15px] text-stone-500 dark:text-stone-400">Loading…</p>
            ) : sections.length === 0 ? (
              <p className="font-serif text-[15px] text-stone-500 dark:text-stone-400">
                {doc.status === 'ready'
                  ? 'This document has no readable sections.'
                  : 'This document is still being indexed.'}
              </p>
            ) : (
              sections.map((s) => (
                <div key={s.id} className="mb-5 last:mb-0">
                  {s.heading && (
                    <h3 className="mb-1 font-display text-[15px] text-stone-700 dark:text-stone-200">{plain(s.heading)}</h3>
                  )}
                  <p className="whitespace-pre-line font-serif text-[16px] leading-relaxed text-stone-700 dark:text-stone-300">
                    {plain(s.body)}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
