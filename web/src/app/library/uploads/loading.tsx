// A boundary of its own for My Works.
//
// `app/library/loading.tsx` wraps EVERY /library/* route, and its skeleton is the library hub's
// shape — a filter row and a list of works, which is not this page at all. Worse, on a hard load
// of /library/uploads the parent fallback was what the browser kept showing: the resolved segment
// streamed (the HTML provably contains both) and never replaced it, so the page sat on "Loading
// the library" while `/api/user-corpus/documents` was never called once, measured 39s in.
// In-app navigation from the sidebar was always fine — ~700ms — which is why this only ever bit
// someone who refreshed or opened the URL directly.
//
// A nearer boundary is the fix AND the honest thing to show: the skeleton below is this page's
// own shape, so nothing shifts when the content lands.
export default function MyWorksLoading() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-6" aria-busy>
      <span className="sr-only">Loading My Works</span>
      <div aria-hidden className="animate-pulse">
        <div className="mb-3 h-9 w-44 rounded-lg bg-stone-200/70 dark:bg-stone-800" />
        <div className="mb-8 h-4 w-80 max-w-full rounded bg-stone-200/50 dark:bg-stone-800/70" />
        <div className="mb-8 h-28 rounded-2xl border border-dashed border-stone-300 dark:border-stone-700" />
        <div className="mb-8 h-11 w-full rounded-full bg-stone-200/60 dark:bg-stone-800/80" />
        <div className="mb-3 h-5 w-40 rounded bg-stone-200/60 dark:bg-stone-800/80" />
        <div className="h-20 rounded-xl bg-stone-200/50 dark:bg-stone-800/70" />
      </div>
    </div>
  );
}
