'use client';

import Link from 'next/link';
import { errorMessage } from '@/lib/api-error-message';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DISPLAY_LOCALE } from '@/lib/locale';
// The cap is the SERVER's constant, imported — not mirrored. sniff.ts is a pure module (bytes
// and strings, no server-only imports), so the client bundle can carry the real number and the
// two ends cannot disagree (D15).
import { MAX_UPLOAD_BYTES } from '@/lib/user-corpus/sniff';
import { formatVerseId } from '@bible/verse-id';

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
  /** Display-only chips extracted from the manuscript head (migration 124). */
  suggestedReference?: string | null;
  suggestedDate?: string | null;
}
// `createdAt` has been on the wire the whole time (UserHit, lib/user-corpus/search.ts) — the
// client type simply omitted it, so §7's "doc + date" labelling had nothing to render (D17).
interface Hit { documentId: string; sectionId: string; title: string; heading: string | null; text: string; score: number; createdAt?: string }
interface Voice { author: string; work: string; tradition: string; origin: 'corpus'; verseId: number; sourceId: string }
interface VoicesState { loading: boolean; error?: string; data?: { voices: Voice[]; authorCount: number; rangesConsidered: number; pending: boolean } }

interface DraftCheckResponse {
  detection: { translation: string; confidence: number; totalHits: number };
  ranges: { start: number; end: number; channel: string }[];
  overlaps: { range: { start: number; end: number }; documents: { documentId: string; title: string; channel: string; matchCount: number | null }[] }[];
  gaps: { voices: { author: string; work: string; tradition: string; verseId: number; rangesHit: number }[]; authorCount: number; rangesConsidered: number };
}

interface Presence { documentId: string; title: string; sectionId: string; verseStart: number; verseEnd: number; channel: string; matchCount: number | null }

/** Statuses that are still moving — the poll runs only while one of these is present. */
const IN_FLIGHT = new Set(['queued', 'parsing', 'chunking', 'embedding']);

/** Poll cadence while something is genuinely moving. */
const ACTIVE_POLL_MS = 2500;
/**
 * A document that has sat in ONE non-terminal status this long is "stuck" (H2's stranded
 * `chunking`/`embedding` rows — a serverless kill mid-embed leaves the row invisible to the
 * claim and the reap alike; one sat 3.66 days on dev). The row gets a Retry — the retry
 * endpoint resets the claim and re-drains, which is the reclaim path — and the poll drops to a
 * slower cadence, because hammering a stalled queue every 2.5 s forever is a request tax with
 * no information in it.
 */
const STUCK_AFTER_MS = 5 * 60 * 1000;
const STUCK_POLL_MS = 15_000;

/**
 * How many files travel at once (D13). Three is enough to make a 40-file drop feel parallel
 * without racing the serverless upload route's own parse/store work or the browser's per-origin
 * connection budget.
 */
const CONCURRENT_UPLOADS = 3;

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

const KB = 1024;
const MB = KB * KB;

/**
 * A file's size, in the largest unit that does not round its content away.
 *
 * B016 — THIS REPORTED A ~130-BYTE UPLOAD AS "0 KB". The old formatter expressed everything below
 * a megabyte in kilobytes (`Math.round(n / 1024)`), and `Math.round(130 / 1024)` is 0, so the
 * ENTIRE sub-kilobyte range — every note, every short sermon outline, every plain-text file — was
 * displayed as nothing at all. On a status wall whose job is to say truthfully what happened to
 * the reader's document (§8, "a wall of status, not a wall of red"), "0 KB" next to "Ready" reads
 * as "we lost your file". The bytes were never lost: `api/user-corpus/upload/route.ts` stores
 * `bytes.byteLength` and `lib/user-corpus/documents.ts` reads it back intact. Only the display
 * was false.
 *
 * So the sub-kilobyte branch states bytes exactly rather than rounding to a unit too coarse to
 * hold them. Zero is still sayable — an empty upload IS "0 bytes", and `empty` is a real status
 * here — but it is now reachable only from an actually-empty file.
 *
 * The handoff to MB is keyed on the ROUNDED kilobyte value, not on `n < 1024 * 1024`. That looks
 * like pedantry and is not: the naive threshold sends 1,048,575 bytes to the KB branch, where it
 * rounds to "1024 KB" — a quantity that should be spelled as a megabyte and never appears in any
 * file manager. The same off-by-a-rounding-step that produced the "0 KB" at the bottom of the
 * range produced a bogus unit at the top of it, which is why this is exported and swept across
 * both boundaries in test/components/my-works-file-size.test.tsx rather than spot-checked.
 *
 * Exported for that test. It was a private const, so the only way to reach this arithmetic was to
 * render the whole client component — fetch stubs, effects and polling, to check a division.
 */
