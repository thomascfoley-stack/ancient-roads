'use client';

// The My Studies doc editor, v2 (design §7.4, Flow C; owner rulings E1 "My Studies", E7
// "auto-save always, never ask"; owner direction 2026-08-12 — the v2 redesign: use the space,
// one quiet insertion model, movable blocks, the library beside the page). There is still no
// Save button anywhere in this file, on purpose.
//
// LICENSING IS NEVER DERIVED HERE. Every block arrives with a `renderState` already computed
// server-side by the ONE shared rule — `blockRenderState` in lib/servability.ts (S-10): the doc
// page computes it for the first blocks page, the sibling feed route for every later page, and
// the library panel's just-added clipping passed the write's own gate in the same second. This
// component only renders what that rule decided.
//
// S-13 — A FAILED WRITE IS VISIBLE AND ITS BUFFER IS NEVER DISCARDED. v2 consolidates the
// SUCCESS states into one header status (Saving…/Saved — the Google-Docs grammar); the FAILURE
// state stays per-block and loud: Save failed — Retry, rendered the moment the write rejects,
// with the textarea keeping its text (the draft IS the buffer) and Retry re-sending it. An
// EMPTIED block is never written, and a new block CREATEs once and UPDATEs on the returned id
// ever after.
//
// MOVEMENT (v2): every saved block can move up/down — the controls are quiet but ALWAYS
// visible (an affordance that only appears on hover does not exist on a touchscreen). A move is
// the P1 `op: 'move'` PATCH anchored on the nearest SAVED neighbor; the unique position index
// makes a lost race a retry server-side, and the response's fractional key is adopted locally.
//
// R0: nothing here implies memory or conversation. A study is a document, not a thread.

import { Fragment, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StudyLibraryPanel } from './study-library-panel';

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

const isLocal = (id: string) => id.startsWith(LOCAL_PREFIX);

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
  placeholder = 'Write…',
}: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  ariaLabel: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  useEffect(() => {
    // Re-fit when the COLUMN changes width. Found in the v2 browser pass: the height effect can
    // run while the grid column is momentarily collapsed (dev CSS/hydration ordering), measure a
    // one-character-wide reflow, and freeze a 5,450px height for a four-line paragraph — and
    // nothing re-measures, because the effect above only watches the value. Guarded to width
    // changes so our own height writes cannot loop the observer.
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let lastWidth = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return;
      lastWidth = el.clientWidth;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    // A block created from the ghost composer arrives mid-keystroke: focus must land at the
    // END of the seeded text, not at position 0, or the next character types backwards.
    if (autoFocus && ref.current) {
      const el = ref.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: refocusing on every render would steal the caret
  }, []);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      rows={1}
      placeholder={placeholder}
      className="focus-quiet w-full resize-none overflow-hidden border-0 bg-transparent font-serif text-lg leading-[1.75] text-stone-900 outline-none placeholder:text-stone-400 dark:text-stone-200 dark:placeholder:text-stone-500"
    />
  );
}

/** S-14's read order, applied client-side after a page merge: saved blocks sort by
 *  (position, id); local drafts keep their seat behind the saved block they currently follow. */
