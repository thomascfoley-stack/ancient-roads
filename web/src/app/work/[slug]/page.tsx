'use client';

// The Book Reader route (docs/LIBRARY_READER_DESIGN.md §2): /work/[slug], deep-linkable as
// /work/[slug]#s{ordinal}. Composition: WorkReader owns the windowed body + selection
// popover; this page owns the work fetch (source + TOC), the TOC drawer, the progress rail,
// and the resume record ({slug, ordinal, scrollPct} → localStorage, throttled on scroll).
// On load a saved position restores automatically; a deep-link wins instead, and then a
// "Continue" chip offers the jump back to the saved spot.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
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

type PersistState = { last: number; timer: ReturnType<typeof setTimeout> | null };

function clearTrailingSave(p: PersistState): void {
  if (p.timer) {
    clearTimeout(p.timer);
    p.timer = null;
  }
}

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

  // The landing position, resolved on mount: deep-link hash beats the saved position (a shared
  // link must land where it points); otherwise resume restores the saved ordinal + offset.
  // Re-resolved below when a deep link arrives AFTER mount (F24).
  const [landing, setLanding] = useState(() => resolveLanding(slug));

  // The frozen "where you left off" snapshot for the Continue chip — only meaningful when a
  // deep-link took the reader somewhere else (after an auto-restore there is nothing to
  // continue TO; the live record keeps updating as they read).
  const [continueTarget, setContinueTarget] = useState<WorkProgress | null>(() => {
    const initial = resolveLanding(slug);
    if (!initial.deepLinked) return null;
    const saved = loadWorkProgress(slug);
    return saved && saved.ordinal !== initial.ordinal ? saved : null;
  });

  // F24 — THE DEEP LINK THAT ARRIVES LATE (F-088/F-155).
  //
  // On a CLIENT-SIDE navigation (search result → /work/[slug]#s{ordinal}) Next.js applies the
  // URL — hash included — AFTER this page has mounted (measured ~255ms post-mount on prod),
  // via pushState, which fires no hashchange. The useState initializer above therefore read
  // the PREVIOUS route's (empty) hash and resolved a resume instead of the deep link. Worse,
  // the scroll-persist below then replaceState'd `#s1` over the incoming `#s171` ~800ms in,
  // so the shared link's target was lost without any second chance (6/6 trials on prod).
  //
  // Re-resolve reactively: whenever the route settles or the reader reports progress (both
  // reliably AFTER the URL application), re-read the hash. If it carries a deep link this page
  // has not honoured and did not write itself, retarget: update the landing (glow), set the
  // Continue chip, and seek — the WorkReader seek machinery already handles "target not
  // mounted yet" and "initial fetch still in flight", which a plain initialOrdinal change
  // cannot. A real hashchange (the reader edits the URL) is an arrival too, and is honoured
  // even when the current hash is one this page wrote earlier.
  const pathname = usePathname();
  const landingRef = useRef(landing);
  landingRef.current = landing;
  // The reader has reached the honoured deep ordinal — persistence may resume. Until then the
  // deep link owns the URL and the device record: a progress report from the pre-landing
  // window must never persist the wrong section or clobber the shared link's hash.
  const landedRef = useRef(false);
  // A deep link honoured AFTER mount (the F24 retarget) and not yet reached. A mount-time deep
  // link is where the reader's FIRST page already is, so only the hash and the device record
  // wait for its scroll to settle (F-088/F-155); a late arrival is a retarget away from a page
  // already showing, and blocks the account-side write as well.
  const lateArrivalRef = useRef(false);
  // The last hash THIS page wrote (replaceState below). A hash equal to it is ours, not an
  // arrival; a hash that differs can only have come from outside — which is exactly the
  // late-applied deep link, however late it lands.
  const ownHashRef = useRef<string | null>(null);
  // Resume persistence: throttled (500ms, leading + trailing) so scroll never thrashes
  // localStorage; the URL hash tracks the position as a shareable deep link (replaceState —
  // no history spam, no scroll jump).
  const persist = useRef<PersistState>({ last: 0, timer: null });

  /** True while an incoming deep link owns the position for `sink`: honoured but not yet
   *  reached, or in the URL but not yet honoured (and not one this page wrote). */
  const deepLinkPending = useCallback((sink: 'device' | 'account'): boolean => {
    const L = landingRef.current;
    if (L.deepLinked) {
      if (landedRef.current) return false;
      return sink === 'device' || lateArrivalRef.current;
    }
    return hashOrdinal() !== null && window.location.hash !== ownHashRef.current;
  }, []);

  const honourHash = useCallback(
    (arrival: boolean) => {
      const deep = hashOrdinal();
      if (deep === null) return;
      const L = landingRef.current;
      if (L.deepLinked && L.ordinal === deep) return; // already honoured
      if (!arrival && window.location.hash === ownHashRef.current) return; // our own write
      clearTrailingSave(persist.current); // a save queued before the arrival is stale by definition
      landedRef.current = false;
      lateArrivalRef.current = true;
      const saved = loadWorkProgress(slug);
      setContinueTarget(saved && saved.ordinal !== deep ? saved : null);
      setLanding({ ordinal: deep, scrollPct: 0, deepLinked: true });
      setSeek({ ordinal: deep, scrollPct: 0, nonce: Date.now() });
    },
    [slug],
  );

  useEffect(() => {
    const onHashChange = () => honourHash(true);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [honourHash]);

  useEffect(() => {
    if (!work) return;
    honourHash(false);
  }, [work, pathname, slug, landing, progress, honourHash]);

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

  const handleProgress = useCallback(
    (ordinal: number, scrollPct: number) => {
      const L = landingRef.current;
      if (L.deepLinked && !landedRef.current && ordinal === L.ordinal) {
        // The landing scroll is done: persistence resumes from here. Any trailing save still
        // queued from the pre-landing window would persist the WRONG section — drop it.
        landedRef.current = true;
        lateArrivalRef.current = false;
        clearTrailingSave(persist.current);
      }
      setProgress({ ordinal, scrollPct });
      const save = () => {
        // F24 guard — the deep link owns the URL and the saved position until it is reached.
        // Evaluated at save time, so a throttled trailing save is guarded too.
        if (deepLinkPending('device')) return;
        persist.current.last = Date.now();
        saveWorkProgress({ slug, ordinal, scrollPct, savedAt: Date.now() });
        const hash = `#s${ordinal}`;
        ownHashRef.current = hash;
        window.history.replaceState(null, '', hash);
      };
      if (Date.now() - persist.current.last >= 500) save();
      else {
        clearTrailingSave(persist.current);
        persist.current.timer = setTimeout(save, 500);
      }
    },
    [slug, deepLinkPending],
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
    // The F24 gate, account edition: a report from the pre-landing window of a LATE deep link
    // is the wrong section, and this sink is what "Continue reading" on the Library hub reads.
    positionRef.current =
      signedIn && progress && total > 0 && !deepLinkPending('account')
        ? { ordinal: progress.ordinal, percent: clamp01((progress.ordinal - 1 + progress.scrollPct) / total) }
        : null;
    pushPosition(false);
  }, [signedIn, progress, total, pushPosition, deepLinkPending]);

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

  // The return strip (history-context-bar.tsx, mounted by the layout) is sticky at the bottom of
  // the scroll area whenever the arrival carries ?from=. On a phone the Continue chip below sits in
  // the same band and would cover it (deep-audit 2026-09-06), so the chip lifts by the strip's
  // height. Read from the URL at render, not a hook: this chip only exists after client state
  // (progress/continueTarget) has been set, so there is no server render to mismatch.
  const hasReturnStrip = typeof window !== 'undefined' && /[?&]from=(hist|ask):/.test(window.location.search);

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
        <div
          className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-3"
          style={{ marginBottom: hasReturnStrip ? 44 : 0 }}
        >
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