export function fmtBytes(n: number | null): string {
  // Absent, not zero. The call site guards on `!= null`, so an unknown size renders as nothing;
  // returning "0 bytes" here would reintroduce B016 from the other direction — the product
  // asserting a file is empty when what it actually has is no measurement.
  if (n == null || !Number.isFinite(n) || n < 0) return '';
  const b = Math.round(n);
  if (b < KB) return `${b} ${b === 1 ? 'byte' : 'bytes'}`;
  const kb = Math.round(b / KB);
  if (kb < KB) return `${kb} KB`;
  return `${(b / MB).toFixed(1)} MB`;
}

/**
 * Parse a JSON body, or `null` when the response is not JSON at all.
 *
 * B021 — `await r.json()` sat OUTSIDE every try block here, and before any `r.ok` check, so a
 * non-JSON body threw past the handler entirely: the list stayed a permanent skeleton, an upload
 * was discarded in silence, a search rendered nothing. This is not exotic. The site's own password
 * gate REDIRECTS an expired cookie, `fetch` follows the redirect, and gate HTML arrives with status
 * 200 — `r.ok` is true and the parse is what fails. Platform 413/502/504 pages are the same class.
 *
 * Returning null rather than throwing puts the decision at the call site, where the right sentence
 * for that particular failure is known.
 */
