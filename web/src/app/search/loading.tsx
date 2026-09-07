// Route-level loading for /search.
//
// /search is a server component with `dynamic = 'force-dynamic'` that runs up to six full-text
// corpus queries in parallel, plus up to four personal ones for a signed-in reader (F-168). With
// no loading.tsx the router blocked on that render with the PREVIOUS page still on screen and
// nothing to say a search was running — the same complaint /library's loading.tsx answers.
//
// A skeleton rather than the word "Loading" or a spinner: the shape of this page is known ahead
// of time, so showing it removes the layout shift when the results land. `animate-pulse` is inert
// under prefers-reduced-motion (globals.css). There are no spinners in this app.
//
// Hairlines go through `.edge`, NOT the `border-stone-200/70 dark:border-stone-800` pair that
// /library/loading.tsx still uses — that pair is measured broken in dark mode and is the whole
// reason `.edge` exists (globals.css:231-268). Copying that file verbatim would have shipped it.
//
// Three groups of four rows, not the full six-by-five: a search may return one group or none, and
// a skeleton that promises six is a claim about results nobody has counted yet. It shows that
// grouped rows are coming, which is true.
export default function SearchLoading() {
  const rows = ['w-[68%]', 'w-[52%]', 'w-[74%]', 'w-[45%]'];

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-24 pt-8" aria-busy>
      <span className="sr-only">Loading search results</span>

      <div aria-hidden className="animate-pulse">
        <div className="mb-6 h-8 w-32 rounded-lg bg-stone-200/70 dark:bg-stone-800" />

        {/* The query row: a 44px field beside its submit control, same box as the real form. */}
        <div className="mb-8 flex gap-2">
          <div className="min-h-[44px] flex-1 border edge bg-stone-200/40 dark:bg-stone-800/60" />
          <div className="min-h-[44px] w-24 shrink-0 bg-stone-200/60 dark:bg-stone-800/80" />
        </div>

        {[0, 1, 2].map((g) => (
          <section key={g} className="mb-8">
            {/* No bare `rounded`: the ladder is zeroed but that one is not on it and paints real
                corners (skeleton.tsx's own note). The first draft of this file carried five. */}
            <div className="mb-3 flex items-baseline gap-3 py-1">
              <div className="h-3 w-3 shrink-0 bg-stone-200/50 dark:bg-stone-800/70" />
              <div className="h-3 w-28 bg-stone-200/60 dark:bg-stone-800/80" />
            </div>

            <ul className="border-y edge">
              {rows.map((w, i) => (
                <li key={i} className="border-b edge py-4 last:border-b-0">
                  {/* Each row is three lines in the real markup: title, attribution, snippet. */}
                  <div className={`h-5 ${w} bg-stone-200/70 dark:bg-stone-800`} />
                  <div className="mt-1.5 h-3 w-40 bg-stone-200/50 dark:bg-stone-800/70" />
                  <div className="mt-2 h-3.5 w-[88%] bg-stone-200/50 dark:bg-stone-800/70" />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
