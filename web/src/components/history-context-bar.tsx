'use client';
// Reader landing strip for history arrivals — HISTORY_RETRIEVAL_DESIGN §5 stage 3, trimmed to the
// minimum: back-link + dismiss. (Breadcrumb/period were in the wireframe but are redundant with
// the visible section content; recorded as a v1 trim, not an oversight.)
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';

export function HistoryContextBar(): React.ReactElement | null {
  const params = useSearchParams();
  const from = params.get('from');
  const [dismissed, setDismissed] = useState<boolean>(() =>
    typeof window !== 'undefined' && sessionStorage.getItem('hist-bar-dismissed') === '1');
  if (dismissed || !from?.startsWith('hist:')) return null;
  const threadId = from.slice(5);
  return (
    <div className="flex items-center justify-between gap-2 border-b bg-black/5 px-3 py-1.5 text-sm">
      <Link href={`/ask/${threadId}?mode=history`} className="underline">← Back to history results</Link>
      <button
        type="button" aria-label="Dismiss"
        onClick={() => { sessionStorage.setItem('hist-bar-dismissed', '1'); setDismissed(true); }}
      >✕</button>
    </div>
  );
}
