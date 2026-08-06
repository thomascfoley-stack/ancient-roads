'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

// "My Works" — the personal-corpus surface. Never "Sermons": that word is the corpus register.

interface Doc {
  id: string;
  title: string;
  status: 'queued' | 'parsing' | 'chunking' | 'embedding' | 'ready' | 'failed' | 'empty';
  parseError: string | null;
  mimeType: string | null;
  pageCount: number | null;
  extractableChars: number | null;
  byteSize: number | null;
  createdAt: string;
}
interface Hit { documentId: string; sectionId: string; title: string; heading: string | null; text: string; score: number }
interface Voice { author: string; work: string; tradition: string; origin: 'corpus'; verseId: number; sourceId: string }
interface VoicesState { loading: boolean; error?: string; data?: { voices: Voice[]; authorCount: number; rangesConsidered: number; pending: boolean } }

interface Presence { documentId: string; title: string; sectionId: string; verseStart: number; verseEnd: number; channel: string; matchCount: number | null }

/** Statuses that are still moving — the poll runs only while one of these is present. */
const IN_FLIGHT = new Set(['queued', 'parsing', 'chunking', 'embedding']);

/** A wall of status, not a wall of red (§8). Every state says what it means in the user's terms. */
const STATUS: Record<Doc['status'], { label: string; tone: string }> = {
  queued: { label: 'Waiting', tone: 'text-stone-500 dark:text-stone-400' },
  parsing: { label: 'Reading', tone: 'text-stone-500 dark:text-stone-400' },
  chunking: { label: 'Dividing', tone: 'text-stone-500 dark:text-stone-400' },
  embedding: { label: 'Indexing', tone: 'text-stone-500 dark:text-stone-400' },
  ready: { label: 'Ready', tone: 'text-emerald-700 dark:text-emerald-400' },
  failed: { label: 'Needs attention', tone: 'text-amber-700 dark:text-amber-400' },
  empty: { label: 'No text found', tone: 'text-amber-700 dark:text-amber-400' },
};

