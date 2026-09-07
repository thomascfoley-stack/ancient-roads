'use client';

// The staged progress panel for a turn in flight. Split out of ask-client.tsx (2026-09-06).
//
// L1 (docs/UX_REMEDIATION.md): "Do not touch the staged progress sequence. Both audits
// independently name it the best-designed thing in the product." The SEQUENCE is unchanged here —
// same four steps, same icons, same order. Two things did change, under the owner's 2026-09-06
// report that a running ask was "not discernible": the ACTIVE step's label sits in the ink tier
// (one tier up, still the same two-tier scheme the note below describes), and the source previews
// no longer pulse — that `animate-pulse` ran for the whole compose-and-verify loop, past the WCAG
// 2.2.2 five-second threshold with no way to stop it (globals.css names this very element). The
// unmistakable working signal is the travelling bar TurnView paints under the question; this panel
// is the narrative under it.

import { useEffect, useState } from 'react';
import { count } from '@/lib/plural';
import { STAGE_RANK, type Turn } from './ask-types';

/**
 * When to tell the reader this answer is taking longer than usual.
 *
 * **The block said ~15s. That number came from a premise INSTR measured false** — it was written
 * for "~18s success, ~45s failure", and the real series was **104s / 58s / 64s** (WORKLOG
 * 2026-08-07). At 15s the line would appear on every single request, so copy that claims an
 * exception would in fact be describing the norm. A message that is false whenever it is shown is
 * worse than no message.
 *
 * DERIVED, and stated as provisional: 90s sits above both the measured median (64s) and mean
 * (~75s) and below the observed maximum (104s), so it fires on a genuinely slow tail rather than
 * on an ordinary wait. **n=3.** That is a weak basis and it is recorded as one — the honest claim
 * is "above typical for every request we have measured", not "the 90th percentile". Two production
 * series now exist (21–37s n=8 in a browser; p50 10.5s / p95 20.6s n=25 warm) and would put the
 * threshold lower; re-deriving it is the owner's call and is filed, not taken.
 */
export const SLOW_ANSWER_NOTICE_MS = 90_000;

export function Progress({ turn }: { turn: Turn }) {
  const rank = STAGE_RANK[turn.stage];

  // L1b — one timer, one line, inside the progress indicator itself. No spinner, no percentage,
  // no countdown (all three forbidden by the block). Threshold derived from measurement, not from
  // the block's ~15s — see SLOW_ANSWER_NOTICE_MS.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_ANSWER_NOTICE_MS);
    return () => clearTimeout(t);
  }, []);
  const refining = turn.stage === 'composing' && turn.attempt > 0;

  // PRD §5 progress steps: 1px hairline connectors between steps, centred under the 12px
  // indicator column (hence ml-[6px]).
  const connector = <div aria-hidden="true" className="edge ml-[6px] h-2.5 border-l" />;

  const step = (label: string, done: boolean, active: boolean) => (
    <div className="flex items-center gap-2.5 py-1.5">
      {/* The completed check is candle-flame amber — one of flame's three sanctioned uses (the Ask
          stage check). The ACTIVE step is an opacity-pulsing ring, not a spinner: the PRD bans
          spinners outright and budgets motion as fade/pulse only. */}
      {done ? <span className="flex h-3 w-3 items-center justify-center text-sm font-bold text-flame">✓</span>
        : active ? <span className="inline-block h-3 w-3 animate-pulse rounded-full border-[1.5px] border-accent-500" />
          : <span className="inline-block h-3 w-3 rounded-full border-[1.5px] border-stone-400" />}
      {/* Two tiers of text colour, not three. `done` and `pending` used to differ (stone-500/400
          vs stone-400/500), but that second pair measured 2.54:1 on light and 3.58:1 on dark —
          both under WCAG AA's 4.5:1 for normal text. The distinction is not lost: the icon column
          already says which tier a step is in, with a flame ✓, a pulsing ring, or an empty ring —
          three different SHAPES, so the signal was never colour-only anyway. */}
      <span className={`text-sm ${active ? 'font-medium text-stone-900 dark:text-stone-100' : 'text-stone-500 dark:text-stone-400'}`}>{label}</span>
    </div>
  );

  return (
    <div className="py-2">
      <div className="flex flex-col">
        {step('Searching the commentaries', rank >= 1, rank === 0)}
        {connector}
        {rank >= 1 && (
          <div className="flex items-center gap-2.5 py-1.5">
            <span className="flex h-3 w-3 items-center justify-center text-sm font-bold text-flame">✓</span>
            <span className="text-sm text-stone-500 dark:text-stone-400">
              Found <b className="text-stone-700 dark:text-stone-200">{count(turn.sources.length, 'voice')}</b> across{' '}
              <b className="text-stone-700 dark:text-stone-200">{turn.traditions} tradition{turn.traditions === 1 ? '' : 's'}</b>
            </span>
          </div>
        )}
        {rank >= 1 && connector}
        {step(refining ? `Refining the answer (attempt ${turn.attempt + 1})…` : 'Composing a grounded answer', rank >= 3, turn.stage === 'composing')}
        {connector}
        {step('Verifying every quote is word-for-word', rank >= 4, turn.stage === 'verifying')}
        {slow && (
          <p role="status" className="mt-1 font-serif text-sm leading-relaxed text-stone-500 dark:text-stone-400">
            This one is taking longer than usual — still verifying every quote.
          </p>
        )}
      </div>

      {turn.sources.length > 0 && (
        <div className="edge mt-4 border-t pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-500">Reading these while I compose</p>
          <div className="flex flex-col gap-2">
            {turn.sources.slice(0, 3).map((s) => (
              <p key={s.sourceId} className="font-serif text-sm leading-relaxed text-stone-500 dark:text-stone-400">
                <b className="text-stone-700 dark:text-stone-300">{s.author}</b>. {s.content.slice(0, 130).replace(/\n/g, ' ')}…
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
