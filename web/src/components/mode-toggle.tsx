'use client';
// [ Voices | History ] — stage 0. Links, not client state: the two modes are separate surfaces
// with separate contracts (HISTORY_RETRIEVAL_DESIGN §5), and a navigation is the honest boundary.
//
// A CLIENT component since 2026-08-22, for one reported defect — "clicking History the first time
// in a session takes a long long time" — which turned out to be two faults wearing one symptom.
//
//   1. NOTHING SAID THE CLICK LANDED. /ask reads searchParams, so both modes are one dynamic
//      route, and a soft navigation to a dynamic route leaves the CURRENT page on screen,
//      untouched, until the server render arrives. On a cold function that is seconds of a page
//      that looks like it ignored you. `useLinkStatus` is pending for exactly that window, and a
//      2px travelling bar under the tab is the only thing on screen that says the app heard you.
//   2. THE CLICK PAID FOR THE WHOLE RENDER. The App Router's default prefetch for a dynamic route
//      stops at the nearest `loading.js`, and /ask has none — so nothing useful was prefetched.
//      `prefetch` fetches the route and its data while the reader is still on the page they are
//      on. Only for the tab you are NOT on: prefetching the current page is a round trip for a
//      render that already happened.
//
// The bar is visual only. The pending state lives INSIDE the Link (that is the hook's contract),
// so it cannot be lifted into a live region without a context, and putting a labelled element in
// there instead would fold "Loading" into the link's accessible name. A screen reader gets the
// destination page announced when it arrives, which is the same signal, later.
//
// RESTYLED 2026-09-06 with the /ask redesign: two words, no box. The pair used to sit in a bare
// `rounded border` — `rounded` is off the zeroed radius ladder and painted real corners against the
// PRD's square-corners rule, and the bare `border` took Tailwind v4's currentColor default, so it
// painted ink and never flipped in dark mode. The active tab is ink with a 1px underline; the
// targets are 44px tall.
import Link, { useLinkStatus } from 'next/link';

function TabPending(): React.ReactElement | null {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] overflow-hidden bg-stone-200 dark:bg-stone-800"
    >
      <span className="progress-travel block h-full w-1/3 bg-accent-600 dark:bg-accent-400" />
    </span>
  );
}

export function ModeToggle({ mode }: { mode: 'voices' | 'history' }): React.ReactElement {
  const seg = 'relative inline-flex min-h-[44px] items-center px-2 font-sans text-sm text-stone-600 transition-colors ease-gentle hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100';
  const on = 'font-semibold text-stone-900 underline decoration-1 underline-offset-[6px] dark:text-stone-100';
  return (
    <div role="group" aria-label="Search mode" className="mx-auto mt-4 flex w-max gap-6">
      <Link
        href="/ask"
        prefetch={mode !== 'voices'}
        aria-current={mode === 'voices' ? 'page' : undefined}
        className={`${seg} ${mode === 'voices' ? on : ''}`}
      >
        Voices<TabPending />
      </Link>
      <Link
        href="/ask?mode=history"
        prefetch={mode !== 'history'}
        aria-current={mode === 'history' ? 'page' : undefined}
        className={`${seg} ${mode === 'history' ? on : ''}`}
      >
        History<TabPending />
      </Link>
    </div>
  );
}
