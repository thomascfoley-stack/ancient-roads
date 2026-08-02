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
import { loadWorkProgress, saveWorkProgress, tocUnitLabel, type WorkProgress } from '@/lib/work-reader';
import type { WorkSource, WorkTocUnit } from '@/lib/work';
import { WorkReader, type WorkReaderSeek } from '@/components/work-reader';
import { WorkToc } from '@/components/work-toc';

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function hashOrdinal(): number | null {
  if (typeof window === 'undefined') return null;
  const m = /^#s(\d+)$/.exec(window.location.hash);
  return m ? Math.max(1, Number(m[1])) : null;
}

export default function WorkPage() {
  const { slug } = useParams<{ slug: string }>();
  const [work, setWork] = useState<{ source: WorkSource; toc: WorkTocUnit[] } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [progress, setProgress] = useState<{ ordinal: number; scrollPct: number } | null>(null);
  const [seek, setSeek] = useState<WorkReaderSeek | null>(null);

  // The landing position, resolved once: deep-link hash beats the saved position (a shared
  // link must land where it points); otherwise resume restores the saved ordinal + offset.
  const [landing] = useState(() => {
    const deep = hashOrdinal();
    if (deep !== null) return { ordinal: deep, scrollPct: 0, deepLinked: true };
    const saved = loadWorkProgress(slug);
    return { ordinal: saved?.ordinal ?? null, scrollPct: saved?.scrollPct ?? 0, deepLinked: false };
  });
  // The frozen "where you left off" snapshot for the Continue chip — only meaningful when a
  // deep-link took the reader somewhere else (after an auto-restore there is nothing to
  // continue TO; the live record keeps updating as they read).
  const [continueTarget, setContinueTarget] = useState<WorkProgress | null>(() => {
    if (!landing.deepLinked) return null;
    const saved = loadWorkProgress(slug);
    return saved && saved.ordinal !== landing.ordinal ? saved : null;
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

  // The same session probe the Bible reader uses: the annotations route is 401 signed out.
  useEffect(() => {
    fetch('/api/annotations?book=1&chapter=1')
      .then((r) => setSignedIn(r.ok))
      .catch(() => setSignedIn(false));
  }, []);

  // Resume persistence: throttled (500ms, leading + trailing) so scroll never thrashes
  // localStorage; the URL hash tracks the position as a shareable deep link (replaceState —
  // no history spam, no scroll jump).
  const persist = useRef<{ last: number; timer: ReturnType<typeof setTimeout> | null }>({
    last: 0,
    timer: null,
  });
  const handleProgress = useCallback(
    (ordinal: number, scrollPct: number) => {
      setProgress({ ordinal, scrollPct });
      const save = () => {
        persist.current.last = Date.now();
        saveWorkProgress({ slug, ordinal, scrollPct, savedAt: Date.now() });
        window.history.replaceState(null, '', `#s${ordinal}`);
      };
      if (Date.now() - persist.current.last >= 500) save();
      else {
        if (persist.current.timer) clearTimeout(persist.current.timer);
        persist.current.timer = setTimeout(save, 500);
      }
    },
    [slug],
  );
  useEffect(
    () => () => {
      if (persist.current.timer) clearTimeout(persist.current.timer);
    },
    [],
  );

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
          className="inline-flex min-h-[44px] items-center rounded-full bg-accent-700 px-5 text-sm font-semibold text-stone-50 hover:bg-accent-800 dark:bg-accent-500 dark:hover:bg-accent-400"
        >
          Browse the library
        </Link>
      </div>
    );
  }

  if (!work) {
    return <p className="py-24 text-center text-sm text-stone-400">Loading…</p>;
  }

  // PROGRESS IS OVER SECTIONS, and `toc` is now a list of UNITS — so the denominator comes from
  // the last unit's range, not from the row count. It was `work.toc.length`, which silently meant
  // "however many rows survived the cap": on the fifteen works that exceeded it the bar measured
  // progress against 5,000 instead of the real total, so a reader 40% through john-gill's 28,843
  // sections saw a full bar. Ordinals are 1..N contiguous within a work, so the final unit's
  // lastOrdinal IS the section count, exactly and for free.
  const total = work.toc.length > 0 ? work.toc[work.toc.length - 1]!.lastOrdinal : 0;
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
            className="flex max-w-full items-center gap-2 rounded-full bg-stone-900/95 px-4 py-2 text-xs font-medium text-stone-100 shadow-deep dark:bg-stone-800"
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
