'use client';

// The search scope: which register lanes the NEXT ask searches, beside the always-on commentary.
//
// Design C (owner-ruled 2026-08-17) made this ALWAYS VISIBLE, with its cost stated. The owner's
// 2026-09-06 redesign ("Field first", chosen from three treatments) keeps both properties and moves
// the control: it is one quiet line under the composer's box, travelling with the sticky composer
// so it is on screen under every answer — more always-visible than the band above the header it
// replaces, which scrolled away. The price line lost its number ("~10s" sat three lines under a
// "20–40 seconds" claim about a different thing) and reads "applies to your next ask".
//
// ADR-023: the lanes may not be deleted from /ask. §4.7: this row is the SEARCH control — it changes
// what is retrieved — and may never become display-only; the display-only control is the Show
// filter on results, which is a differently named group so a screen reader can tell the two apart.
//
// History became a real lane 2026-08-14 and was REMOVED from this picker 2026-08-20 (owner decision
// #4, standalone-history ruling): History is its own mode on /ask, never a voices lane. The result
// renderer keeps its historian branches deliberately — persisted threads are transcripts.

export type LaneKey = 'sermons' | 'theology' | 'songVerse';
export const LANE_OPTIONS: { key: LaneKey; label: string }[] = [
  { key: 'sermons', label: 'Sermons' },
  { key: 'theology', label: 'Theology & Confessions' },
  { key: 'songVerse', label: 'Hymns & Sacred Poetry' },
];

export function ScopeRow({ lanes, onToggle }: { lanes: Record<LaneKey, boolean>; onToggle: (key: LaneKey, value: boolean) => void }) {
  return (
    // One line on desktop; on narrow screens the line scrolls sideways rather than stacking three
    // 40px rows under the composer (measured at 390px: stacking pushed Ask under the tab bar).
    <div className="flex flex-nowrap items-center overflow-x-auto px-1.5 pb-1 pt-1 font-sans text-xs text-stone-500 [scrollbar-width:none] md:flex-wrap md:overflow-visible dark:text-stone-400">
      <span className="shrink-0">Searching commentary</span>
      <div role="group" aria-label="Search these collections" className="flex shrink-0 items-center md:flex-wrap">
        {LANE_OPTIONS.map((o) => {
          const on = lanes[o.key];
          return (
            <span key={o.key} className="flex items-center">
              <span aria-hidden className="mx-1">·</span>
              {/* 40px hit area on a 16px line: the text is the control, the padding is the target. */}
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(o.key, !on)}
                className={`inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap px-1 transition-colors ease-gentle ${
                  // Off keeps AA on 12px text (stone-500 on parchment 5.7:1; stone-400 measured 2.25:1
                  // and failed — deep-audit 2026-09-06); the strike-through carries the de-emphasis.
                  on ? 'text-stone-700 hover:text-stone-900 dark:text-stone-200 dark:hover:text-stone-100' : 'text-stone-500 line-through hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'
                }`}
              >
                <span aria-hidden className={`text-[10px] ${on ? 'text-accent-600 dark:text-accent-400' : ''}`}>{on ? '✓' : '○'}</span>
                {o.label}
              </button>
            </span>
          );
        })}
      </div>
      {/* The price, stated once and without a number. Below md the same words sit in the
          composer's button row instead (the line is scrolling there). */}
      <span className="ml-auto hidden shrink-0 pl-3 text-micro text-stone-400 md:inline dark:text-stone-500">applies to your next ask</span>
    </div>
  );
}