async function readJson<T>(r: Response): Promise<T | null> {
  try {
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/**
 * The human message out of either error envelope.
 *
 * B020 — most `/api/user-corpus/*` routes answer `{ error: "some sentence" }`, but the search route
 * uses the app-wide `apiError`, whose envelope is `{ error: { code, message } }` (docs/API_ERRORS.md).
 * The client typed it as the first shape and stored the object; rendering an object as a React child
 * throws, and the root boundary replaced the entire page. Read both shapes, and fall back to a
 * sentence rather than to `undefined`.
 */
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

/** The merged search surface's date format (search-groups.tsx `when`), so a work carries the
 *  same date on both surfaces. */
const when = (iso: string) =>
  new Date(iso).toLocaleDateString(DISPLAY_LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });

const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / MB;

/**
 * Extensions the server is CERTAIN to refuse — binary formats with no text to sniff as txt/md
 * and no PDF/docx magic, or zip containers the docx reader will reject.
 *
 * A DENY-list, deliberately not an allow-list: the server sniffs CONTENT and accepts any textual
 * file whatever it is called (an .rtf, an .html, a renamed anything — sniff.ts's whole point), so
 * an allow-list here would refuse files the server takes. This list only pre-empts round trips
 * the server would refuse anyway (D15).
 */
const REFUSED_EXTENSIONS = new Set([
  // legacy / other binary office formats
  'doc', 'dot', 'ppt', 'pptx', 'xls', 'xlsx', 'key', 'pages', 'numbers',
  // archives (a zip that is not a docx fails the docx reader; the rest fail the sniff)
  'zip', 'rar', '7z', 'gz', 'tar', 'epub',
  // media
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'tiff', 'bmp',
  'mp3', 'm4a', 'wav', 'aac', 'mp4', 'mov', 'avi', 'mkv',
  // executables
  'exe', 'dmg', 'app',
]);

/**
 * The pre-transfer refusal for one file, or null when it should travel (D15). `file.size` and the
 * filename are in hand before any network; a 5 MB file must not upload for 4 MB before being
 * told about a limit the client knew the whole time. Exported for the component tests.
 */
export function clientRefusal(file: { name: string; size: number }): string | null {
  if (file.size > MAX_UPLOAD_BYTES) {
    return `Larger than the ${MAX_UPLOAD_MB} MB limit (${fmtBytes(file.size)}).`;
  }
  const ext = /\.([A-Za-z0-9]+)$/.exec(file.name)?.[1]?.toLowerCase();
  if (ext && REFUSED_EXTENSIONS.has(ext)) {
    return `.${ext} files cannot be read here — PDF, Word (.docx), text or Markdown only.`;
  }
  return null;
}

/** One file's journey through a batch upload (D13). `failed` keeps its reason; nothing is
 *  overwritten by the next file's outcome. */
type UploadItemState = 'waiting' | 'uploading' | 'done' | 'duplicate' | 'failed';
interface UploadItem { key: string; name: string; state: UploadItemState; message?: string }

/** Same register as the document STATUS map: person-words, one tone per verdict. The dedupe 200
 *  is its OWN state — "already in your library" is not an error and must not dress as one. */
const UPLOAD_STATE: Record<UploadItemState, { label: string; tone: string }> = {
  waiting: { label: 'Waiting', tone: 'text-stone-500 dark:text-stone-400' },
  uploading: { label: 'Uploading…', tone: 'text-stone-500 dark:text-stone-400' },
  done: { label: 'Added', tone: 'text-emerald-700 dark:text-emerald-400' },
  duplicate: { label: 'Already in your library', tone: 'text-stone-500 dark:text-stone-400' },
  failed: { label: 'Refused', tone: 'text-amber-700 dark:text-amber-400' },
};

/** "12 added · 2 already in your library · 1 refused" — zero-count parts omitted. */
function summarizeUploads(items: UploadItem[]): string {
  const n = (s: UploadItemState) => items.filter((it) => it.state === s).length;
  const parts: string[] = [];
  const done = n('done');
  const dup = n('duplicate');
  const failed = n('failed');
  if (done) parts.push(`${done} added`);
  if (dup) parts.push(`${dup} already in your library`);
  if (failed) parts.push(`${failed} refused`);
  return parts.join(' · ');
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
  const [loadError, setLoadError] = useState<string | null>(null);
  // D13: per-file rows replace the single overwritten error string. `uploadItems` is the batch in
  // flight (or just settled); `uploadSummary` is the one line written when everything settles.
  const [uploadItems, setUploadItems] = useState<UploadItem[] | null>(null);
  const [uploadSummary, setUploadSummary] = useState<string | null>(null);
  /** D16: per-document action note (a failed retry or remove says so ON the row it failed on). */
  const [rowNotes, setRowNotes] = useState<Record<string, string>>({});
  /** D14: the drop zone's armed state. Depth-counted, because dragenter/dragleave fire per child. */
  const [dragArmed, setDragArmed] = useState(false);
  const dragDepth = useRef(0);
  /**
   * When each document was FIRST SEEN in its current status, for the stuck test. Seeded from
   * `createdAt` on first sight — an in-flight row that is already six minutes old on page load is
   * stuck NOW, not five minutes from now — and reset to the observation time on any status
   * change, so a just-retried document gets its full grace period even though `createdAt` never
   * moves. Maintained inside load(), before setDocs, so render never sees a doc it cannot date.
   */
  const statusSince = useRef(new Map<string, { status: Doc['status']; since: number }>());
  /**
   * The render's clock for the stuck test, stamped by load() — never Date.now() in render (the
   * purity rule, and the right call anyway: stuck-ness only changes when the poll ticks, and
   * every tick runs load()).
   */
  const [clock, setClock] = useState(0);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [presence, setPresence] = useState<Presence[] | null>(null);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  /** Which row's Remove is armed (B017). One at a time; null when nothing is armed. */
  const [armedRemove, setArmedRemove] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [voices, setVoices] = useState<Record<string, VoicesState>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  /**
   * `reclaimedId` — a document whose stuck-clock must restart NOW (a successful retry). Done here
   * rather than in retry() because this is where the clock lives; a retried document's status may
   * already read `queued`, in which case no status CHANGE would ever reset it.
   */
  const load = useCallback(async (reclaimedId?: string) => {
    // A THROW HERE USED TO BE PERMANENT. `docsLoaded` gates the list, so a network failure left
    // "Loading your documents…" on screen for the life of the tab with nothing to retry — the same
    // shape as the `if (!r.ok) return;` bug that pinned the whole page on "Loading…" before it.
    // Whatever happens, the wait ends and says something.
    let r: Response;
    try {
      r = await fetch('/api/user-corpus/documents');
    } catch {
      setDocsLoaded(true);
      setLoadError('Your documents could not be loaded. Check your connection and try again.');
      return;
    }
    setLoadError(null);
    if (r.status === 401) { setState('signedout'); return; }
    // Any other failure (403 when uploads are switched off, 500) used to `return` and leave state
    // on 'loading' forever: the page sat at "Loading…" with no upload control and no reason given.
    if (!r.ok) { setState('unavailable'); return; }
    // B021 — a 200 that is not JSON (the gate's HTML, a platform error page) used to throw here and
    // pin the page on its skeleton forever. End the wait, and offer the retry.
    const d = await readJson<{ documents: Doc[] }>(r);
    if (!d || !Array.isArray(d.documents)) {
      setDocsLoaded(true);
      setState('ready');
      setLoadError('Your documents could not be loaded. Check your connection and try again.');
      return;
    }
    // Status-age bookkeeping BEFORE the state lands, so the render that shows these docs can
    // already answer "how long has this one been here".
    const now = Date.now();
    const seen = statusSince.current;
    const ids = new Set(d.documents.map((doc) => doc.id));
    for (const id of [...seen.keys()]) if (!ids.has(id)) seen.delete(id);
    for (const doc of d.documents) {
      const prev = seen.get(doc.id);
      if (!prev) {
        const created = Date.parse(doc.createdAt);
        seen.set(doc.id, { status: doc.status, since: Number.isFinite(created) ? Math.min(created, now) : now });
      } else if (prev.status !== doc.status || doc.id === reclaimedId) {
        prev.status = doc.status;
        prev.since = now;
      }
    }
    setClock(now);
    setDocs(d.documents);
    setDocsLoaded(true);
    setState('ready');
  }, []);

  useEffect(() => { void load(); }, [load]);

  /** Stuck = non-terminal AND unchanged past the grace period. The reclaim affordance's predicate. */
  const isStuck = useCallback((d: Doc, now: number) => {
    if (!IN_FLIGHT.has(d.status)) return false;
    const seen = statusSince.current.get(d.id);
    return now - (seen?.since ?? now) > STUCK_AFTER_MS;
  }, []);

  // Poll only while something is moving. A permanent interval on a settled list is a request every
  // few seconds forever, on every open tab. When everything still in flight is STUCK, drop to the
  // slow cadence — the row is waiting on a human clicking Retry, not on the queue.
  useEffect(() => {
    const now = Date.now();
    const inFlight = docs.filter((d) => IN_FLIGHT.has(d.status));
    if (inFlight.length === 0) return;
    const allStuck = inFlight.every((d) => isStuck(d, now));
    const t = setInterval(() => { void load(); }, allStuck ? STUCK_POLL_MS : ACTIVE_POLL_MS);
    return () => clearInterval(t);
  }, [docs, load, isStuck]);

  /**
   * D13 — the batch upload. Bounded-concurrency workers over the selection, one status row per
   * file, every refusal named on ITS row and preserved. The serial loop this replaces overwrote a
   * single error string per iteration, so 40 files with 6 refusals reported one message that
   * never named a file.
   */
  async function upload(files: FileList | File[] | null) {
    const list = files ? Array.from(files) : [];
    if (!list.length || busy) return;
    setBusy(true);
    setUploadSummary(null);

    // D15 — pre-checks BEFORE any transfer. A refused file starts (and ends) as `failed`,
    // reason attached; it never reaches the network.
    const stamp = Date.now();
    const items: UploadItem[] = list.map((f, i) => {
      const refusal = clientRefusal(f);
      return {
        key: `${stamp}-${i}-${f.name}`,
        name: f.name,
        state: refusal ? 'failed' : 'waiting',
        message: refusal ?? undefined,
      };
    });
    setUploadItems(items);
    const patch = (key: string, next: Partial<UploadItem>) =>
      setUploadItems((cur) => (cur ? cur.map((it) => (it.key === key ? { ...it, ...next } : it)) : cur));

    // Settled outcomes tracked locally as well as in state: the summary must not depend on
    // reading React state mid-flight.
    const settled = new Map(items.filter((it) => it.state === 'failed').map((it) => [it.key, it] as const));

    const queue = items
      .map((it, i) => ({ it, file: list[i]! }))
      .filter(({ it }) => it.state === 'waiting');
    let next = 0;
    const worker = async () => {
      // Single-threaded pull; `next++` is atomic between awaits, so no two workers share a file.
      while (next < queue.length) {
        const { it, file } = queue[next++]!;
        patch(it.key, { state: 'uploading' });
        let outcome: UploadItemState;
        let message: string | undefined;
        try {
          // Two-call direct-to-Blob flow (DIRECT_UPLOAD_DESIGN.md): the bytes never
          // touch the serverless function, so the ~4 MB platform body cap does not apply.
          // 1. Get a presigned URL. 2. PUT directly to Blob. 3. Record the document.
          const urlRes = await fetch('/api/user-corpus/upload-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: file.name, size: file.size }),
          });
          const urlData = await readJson<{ uploadUrl?: string; pathname?: string; error?: unknown }>(urlRes);
          if (!urlRes.ok || !urlData?.uploadUrl || !urlData?.pathname) {
            outcome = 'failed';
            message = errorMessage(urlData, 'The upload could not be prepared. Please try again.');
            settled.set(it.key, { ...it, state: outcome, message });
            patch(it.key, { state: outcome, message });
            continue;
          }

          // Direct PUT to Blob — the browser talks to the store, not to us.
          const putRes = await fetch(urlData.uploadUrl, { method: 'PUT', body: file });
          if (!putRes.ok) {
            outcome = 'failed';
            message = 'The file could not be stored. Please try again.';
            settled.set(it.key, { ...it, state: outcome, message });
            patch(it.key, { state: outcome, message });
            continue;
          }

          // Record the document (sniff + checksum + dedupe + queue happen here).
          const completeRes = await fetch('/api/user-corpus/upload-complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pathname: urlData.pathname, name: file.name }),
          });
          const d = await readJson<{ error?: unknown; message?: string; duplicateOf?: string }>(completeRes);
          if (!completeRes.ok) {
            outcome = 'failed';
            message = errorMessage(d, 'The upload failed. Please try again.');
          } else if (!d) {
            outcome = 'failed';
            message = 'The upload could not be confirmed. Please try again.';
          } else if (d.duplicateOf) {
            outcome = 'duplicate';
          } else {
            outcome = 'done';
          }
        } catch {
          outcome = 'failed';
          message = 'Could not be uploaded. Check your connection and try again.';
        }
        settled.set(it.key, { ...it, state: outcome, message });
        patch(it.key, { state: outcome, message });
      }
    };

    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENT_UPLOADS, queue.length) }, () => worker()));
      setUploadSummary(summarizeUploads([...settled.values()]));
      await load();
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  const setRowNote = (id: string, note: string | null) =>
    setRowNotes((cur) => {
      if (note === null) {
        if (!(id in cur)) return cur;
        const rest = { ...cur };
        delete rest[id];
        return rest;
      }
      return { ...cur, [id]: note };
    });

  // D16 — both actions READ THE RESPONSE. The route's 409s are written to be shown ("The
  // original file was not stored… please upload it again"), and a failed delete must say so
  // instead of silently keeping the row.
  async function retry(id: string) {
    setRowNote(id, null);
    let r: Response;
    try {
      r = await fetch(`/api/user-corpus/documents/${id}`, { method: 'POST' });
    } catch {
      setRowNote(id, 'The retry could not be started. Check your connection and try again.');
      return;
    }
    if (!r.ok) {
      const d = await readJson<{ error?: unknown }>(r);
      setRowNote(id, errorMessage(d, 'The retry could not be started.'));
      return;
    }
    // The reclaim id restarts this document's stuck-clock inside load(), where the clock lives.
    await load(id);
  }

  async function remove(id: string) {
    setRowNote(id, null);
    let r: Response;
    try {
      r = await fetch(`/api/user-corpus/documents/${id}`, { method: 'DELETE' });
    } catch {
      setRowNote(id, 'This document could not be removed. Check your connection and try again.');
      setArmedRemove(null);
      return;
    }
    if (!r.ok) {
      const d = await readJson<{ error?: unknown }>(r);
      setRowNote(id, errorMessage(d, 'This document could not be removed.'));
      setArmedRemove(null);
      return;
    }
    // B018 — the document list reloaded and the SEARCH RESULTS did not, so hits pointing at the
    // just-deleted document stayed on screen until the reader searched again. Clicking one of
    // those is the failure that matters: a result for a document that no longer exists. Cleared
    // rather than silently re-run — re-running spends a request the reader did not ask for, and
    // the honest state after a delete is "these results are no longer current".
    setHits(null);
    setPresence(null);
    setSearchNote(null);
    setArmedRemove(null);
    await load();
  }

  // ── the draft check (design §1): paste a draft, see your own ground and the tradition's ──
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [draftResult, setDraftResult] = useState<DraftCheckResponse | null>(null);

  async function checkDraft() {
    const text = draftText.trim();
    if (!text || draftBusy) return;
    setDraftBusy(true);
    setDraftNote(null);
    setDraftResult(null);
    try {
      let r: Response;
      try {
        r = await fetch('/api/user-corpus/draft-check', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text }),
        });
      } catch {
        setDraftNote('The check could not run. Check your connection and try again.');
        return;
      }
      const d = await readJson<DraftCheckResponse & { error?: unknown }>(r);
      if (!r.ok) { setDraftNote(errorMessage(d, 'The check could not run.')); return; }
      if (!d) { setDraftNote('The check could not run. Please try again.'); return; }
      setDraftResult(d);
    } finally {
      setDraftBusy(false);
    }
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
      // POST + application/json, not a GET query string: the search route is state-changing (a paid
      // embedding on the request path + a victim-attributed audit row), so it sits behind the CSRF
      // Content-Type floor (csrf-floor.ts). A GET has no Content-Type to gate, so a cross-site
      // top-level navigation could carry the SameSite=Lax session cookie and run the handler as the
      // victim; requiring application/json forces a preflight on cross-origin callers, which the
      // browser then refuses.
      const payload = looksLikeRef ? { ref: q } : { q };
      let r: Response;
      try {
        r = await fetch('/api/user-corpus/search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch {
        setSearchNote('That search could not be run. Check your connection and try again.');
        return;
      }
      const d = await readJson<{ mode?: string; hits?: Hit[]; anchors?: Presence[]; error?: unknown; degraded?: string }>(r);
      // B020 — the search route answers failures with `apiError`'s `{ error: { code, message } }`,
      // not the bare string every other route here returns. Storing the object and rendering it
      // threw, and the root boundary replaced the whole page.
      if (!r.ok) { setSearchNote(errorMessage(d, 'That search could not be run.')); return; }
      if (!d) { setSearchNote('That search could not be run. Please try again.'); return; }
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
    // THE SHAPE, NOT THE WORD. This used to render "Loading…" and nothing else — no heading, no
    // dropzone, no search box — so every visit was a blank page and then the whole surface
    // arriving at once, shifting the layout under the pointer. Anything typed or clicked in that
    // window went nowhere; it was hit three separate times while driving this feature in a
    // browser. Drawing this page's own skeleton means the shell is there immediately and nothing
    // moves when the answer lands. Deliberately shows NO upload control: whether this account may
    // upload is not known yet, and a control that might vanish is worse than one that arrives.
    return (
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-6" aria-busy>
        <span className="sr-only">Loading My Works</span>
        <div aria-hidden className="animate-pulse">
          <div className="mb-3 h-9 w-44 rounded-lg bg-stone-200/70 dark:bg-stone-800" />
          <div className="mb-8 h-4 w-80 max-w-full rounded bg-stone-200/50 dark:bg-stone-800/70" />
          <div className="mb-8 h-28 rounded-2xl border border-dashed border-stone-300 dark:border-stone-700" />
          <div className="mb-8 h-11 w-full rounded bg-stone-200/60 dark:bg-stone-800/80" />
          <div className="mb-3 h-5 w-40 rounded bg-stone-200/60 dark:bg-stone-800/80" />
          <div className="h-20 rounded-xl bg-stone-200/50 dark:bg-stone-800/70" />
        </div>
      </div>
    );
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
            className="mt-5 inline-flex min-h-[44px] items-center border border-stone-900 px-6 py-2.5 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-900"
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
        {/* D14 — a real drop zone. All four handlers live on the label; an unhandled dragover is
            the browser saying "not a drop target", and the eventual drop NAVIGATES THE TAB AWAY
            with the reader's whole session. Enter/leave are depth-counted because they re-fire on
            every child span. Drops while busy are ignored — the input is disabled, and the drop
            path must not be a side door around that. */}
        <label
          htmlFor="my-works-file"
          onDragEnter={(e) => { e.preventDefault(); dragDepth.current += 1; setDragArmed(true); }}
          onDragOver={(e) => { e.preventDefault(); }}
          onDragLeave={() => {
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setDragArmed(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            dragDepth.current = 0;
            setDragArmed(false);
            if (!busy) void upload(e.dataTransfer?.files ?? null);
          }}
          /* D19 — the input is sr-only, so without focus-within the feature's primary action has
             no visible keyboard focus at all. Same outline idiom as the ask composer. */
          className={`flex min-h-[44px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-8 text-center transition-colors focus-within:outline-2 focus-within:outline-solid focus-within:outline-offset-2 focus-within:outline-accent-600 dark:focus-within:outline-accent-400 ${
            dragArmed
              ? 'border-accent-500 bg-accent-50/60 dark:border-accent-400 dark:bg-accent-950/30'
              : 'border-stone-300 bg-paper hover:border-accent-400 dark:border-stone-700 dark:bg-stone-800'
          }`}
        >
          <span className="font-serif text-[15px] text-stone-600 dark:text-stone-300">
            {busy ? 'Uploading…' : dragArmed ? 'Drop to add' : 'Add a document'}
          </span>
          {/* D15 — the cap is stated BEFORE the picker, from the server's own constant. */}
          <span className="mt-1 text-[13px] text-stone-500 dark:text-stone-400">
            PDF, Word, text or Markdown · up to {MAX_UPLOAD_MB} MB
          </span>
          {/* The ownership assertion (UPLOADER_DESIGN.md §5/Q7) — one sentence, beside the ONLY
              upload entry point, so uploading past it IS the assertion the server records as
              asserted_ownership_at. If a second upload surface ever ships, it must carry this
              sentence too or the recorded assertion becomes a fabrication. */}
          <span className="mt-1 text-[12px] text-stone-400 dark:text-stone-500">
            By uploading you affirm this is your own work, or content you have the right to store.
          </span>
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

        {/* D13 — the per-file batch report: one row per file, its own verdict, failures named and
            preserved, and one summary line when everything settles. role="status" (D19) so state
            transitions announce without stealing focus. */}
        {uploadItems && (
          <div role="status" aria-label="Upload progress" className="mt-3">
            <ul className="border-y edge">
              {uploadItems.map((it) => {
                const s = UPLOAD_STATE[it.state];
                return (
                  <li key={it.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b edge px-1 py-2 last:border-b-0">
                    <span className="min-w-0 flex-1 truncate font-serif text-[14px] text-stone-700 dark:text-stone-200">{it.name}</span>
                    <span className={`shrink-0 text-[13px] font-semibold ${s.tone}`}>{s.label}</span>
                    {it.message && (
                      <span className="w-full font-serif text-[13px] leading-relaxed text-amber-800 dark:text-amber-300">{it.message}</span>
                    )}
                  </li>
                );
              })}
            </ul>
            {uploadSummary && (
              <p className="mt-2 font-sans text-sm text-stone-600 dark:text-stone-300">{uploadSummary}</p>
            )}
          </div>
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
            className="min-h-[44px] w-full border edge bg-transparent px-4 font-serif text-[15px] text-stone-700 placeholder:text-stone-400 dark:text-stone-200"
          />
          <button
            type="submit"
            disabled={searching}
            className="min-h-[44px] shrink-0 border border-stone-900 px-5 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 disabled:opacity-50 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-900"
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
            <ul className="mt-3 border-y edge">
              {presence.map((p) => (
                /* D18 — flex + min-w-0 + truncate: the title is a raw filename and must not
                   push the row past 390px. No date here: VersePresence carries no createdAt on
                   the wire (recorded gap — a route change, not a client one). */
                <li key={`${p.sectionId}-${p.channel}-${p.verseStart}`} className="flex flex-wrap items-baseline gap-x-2 border-b edge px-1 py-3 last:border-b-0">
                  <span className="min-w-0 max-w-full truncate font-serif text-[15px] text-stone-700 dark:text-stone-200">{p.title}</span>
                  <span className="text-[13px] text-stone-500 dark:text-stone-400">
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
            <ul className="mt-3 border-y edge">
              {hits.map((h) => (
                <li key={h.sectionId} className="border-b edge px-1 py-4 last:border-b-0">
                  {/* D18 — the title is a raw filename; truncate rather than overflow at 390px. */}
                  <p className="truncate font-display text-[15px] text-stone-700 dark:text-stone-200">{h.title}</p>
                  {/* D17 — doc + date (§7): the document's date, in the merged surface's format. */}
                  {(h.createdAt || h.heading) && (
                    <p className="truncate text-[13px] text-stone-500 dark:text-stone-400">
                      {[h.createdAt ? when(h.createdAt) : null, h.heading].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  <p className="mt-1 font-serif text-[15px] leading-relaxed text-stone-600 dark:text-stone-300">
                    {(() => { const t = plainExcerpt(h.text); return t.length > 320 ? `${t.slice(0, 320)}…` : t; })()}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── the draft check (design §1): all three loop questions in one action ─────────────── */}
      <section className="mb-8">
        <details open={draftOpen} onToggle={(e) => setDraftOpen((e.target as HTMLDetailsElement).open)}>
          <summary className="min-h-[44px] cursor-pointer list-none font-display text-lg text-stone-700 hover:text-accent-700 dark:text-stone-200 dark:hover:text-accent-300">
            Check a draft
          </summary>
          <p className="mt-1 font-serif text-[14px] text-stone-500 dark:text-stone-400">
            Paste a draft to see where you have preached its passages before, and which voices from
            the tradition speak on them. Matched by quoted Scripture.
          </p>
          <textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            rows={6}
            aria-label="Draft to check"
            placeholder="Paste your draft here…"
            className="mt-3 w-full border edge bg-transparent p-3 font-serif text-[15px] text-stone-700 placeholder:text-stone-400 dark:text-stone-200"
          />
          <button
            type="button"
            onClick={() => void checkDraft()}
            disabled={draftBusy || !draftText.trim()}
            className="mt-2 min-h-[44px] border border-stone-900 px-5 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 disabled:opacity-50 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-900"
          >
            {draftBusy ? 'Checking…' : 'Check this draft'}
          </button>
          {draftNote && <p role="alert" className="mt-3 font-serif text-[14px] text-amber-700 dark:text-amber-400">{draftNote}</p>}
          {draftResult && (
            <div className="mt-4" role="status" aria-label="Draft check results">
              {draftResult.ranges.length === 0 ? (
                <p className="font-serif text-[15px] text-stone-500 dark:text-stone-400">
                  No quoted Scripture was found in this draft — the check matches by quotation, so a
                  draft that paraphrases without quoting will not anchor.
                </p>
              ) : (
                <>
                  <h3 className="font-display text-base text-stone-700 dark:text-stone-200">
                    {draftResult.overlaps.length === 0
                      ? 'You have not written on these passages yet'
                      : 'Where you have preached this ground'}
                  </h3>
                  {draftResult.overlaps.length > 0 && (
                    <ul className="mt-2 border-y edge">
                      {draftResult.overlaps.map((o) => (
                        <li key={`${o.range.start}-${o.range.end}`} className="border-b edge px-1 py-2.5 last:border-b-0">
                          <span className="font-sans text-[13px] font-semibold text-stone-600 dark:text-stone-300">
                            {o.range.start === o.range.end ? formatVerseId(o.range.start) : `${formatVerseId(o.range.start)}–${formatVerseId(o.range.end).split(' ').pop()}`}
                          </span>
                          <span className="ml-2 font-serif text-[14px] text-stone-600 dark:text-stone-300">
                            {o.documents.map((d) => d.title).join(' · ')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {draftResult.gaps.voices.length > 0 && (
                    <>
                      <h3 className="mt-4 font-display text-base text-stone-700 dark:text-stone-200">
                        Voices from the tradition on the same passages
                      </h3>
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {draftResult.gaps.voices.slice(0, 12).map((v) => (
                          <li key={`${v.author}-${v.work}`} className="rounded-full bg-stone-100 px-3 py-1 font-sans text-[13px] text-stone-700 dark:bg-stone-800 dark:text-stone-200">
                            {v.author}{v.work ? ` · ${v.work}` : ''}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </details>
      </section>


      {/* ── the status wall ────────────────────────────────────────────────────────────────── */}
      {/* D19 — aria-live: this wall mutates every poll tick while documents are in flight, and
          without a live region every transition (Reading → Indexing → Ready) was silent to a
          screen reader. Polite, never assertive — a status change must not interrupt. */}
      <section aria-live="polite">
        <h2 className="mb-3 font-display text-lg text-stone-700 dark:text-stone-200">Your documents</h2>
        {loadError ? (
          <p role="alert" className="font-serif text-[15px] text-amber-800 dark:text-amber-300">
            {loadError}{' '}
            <button type="button" onClick={() => void load()} className="underline underline-offset-2">
              Try again
            </button>
          </p>
        ) : !docsLoaded ? (
          <p role="status" className="font-serif text-[15px] text-stone-500 dark:text-stone-400">Loading your documents…</p>
        ) : docs.length === 0 ? (
          <p className="font-serif text-[15px] text-stone-500 dark:text-stone-400">Nothing here yet. Add a sermon or a paper and it will be searchable alongside the library.</p>
        ) : (
          <ul className="border-y edge">
            {docs.map((d) => {
              const s = STATUS[d.status];
              return (
                /* PRD §5 My Works: hairline list rows, no cards — 18px Literata titles,
                   14px Source Sans ink-wash metadata. */
                <li key={d.id} className="border-b edge px-1 py-4 last:border-b-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    {/* D18 — min-w-0 + truncate (the library page's idiom): the title is a raw
                        filename minus extension and must not overflow at 390px. */}
                    <span className="min-w-0 flex-1 truncate font-serif text-lg text-stone-900 dark:text-stone-100">{d.title}</span>
                    <span className={`shrink-0 text-[13px] font-semibold ${s.tone}`}>{s.label}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 font-sans text-sm text-stone-500 dark:text-stone-400">
                    {/* D17 — doc + date, same format as the merged search surface. */}
                    <span>{when(d.createdAt)}</span>
                    {d.mimeType && <span className="uppercase">{d.mimeType}</span>}
                    {d.byteSize != null && <span>{fmtBytes(d.byteSize)}</span>}
                    {d.pageCount != null && <span>{d.pageCount} pages</span>}
                    {/* Extracted, not typed (design §2): what the manuscript head appears to say.
                        Display-only — a wrong suggestion is a chip, not a renamed document. */}
                    {(d.suggestedReference || d.suggestedDate) && (
                      <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[12px] text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                        Looks like: {[d.suggestedReference, d.suggestedDate ? when(d.suggestedDate) : null].filter(Boolean).join(' · ')}
                      </span>
                    )}
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
                        className="min-h-[44px] px-3 text-[13px] font-semibold text-stone-600 hover:text-accent-800 dark:text-stone-300"
                      >
                        Try again
                      </button>
                    )}
                    {/* The reclaim affordance (H2's retry gap): a row stuck in a non-terminal
                        state for five minutes is almost always a killed function, not a slow one.
                        Retry is the reclaim path — the endpoint resets the claim and re-drains. */}
                    {d.status !== 'failed' && isStuck(d, clock) && (
                      <span className="inline-flex min-h-[44px] items-center gap-1.5 px-1 text-[13px] text-stone-500 dark:text-stone-400">
                        Taking longer than expected —
                        <button
                          type="button"
                          onClick={() => void retry(d.id)}
                          className="min-h-[44px] font-semibold text-stone-600 hover:text-accent-800 dark:text-stone-300"
                        >
                          Retry
                        </button>
                      </span>
                    )}
                    {/* Reading view: the work on one side, the tradition on the other. Linked
                        from the card because a surface reachable only by typing its URL is a
                        surface nobody finds — the defect this whole feature already had once. */}
                    {d.status === 'ready' && (
                      <Link
                        href={`/library/uploads/${d.id}`}
                        className="inline-flex min-h-[44px] items-center px-3 text-[13px] font-semibold text-stone-600 hover:text-accent-800 dark:text-stone-300"
                      >
                        Open beside the tradition
                      </Link>
                    )}
                    {/* The corpus join (ADR-104). Only offered once the document is `ready`,
                        because anchors are what the join reads and they do not exist before then. */}
                    {d.status === 'ready' && !voices[d.id] && (
                      <button
                        type="button"
                        onClick={() => void loadVoices(d.id)}
                        className="min-h-[44px] px-3 text-[13px] font-semibold text-stone-600 hover:text-accent-800 dark:text-stone-300"
                      >
                        The tradition on this
                      </button>
                    )}
                    {/* B017 — this deleted on ONE click, with no confirmation, on the reader's
                        own uploaded file. Two steps, disarming on blur so an armed row cannot sit
                        waiting to catch a later stray click. Same pattern as the research-thread
                        and study controls. */}
                    <button
                      type="button"
                      onClick={() => (armedRemove === d.id ? void remove(d.id) : setArmedRemove(d.id))}
                      onBlur={() => setArmedRemove((cur) => (cur === d.id ? null : cur))}
                      className={`min-h-[44px] px-3 text-[13px] font-semibold ${
                        armedRemove === d.id
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-stone-500 hover:text-red-700 dark:text-stone-400'
                      }`}
                    >
                      {armedRemove === d.id ? 'Remove?' : 'Remove'}
                    </button>
                  </div>

                  {/* D16 — the answer to a failed retry/remove, on the row it failed on. The
                      server's 409 sentences are written to be shown; a silent no-op reads as
                      "remove worked" until the next reload contradicts it. */}
                  {rowNotes[d.id] && (
                    <p role="alert" className="mt-2 font-serif text-[14px] leading-relaxed text-amber-800 dark:text-amber-300">
                      {rowNotes[d.id]}
                    </p>
                  )}

                  {voices[d.id] && (
                    <div className="mt-3 border-t edge pt-3">
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
                                    {x.tradition && <span className="ml-2 text-[12px] uppercase tracking-wide text-stone-500 dark:text-stone-400">{x.tradition}</span>}
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
