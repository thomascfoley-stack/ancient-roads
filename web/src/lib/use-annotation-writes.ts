'use client';

// The reader's annotation writes: highlights, verse notes, and bookmarks — plus the failure path
// that used to not exist. Extracted out of the page component so the retry/rollback/surface-error
// logic is unit-testable with `renderHook` against a mocked `fetch`, the same way
// `useWorkSectionPages` is tested (test/invariants/work-reader-paging.test.tsx). Mounting the whole
// reader page just to fail one POST would also require faking the chapter/commentary/original-
// language fetches that have nothing to do with this bug.
//
// THE DEFECT THIS REPLACES: every write here used to be `fetch(...).catch(() => {})`. The
// optimistic UI painted the change, the POST/DELETE could fail, and on a dropped connection —
// this app's core use context is phones on low signal (CLAUDE.md) — NOTHING retried, NOBODY was
// told, and the annotation was gone on reload. Fixed two ways: `persistWrite` (./persist-write.ts)
// retries a transient failure a couple of times before giving up, and if it still fails, the
// optimistic state is rolled back to what it was and ONE error banner appears with a Retry button
// — see `writeError` / `retryWrite` / `dismissWrite` below. Retry redoes the WHOLE action (paint
// again, then persist again), not just the bare network call — otherwise a retry that finally
// succeeds would leave the optimistic paint missing even though the write landed.

import { useCallback, useEffect, useRef, useState } from 'react';
import { encodeVerseId } from '@bible/verse-id';
import { persistWrite } from './persist-write';
import { isFetchableChapter } from './chapter-param';

// A stored highlight span as the reader holds it: character offsets into v.text (null/null = a
// legacy whole-verse highlight), the background color, and the translation it was anchored in.
// Owned here, not by the presentational VerseDisplay, because this hook is what produces it.
export interface StoredSpan {
  id?: string;
  start: number | null;
  end: number | null;
  color: string;
  textColor?: string | null;
  translation?: string | null;
}

// The highlight shape returned by GET /api/annotations (sub-verse columns from migration 015).
interface ApiHighlight {
  id: string;
  verse_id: number;
  span_start: number | null;
  span_end: number | null;
  color: string;
  text_color: string | null;
  translation: string | null;
}

/** A write that failed after retries. `id` is internal (races an older write's late resolution
 *  against a newer one's failure); callers just render `message` and offer `retry` when present.
 *  `retry` is carried ON the error, not in a ref beside it — a ref can go stale (an earlier
 *  failed write's retry firing for a newer error) or go missing (a path that sets the error
 *  without the ref, which is exactly what the superseded-clear branch does). Carrying it on the
 *  object makes "the banner can never offer a retry that isn't its own" structural. */
export interface WriteFailure {
  id: number;
  message: string;
  retry?: () => void;
}

