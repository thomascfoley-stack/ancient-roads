'use client';

// The composer: the one object on the /ask page (owner pick 2026-09-06, "Field first"). The BOX
// holds only the question and the Ask/Stop button; the search scope is a quiet line under the box
// (ask-scope-row.tsx). Both travel together — the whole form is what sticks.
//
// PRD §5 composer: parchment surface, one 1px vellum hairline, square corners, no shadow. `.edge`
// owns the hairline and is unlayered, so a `focus-within:border-*` utility could never override
// it — focus is shown with the PRD's antique-gold outline (§10) instead of a border-colour swap.
//
// THE FORM'S GEOMETRY IS LOCKED BY A TEST, and the lock is the point. `web/test/invariants/
// ask-composer-mask.test.ts` derives three values from this file's `<form className="edge sticky
// …">` string and app-shell.tsx's `main` padding, and checks the arithmetic:
//
//   offset   the sticky inset, measured from `main`'s CONTENT box (which the shell's padding has
//            ALREADY inset by the tab bar's height — adding it again is the 2026-08-17 bug)
//   height   must equal offset + `main`'s padding-bottom, so the strip reaches the bottom of the
//            scrollport's padding box rather than the top of a bar whose rendered height (an
//            emergent 53px) no CSS here can name
//   top      `calc(100%+1px)`, NOT `top-full` — which starts one border-width above the border edge
//   inset-x  the `-mx-2.5` result-card overhang PLUS the border, or a hovered row paints beside it
//
// The `after:` strip fills the slot BELOW the sticky form in the PAGE background (body is
// bg-stone-50 / dark:bg-stone-950), so content vanishes at the form's bottom edge instead of
// reappearing beneath it. The form itself has no visible border now — the box inside does — so the
// strip's 1px `top` offset leaves a 1px band of page colour under the scope line, which is the
// same colour as the strip. The class string stays a literal attribute: the test greps it.
//
// HEADROOM IS 4px AND IT IS NOT ENFORCED. The strip is an absolutely-positioned descendant of the
// scroll container, so it adds to scrollable overflow unless it fits inside the column's `pb-4`
// (16px) plus `main`'s reserve (60px) = 76px against a 72px strip. Shrink the column's padding or
// grow the tab bar and /ask silently gains dead scroll under every answer.

import Link from 'next/link';
import { ScopeRow, type LaneKey } from './ask-scope-row';

const BUTTON = 'min-h-[44px] border border-stone-900 px-6 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-900';

export function AskComposer({ question, onChange, onSubmit, onStop, busy, signedIn, lanes, onToggleLane }: {
  question: string;
  onChange: (q: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  busy: boolean;
  signedIn: boolean;
  lanes: Record<LaneKey, boolean>;
  onToggleLane: (key: LaneKey, value: boolean) => void;
}) {
  return (
    // `border-b` + a transparent inline colour: the mask's `top: calc(100% + 1px)` was derived for a
    // form with a 1px border, and that border now belongs to the inner box. Without a border the
    // padding box ends where the border box does and the mask starts 1px BELOW the form — a
    // full-width 1px slot where scrolling text shows through (deep-audit 2026-09-06). Keeping a
    // 1px transparent border keeps the arithmetic the test derives; inline, because the unlayered
    // `.edge` beats any `border-transparent` utility.
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      style={{ borderBottomColor: 'transparent' }}
      className="edge sticky bottom-3 mt-6 border-b bg-stone-50 after:absolute after:inset-x-[calc(-0.625rem-1px)] after:top-[calc(100%+1px)] after:h-[calc(3.75rem+env(safe-area-inset-bottom)+0.75rem)] md:after:h-4 after:bg-stone-50 dark:bg-stone-950 dark:after:bg-stone-950">
      <div className="edge relative border bg-stone-50 p-3 focus-within:outline-2 focus-within:outline-solid focus-within:outline-offset-[-2px] focus-within:outline-accent-600 dark:bg-stone-950 dark:focus-within:outline-accent-400">
        {/* THE WORKING SIGNAL, on the control the reader is looking at. The same travelling bar
            TurnView paints under the question, along the box's top edge — aria-hidden, because the
            turn's bar is the announced one and two progress bars for one job is noise. */}
        {busy && (
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2px] overflow-hidden bg-stone-200 dark:bg-stone-800">
            <span className="progress-travel block h-full w-1/3 bg-accent-600 dark:bg-accent-400" />
          </span>
        )}
        {/* Q1 — 13 of 20 QA-fleet sessions typed a full question and only then learned that asking
            needs an account. The notice rides the composer rather than the page top, so it cannot
            scroll away from the control it constrains. NOT an alert and NOT a disabled composer:
            signed-out is the app's own auth state, not a fault (the prayer-journal lesson), and a
            reader who signs in on another tab can still submit what they have already typed. The
            second sentence exists because the fleet also found Search working anonymously while
            Ask did not, and read the pair as broken rather than as a boundary. */}
        {!signedIn && (
          <p className="edge mb-2 border-b px-1.5 pb-2 font-sans text-xs leading-relaxed text-stone-600 dark:text-stone-400">
            <Link href="/auth/sign-in" className="font-semibold underline underline-offset-2 hover:text-accent-700 dark:hover:text-accent-400">
              Sign in
            </Link>
            {' '}to ask — answers are kept in your research history. Reading and search stay open to everyone.
          </p>
        )}
        <textarea
          value={question}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(); } }}
          onFocus={(e) => {
            // Keep the composer visible above the on-screen keyboard (iOS scrolls the container;
            // give it a nudge once the keyboard is up).
            const el = e.currentTarget;
            setTimeout(() => el.scrollIntoView({ block: 'end', behavior: 'smooth' }), 300);
          }}
          // PRD §5 Ask: the placeholder is 18px Literata italic in ink-wash gray.
          placeholder="Ask a question…"
          aria-label="Ask a question"
          rows={3}
          maxLength={500}
          className="focus-quiet w-full resize-none bg-transparent px-1.5 pt-0.5 font-serif text-lg leading-relaxed text-stone-900 outline-none placeholder:italic placeholder:text-stone-500 dark:text-stone-100 dark:placeholder:text-stone-400"
        />
        <div className="mt-1 flex min-h-[44px] items-center justify-between gap-3 px-1.5">
          <span className="min-w-0 text-xs text-stone-500 dark:text-stone-400">
            {busy ? (
              // R3 (2026-08-17): a RANGE, never an average — measured 21–37s live, avg 28.5s.
              'Answering… usually 20–40 seconds'
            ) : (
              <>
                <span className="[@media(hover:none)]:hidden">↵ to send · ⇧↵ newline</span>
                {/* Touch, below md: the price line is scrolling, so the price sits here instead.
                    Hidden wherever the keyboard hint shows, so the two never concatenate. */}
                <span className="text-micro md:hidden [@media(hover:hover)]:hidden">applies to your next ask</span>
              </>
            )}
          </span>
          {/* The PRD §6 primary: a hairline button, filled on hover. The 44px touch target holds at
              every size. Stop is `type="button"` — a submit-typed Stop would re-enter the handler. */}
          {busy ? (
            <button type="button" onClick={onStop} className={BUTTON}>Stop</button>
          ) : (
            <button type="submit" disabled={!question.trim()} className={BUTTON}>Ask</button>
          )}
        </div>
      </div>
      <ScopeRow lanes={lanes} onToggle={onToggleLane} />
    </form>
  );
}
