'use client';
// Reader landing strip for arrivals from a research thread — HISTORY_RETRIEVAL_DESIGN §5 stage 3,
// trimmed to the minimum: back-link + dismiss. (Breadcrumb/period were in the wireframe but are
// redundant with the visible section content; recorded as a v1 trim, not an oversight.)
//
// Two arrivals share it. `from=hist:<id>` (order 2026-08-20-historians-study-entrance) came from
// history RESULTS and goes back to `/ask/<id>?mode=history`; `from=ask:<id>` came from a result
// card on the thread itself and goes back to `/ask/<id>`. Both NAME THE QUESTION when they can:
// `fq=` rides the same URL — no fetch, no state — and links minted without it degrade to a
// generic label, never to a blank.
//
// `from` is a URL parameter, so its shape is PARSED (kind:id, id = [A-Za-z0-9-]{1,64}) and
// anything else renders nothing: no link is ever built from an unvalidated segment.
//
// Dismissal is PER THREAD. This strip is mounted in the /work/[slug] layout and STAYS MOUNTED
// across /work/a -> /work/b, so a single flag would hide every later arrival too. The key is
// read in an effect keyed on the arrival (reading sessionStorage during render risks a
// hydration mismatch); the strip renders visible until the effect says otherwise.
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

const FROM_RE = /^(hist|ask):([A-Za-z0-9-]{1,64})$/;
// Cap what a URL param can print into the chrome; the thread page has the full question.
const LABEL_MAX = 64;

function questionLabel(fq: string | null): string | null {
  const q = fq?.trim();
  if (!q) return null;
  return q.length > LABEL_MAX ? `${q.slice(0, LABEL_MAX - 3)}…` : q;
}

export function HistoryContextBar(): React.ReactElement | null {
  const params = useSearchParams();
  const from = params.get('from');
  const match = from ? FROM_RE.exec(from) : null;
  const kind = match?.[1] ?? null;
  const id = match?.[2] ?? null;
  const dismissKey = kind && id ? `ctx-bar-dismissed:${kind}:${id}` : null;
  // The key that is known dismissed — compared against the CURRENT arrival's key, so a stale
  // dismissal from the previous work's arrival never hides this one.
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  useEffect(() => {
    if (!dismissKey) return;
    // Storage can be blocked (Safari "Block all cookies", some webviews) and then `getItem`
    // THROWS; unguarded, that unwinds to the route's error boundary and takes the whole reader
    // with it on a ?from= arrival. Blocked storage means "not dismissed" — the strip shows.
    let dismissed = false;
    try { dismissed = sessionStorage.getItem(dismissKey) === '1'; } catch { dismissed = false; }
    setDismissedKey(dismissed ? dismissKey : null);
  }, [dismissKey]);

  if (!kind || !id || !dismissKey || dismissedKey === dismissKey) return null;
  const label = questionLabel(params.get('fq'));
  const isHistory = kind === 'hist';
  const href = isHistory ? `/ask/${id}?mode=history` : `/ask/${id}`;
  return (
    // STICKY AT THE BOTTOM of the reader's scroll area (2026-09-06). In normal flow at the top, the
    // strip scrolled out of view the instant the reader landed on the deep-linked section — the way
    // back was gone before it was seen (measured on dev: y = -168px on arrival). The top is taken:
    // the reader's own header is `sticky top-0` (reader-header.tsx), so a second top-sticky bar
    // either covers it or is covered by it. The bottom belongs to nothing on this route, sits above
    // the mobile tab bar by construction (`main` reserves it — a plain `bottom-0`, never the reserve
    // token; tab-bar-reserved-once.test.ts), and is where the reader's eye goes when they are done.
    // Opaque, one tone off the page (stone-100 / stone-900), so scrolling text never shows through.
    <div className="sticky bottom-0 z-30 flex items-center justify-between gap-2 border-t edge bg-stone-100 px-3 py-1.5 text-sm dark:bg-stone-900">
      <Link href={href} className="min-w-0 truncate underline">
        {isHistory
          ? (label ? <>&larr; Results for &ldquo;{label}&rdquo;</> : <>&larr; Back to history results</>)
          : (label ? <>&larr; Back to &ldquo;{label}&rdquo;</> : <>&larr; Back to your question</>)}
      </Link>
      {/* 44px hit area; the negative vertical margin keeps the strip at one line rather than
          growing the bar to fit the target. */}
      <button
        type="button" aria-label="Dismiss"
        className="-my-1.5 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center"
        onClick={() => {
          // Same guard as the read above: with storage blocked the dismissal lasts this render only.
          try { sessionStorage.setItem(dismissKey, '1'); } catch { /* storage blocked — see above */ }
          setDismissedKey(dismissKey);
        }}
      >✕</button>
    </div>
  );
}