export function useAnnotationWrites(bookNum: number | undefined, chapterNum: number, translationId: string) {
  // verse (1-based within chapter) → its highlight spans (multiple allowed).
  const [highlights, setHighlights] = useState<Map<number, StoredSpan[]>>(new Map());
  const [notes, setNotes] = useState<Map<number, string>>(new Map());
  // Bookmarked verses in this chapter, by verse number. A Set because a bookmark carries no
  // payload — it is a place, not an annotation.
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set());
  // Spans written THIS session and not yet bloomed out — identity-based (the object addHighlight
  // painted), so a server-hydrated span can never be a member. VerseDisplay reads it to run the
  // one-shot bloom on fresh marks only.
  const [freshSpans, setFreshSpans] = useState<Set<StoredSpan>>(new Set());
  // THE CHAPTER'S ANNOTATIONS FAILED TO LOAD. Deliberately NOT `writeError`: nothing was painted,
  // nothing was rolled back, nothing is queued to re-send. The reader's highlights and notes are
  // on the server and this screen is not showing them.
  //
  // This slot used to be `signedIn`, set true in the GET's success handler and false in its catch —
  // so ONE failed request revoked the highlighter for a signed-in reader. Who is signed in is a
  // session fact and now comes from `lib/auth/use-signed-in.ts`; this flag says only what it can
  // honestly say. The distinction matters because the note editor upserts
  // (`annotations.ts`, `DO UPDATE SET body = EXCLUDED.body`): a reader who saves over a note they
  // cannot see destroys it, and until now that was prevented only by accident, because a failed
  // load ALSO hid the editor behind "Sign in".
  const [loadFailed, setLoadFailed] = useState(false);
  // A nonce rather than a bare re-fetch so a retry re-runs the SAME effect, including its reset of
  // the three maps — a retry that re-populated them by a second path would drift from the first.
  const [loadNonce, setLoadNonce] = useState(0);
  const retryAnnotations = useCallback(() => setLoadNonce((n) => n + 1), []);
  const [writeError, setWriteError] = useState<WriteFailure | null>(null);

  // F-121: a verse-level clear that is still in flight when the reader recolours the same verse
  // must not delete the new colour, and must still delete the old one. Each clear gets an
  // AbortController and a `settled` promise; a newer write for the same verse marks the clear
  // superseded (so its rollback is skipped) and awaits `settled` before issuing its own POST,
  // sequencing the verse-level DELETE ahead of the new span.
  interface ClearEntry { controller: AbortController; superseded: boolean; settled: Promise<unknown>; }
  const activeClears = useRef<Map<number, ClearEntry>>(new Map());

  const verseId = useCallback(
    (verse: number) => encodeVerseId({ book: bookNum!, chapter: chapterNum, verse }),
    [bookNum, chapterNum],
  );

  // Load the user's highlights + notes + bookmarks for this chapter.
  //
  // NOT gated on `useSignedIn()`, on purpose. The auth cookie rides this request whether or not the
  // client's session query has resolved, so gating would serialise the load behind it for no gain —
  // and would mean that whenever the session query is pending, slow or itself failing, the GET is
  // never issued, `loadFailed` can never be set, and the Retry is unreachable precisely when it
  // would help. That is the same silent-revocation shape this change exists to remove. Signed out,
  // this GET is a 401 exactly as it is today; the notice it sets is rendered only for a signed-in
  // reader (see the reader page).
  useEffect(() => {
    // A084 — this guarded only the BOOK, so a malformed chapter segment sent
    // `?book=43&chapter=NaN` on every load of `/read/jhn/abc`. The shared predicate answers the
    // one question all three dispatchers were each answering for themselves.
    if (!isFetchableChapter(bookNum, chapterNum)) return;
    setHighlights(new Map());
    setNotes(new Map());
    setBookmarks(new Set());
    setFreshSpans(new Set());
    setLoadFailed(false);
    fetch(`/api/annotations?book=${bookNum}&chapter=${chapterNum}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { highlights: ApiHighlight[]; notes: { verse_id: number; body: string }[]; bookmarks?: { verse_id: number }[] }) => {
        const byVerse = new Map<number, StoredSpan[]>();
        for (const h of d.highlights) {
          const v = h.verse_id % 1000;
          const arr = byVerse.get(v) ?? [];
          arr.push({ id: h.id, start: h.span_start, end: h.span_end, color: h.color, textColor: h.text_color, translation: h.translation });
          byVerse.set(v, arr);
        }
        setHighlights(byVerse);
        setNotes(new Map(d.notes.map((n) => [n.verse_id % 1000, n.body])));
        // Optional in the type: a reader on a tab opened before this deploy would receive a
        // response without the key, and `undefined.map` would blank the whole chapter's
        // annotations rather than just its bookmarks.
        setBookmarks(new Set((d.bookmarks ?? []).map((b) => b.verse_id % 1000)));
      })
      .catch(() => setLoadFailed(true));
  }, [bookNum, chapterNum, loadNonce]);

  // ── the shared failure path ────────────────────────────────────────────────────────────────
  // One slot, not a queue: there's no service worker, so nothing here survives a reload regardless,
  // and this reader's writes are occasional (a highlight, a note, a bookmark) rather than a stream
  // — the most recent failure is the one the reader is looking at.
  //
  // `id` is assigned ONCE per logical write (when the reader's gesture happens), not once per
  // network attempt — every retry of that SAME write (automatic, inside persistWrite, or manual,
  // via the banner) reuses it. A first version minted a fresh id per `beginPersist` call, which
  // meant a successful RETRY could never match the id of the banner it was supposed to clear (the
  // banner was created by an earlier call with an earlier id) — the banner would report success
  // and then just... stay there. `id` still does useful work beyond that: it's what stops an
  // OLDER write's late resolution from clobbering a NEWER write's still-showing failure banner.
  const writeSeq = useRef(0);

  /**
   * Persists a write that has ALREADY been painted, retrying transient failures
   * (`persistWrite`), and on final failure rolls back + surfaces an error whose Retry is exactly
   * the caller-supplied `retry` — so a retry that eventually succeeds redoes whatever painting
   * `retry` redoes, not just the bare network call. `id` is the SAME value across every retry of
   * one logical write (see above) — callers must not mint a fresh one per attempt.
   */
  const beginPersist = useCallback(
    (
      id: number,
      message: string | (() => string),
      request: () => Promise<Response>,
      rollback: () => void,
      retry: () => void,
      isAborted?: () => boolean,
      onSettled?: () => void,
      onSuccess?: () => void,
    ) => {
      return persistWrite(request).then((ok) => {
        if (isAborted?.()) {
          // F-119: a superseded clear that FAILED still needs its error reported — the old
          // highlight is still on the server beside the new one, and silence is exactly the
          // "looks saved, isn't" bug this hook exists to close. Report it, but do NOT carry a
          // retry: the clear's retry() calls paint() which deletes EVERY span on the verse
          // (including the newer one) and re-issues the verse-level DELETE, which destroys the
          // new highlight server-side too. The online listener would fire that automatically.
          // The rollback below is safe: it re-adds only the members still missing and leaves
          // anything painted since (a newer highlight) untouched.
          if (!ok) {
            rollback();
            setWriteError({ id, message: typeof message === 'function' ? message() : message });
          }
          onSettled?.();
          return;
        }
        if (ok) {
          setWriteError((cur) => (cur?.id === id ? null : cur));
          onSettled?.();
          onSuccess?.();
          return;
        }
        rollback();
        setWriteError({ id, message: typeof message === 'function' ? message() : message, retry });
        onSettled?.();
      });
    },
    [],
  );

  /**
   * The common case: `paint` doesn't need to run inside a state updater to know what to do (it
   * doesn't depend on anything React hasn't flushed yet), so `paint` then `beginPersist` can run
   * back-to-back, and "retry" is just "do that again" — `attempt` recurses into itself, reusing
   * the SAME `id` assigned when the write started. toggleBookmark below is the one handler that
   * does NOT fit this shape — see its own comment.
   */
  const runPersist = useCallback(
    (
      message: string | (() => string),
      paint: () => void,
      request: () => Promise<Response>,
      rollback: () => void,
      isAborted?: () => boolean,
      onSettled?: () => void,
      onSuccess?: () => void,
    ) => {
      const id = ++writeSeq.current;
      const attempt = () => {
        paint();
        return beginPersist(id, message, request, rollback, attempt, isAborted, onSettled, onSuccess);
      };
      return attempt();
    },
    [beginPersist],
  );

  const retryWrite = useCallback(() => {
    setWriteError((cur) => {
      cur?.retry?.();
      return cur;
    });
  }, []);

  const dismissWrite = useCallback(() => setWriteError(null), []);

  // A phone regaining signal is the single most likely reason a write here failed — worth one
  // free retry before making the reader tap the banner themselves. There's no service worker to
  // do this while the tab is closed, so it's scoped to "the tab is open and watching".
  useEffect(() => {
    if (!writeError) return;
    window.addEventListener('online', retryWrite);
    return () => window.removeEventListener('online', retryWrite);
  }, [writeError, retryWrite]);

  // Mirror of `highlights` state so addHighlight can decide whether a whole-verse tap is a
  // replacement (F-119) without adding `highlights` to its own dependency array and re-creating
  // the callback on every paint.
  const highlightsRef = useRef(highlights);
  useEffect(() => { highlightsRef.current = highlights; }, [highlights]);

  // Clear every span on a verse (the whole-verse "clear" affordance in the study panel).
  const clearVerse = useCallback(
    (verse: number) => {
      // F-121: if a clear is already pending for this verse, mark it superseded so it cannot
      // roll back a newer write, but let it finish — its DELETE is what removes the old colour.
      // The new clear replaces the old one in the registry.
      const existing = activeClears.current.get(verse);
      if (existing) {
        existing.superseded = true;
      }
      const entry: ClearEntry = { controller: new AbortController(), superseded: false, settled: Promise.resolve() };
      activeClears.current.set(verse, entry);
      // Captured by `paint`, read by `rollback` — always the freshest prior value, including on a
      // retry (where "prior" is whatever `rollback` already restored after the first failure).
      let previous: StoredSpan[] | undefined;
      const paint = () => {
        setHighlights((prev) => {
          previous = prev.get(verse);
          const next = new Map(prev);
          next.delete(verse);
          return next;
        });
      };
      // Identity, not value, restoration — the inverse of addHighlight's rollback: this op
      // removed the SET of spans in `previous`, so it re-adds exactly the members still missing
      // and leaves anything painted since (a newer highlight on the same verse) untouched. A
      // blind `set(verse, previous)` would restore the prior spans at the cost of that newer one.
      const rollback = () => {
        if (!previous?.length) return;
        setHighlights((cur) => {
          const existing = cur.get(verse) ?? [];
          const next = new Map(cur);
          next.set(verse, [...previous!.filter((s) => !existing.includes(s)), ...existing]);
          return next;
        });
      };
      const request = () =>
        fetch('/api/annotations', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'highlight', verseId: verseId(verse) }),
          signal: entry.controller.signal,
        });
      const settled = runPersist(
        // A superseded clear's rollback re-adds the old spans beside the new one, so the reader
        // sees BOTH colours plus this banner. A regular clear's rollback restores only the old
        // spans. The message names what actually happened in each case.
        () => entry.superseded
          ? "Couldn't remove the old highlight — both colours are saved."
          : "Couldn't clear the highlight",
        paint,
        request,
        rollback,
        () => entry.superseded,
        () => {
          // Identity, not key: a superseded clear's completion must not remove the NEWER clear
          // that replaced it in the registry — otherwise the next addHighlight finds no
          // pendingClear and POSTs with no sequencing, which is the race F-121 exists to close.
          if (activeClears.current.get(verse) === entry) activeClears.current.delete(verse);
        },
      );
      entry.settled = settled ?? Promise.resolve();
    },
    [verseId, runPersist],
  );

  // Add a highlight span. range === null → whole verse (the tap-a-verse path).
  const addHighlight = useCallback(
    (verse: number, range: { start: number; end: number } | null, color: string) => {
      // F-119: a whole-verse highlight REPLACES any existing highlights for the verse — the
      // reader asked for "this colour now", not "add another row". Clear first so the old
      // colour does not survive beside the new one. F-121's sequencing then guarantees the
      // DELETE lands before the POST below.
      if (range === null && (highlightsRef.current.get(verse)?.length ?? 0) > 0) {
        clearVerse(verse);
      }
      // F-121: a pending clear for this verse must still run (so the old colour is removed),
      // but its verse-level DELETE must not land after this POST and wipe the new span. Mark
      // it superseded so its rollback is skipped, and await its `settled` promise inside the
      // request so the DELETE is guaranteed to complete before the POST is issued.
      const pendingClear = activeClears.current.get(verse);
      if (pendingClear) {
        pendingClear.superseded = true;
      }
      const optimistic: StoredSpan = {
        start: range?.start ?? null,
        end: range?.end ?? null,
        color,
        translation: translationId,
      };
      const paint = () => {
        setHighlights((prev) => {
          const next = new Map(prev);
          next.set(verse, [...(next.get(verse) ?? []), optimistic]);
          return next;
        });
        // Fresh marks bloom once on render (highlight-bloom in globals.css). "Fresh" lives
        // here, not on the span, because it is a fact about the WRITE, not the data — a span
        // the GET returned can never be in this set. It goes stale on its own a breath after
        // the animation ends, so the class does not linger to re-fire on some later re-render.
        setFreshSpans((prev) => new Set(prev).add(optimistic));
        setTimeout(() => {
          setFreshSpans((prev) => {
            if (!prev.has(optimistic)) return prev;
            const next = new Set(prev);
            next.delete(optimistic);
            return next;
          });
        }, 1000);
      };
      // Identity, not value, comparison: filtering out exactly the object `paint` added survives
      // another highlight landing on the same verse in between (never drops a sibling span).
      const rollback = () => {
        setHighlights((prev) => {
          const next = new Map(prev);
          const remaining = (next.get(verse) ?? []).filter((s) => s !== optimistic);
          if (remaining.length) next.set(verse, remaining);
          else next.delete(verse);
          return next;
        });
        setFreshSpans((prev) => {
          if (!prev.has(optimistic)) return prev;
          const next = new Set(prev);
          next.delete(optimistic);
          return next;
        });
      };
      const request = async () => {
        if (pendingClear) await pendingClear.settled.catch(() => {});
        return fetch('/api/annotations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'highlight',
            verseId: verseId(verse),
            color,
            spanStart: range?.start ?? null,
            spanEnd: range?.end ?? null,
            translation: translationId,
          }),
        });
      };
      runPersist("Couldn't save your highlight", paint, request, rollback);
    },
    [verseId, translationId, runPersist, clearVerse],
  );

  const saveVerseNote = useCallback(
    (verse: number, body: string, onSuccess?: () => void) => {
      let previous: string | undefined;
      const paint = () => {
        setNotes((prev) => {
          previous = prev.get(verse);
          return new Map(prev).set(verse, body);
        });
      };
      // Revert only if the value on screen is still the one THIS write painted: a newer save
      // landing during the retry window owns the entry now, and rolling this failure back over
      // it would erase it.
      const rollback = () => {
        setNotes((cur) => {
          if (cur.get(verse) !== body) return cur;
          const restored = new Map(cur);
          if (previous == null) restored.delete(verse);
          else restored.set(verse, previous);
          return restored;
        });
      };
      const request = () =>
        fetch('/api/annotations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'note', verseId: verseId(verse), body }),
        });
      runPersist("Couldn't save your note", paint, request, rollback, undefined, undefined, onSuccess);
    },
    [verseId, runPersist],
  );

  const deleteVerseNote = useCallback(
    (verse: number) => {
      let previous: string | undefined;
      const paint = () => {
        setNotes((prev) => {
          previous = prev.get(verse);
          const next = new Map(prev);
          next.delete(verse);
          return next;
        });
      };
      // Restore the deleted note only while the verse is still empty: an entry present at
      // rollback time is a NEWER note saved during the retry window, not something this op
      // removed — resurrecting `previous` over it would clobber it.
      const rollback = () => {
        if (previous == null) return;
        setNotes((cur) => {
          if (cur.has(verse)) return cur;
          return new Map(cur).set(verse, previous!);
        });
      };
      const request = () =>
        fetch('/api/annotations', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'note', verseId: verseId(verse) }),
        });
      runPersist("Couldn't delete your note", paint, request, rollback);
    },
    [verseId, runPersist],
  );

  /**
   * Bookmark toggle. Does NOT go through `runPersist` like the handlers above — it needs
   * `adding` (whether this tap is a bookmark or an unbookmark), and a `setState` UPDATER
   * FUNCTION is not guaranteed to have run by the time the code after the `setBookmarks(...)`
   * call executes (that's exactly the bug this shape avoids: an earlier version read `adding`
   * from a variable the updater was supposed to have set by then, and it hadn't — so `request`
   * always saw the stale default and a double-tap sent POST, POST instead of POST, DELETE).
   *
   * So the request AND its rollback AND the retry hookup are all built and fired from INSIDE the
   * updater, where `prev` (and therefore `adding`) is guaranteed current. This is also what makes
   * a fast double-tap safe: each queued updater invocation sees the PRIOR one's result via `prev`,
   * so the second tap computes "remove" against a set that already has the bookmark, never "add"
   * twice. The server is idempotent too (createBookmark returns the existing row), so the two
   * guards are independent.
   *
   * `retry` is `attempt` recursing into itself — NOT a fresh call to `toggleBookmark` — so it
   * reuses the SAME `id` across every retry of this one tap (see the `id` comment above: a fresh
   * id per retry would never match, and therefore never clear, the banner it's supposed to
   * resolve). Recomputing `adding` from `prev` on every `attempt()` call is still correct on
   * retry: a rollback puts the bookmark set back where it started, so recomputing lands on the
   * same direction as the original tap.
   */
  const toggleBookmark = useCallback(
    (verse: number) => {
      const id = ++writeSeq.current;
      const attempt = () => {
        setBookmarks((prev) => {
          const wasOn = prev.has(verse);
          const adding = !wasOn;
          const next = new Set(prev);
          if (wasOn) next.delete(verse);
          else next.add(verse);
          const rollback = () => {
            setBookmarks((cur) => {
              const restored = new Set(cur);
              if (adding) restored.delete(verse);
              else restored.add(verse);
              return restored;
            });
          };
          const request = () =>
            fetch('/api/annotations', {
              method: adding ? 'POST' : 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ kind: 'bookmark', verseId: verseId(verse) }),
            });
          beginPersist(id, adding ? "Couldn't save your bookmark" : "Couldn't remove your bookmark", request, rollback, attempt);
          return next;
        });
      };
      attempt();
    },
    [verseId, beginPersist],
  );

  return {
    highlights,
    notes,
    bookmarks,
    freshSpans,
    annotationsFailed: loadFailed,
    retryAnnotations,
    writeError,
    retryWrite,
    dismissWrite,
    addHighlight,
    clearVerse,
    saveVerseNote,
    deleteVerseNote,
    toggleBookmark,
  };
}
