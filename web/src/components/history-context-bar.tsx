'use client';
// Reader landing strip for history arrivals — HISTORY_RETRIEVAL_DESIGN §5 stage 3, trimmed to the
// minimum: back-link + dismiss. (Breadcrumb/period were in the wireframe but are redundant with
// the visible section content; recorded as a v1 trim, not an oversight.)
//
// The strip NAMES THE STUDY when it can (order 2026-08-20-historians-study-entrance): `fq=`
// rides the same URL that carries `from=hist:`, written by HistoryResults' workHref — no fetch,
// no state. Links minted before fq existed degrade to the generic label, never to a blank.
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';

export function HistoryContextBar(): React.ReactElement | null {
  const params = useSearchParams();
  const from = params.get('from');
  const fq = params.get('fq');
  const [dismissed, setDismissed] = useState<boolean>(() =>
    typeof window !== 'undefined' && sessionStorage.getItem('hist-bar-dismissed') === '1');
  if (dismissed || !from?.startsWith('hist:')) return null;
  const threadId = from.slice(5);
  // Cap what a URL param can print into the chrome; the thread page has the full question.
  const label = fq && fq.trim() ? (fq.length > 64 ? `${fq.slice(0, 61)}…` : fq) : null;
  return (
    // Ink-derived scrim (stone-900/5), not black/5 — a neutral black wash reads cool against the
    // warm parchment, the one off-family tint the 2026-08-20 design pass found on this surface.
    <div className="flex items-center justify-between gap-2 border-b edge bg-stone-900/5 px-3 py-1.5 text-sm dark:bg-stone-50/5">
      <Link href={`/ask/${threadId}?mode=history`} className="min-w-0 truncate underline">
        {label ? <>&larr; Results for &ldquo;{label}&rdquo;</> : <>&larr; Back to history results</>}
      </Link>
      <button
        type="button" aria-label="Dismiss"
        onClick={() => { sessionStorage.setItem('hist-bar-dismissed', '1'); setDismissed(true); }}
      >✕</button>
    </div>
  );
}
