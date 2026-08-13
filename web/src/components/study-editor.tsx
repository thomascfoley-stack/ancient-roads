'use client';

// The My Studies doc editor (design §7.4, Flow C; owner rulings E1 "My Studies", E7 "auto-save
// always, never ask"). There is no Save button anywhere in this file, on purpose.
//
// LICENSING IS NEVER DERIVED HERE. Every block arrives with a `renderState` already computed
// server-side by the ONE shared rule — `blockRenderState` in lib/servability.ts (S-10): the doc
// page computes it for the first blocks page, the sibling feed route (`../app/studies/[id]/feed`)
// for every later page. This component only renders what that rule decided:
//   - 'clipping'  → attribution + quote + Open-in-work link;
//   - 'tombstone' → attribution + the shared notice, NO quote, NO link (S-10).
// servability.ts is not imported here on purpose: it pulls in the DB layer, and a client-side
// re-derivation of the licensing rule is exactly how one surface forgets the re-check.
//
// S-13 — A FAILED WRITE IS VISIBLE AND ITS BUFFER IS NEVER DISCARDED. Every text block carries
// its save state beneath itself: Saving… / Saved / Save failed — Retry. The failure renders the
// moment the write rejects (ahead of any later debounce), the textarea keeps its text — the
// draft IS the buffer — and Retry re-sends that same buffer. The save machinery per block is the
// prayer journal's, at block granularity: debounce, in-flight guard, pending retry; the same
// two rules too — an EMPTIED block is never written (erasing text is not consenting to deletion,
// and the route 400s empty bodies anyway), and a new block CREATEs once and UPDATEs on the
// returned id ever after, so a keystroke burst cannot file the same words twice.
//
// R0: nothing here implies memory or conversation. A study is a document, not a thread.