const fmtBytes = (n: number | null) => (n == null ? '' : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/**
 * Markdown syntax out of the search excerpt.
 *
 * A .md upload is stored exactly as the user wrote it, so the excerpt was showing a preacher his
 * own sermon as "# The Good Shepherd and the Hireling *Preached on a Lord's Day morning* **Text:
 * John 10:11**". DISPLAY-ONLY on purpose: the stored section stays byte-faithful to the file they
 * gave us, because it is their document and the anchor channels shingle against it.
 */
export function plainExcerpt(s: string): string {
  // The delimiter rules are NOT decoration. A lazy /\*(.+?)\*/ pairs the two unrelated asterisks
  // in "7 * 70, and 3 * 4" and silently rewrites a preacher's arithmetic; real markdown emphasis
  // never opens with a space after the marker nor closes with one before it, and requiring \S on
  // both inner edges is exactly what separates the two. Same for the heading rule: `#` opens an
  // ATX heading only when whitespace follows, so "sermon #1" survives.
  return s
    .replace(/(^|\s)#{1,6}\s+/g, '$1') // headings, wherever a chunk boundary left them
    .replace(/\*\*(\S(?:[^*]*\S)?)\*\*/g, '$1') // bold
    .replace(/\*(\S(?:[^*]*\S)?)\*/g, '$1') // emphasis
    .replace(/`([^`]+)`/g, '$1') // code spans
    .trim();
}

export type MyWorksState = 'loading' | 'signedout' | 'unavailable' | 'ready';

export function MyWorksClient({ initialState = 'loading' }: { initialState?: MyWorksState }) {
  // Seeded by the server (page.tsx), which already knows both answers. 'loading' remains the
  // default so the component is still usable without the prop, but nothing ships that way.
  const [state, setState] = useState<MyWorksState>(initialState);
  const [docs, setDocs] = useState<Doc[]>([]);
  // Distinct from `state`: the shell is ready to draw long before the list has arrived. Without
  // this the empty list renders "Nothing here yet" — telling someone with ten sermons that they
  // have none, for as long as the fetch takes.
  const [docsLoaded, setDocsLoaded] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [presence, setPresence] = useState<Presence[] | null>(null);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [voices, setVoices] = useState<Record<string, VoicesState>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/user-corpus/documents');
    if (r.status === 401) { setState('signedout'); return; }
    // Any other failure (403 when uploads are switched off, 500) used to `return` and leave state
    // on 'loading' forever: the page sat at "Loading…" with no upload control and no reason given.
    if (!r.ok) { setState('unavailable'); return; }
    const d = (await r.json()) as { documents: Doc[] };
    setDocs(d.documents);
    setDocsLoaded(true);
    setState('ready');
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Poll only while something is moving. A permanent interval on a settled list is a request every
  // few seconds forever, on every open tab.
  useEffect(() => {
    if (!docs.some((d) => IN_FLIGHT.has(d.status))) return;
    const t = setInterval(() => { void load(); }, 2500);
    return () => clearInterval(t);
  }, [docs, load]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploadError(null);
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.append('file', file);
        const r = await fetch('/api/user-corpus/upload', { method: 'POST', body });
        const d = (await r.json()) as { error?: string; message?: string };
        // A refusal is shown as itself. The route already writes messages a person can act on
        // ("That PDF has no readable text layer… it needs OCR"), so they are surfaced verbatim
        // rather than replaced with a generic failure.
        if (!r.ok) setUploadError(d.error ?? 'That file could not be uploaded.');
        else if (d.message) setUploadError(d.message); // e.g. already uploaded
      }
      await load();
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function retry(id: string) {
    await fetch(`/api/user-corpus/documents/${id}`, { method: 'POST' });
    await load();
  }
  async function remove(id: string) {
    await fetch(`/api/user-corpus/documents/${id}`, { method: 'DELETE' });
    await load();
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setHits(null);
    setPresence(null);
    setSearchNote(null);
    try {
      // A passage reference goes to the presence scan; anything else to the fused search. Both are
      // the same box because "have I written on Romans 8" and "what did I say about grace" are the
      // same question to the person asking.
      const looksLikeRef = /^[1-3]?\s?[A-Za-z][A-Za-z.]*\s+\d/.test(q);
      const url = looksLikeRef
        ? `/api/user-corpus/search?ref=${encodeURIComponent(q)}`
        : `/api/user-corpus/search?q=${encodeURIComponent(q)}`;
      const r = await fetch(url);
      const d = (await r.json()) as { mode?: string; hits?: Hit[]; anchors?: Presence[]; error?: string; degraded?: string };
      if (!r.ok) { setSearchNote(d.error ?? 'That search could not be run.'); return; }
      if (d.degraded) setSearchNote(d.degraded);
      if (d.mode === 'verse') setPresence(d.anchors ?? []);
      else setHits(d.hits ?? []);
    } finally {
      setSearching(false);
    }
  }

  async function loadVoices(id: string) {
    setVoices((v) => ({ ...v, [id]: { loading: true } }));
    try {
      const res = await fetch(`/api/user-corpus/documents/${id}/voices`);
      if (!res.ok) throw new Error(String(res.status));
      // Read the body BEFORE the updater: the callback passed to setVoices is not async, so an
      // `await` inside it is a syntax error rather than a wait.
      const data = (await res.json()) as VoicesState['data'];
      setVoices((v) => ({ ...v, [id]: { loading: false, data } }));
    } catch {
      setVoices((v) => ({ ...v, [id]: { loading: false, error: 'Could not load the tradition on this document.' } }));
    }
  }

  if (state === 'loading') {
    return <div className="mx-auto max-w-3xl px-5 py-8 sm:px-6"><p className="font-serif text-[15px] text-stone-500 dark:text-stone-400">Loading…</p></div>;
  }
  if (state === 'signedout' || state === 'unavailable') {
    return (
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-6">
        <h1 className="font-display text-3xl font-medium text-stone-800 dark:text-stone-100">My Works</h1>
        <p className="mt-3 font-serif text-[15px] leading-relaxed text-stone-500 dark:text-stone-400">
          {state === 'signedout'
            ? 'Sign in to bring your own sermons and papers into the library.'
            : 'Uploads are not available on this account yet.'}
        </p>
        {state === 'signedout' && (
          <Link
            href="/auth/sign-in"
            className="mt-5 inline-block min-h-[44px] rounded-full bg-stone-900 px-5 py-2.5 text-[15px] font-medium text-paper hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900"
          >
            Sign in
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-medium text-stone-800 dark:text-stone-100">My Works</h1>
        <p className="mt-2 max-w-xl font-serif text-[15px] leading-relaxed text-stone-500 dark:text-stone-400">
          Your own sermons, papers and notes, searchable alongside the library. Private to you.
        </p>
      </header>

      {/* ── upload ─────────────────────────────────────────────────────────────────────────── */}
      <section className="mb-8">
        <label
          htmlFor="my-works-file"
          className="flex min-h-[44px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-paper px-5 py-8 text-center transition-colors hover:border-accent-400 dark:border-stone-700 dark:bg-stone-800"
        >
          <span className="font-serif text-[15px] text-stone-600 dark:text-stone-300">
            {busy ? 'Uploading…' : 'Add a document'}
          </span>
          <span className="mt-1 text-[13px] text-stone-400 dark:text-stone-500">PDF, Word, text or Markdown</span>
          <input
            ref={fileInput}
            id="my-works-file"
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.md"
            className="sr-only"
            disabled={busy}
            onChange={(e) => void upload(e.target.files)}
          />
        </label>
        {uploadError && (
          <p role="status" className="mt-3 rounded-xl bg-amber-50 px-4 py-3 font-serif text-[14px] leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {uploadError}
          </p>
        )}
      </section>

      {/* ── search ─────────────────────────────────────────────────────────────────────────── */}
      <section className="mb-8">
        <form onSubmit={(e) => void search(e)} className="flex gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your works, or type a passage like Romans 8"
            aria-label="Search your works"
            className="min-h-[44px] w-full rounded-full border border-stone-200 bg-paper px-4 font-serif text-[15px] text-stone-700 placeholder:text-stone-400 focus:border-accent-400 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
          />
          <button
            type="submit"
            disabled={searching}
            className="min-h-[44px] shrink-0 rounded-full bg-paper px-5 text-sm font-semibold text-stone-700 shadow-paper transition-all hover:text-accent-800 hover:shadow-float disabled:opacity-50 dark:bg-stone-800 dark:text-stone-200 dark:shadow-none"
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>

        {searchNote && <p className="mt-3 font-serif text-[14px] text-amber-700 dark:text-amber-400">{searchNote}</p>}

        {presence && (
          <div className="mt-5">
            <h2 className="font-display text-lg text-stone-700 dark:text-stone-200">
              {presence.length === 0 ? 'You have not written on that passage yet' : 'Where you have written on it'}
            </h2>
            <ul className="mt-3 space-y-2">
              {presence.map((p) => (
                <li key={`${p.sectionId}-${p.channel}-${p.verseStart}`} className="rounded-xl bg-paper px-4 py-3 shadow-paper dark:bg-stone-800 dark:shadow-none">
                  <span className="font-serif text-[15px] text-stone-700 dark:text-stone-200">{p.title}</span>
                  <span className="ml-2 text-[13px] text-stone-400 dark:text-stone-500">
                    {/* channel and strength, so "quoted at length" is separable from "mentioned once" */}
                    {p.channel === 'explicit' ? 'cited' : `quoted (${p.matchCount ?? 0} matches)`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {hits && (
          <div className="mt-5">
            <h2 className="font-display text-lg text-stone-700 dark:text-stone-200">
              {hits.length === 0 ? 'Nothing found in your works' : `${hits.length} passage${hits.length === 1 ? '' : 's'} from your works`}
            </h2>
            <ul className="mt-3 space-y-3">
              {hits.map((h) => (
                <li key={h.sectionId} className="rounded-xl bg-paper px-4 py-3 shadow-paper dark:bg-stone-800 dark:shadow-none">
                  <p className="font-display text-[15px] text-stone-700 dark:text-stone-200">{h.title}</p>
                  {h.heading && <p className="text-[13px] text-stone-400 dark:text-stone-500">{h.heading}</p>}
                  <p className="mt-1 font-serif text-[15px] leading-relaxed text-stone-600 dark:text-stone-300">
                    {(() => { const t = plainExcerpt(h.text); return t.length > 320 ? `${t.slice(0, 320)}…` : t; })()}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── the status wall ────────────────────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 font-display text-lg text-stone-700 dark:text-stone-200">Your documents</h2>
        {!docsLoaded ? (
          <p role="status" className="font-serif text-[15px] text-stone-500 dark:text-stone-400">Loading your documents…</p>
        ) : docs.length === 0 ? (
          <p className="font-serif text-[15px] text-stone-500 dark:text-stone-400">Nothing here yet. Add a sermon or a paper and it will be searchable alongside the library.</p>
        ) : (
          <ul className="space-y-2">
            {docs.map((d) => {
              const s = STATUS[d.status];
              return (
                <li key={d.id} className="rounded-xl bg-paper px-4 py-3 shadow-paper dark:bg-stone-800 dark:shadow-none">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="font-serif text-[15px] text-stone-700 dark:text-stone-200">{d.title}</span>
                    <span className={`text-[13px] font-semibold ${s.tone}`}>{s.label}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[13px] text-stone-400 dark:text-stone-500">
                    {d.mimeType && <span className="uppercase">{d.mimeType}</span>}
                    {d.byteSize != null && <span>{fmtBytes(d.byteSize)}</span>}
                    {d.pageCount != null && <span>{d.pageCount} pages</span>}
                  </div>
                  {d.parseError && (
                    <p className="mt-2 font-serif text-[14px] leading-relaxed text-amber-800 dark:text-amber-300">{d.parseError}</p>
                  )}
                  <div className="mt-2 flex gap-2">
                    {/* Retry is offered only where it can change the answer. A scan with no text
                        layer and an empty file are verdicts about the file, not transient errors —
                        re-running the same parse over the same bytes cannot reach a different one,
                        and a button that promises otherwise is a button that lies. */}
                    {d.status === 'failed' && (
                      <button
                        type="button"
                        onClick={() => void retry(d.id)}
                        className="min-h-[44px] rounded-full px-3 text-[13px] font-semibold text-stone-600 hover:text-accent-800 dark:text-stone-300"
                      >
                        Try again
                      </button>
                    )}
                    {/* The corpus join (ADR-104). Only offered once the document is `ready`,
                        because anchors are what the join reads and they do not exist before then. */}
                    {d.status === 'ready' && !voices[d.id] && (
                      <button
                        type="button"
                        onClick={() => void loadVoices(d.id)}
                        className="min-h-[44px] rounded-full px-3 text-[13px] font-semibold text-stone-600 hover:text-accent-800 dark:text-stone-300"
                      >
                        The tradition on this
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void remove(d.id)}
                      className="min-h-[44px] rounded-full px-3 text-[13px] font-semibold text-stone-500 hover:text-red-700 dark:text-stone-400"
                    >
                      Remove
                    </button>
                  </div>

                  {voices[d.id] && (
                    <div className="mt-3 border-t border-stone-200 pt-3 dark:border-stone-700">
                      {voices[d.id].loading && (
                        <p className="font-serif text-[14px] text-stone-500 dark:text-stone-400">Reading the tradition…</p>
                      )}
                      {voices[d.id].error && (
                        <p role="alert" className="font-serif text-[14px] text-amber-800 dark:text-amber-300">{voices[d.id].error}</p>
                      )}
                      {voices[d.id].data && (
                        (() => {
                          const v = voices[d.id].data!;
                          if (v.pending) {
                            return <p className="font-serif text-[14px] text-stone-500 dark:text-stone-400">This document is still being indexed.</p>;
                          }
                          // TWO DIFFERENT FACTS, AND THE OLD COPY TOLD THE WRONG ONE. "No one in
                          // the library writes on the passages this document anchors" was shown
                          // whenever the voice list came back empty — including when the document
                          // anchored NOTHING, which is not a statement about the library at all.
                          // A sermon on grace came back with that sentence and the owner knew it
                          // was false. `rangesConsidered` was in the response the whole time.
                          if (v.rangesConsidered === 0) {
                            return (
                              <p className="font-serif text-[14px] leading-relaxed text-stone-500 dark:text-stone-400">
                                No scripture was detected in this document, so there are no passages
                                to look up. Verse detection finds explicit references, and quotations
                                close to the KJV wording; a sermon that paraphrases, or quotes a
                                modern translation, can read as having none.
                              </p>
                            );
                          }
                          if (v.voices.length === 0) {
                            return (
                              <p className="font-serif text-[14px] leading-relaxed text-stone-500 dark:text-stone-400">
                                This document anchors {v.rangesConsidered} passage
                                {v.rangesConsidered === 1 ? '' : 's'}, and no one in the library writes on
                                {v.rangesConsidered === 1 ? ' it' : ' them'}.
                              </p>
                            );
                          }
                          return (
                            <>
                              {/* WORDED NARROWLY ON PURPOSE. Slice 1 returns the voices ON these
                                  passages, not the ones you did NOT engage: answering the "not"
                                  half needs a commentator-detection channel that does not exist
                                  yet (tradition-gap.ts). Calling this "what you missed" would be
                                  the product claiming something it has not measured. */}
                              <p className="font-display text-[15px] text-stone-700 dark:text-stone-200">
                                {v.authorCount} {v.authorCount === 1 ? 'voice' : 'voices'} from the library
                                {' '}on {v.rangesConsidered} {v.rangesConsidered === 1 ? 'passage' : 'passages'} this document anchors
                              </p>
                              <ul className="mt-2 space-y-1.5">
                                {v.voices.map((x) => (
                                  <li key={x.sourceId} className="font-serif text-[14px] text-stone-600 dark:text-stone-300">
                                    <span className="text-stone-800 dark:text-stone-100">{x.author}</span>
                                    {x.work && <span className="text-stone-500 dark:text-stone-400">, {x.work}</span>}
                                    {x.tradition && <span className="ml-2 text-[12px] uppercase tracking-wide text-stone-400 dark:text-stone-500">{x.tradition}</span>}
                                  </li>
                                ))}
                              </ul>
                            </>
                          );
                        })()
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
