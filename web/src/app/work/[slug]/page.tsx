'use client';

// The Book Reader route (docs/LIBRARY_READER_DESIGN.md §2): /work/[slug], deep-linkable as
// /work/[slug]#s{ordinal}. Composition: WorkReader owns the windowed body + selection
// popover; this page owns the work fetch (source + TOC), the TOC drawer, the progress rail,
// and the resume record ({slug, ordinal, scrollPct} → localStorage, throttled on scroll).
// On load a saved position restores automatically; a deep-link wins instead, and then a
// "Continue" chip offers the jump back to the saved spot.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  loadWorkProgress,
  saveWorkProgress,
  shouldSyncProgress,
  tocUnitLabel,
  type ProgressPosition,
  type ProgressSyncState,
  type WorkProgress,
} from '@/lib/work-reader';
import type { WorkSource, WorkTocUnit } from '@/lib/work';
import { WorkReader, type WorkReaderSeek } from '@/components/work-reader';
import { WorkToc } from '@/components/work-toc';
import { useSignedIn } from '@/lib/auth/use-signed-in';

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function hashOrdinal(): number | null {
  if (typeof window === 'undefined') return null;
  const m = /^#s(\d+)$/.exec(window.location.hash);
  return m ? Math.max(1, Number(m[1])) : null;
}

function resolveLanding(slug: string) {
  const deep = hashOrdinal();
  if (deep !== null) return { ordinal: deep, scrollPct: 0, deepLinked: true };
  const saved = loadWorkProgress(slug);
  return { ordinal: saved?.ordinal ?? null, scrollPct: saved?.scrollPct ?? 0, deepLinked: false };
}