import { Fragment, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/** The block shape the editor renders — StudyBlock minus the server-only fields, plus the
 *  server-computed render state (see the header: licensing arrives decided, not derivable). */
export interface EditorBlock {
  id: string;
  position: string;
  kind: 'text' | 'clipping';
  body: string | null;
  work_slug: string | null;
  ordinal: number | null;
  quote: string | null;
  attribution: { author?: string; work_title?: string; reference?: string } | null;
  renderState: 'text' | 'clipping' | 'tombstone';
}

type SaveState = 'clean' | 'saving' | 'saved' | 'failed';

const DEBOUNCE_MS = 500;
const LOCAL_PREFIX = 'local-';

interface TextBuf {
  /** The buffer S-13 says is never discarded: the last text the user typed. */
  draft: string;
  lastSaved: string;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  pending: boolean;
}

interface Placement {
  afterBlockId?: string;
  beforeBlockId?: string;
}

function attributionParts(attribution: EditorBlock['attribution']): {
  author?: string;
  title?: string;
  reference?: string;
} {
  return {
    author: attribution?.author?.trim() || undefined,
    title: attribution?.work_title?.trim() || undefined,
    reference: attribution?.reference?.trim() || undefined,
  };
}

/** One attribution line, one JSX shape, shared by the clipping and the tombstone so the two can
 *  never drift apart (S-10: a tombstone keeps attribution and drops quote AND link). */
function AttributionLine({ attribution }: { attribution: EditorBlock['attribution'] }) {
  const { author, title, reference } = attributionParts(attribution);
  return (
    <p className="font-sans text-xs small-caps tracking-[0.08em] text-stone-500 dark:text-stone-400">
      — {author || title ? (
        <>
          {author}
          {author && title ? ', ' : ''}
          {title && <em>{title}</em>}
        </>
      ) : (
        'Unknown source'
      )}
      {reference && ` (${reference})`}
    </p>
  );
}

/** The page scrolls, the editor never does (the prayer journal's rule): the textarea is always
 *  exactly as tall as its content, so a long block grows the page. */
function GrowingTextarea({
  value,
  onChange,
  autoFocus,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      // A freshly inserted "+ Text" block is the user's explicit point of action; focus belongs
      // there (the prayer compose view's autoFocus precedent).
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      rows={1}
      placeholder="Write…"
      className="focus-quiet w-full resize-none overflow-hidden border-0 bg-transparent font-serif text-lg leading-[1.75] text-stone-900 outline-none placeholder:text-stone-400 dark:text-stone-200 dark:placeholder:text-stone-500"
    />
  );
}

export function StudyEditor({
  study,
  initialBlocks,
  initialNextAfterPosition,
  tombstoneNotice,
}: {
  study: { id: string; title: string; pinned: boolean };
  initialBlocks: EditorBlock[];
  initialNextAfterPosition: string | null;
  /** The shared TOMBSTONE_NOTICE, handed down from the server — the one wording, not a re-wording. */
  tombstoneNotice: string;
}) {
  const [blocks, setBlocks] = useState<EditorBlock[]>(initialBlocks);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [removeErrors, setRemoveErrors] = useState<Record<string, boolean>>({});
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const [nextAfter, setNextAfter] = useState<string | null>(initialNextAfterPosition);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [title, setTitle] = useState(study.title);
  const [titleFailed, setTitleFailed] = useState(false);
  const [pinned, setPinned] = useState(study.pinned);
  const [pinFailed, setPinFailed] = useState(false);
  const localCounter = useRef(0);
  const bufs = useRef(new Map<string, TextBuf>());
  const placements = useRef(new Map<string, Placement>());
  // The title's last-saved value: an empty title is never written (the route 400s it), so a
  // cleared field falls back to this on blur rather than erasing the study's name.
  const savedTitle = useRef(study.title);

  const setSave = (key: string, state: SaveState) =>
    setSaveStates((cur) => ({ ...cur, [key]: state }));

  const getBuf = (key: string, initial: string): TextBuf => {
    let buf = bufs.current.get(key);
    if (!buf) {
      buf = { draft: initial, lastSaved: initial, timer: null, inFlight: false, pending: false };
      bufs.current.set(key, buf);
    }
    return buf;
  };

  // Plain functions, not useCallback: called from handlers and timer chains, never from an
  // effect's dependency list (the prayer journal's note on the compiler's memoization rule).
  const saveText = async (key: string): Promise<void> => {
    const buf = bufs.current.get(key);
    if (!buf) return;
    const text = buf.draft;
    if (!text.trim() || text === buf.lastSaved) return;
    if (buf.inFlight) { buf.pending = true; return; }
    buf.inFlight = true;
    setSave(key, 'saving');
    let currentKey = key;
    try {
      if (key.startsWith(LOCAL_PREFIX)) {
        // First save of a "+ Text" block: CREATE with the placement captured at insert time.
        const res = await fetch(`/api/studies/${study.id}/blocks`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind: 'text', body: text, ...placements.current.get(key) }),
        });
        // A create that comes back without its new id cannot be updated later — the next save
        // would CREATE AGAIN and file the same words twice. Treat it as not-saved; the buffer
        // stands and Retry re-attempts the create.
        const data = res.status === 201
          ? ((await res.json().catch(() => undefined)) as { block?: EditorBlock } | undefined)
          : undefined;
        if (!data?.block?.id) { setSave(key, 'failed'); return; }
        const created = data.block;
        setBlocks((cur) => cur.map((b) => (b.id === key ? { ...created, renderState: 'text' as const } : b)));
        bufs.current.delete(key);
        placements.current.delete(key);
        buf.lastSaved = text;
        bufs.current.set(created.id, buf);
        setSaveStates((cur) => {
          const next = { ...cur };
          delete next[key];
          next[created.id] = 'saved';
          return next;
        });
        currentKey = created.id;
      } else {
        const res = await fetch(`/api/studies/${study.id}/blocks`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ op: 'update_text', blockId: key, body: text }),
        });
        if (!res.ok) { setSave(key, 'failed'); return; }
        buf.lastSaved = text;
        setSave(key, 'saved');
      }
    } catch {
      setSave(currentKey, 'failed');
    } finally {
      buf.inFlight = false;
      if (buf.pending) { buf.pending = false; void saveText(currentKey); }
    }
  };

  const onTextChange = (block: EditorBlock, value: string) => {
    setBlocks((cur) => cur.map((b) => (b.id === block.id ? { ...b, body: value } : b)));
    const buf = getBuf(block.id, block.body ?? '');
    buf.draft = value;
    if (buf.timer) clearTimeout(buf.timer);
    buf.timer = setTimeout(() => { void saveText(block.id); }, DEBOUNCE_MS);
  };

  const addText = (index: number, placement: Placement) => {
    const key = `${LOCAL_PREFIX}${++localCounter.current}`;
    placements.current.set(key, placement);
    bufs.current.set(key, { draft: '', lastSaved: '', timer: null, inFlight: false, pending: false });
    const fresh: EditorBlock = {
      id: key,
      position: '',
      kind: 'text',
      body: '',
      work_slug: null,
      ordinal: null,
      quote: null,
      attribution: null,
      renderState: 'text',
    };
    setConfirmingRemove(null);
    setBlocks((cur) => [...cur.slice(0, index), fresh, ...cur.slice(index)]);
  };

  const removeBlock = async (block: EditorBlock): Promise<void> => {
    setConfirmingRemove(null);
    const drop = () => {
      const buf = bufs.current.get(block.id);
      if (buf?.timer) clearTimeout(buf.timer);
      bufs.current.delete(block.id);
      placements.current.delete(block.id);
      setBlocks((cur) => cur.filter((b) => b.id !== block.id));
    };
    if (block.id.startsWith(LOCAL_PREFIX)) { drop(); return; }
    try {
      const res = await fetch(
        `/api/studies/${study.id}/blocks?blockId=${encodeURIComponent(block.id)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) { setRemoveErrors((cur) => ({ ...cur, [block.id]: true })); return; }
      drop();
    } catch {
      setRemoveErrors((cur) => ({ ...cur, [block.id]: true }));
    }
  };

  const saveTitle = async () => {
    const next = title.trim();
    if (!next) { setTitle(savedTitle.current); return; }
    if (next === savedTitle.current) { setTitle(next); return; }
    try {
      const res = await fetch(`/api/studies/${study.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: next }),
      });
      if (!res.ok) { setTitleFailed(true); return; }
      savedTitle.current = next;
      setTitle(next);
      setTitleFailed(false);
    } catch {
      // The field keeps the edited text; the next blur retries. Nothing is lost silently.
      setTitleFailed(true);
    }
  };

  const togglePin = async () => {
    const next = !pinned;
    try {
      const res = await fetch(`/api/studies/${study.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pinned: next }),
      });
      if (!res.ok) { setPinFailed(true); return; }
      setPinned(next);
      setPinFailed(false);
    } catch {
      setPinFailed(true);
    }
  };

  const loadMore = async () => {
    if (!nextAfter) return;
    setLoadingMore(true);
    setLoadMoreFailed(false);
    try {
      // The feed route (not the bare blocks route) because its rows carry the server-computed
      // renderState — the licensing re-check stays server-side on every page, not just the first.
      const res = await fetch(
        `/studies/${study.id}/feed?afterPosition=${encodeURIComponent(nextAfter)}`,
      );
      if (!res.ok) { setLoadMoreFailed(true); return; }
      const data = (await res.json()) as { blocks: EditorBlock[]; nextAfterPosition: string | null };
      setBlocks((cur) => [...cur, ...data.blocks]);
      setNextAfter(data.nextAfterPosition);
    } catch {
      setLoadMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  };

  /** The quiet "+ Text" affordance between blocks (design §7.4). Always visible — an affordance
   *  that only appears on hover does not exist on a touchscreen. */
  const addTextButton = (index: number, placement: Placement, label: string) => (
    <div className="flex justify-center py-1">
      <button
        type="button"
        onClick={() => addText(index, placement)}
        className="inline-flex min-h-[44px] items-center px-3 font-sans text-xs small-caps tracking-[0.08em] text-stone-400 hover:text-accent-600 dark:text-stone-500 dark:hover:text-accent-400"
      >
        {label}
      </button>
    </div>
  );

  return (
    <div className="mx-auto max-w-[80ch] px-6 pb-16">
      {/* Title: inline edit, saved on blur/Enter — auto-save always, never ask (E7). */}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => void saveTitle()}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        aria-label="Study title"
        maxLength={300}
        className="focus-quiet w-full border-0 bg-transparent font-display text-3xl font-medium tracking-[-0.01em] text-stone-900 outline-none dark:text-stone-200"
      />
      {titleFailed && (
        <p role="alert" className="mt-2 text-sm text-red-800 dark:text-red-200">
          The title could not be saved. It will try again when you leave the field.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 font-sans text-xs small-caps tracking-[0.08em] text-stone-500 dark:text-stone-400">
        <button
          type="button"
          aria-pressed={pinned}
          onClick={() => void togglePin()}
          className="inline-flex min-h-[44px] items-center hover:text-accent-600 dark:hover:text-accent-400"
        >
          {pinned ? 'Pinned' : 'Pin'}
        </button>
        {/* The export is a plain anchor to a route handler that streams the markdown with an
            attachment disposition — no client-side serialization, so the licensing re-check on
            the export path runs server-side like every other render path (Flow E). */}
        <a
          href={`/studies/${study.id}/export`}
          className="inline-flex min-h-[44px] items-center hover:text-accent-600 dark:hover:text-accent-400"
        >
          Export
        </a>
        {pinFailed && (
          <span role="alert" className="text-red-800 dark:text-red-200">
            The pin could not be saved.
          </span>
        )}
      </div>

      <div className="mt-10">
        {blocks.length === 0 && (
          <p className="font-serif text-stone-500 dark:text-stone-400">
            Nothing here yet. Add your own words below; save passages from the library with
            Save to study.
          </p>
        )}
        {addTextButton(0, blocks.length > 0 ? { beforeBlockId: blocks[0]!.id } : {}, '+ Text')}
        {blocks.map((block, i) => (
          <Fragment key={block.id}>
            {block.renderState === 'text' ? (
              <div className="border-l-2 border-transparent pl-4 transition-colors ease-gentle focus-within:border-accent-600 dark:focus-within:border-accent-400">
                <GrowingTextarea
                  value={block.body ?? ''}
                  onChange={(v) => onTextChange(block, v)}
                  autoFocus={block.id.startsWith(LOCAL_PREFIX)}
                  ariaLabel={`Text block ${i + 1}`}
                />
                <div className="flex min-h-[1.5rem] items-center gap-3 font-sans text-xs tracking-[0.03em] text-stone-400 dark:text-stone-500">
                  {saveStates[block.id] === 'saving' && <span role="status">Saving…</span>}
                  {saveStates[block.id] === 'saved' && (
                    <span role="status" className="flex items-center gap-2">
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-flame" />
                      Saved
                    </span>
                  )}
                  {saveStates[block.id] === 'failed' && (
                    <span role="alert" className="flex items-center gap-2 text-red-800 dark:text-red-200">
                      Save failed —
                      <button
                        type="button"
                        onClick={() => void saveText(block.id)}
                        className="font-medium underline underline-offset-2"
                      >
                        Retry
                      </button>
                    </span>
                  )}
                </div>
              </div>
            ) : block.renderState === 'clipping' ? (
              <figure className="border-l-2 border-stone-300 py-1 pl-4 dark:border-stone-700">
                <blockquote className="whitespace-pre-wrap font-serif leading-[1.9] text-stone-800 dark:text-stone-300">
                  {block.quote}
                </blockquote>
                <figcaption className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <AttributionLine attribution={block.attribution} />
                  {block.work_slug && block.ordinal !== null && (
                    <Link
                      href={`/work/${block.work_slug}#s${block.ordinal}`}
                      className="font-sans text-xs small-caps tracking-[0.08em] text-accent-600 hover:underline dark:text-accent-400"
                    >
                      Open in work
                    </Link>
                  )}
                </figcaption>
              </figure>
            ) : (
              // Tombstone (S-10): attribution + the shared notice. NO quote, NO link — and the
              // renderState arrived from the server, so this branch cannot be talked into
              // showing text the re-check refused.
              <figure className="border-l-2 border-stone-200 py-1 pl-4 dark:border-stone-800">
                <AttributionLine attribution={block.attribution} />
                <p className="mt-2 font-serif text-sm italic text-stone-500 dark:text-stone-400">
                  {tombstoneNotice}
                </p>
              </figure>
            )}
            <div className="mt-1 flex justify-end">
              {confirmingRemove === block.id ? (
                <span className="flex items-center gap-4" role="group" aria-label="Confirm remove">
                  <span className="font-serif text-sm text-stone-600 dark:text-stone-300">
                    Remove this block?
                  </span>
                  <button
                    type="button"
                    autoFocus
                    onClick={() => setConfirmingRemove(null)}
                    className="inline-flex min-h-[44px] items-center font-sans text-xs text-stone-500 hover:text-accent-600 dark:text-stone-400 dark:hover:text-accent-400"
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeBlock(block)}
                    className="inline-flex min-h-[44px] items-center font-sans text-xs font-medium text-red-800 dark:text-red-300"
                  >
                    Remove
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingRemove(block.id)}
                  aria-label={`Remove block ${i + 1}`}
                  className="inline-flex min-h-[44px] items-center font-sans text-xs text-stone-400 hover:text-red-800 dark:text-stone-500 dark:hover:text-red-300"
                >
                  Remove
                </button>
              )}
            </div>
            {removeErrors[block.id] && (
              <p role="alert" className="text-right text-sm text-red-800 dark:text-red-200">
                The block could not be removed. Try again.
              </p>
            )}
            {addTextButton(i + 1, { afterBlockId: block.id }, '+ Text')}
          </Fragment>
        ))}
        {nextAfter && (
          <div className="mt-8 flex items-center justify-center gap-4">
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void loadMore()}
              className="inline-flex min-h-[44px] items-center font-sans text-xs font-semibold small-caps tracking-[0.08em] text-accent-600 hover:underline disabled:opacity-40 dark:text-accent-400"
            >
              {loadingMore ? 'Loading…' : 'Show more'}
            </button>
            {loadMoreFailed && (
              <span role="alert" className="text-sm text-red-800 dark:text-red-200">
                The next page could not be loaded. Try again.
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** The /studies list page's create affordance: one tap, land in the new doc (E3: many studies;
 *  the picker in save-to-study titles from context, this standalone one starts untitled and the
 *  doc page's inline title edit is the rename). */
export function NewStudyButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const create = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch('/api/studies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled study' }),
      });
      const data = res.status === 201
        ? ((await res.json().catch(() => undefined)) as { study?: { id?: string } } | undefined)
        : undefined;
      if (!data?.study?.id) { setFailed(true); return; }
      router.push(`/studies/${data.study.id}`);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-4">
      <button
        type="button"
        disabled={busy}
        onClick={() => void create()}
        className="inline-flex min-h-[44px] items-center font-sans text-xs font-semibold small-caps tracking-[0.08em] text-accent-600 hover:underline disabled:opacity-40 dark:text-accent-400"
      >
        {busy ? 'Creating…' : 'New study'}
      </button>
      {failed && (
        <span role="alert" className="text-sm text-red-800 dark:text-red-200">
          The study could not be created. Try again.
        </span>
      )}
    </span>
  );
}