function mergeByPosition(existing: EditorBlock[], incoming: EditorBlock[]): EditorBlock[] {
  const seen = new Set(existing.map((b) => b.id));
  const all = [...existing, ...incoming.filter((b) => !seen.has(b.id))];
  const saved = all.filter((b) => !isLocal(b.id));
  saved.sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : a.id < b.id ? -1 : 1));
  const out: EditorBlock[] = [];
  const localsAfter = new Map<string, EditorBlock[]>();
  let prevSavedId = '';
  for (const b of all) {
    if (isLocal(b.id)) {
      const bucket = localsAfter.get(prevSavedId) ?? [];
      bucket.push(b);
      localsAfter.set(prevSavedId, bucket);
    } else {
      prevSavedId = b.id;
    }
  }
  out.push(...(localsAfter.get('') ?? []));
  for (const b of saved) {
    out.push(b);
    out.push(...(localsAfter.get(b.id) ?? []));
  }
  return out;
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
  const [blockErrors, setBlockErrors] = useState<Record<string, 'remove' | 'move'>>({});
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const [expandedInsert, setExpandedInsert] = useState<number | null>(null);
  const [nextAfter, setNextAfter] = useState<string | null>(initialNextAfterPosition);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [title, setTitle] = useState(study.title);
  const [titleFailed, setTitleFailed] = useState(false);
  const [pinned, setPinned] = useState(study.pinned);
  const [pinFailed, setPinFailed] = useState(false);
  const [everSaved, setEverSaved] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelFocusToken, setPanelFocusToken] = useState(0);
  const localCounter = useRef(0);
  const bufs = useRef(new Map<string, TextBuf>());
  const placements = useRef(new Map<string, Placement>());
  // Where the library panel's next Add lands: set by an insert point's "From library", advanced
  // past each added clipping so consecutive adds stack in reading order; null = the document end.
  const pendingPlacement = useRef<Placement | null>(null);
  // The title's last-saved value: an empty title is never written (the route 400s it), so a
  // cleared field falls back to this on blur rather than erasing the study's name.
  const savedTitle = useRef(study.title);

  const setSave = (key: string, state: SaveState) =>
    setSaveStates((cur) => ({ ...cur, [key]: state }));
  const setBlockError = (id: string, kind: 'remove' | 'move' | undefined) =>
    setBlockErrors((cur) => {
      const next = { ...cur };
      if (kind === undefined) delete next[id];
      else next[id] = kind;
      return next;
    });

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
      if (isLocal(key)) {
        // First save of an inserted block: CREATE with the placement captured at insert time.
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
        setEverSaved(true);
      } else {
        const res = await fetch(`/api/studies/${study.id}/blocks`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ op: 'update_text', blockId: key, body: text }),
        });
        if (!res.ok) { setSave(key, 'failed'); return; }
        buf.lastSaved = text;
        setSave(key, 'saved');
        setEverSaved(true);
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

  const addText = (index: number, placement: Placement, seed = '') => {
    const key = `${LOCAL_PREFIX}${++localCounter.current}`;
    placements.current.set(key, placement);
    const buf: TextBuf = { draft: seed, lastSaved: '', timer: null, inFlight: false, pending: false };
    bufs.current.set(key, buf);
    if (seed.trim()) buf.timer = setTimeout(() => { void saveText(key); }, DEBOUNCE_MS);
    const fresh: EditorBlock = {
      id: key,
      position: '',
      kind: 'text',
      body: seed,
      work_slug: null,
      ordinal: null,
      quote: null,
      attribution: null,
      renderState: 'text',
    };
    setConfirmingRemove(null);
    setExpandedInsert(null);
    setBlocks((cur) => [...cur.slice(0, index), fresh, ...cur.slice(index)]);
  };

  /** The library panel consumes the pending anchor per add, and the anchor advances past the
   *  block just added so a run of adds lands in reading order. */
  const takePlacement = (): Placement => pendingPlacement.current ?? {};
  const onClippingAdded = (block: EditorBlock) => {
    const placement = pendingPlacement.current;
    setBlocks((cur) => {
      if (placement?.afterBlockId) {
        const i = cur.findIndex((b) => b.id === placement.afterBlockId);
        if (i >= 0) return [...cur.slice(0, i + 1), block, ...cur.slice(i + 1)];
      }
      if (placement?.beforeBlockId) {
        const i = cur.findIndex((b) => b.id === placement.beforeBlockId);
        if (i >= 0) return [...cur.slice(0, i), block, ...cur.slice(i)];
      }
      // Document end. With unloaded pages the true end is below "Show more"; the merge on
      // loadMore re-sorts saved blocks by (position, id), so the order self-corrects (S-14).
      return [...cur, block];
    });
    if (placement) pendingPlacement.current = { afterBlockId: block.id };
    setEverSaved(true);
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
    if (isLocal(block.id)) { drop(); return; }
    try {
      const res = await fetch(
        `/api/studies/${study.id}/blocks?blockId=${encodeURIComponent(block.id)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) { setBlockError(block.id, 'remove'); return; }
      drop();
    } catch {
      setBlockError(block.id, 'remove');
    }
  };

  // A move anchors on the nearest SAVED neighbor — a local draft has no server id to anchor on.
  const savedNeighbor = (index: number, dir: -1 | 1): { block: EditorBlock; at: number } | null => {
    for (let j = index + dir; j >= 0 && j < blocks.length; j += dir) {
      if (!isLocal(blocks[j]!.id)) return { block: blocks[j]!, at: j };
    }
    return null;
  };

  const moveBlockDir = async (block: EditorBlock, dir: -1 | 1): Promise<void> => {
    if (isLocal(block.id)) return;
    const i = blocks.findIndex((b) => b.id === block.id);
    if (i < 0) return;
    const anchor = savedNeighbor(i, dir);
    if (!anchor) return;
    const placement: Placement =
      dir === -1 ? { beforeBlockId: anchor.block.id } : { afterBlockId: anchor.block.id };
    setBlockError(block.id, undefined);
    try {
      const res = await fetch(`/api/studies/${study.id}/blocks`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'move', blockId: block.id, ...placement }),
      });
      const data = res.ok
        ? ((await res.json().catch(() => undefined)) as { position?: string } | undefined)
        : undefined;
      if (!data?.position) { setBlockError(block.id, 'move'); return; }
      const position = data.position;
      setBlocks((cur) => {
        const from = cur.findIndex((b) => b.id === block.id);
        if (from < 0) return cur;
        const moved = { ...cur[from]!, position };
        const without = cur.filter((b) => b.id !== block.id);
        const anchorAt = without.findIndex((b) => b.id === anchor.block.id);
        if (anchorAt < 0) return cur;
        const at = dir === -1 ? anchorAt : anchorAt + 1;
        return [...without.slice(0, at), moved, ...without.slice(at)];
      });
    } catch {
      setBlockError(block.id, 'move');
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
      setBlocks((cur) => mergeByPosition(cur, data.blocks));
      setNextAfter(data.nextAfterPosition);
    } catch {
      setLoadMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const anySaving = Object.values(saveStates).some((s) => s === 'saving');
  const anyFailed = Object.values(saveStates).some((s) => s === 'failed');
  const lastVisible = blocks[blocks.length - 1];
  // The trailing composer: the document always ends ready to type into — unless the last block
  // is already an editable textarea, or the true end is behind unloaded pages.
  const showGhost = nextAfter === null && (!lastVisible || lastVisible.renderState !== 'text');

  /** v2's insertion point: one quiet mark per gap that expands to the two real choices. The
   *  hit target stays ≥44px (touch); the VISUAL is a hairline until asked. */
  const insertPoint = (index: number, placement: Placement) => (
    <div className="group/insert flex min-h-[24px] items-center justify-center py-0.5">
      {expandedInsert === index ? (
        <span className="flex items-center gap-5 font-sans text-xs small-caps tracking-[0.08em]" role="group" aria-label="Insert here">
          <button
            type="button"
            onClick={() => addText(index, placement)}
            className="inline-flex min-h-[44px] items-center text-accent-700 hover:underline dark:text-accent-300"
          >
            + Write
          </button>
          <button
            type="button"
            onClick={() => {
              pendingPlacement.current = placement;
              setPanelOpen(true);
              setPanelFocusToken((t) => t + 1);
              setExpandedInsert(null);
            }}
            className="inline-flex min-h-[44px] items-center text-accent-700 hover:underline dark:text-accent-300"
          >
            + From library
          </button>
          <button
            type="button"
            onClick={() => setExpandedInsert(null)}
            aria-label="Close insert"
            className="inline-flex min-h-[44px] items-center text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300"
          >
            ×
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setExpandedInsert(index)}
          aria-label={`Insert at position ${index + 1}`}
          className="flex min-h-[24px] w-full items-center justify-center opacity-25 transition-opacity ease-gentle hover:opacity-100 focus-visible:opacity-100"
        >
          <span aria-hidden="true" className="h-px w-16 bg-stone-300 dark:bg-stone-600" />
          <span aria-hidden="true" className="mx-2 font-sans text-sm leading-none text-stone-400 dark:text-stone-500">+</span>
          <span aria-hidden="true" className="h-px w-16 bg-stone-300 dark:bg-stone-600" />
        </button>
      )}
    </div>
  );

  const blockToolbar = (block: EditorBlock, i: number) => {
    const canUp = !isLocal(block.id) && savedNeighbor(i, -1) !== null;
    const canDown = !isLocal(block.id) && savedNeighbor(i, 1) !== null;
    return (
      <div className="mt-1 flex items-center justify-end gap-4 font-sans text-xs text-stone-300 dark:text-stone-600">
        {canUp && (
          <button
            type="button"
            onClick={() => void moveBlockDir(block, -1)}
            aria-label={`Move block ${i + 1} up`}
            className="inline-flex min-h-[44px] items-center hover:text-stone-700 dark:hover:text-stone-300"
          >
            ↑
          </button>
        )}
        {canDown && (
          <button
            type="button"
            onClick={() => void moveBlockDir(block, 1)}
            aria-label={`Move block ${i + 1} down`}
            className="inline-flex min-h-[44px] items-center hover:text-stone-700 dark:hover:text-stone-300"
          >
            ↓
          </button>
        )}
        {confirmingRemove === block.id ? (
          <span className="flex items-center gap-4 text-stone-500 dark:text-stone-400" role="group" aria-label="Confirm remove">
            <span className="font-serif text-sm">Remove this block?</span>
            <button
              type="button"
              autoFocus
              onClick={() => setConfirmingRemove(null)}
              className="inline-flex min-h-[44px] items-center hover:text-accent-600 dark:hover:text-accent-400"
            >
              Keep
            </button>
            <button
              type="button"
              onClick={() => void removeBlock(block)}
              className="inline-flex min-h-[44px] items-center font-medium text-red-800 dark:text-red-300"
            >
              Remove
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingRemove(block.id)}
            aria-label={`Remove block ${i + 1}`}
            className="inline-flex min-h-[44px] items-center hover:text-red-800 dark:hover:text-red-300"
          >
            Remove
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-[1360px] px-6 pb-16">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-14">
        <div className="mx-auto w-full max-w-[75ch] lg:mx-0">
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
            {/* Export asks the format (owner 2026-08-12). Plain anchors to the route handler —
                serialization and the licensing re-check stay server-side (Flow E). */}
            <details className="relative">
              <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center hover:text-accent-600 dark:hover:text-accent-400 [&::-webkit-details-marker]:hidden">
                Export
              </summary>
              <div className="absolute left-0 top-full z-10 mt-1 flex min-w-[12rem] flex-col rounded border edge bg-white py-1 shadow-sm dark:bg-stone-900">
                <a href={`/studies/${study.id}/export?format=docx`} className="px-4 py-2 hover:bg-stone-50 hover:text-accent-700 dark:hover:bg-stone-800 dark:hover:text-accent-300">
                  Word (.docx)
                </a>
                <a href={`/studies/${study.id}/export?format=pdf`} target="_blank" rel="noreferrer" className="px-4 py-2 hover:bg-stone-50 hover:text-accent-700 dark:hover:bg-stone-800 dark:hover:text-accent-300">
                  PDF (print)
                </a>
                <a href={`/studies/${study.id}/export?format=md`} className="px-4 py-2 hover:bg-stone-50 hover:text-accent-700 dark:hover:bg-stone-800 dark:hover:text-accent-300">
                  Markdown
                </a>
              </div>
            </details>
            <button
              type="button"
              onClick={() => { setPanelOpen((v) => !v); setPanelFocusToken((t) => t + 1); }}
              aria-expanded={panelOpen}
              className="inline-flex min-h-[44px] items-center hover:text-accent-600 dark:hover:text-accent-400 lg:hidden"
            >
              Library
            </button>
            {/* The document-level save status (v2): success is one quiet word here; failure
                stays loud on the failing block itself (S-13). */}
            {anySaving ? (
              <span role="status">Saving…</span>
            ) : anyFailed ? (
              <span role="status" className="text-red-800 dark:text-red-200">Save failed below</span>
            ) : everSaved ? (
              <span role="status" className="flex items-center gap-2">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-flame" />
                Saved
              </span>
            ) : null}
            {pinFailed && (
              <span role="alert" className="text-red-800 dark:text-red-200">
                The pin could not be saved.
              </span>
            )}
          </div>

          <div className="mt-8">
            {blocks.length === 0 && (
              <p className="font-serif text-stone-500 dark:text-stone-400">
                Start writing below, or search the library and add what speaks.
              </p>
            )}
            {blocks.length > 0 && insertPoint(0, { beforeBlockId: blocks[0]!.id })}
            {blocks.map((block, i) => (
              <Fragment key={block.id}>
                {block.renderState === 'text' ? (
                  <div className="border-l-2 border-transparent pl-4 transition-colors ease-gentle focus-within:border-accent-600 dark:focus-within:border-accent-400">
                    <GrowingTextarea
                      value={block.body ?? ''}
                      onChange={(v) => onTextChange(block, v)}
                      autoFocus={isLocal(block.id)}
                      ariaLabel={`Text block ${i + 1}`}
                    />
                    {saveStates[block.id] === 'failed' && (
                      <div className="flex min-h-[1.5rem] items-center gap-3 font-sans text-xs tracking-[0.03em]">
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
                      </div>
                    )}
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
                  // Tombstone (S-10): attribution + the shared notice. NO quote, NO link — and
                  // the renderState arrived from the server, so this branch cannot be talked
                  // into showing text the re-check refused.
                  <figure className="border-l-2 border-stone-200 py-1 pl-4 dark:border-stone-800">
                    <AttributionLine attribution={block.attribution} />
                    <p className="mt-2 font-serif text-sm italic text-stone-500 dark:text-stone-400">
                      {tombstoneNotice}
                    </p>
                  </figure>
                )}
                {blockToolbar(block, i)}
                {blockErrors[block.id] === 'remove' && (
                  <p role="alert" className="text-right text-sm text-red-800 dark:text-red-200">
                    The block could not be removed. Try again.
                  </p>
                )}
                {blockErrors[block.id] === 'move' && (
                  <p role="alert" className="text-right text-sm text-red-800 dark:text-red-200">
                    The block could not be moved. Try again.
                  </p>
                )}
                {insertPoint(i + 1, { afterBlockId: block.id })}
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
            {showGhost && (
              <div className="border-l-2 border-transparent pl-4">
                {/* The trailing composer: typing here becomes a new block at the document's end
                    (the first keystroke seeds it; the caret follows). No button, no mode. */}
                <GrowingTextarea
                  value=""
                  onChange={(v) => addText(blocks.length, {}, v)}
                  ariaLabel="Keep writing at the end of the document"
                  placeholder="Keep writing…"
                />
              </div>
            )}
          </div>
        </div>

        <div className={`${panelOpen ? 'block' : 'hidden'} mt-12 border-t edge pt-8 lg:mt-0 lg:block lg:border-t-0 lg:pt-0`}>
          <div className="lg:sticky lg:top-8 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto lg:pl-2">
            <StudyLibraryPanel
              studyId={study.id}
              takePlacement={takePlacement}
              onAdded={onClippingAdded}
              focusToken={panelFocusToken}
            />
          </div>
        </div>
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
