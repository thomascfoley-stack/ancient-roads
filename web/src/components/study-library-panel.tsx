'use client';

// The study editor's library panel (editor v2, owner direction 2026-08-12: "add and search
// commentaries within this page itself"). This is the §12 finder's first rung — search the
// corpus beside the document, read, choose, clip. It NEVER writes prose and never puts corpus
// text into the editing buffer: snippets render read-only here, and "Add" sends a REFERENCE
// (sectionId) to the same server-snapshotting clipping write as every other surface — the
// licensing gate runs inside that INSERT…SELECT, not here (F3/S-1).
//
// One capped query per search, per register group (S-12's shape): the active chip is the only
// group queried, through /api/studies/library-search — the /search page's fenced engine behind
// an auth wall. Register labels stay on every row (S-5).

import { useEffect, useRef, useState } from 'react';
import { CORPUS_GROUPS, type CorpusGroupId } from '@/lib/search-groups';
import { sanitizeSnippet } from '@/lib/snippet';
import type { EditorBlock } from './study-editor';

interface LibraryRow {
  sectionId: number;
  slug: string;
  title: string;
  author: string | null;
  sourceType: string;
  ordinal: number;
  heading: string | null;
  snippet: string;
}

type AddState = 'adding' | 'added' | 'not_servable' | 'failed';

const SEARCH_DEBOUNCE_MS = 400;

