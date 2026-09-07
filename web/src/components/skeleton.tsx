// The app's loading idiom, in one place.
//
// It was already the app's idiom before this file existed — `app/library/loading.tsx`,
// `read/[book]/[chapter]`'s ChapterSkeleton, `my-works.tsx`'s loading branch, `passage-view.tsx`
// and the desk pane header all draw the same thing: a pulsing block occupying the box the real
// content will occupy, `aria-hidden` so a screen reader does not hear a row of empty divs, and one
// `sr-only` line so it hears the state exactly once, under an `aria-busy` wrapper.
//
// Fourteen other surfaces printed the bare word "Loading…" instead. That is worse than ugly: the
// word occupies none of the space the content will, so the answer landing throws the region into a
// full relayout under the reader's pointer — the same failure my-works.tsx was hit by three times
// while being driven in a browser (see its loading branch's note).
//
// EXTRACTED, NOT INVENTED. Five inline copies is well past the inline-until-the-third rule, and a
// second idiom would be worse than the bug this closes. The four existing hand-written skeletons
// are deliberately NOT rewritten onto this: each holds the specific shape of its own page (the
// library's row list, the reader's measure, My Works' dropzone), which is the whole reason they
// are worth having. This is for the surfaces that had no shape at all.
//
// NO RADIUS. The PRD bans rounded corners and the radius ladder is zeroed in globals.css, so
// `rounded-lg` and up compile to nothing — but a BARE `rounded` is not on that ladder and would
// paint real 4px corners. The older skeletons carry one from before the ladder was zeroed; new
// bars do not.
//
// `animate-pulse` is already inert under prefers-reduced-motion (globals.css), which is why it is
// the sanctioned motion here and a spinner is not.

/** Ragged, not uniform: equal-length bars read as a table, and prose does not set that way. */
const RAGGED = ['w-[95%]', 'w-[88%]', 'w-full', 'w-[72%]', 'w-[92%]', 'w-[84%]', 'w-full', 'w-[63%]'];

export function TextSkeleton({
  label,
  lines = 4,
  className = '',
  announce = false,
}: {
  /**
   * What is loading, as a sentence fragment a screen reader can use: "Loading your reading plans".
   * Required — a silent busy region is a regression on the bare word it replaces, not a fix.
   */
  label: string;
  /** How much of the region to fill. Match the content, not a default. */
  lines?: number;
  /** Spacing for the box this sits in. The bars themselves are not configurable. */
  className?: string;
  /**
   * Make the label AUDIBLE by rendering the wrapper as a `role="status"` live region. `aria-busy`
   * alone only tells assistive tech to defer updates inside a live region — on a plain div it
   * announces nothing, so the three sites that had `<p role="status">Loading…</p>` on live pass
   * `announce` to keep what they had. OPT-IN, not the default: a surface owns ONE status role —
   * the desk reserves its for the pane-cap notice (A078) and three of its own suites assert that
   * exactly one exists — so a skeleton must not claim it uninvited (audit-run-4, 2026-09-07).
   */
  announce?: boolean;
}) {
  return (
    <div role={announce ? 'status' : undefined} aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      <div aria-hidden className="animate-pulse space-y-3">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className={`h-4 ${RAGGED[i % RAGGED.length]} bg-stone-200/70 dark:bg-stone-800`} />
        ))}
      </div>
    </div>
  );
}
