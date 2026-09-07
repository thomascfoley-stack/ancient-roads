'use client';

// The first screen of /ask: two lines of heading, three questions a person might ask, and the
// door into History. Split out of ask-client.tsx in the 2026-09-06 redesign.
//
// EMPTY STATE IS COMPOSED, NOT TOP-ALIGNED (2026-08). It was `flex-1` with the examples pinned to
// the top, so a first visit was a small heading, three floating cards, and roughly 400px of nothing
// above a composer stuck to the bottom edge. Centring the invitation in the space it actually has
// makes the screen one thing instead of two things separated by a void. The examples are a
// hairline-separated list in the reading face, so they read as questions rather than as buttons.
//
// What the 2026-09-06 redesign removed from here, and why: the timing sentence (it now sits in the
// composer, beside the wait it describes); "Currently answering from the Gospels" (false — the
// corpus is 65 books, docs/LONG_NIGHT.md:247); the lane band (inside the composer now). What it
// kept: the header phrase, the three examples, and the History invitation with its ruled copy.

import Link from 'next/link';

export const EXAMPLES = [
  'What does the Gospel of John say about the Word becoming flesh?',
  'How have commentators understood being born again?',
  'Is Jesus really God? Just tell me the answer.',
];

export function AskEmptyState({ onPick }: { onPick: (question: string) => void }) {
  return (
    <div className="pb-8">
      <h1 className="font-display text-3xl font-medium tracking-tight text-stone-900 dark:text-stone-100">Explore the paths</h1>
      <p className="mt-2 font-serif text-base leading-relaxed text-stone-500 dark:text-stone-400">
        What commentators across the traditions have said — quoted and attributed, never interpreted.
      </p>
      <p className="mb-1 mt-10 text-micro font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-500">Try one</p>
      {/* `.edge` hairlines, not a `divide-stone-200 dark:divide-stone-800` pair — the pair's dark
          half loses the cascade (see THE EDGE in globals.css). */}
      <ul className="edge border-t">
        {EXAMPLES.map((ex) => (
          <li key={ex} className="edge border-b">
            <button
              type="button"
              /* FILLS the composer; it used to `ask(ex)` outright (A013). Submitting a question the
                 reader never read is the wrong default on a control whose whole purpose is to show
                 what a good question looks like — and signed out it spends their click on a 401. */
              onClick={() => onPick(ex)}
              className="group flex min-h-[56px] w-full items-center gap-3 py-3 text-left font-serif text-lg leading-snug text-stone-500 transition-colors ease-gentle hover:text-accent-700 dark:text-stone-400 dark:hover:text-accent-300"
            >
              <span className="flex-1">{ex}</span>
              <span aria-hidden className="shrink-0 opacity-0 transition-opacity ease-gentle group-hover:opacity-100 group-focus-visible:opacity-100">&rarr;</span>
            </button>
          </li>
        ))}
        {/* THE INVITATION INTO HISTORY (order 2026-08-20-historians-study-entrance, ruling 4): the
            other door into study, offered where a reader is already asking questions. A real link,
            not a mode-flipping button, so it works before hydration and in a new tab. Empty state
            only — under an answer it would be an advertisement, not a welcome. A hairline row rather
            than the ruling's raised-paper block: owner re-ruled 2026-09-06 (the PRD's empty state is
            "no cards, just quiet text", and the block sat half under the sticky composer). The copy
            is the ruling's: deliberately countless, and "history's own witnesses" rather than "the
            church's historians" — the corpus leads with Josephus. */}
        <li className="edge border-b">
          <Link
            href="/ask?mode=history"
            className="group flex min-h-[56px] items-center gap-3 py-3 transition-colors ease-gentle hover:text-accent-700 dark:hover:text-accent-300"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-micro font-semibold uppercase tracking-[0.08em] text-accent-600 dark:text-accent-400">History</span>
              <span className="mt-0.5 block font-serif text-lg leading-snug text-stone-700 dark:text-stone-300">Step into the story behind the text</span>
            </span>
            <span className="shrink-0 font-sans text-sm text-accent-700 underline underline-offset-2 dark:text-accent-300">Begin a study &rarr;</span>
          </Link>
        </li>
      </ul>
    </div>
  );
}