export function StudyLibraryPanel({
  studyId,
  takePlacement,
  onAdded,
  focusToken,
  lookup,
}: {
  studyId: string;
  /** The editor's pending insertion anchor, consumed per add (it advances there). */
  takePlacement: () => { afterBlockId?: string; beforeBlockId?: string };
  onAdded: (block: EditorBlock) => void;
  /** Increments when the editor's "From library" is chosen — focuses the search box. */
  focusToken: number;
  /** A selection lookup from the doc ("Search lexicons" on selected text): sets the query and
   *  jumps the active register to Lexicons — the dictionary IS the lexicon register, searched
   *  through the same fenced engine as everything else here. */
  lookup?: { token: number; q: string } | null;
}) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<CorpusGroupId>('commentaries');
  const [rows, setRows] = useState<LibraryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalCapped, setTotalCapped] = useState(false);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [addStates, setAddStates] = useState<Record<number, AddState>>({});
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (focusToken > 0) inputRef.current?.focus();
  }, [focusToken]);

  useEffect(() => {
    if (!lookup || lookup.token === 0) return;
    setQ(lookup.q);
    setGroup('lexicons');
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- token is the trigger; q rides it
  }, [lookup?.token]);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setRows([]);
      setTotal(0);
      setSearched(false);
      setSearchFailed(false);
      return;
    }
    const seq = ++requestSeq.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/studies/library-search?q=${encodeURIComponent(query)}&group=${group}`,
        );
        if (seq !== requestSeq.current) return; // a newer search superseded this one
        if (!res.ok) { setSearchFailed(true); setLoading(false); return; }
        const data = (await res.json()) as { results: LibraryRow[]; total: number; totalCapped: boolean };
        setRows(data.results);
        setTotal(data.total);
        setTotalCapped(data.totalCapped);
        setSearched(true);
        setSearchFailed(false);
        setLoading(false);
      } catch {
        if (seq !== requestSeq.current) return;
        setSearchFailed(true);
        setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, group]);

  const setAdd = (sectionId: number, state: AddState | undefined) =>
    setAddStates((cur) => {
      const next = { ...cur };
      if (state === undefined) delete next[sectionId];
      else next[sectionId] = state;
      return next;
    });

  const add = async (row: LibraryRow) => {
    setAdd(row.sectionId, 'adding');
    try {
      const res = await fetch(`/api/studies/${studyId}/blocks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'clipping',
          sectionId: row.sectionId,
          reference: row.heading ?? undefined,
          // B030 — what the reader actually matched, so the block opens on that paragraph instead
          // of the whole chapter. A hint only: the server locates it in its own snapshot and stores
          // a trim VIEW; the bytes are still the full section, so "add more" is a widen, not a
          // refetch. `q` is the live search term that produced this row.
          matchHint: q || undefined,
          ...takePlacement(),
        }),
      });
      if (res.status === 201) {
        const data = (await res.json().catch(() => undefined)) as { block?: Omit<EditorBlock, 'renderState'> } | undefined;
        if (!data?.block) { setAdd(row.sectionId, 'failed'); return; }
        // renderState 'clipping' without a server round-trip is honest here and only here: the
        // write's own INSERT…SELECT admitted this row through the full licensing gate in the
        // same second. Every LATER render re-checks server-side as always.
        onAdded({ ...data.block, renderState: 'clipping' });
        setAdd(row.sectionId, 'added');
        setTimeout(() => setAdd(row.sectionId, undefined), 2000);
      } else if (res.status === 409) {
        setAdd(row.sectionId, 'not_servable');
      } else {
        setAdd(row.sectionId, 'failed');
      }
    } catch {
      setAdd(row.sectionId, 'failed');
    }
  };

  return (
    <aside aria-label="Library" className="font-sans">
      <p className="text-xs font-semibold small-caps tracking-[0.08em] text-stone-500 dark:text-stone-400">
        Library
      </p>
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search the library…"
        aria-label="Search the library"
        maxLength={200}
        className="focus-quiet mt-2 w-full rounded border edge bg-transparent px-3 py-2 text-sm text-stone-900 outline-none placeholder:text-stone-400 dark:text-stone-200 dark:placeholder:text-stone-500"
      />
      <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Register">
        {CORPUS_GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={group === g.id}
            onClick={() => setGroup(g.id)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ease-gentle ${
              group === g.id
                ? 'border-accent-600 bg-accent-50 text-accent-800 dark:border-accent-400 dark:bg-accent-950/40 dark:text-accent-300'
                : 'edge text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
            }`}
          >
            {g.label}
            {group === g.id && searched && (
              <span className="ml-1 text-[11px] opacity-70">
                {total}{totalCapped ? '+' : ''}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && (
        <p role="status" className="mt-4 text-xs text-stone-400 dark:text-stone-500">Searching…</p>
      )}
      {searchFailed && (
        <p role="alert" className="mt-4 text-sm text-red-800 dark:text-red-200">
          The search failed. Keep typing or try again.
        </p>
      )}
      {searched && !loading && !searchFailed && rows.length === 0 && (
        <p className="mt-4 font-serif text-sm text-stone-500 dark:text-stone-400">
          Nothing in {CORPUS_GROUPS.find((g) => g.id === group)?.label.toLowerCase()} matches that.
        </p>
      )}

      <ul className="mt-2">
        {rows.map((row) => (
          <li key={row.sectionId} className="border-b edge py-3 last:border-b-0">
            <span className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">
                {row.author ?? row.title}
              </span>
              {/* the register label — the reader can always tell what this is (S-5) */}
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                {row.sourceType}
              </span>
            </span>
            <span className="mt-0.5 block truncate text-xs text-stone-500 dark:text-stone-400">
              {row.author ? row.title : ''}
              {row.author && row.heading ? ' · ' : ''}
              {row.heading ?? ''}
            </span>
            <span
              className="mt-1 block text-sm leading-relaxed text-stone-600 [&_mark]:bg-accent-100 [&_mark]:text-stone-900 dark:text-stone-300 dark:[&_mark]:bg-accent-900/60 dark:[&_mark]:text-stone-100"
              /* ts_headline does NOT escape the body — sanitize before rendering (lib/snippet.ts). */
              dangerouslySetInnerHTML={{ __html: sanitizeSnippet(row.snippet) }}
            />
            <span className="mt-2 flex items-center gap-4">
              {addStates[row.sectionId] === 'adding' ? (
                <span role="status" className="text-xs text-stone-400 dark:text-stone-500">Adding…</span>
              ) : addStates[row.sectionId] === 'added' ? (
                <span role="status" className="text-xs text-accent-700 dark:text-accent-300">Added</span>
              ) : (
                <button
                  type="button"
                  onClick={() => void add(row)}
                  className="inline-flex min-h-[36px] items-center text-xs font-semibold small-caps tracking-[0.08em] text-accent-600 hover:underline dark:text-accent-400"
                >
                  + Add to study
                </button>
              )}
              <a
                href={`/work/${row.slug}#s${row.ordinal}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[36px] items-center text-xs text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200"
              >
                Open
              </a>
              {addStates[row.sectionId] === 'not_servable' && (
                <span role="alert" className="text-xs text-red-800 dark:text-red-200">
                  Not currently servable from the library.
                </span>
              )}
              {addStates[row.sectionId] === 'failed' && (
                <span role="alert" className="text-xs text-red-800 dark:text-red-200">
                  Could not add — try again.
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