export default function WorkPage() {
  const { slug } = useParams<{ slug: string }>();
  const [work, setWork] = useState<{ source: WorkSource; toc: WorkTocUnit[] } | null>(null);
  const [notFound, setNotFound] = useState(false);
  // The session, not a probe of the annotations route. SelectionPopover is ONE component shared by
  // both readers; inferring this from a fetch here while /read reads the session would show
  // swatches on one and "Sign in to highlight" on the other inside a single session.
  const signedIn = useSignedIn();
  const [tocOpen, setTocOpen] = useState(false);
  const [progress, setProgress] = useState<{ ordinal: number; scrollPct: number } | null>(null);
  const [seek, setSeek] = useState<WorkReaderSeek | null>(null);

  // The landing position, resolved on mount AND on every hash change (F-088/F-155/F24):
  // client-side navigation sets the URL hash AFTER the new page mounts, so resolving it once
  // in a useState initializer reads the previous page's (empty) hash. A shared link must land
  // where it points; otherwise resume restores the saved ordinal + offset.
  const [landing, setLanding] = useState(() => resolveLanding(slug));

  useEffect(() => {
    const onHashChange = () => setLanding(resolveLanding(slug));
    window.addEventListener('hashchange', onHashChange);
    // Next.js client-side nav completes after mount; re-check once the task queue clears.
    const id = setTimeout(onHashChange, 0);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      clearTimeout(id);
    };
  }, [slug]);

  // When the resolved landing changes (client-side nav with a new hash), tell WorkReader to
  // seek there. This also re-arms the hash-write guard for deep links.
  useEffect(() => {
    suppressHashWrite.current = landing.deepLinked;
    if (landing.ordinal !== null) {
      setSeek({ ordinal: landing.ordinal, scrollPct: landing.scrollPct, nonce: Date.now() });
    }
  }, [landing]);

  // The frozen "where you left off" snapshot for the Continue chip — only meaningful when a
  // deep-link took the reader somewhere else (after an auto-restore there is nothing to
  // continue TO; the live record keeps updating as they read).
  const [continueTarget, setContinueTarget] = useState<WorkProgress | null>(() => {
    const initial = resolveLanding(slug);
    if (!initial.deepLinked) return null;
    const saved = loadWorkProgress(slug);
    return saved && saved.ordinal !== initial.ordinal ? saved : null;
  });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/work/${encodeURIComponent(slug)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as { source: WorkSource; toc: WorkTocUnit[] };
      })
      .then((d) => {
        if (!cancelled) setWork(d);
      })
      .catch(() => {
        // 404 (staged/unknown work) and network failure land on the same calm dead end.
        if (!cancelled) setNotFound(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Resume persistence: throttled (500ms, leading + trailing) so scroll never thrashes
  // localStorage; the URL hash tracks the position as a shareable deep link (replaceState —
  // no history spam, no scroll jump).
  const persist = useRef<{ last: number; timer: ReturnType<typeof setTimeout> | null }>({
    last: 0,
    timer: null,
  });
  // F-088/F-155/F24: suppress the hash rewrite until the reader has actually scrolled to a
  // deep-linked section. On client-side nav the spy otherwise writes #s1 before the scroll lands.
  const suppressHashWrite = useRef(landing.deepLinked);
  const handleProgress = useCallback(
    (ordinal: number, scrollPct: number) => {
      setProgress({ ordinal, scrollPct });
      const save = () => {
        persist.current.last = Date.now();
        saveWorkProgress({ slug, ordinal, scrollPct, savedAt: Date.now() });
        if (!suppressHashWrite.current) {
          window.history.replaceState(null, '', `#s${ordinal}`);
        }
      };
      if (Date.now() - persist.current.last >= 500) save();
      else {
        if (persist.current.timer) clearTimeout(persist.current.timer);
        persist.current.timer = setTimeout(save, 500);
      }
      // Once the reported ordinal matches the deep-linked target, the landing scroll is done.
      if (suppressHashWrite.current && ordinal === landing.ordinal) {
        suppressHashWrite.current = false;
      }
    },
    [slug, landing.ordinal],
  );
  useEffect(
    () => () => {
      if (persist.current.timer) clearTimeout(persist.current.timer);
    },
    [],
  );

  // PROGRESS IS OVER SECTIONS, and `toc` is a list of UNITS — so the denominator comes from the
  // last unit's range, not from the row count. It was `work.toc.length`, which silently meant
  // "however many rows survived the cap": on the fifteen works that exceeded it the bar measured
  // progress against 5,000 instead of the real total, so a reader 40% through john-gill's 28,843
  // sections saw a full bar. Ordinals are 1..N contiguous within a work, so the final unit's
  // lastOrdinal IS the section count, exactly and for free.
  //
  // Computed HERE, above the early returns, because the account-sync effect below needs it and a
  // hook cannot live after a conditional return.
  const total = work && work.toc.length > 0 ? work.toc[work.toc.length - 1]!.lastOrdinal : 0;

  // ── The account-side position (ledger N1) ─────────────────────────────────────────────────
  //
  // The record above is per DEVICE (localStorage). This one is per ACCOUNT, and it is the ONLY
  // writer of `reading_progress` — which is what the Library hub's "Continue reading" section
  // reads, and why that section was empty for every account until this existed.
  //
  // Deliberately a different cadence and a different failure posture from the localStorage
  // record beside it:
  //   • throttled by `shouldSyncProgress` (a real section change, ≥30s apart) rather than 500ms,
  //     because this is a per-user DB write and that one is a same-process `setItem`;
  //   • fire-and-forget — the reader's scroll never awaits it (CLAUDE.md: writes off the
  //     request path);
  //   • silent on failure, because localStorage still holds the position: a lost sync costs a
  //     cross-device convenience, not a page. It is emphatically NOT silent server-side, where
  //     the route logs and returns a 500.
  // Signed-out readers never call it at all — the route would 401 every one of them, and their
  // place is already kept on this device.
  const syncedRef = useRef<ProgressSyncState | null>(null);
  const positionRef = useRef<ProgressPosition | null>(null);

  const pushPosition = useCallback(
    (force: boolean) => {
      const position = positionRef.current;
      if (!position) return;
      const next = { ordinal: position.ordinal, at: Date.now() };
      if (!shouldSyncProgress(syncedRef.current, next, { force })) return;
      syncedRef.current = next;
      void fetch(`/api/work/${encodeURIComponent(slug)}/progress`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(position),
        // The flush below runs as the page is going away; without keepalive the browser is free
        // to cancel it, which is exactly the position most worth keeping.
        keepalive: true,
      }).catch(() => {});
    },
    [slug],
  );

  useEffect(() => {
    positionRef.current =
      signedIn && progress && total > 0
        ? { ordinal: progress.ordinal, percent: clamp01((progress.ordinal - 1 + progress.scrollPct) / total) }
        : null;
    pushPosition(false);
  }, [signedIn, progress, total, pushPosition]);

  // Leaving is the position most worth recording, and it arrives three different ways: the tab is
  // hidden, the page is unloaded, or the reader navigates to another route inside the app (which
  // fires neither of the first two — only the cleanup).
  useEffect(() => {
    const flush = () => pushPosition(true);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [pushPosition]);

  if (notFound) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-24 text-center">
        <p className="mb-2 font-scripture text-xl text-stone-700 dark:text-stone-200">
          This work isn&rsquo;t available.
        </p>
        <p className="mb-6 text-sm text-stone-500 dark:text-stone-400">
          It may still be staged for review, or the link is mistaken.
        </p>
        <Link
          href="/library"
          className="inline-flex min-h-[44px] items-center border border-stone-900 px-5 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-900"
        >
          Browse the library
        </Link>
      </div>
    );
  }

  if (!work) {
    return <p className="py-24 text-center text-sm text-stone-500 dark:text-stone-400">Loading…</p>;
  }

  const pct = progress && total > 0 ? clamp01((progress.ordinal - 1 + progress.scrollPct) / total) : 0;
  const continueHeading = continueTarget
    ? (() => {
        // The unit that HOLDS the ordinal, by range — the reader is resuming inside a sermon, and
        // what they want to see named is the sermon.
        const unit = work.toc.find(
          (u) => continueTarget.ordinal >= u.firstOrdinal && continueTarget.ordinal <= u.lastOrdinal,
        );
        return unit ? tocUnitLabel(unit) : `Section ${continueTarget.ordinal}`;
      })()
    : null;

  return (
    <>
      <WorkReader
        slug={slug}
        source={work.source}
        initialOrdinal={landing.ordinal}
        initialScrollPct={landing.scrollPct}
        seek={seek}
        signedIn={signedIn}
        onOpenToc={() => setTocOpen(true)}
        onProgress={handleProgress}
        // The landing glow marks where a SHARED/STUDY link dropped the reader — deep links
        // only. A resume restore is the reader's own place; glowing it would say nothing.
        landingOrdinal={landing.deepLinked ? landing.ordinal : null}
      />

      {/* The progress rail: a subtle accent fill down the right edge. */}
      <div
        aria-hidden
        className="fixed inset-y-0 right-0 z-30 w-1 bg-stone-200/60 dark:bg-stone-800/60"
      >
        <div className="w-full bg-accent-500/70 dark:bg-accent-400/70" style={{ height: `${pct * 100}%` }} />
      </div>

      {/* Continue: shown when a deep-link landed away from the saved position. */}
      {continueTarget && continueHeading && progress?.ordinal !== continueTarget.ordinal && (
        <div className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-3">
          <button
            onClick={() => {
              setSeek({ ordinal: continueTarget.ordinal, scrollPct: continueTarget.scrollPct, nonce: Date.now() });
              setContinueTarget(null);
            }}
            className="flex max-w-full items-center gap-2 rounded-full bg-stone-900/95 px-4 py-2 text-xs font-medium text-stone-100 dark:bg-stone-800"
          >
            <span className="shrink-0 font-semibold text-accent-300">Continue</span>
            <span className="truncate">{continueHeading}</span>
          </button>
        </div>
      )}

      {tocOpen && (
        <WorkToc
          sourceType={work.source.source_type}
          toc={work.toc}
          currentOrdinal={progress?.ordinal ?? landing.ordinal}
          onNavigate={(ordinal) => {
            setSeek({ ordinal, scrollPct: 0, nonce: Date.now() });
            setTocOpen(false);
          }}
          onClose={() => setTocOpen(false)}
        />
      )}
    </>
  );
}
