// Route-level loading for the library hub.
//
// /library is a server component with `dynamic = 'force-dynamic'` and two DB queries, and it
// had NO loading.tsx, so navigating to it blocked with the previous page still on screen and
// nothing indicating anything was happening. The app has 25 hand-written "Loading…" strings
// and, before this, exactly one Suspense boundary.
//
// A skeleton rather than the word "Loading": the shape of this page is known ahead of time, so
// showing it is more honest than a spinner and removes the layout shift when the data lands.
// `animate-pulse` is inert under prefers-reduced-motion (see globals.css).
export default function LibraryLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-24 pt-8" aria-busy>
      <span className="sr-only">Loading the library</span>

      <div aria-hidden className="animate-pulse">
        <div className="mb-6 h-8 w-40 rounded-lg bg-stone-200/70 dark:bg-stone-800" />

        <div className="mb-3 h-3 w-16 rounded bg-stone-200/50 dark:bg-stone-800/70" />
        <div className="mb-9 flex flex-wrap gap-2">
          {['w-24', 'w-28', 'w-28', 'w-24'].map((w, i) => (
            <div key={i} className={`h-11 ${w} rounded-lg bg-stone-200/60 dark:bg-stone-800/80`} />
          ))}
        </div>

        <div className="mb-3 h-3 w-24 rounded bg-stone-200/50 dark:bg-stone-800/70" />
        <div className="border-y border-stone-200/70 dark:border-stone-800">
          {['w-44', 'w-32', 'w-52', 'w-36', 'w-40', 'w-56'].map((w, i) => (
            <div
              key={i}
              className="flex min-h-[64px] items-center justify-between border-b border-stone-200/70 py-4 last:border-b-0 dark:border-stone-800"
            >
              <div className={`h-6 ${w} rounded bg-stone-200/70 dark:bg-stone-800`} />
              <div className="h-4 w-16 rounded bg-stone-200/50 dark:bg-stone-800/70" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
