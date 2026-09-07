import Link from 'next/link';
import { AskClient } from '@/components/ask-client';
import { HistoryAsk } from '@/components/history-ask';
import { ModeToggle } from '@/components/mode-toggle';
import { ThreadRestore } from '@/components/thread-restore';
import { currentUser } from '@/lib/session';
import { isTeacherAllowed } from '@/lib/teacher-access';

export const metadata = {
  title: 'Ask',
  description: 'Ask a question and hear what commentators across the traditions have said, quoted and attributed, never interpreted.',
};

// THE PAGE OWNS THE COLUMN'S HEIGHT (2026-09-06). AskClient used to size itself to the viewport
// while the mode toggle above it sat outside that measure, so the document was always ~50px taller
// than the scrollport and the sticky composer covered the bottom of the "centred" first screen.
// The frame wraps BOTH, and the toggle stays a sibling of AskClient rather than moving inside it
// (ask-history-invite.test.tsx takes the FIRST /ask?mode=history link in the document).
const FRAME = 'flex min-h-[calc(100dvh-3.75rem-env(safe-area-inset-bottom)-1px)] flex-col md:min-h-[calc(100dvh-1px)]';

// Two modes, two contracts (HISTORY_RETRIEVAL_DESIGN §5 stage 0): voices composes attributed
// answers; history points into sources and never summarizes. Separate surfaces on one entry.
// `q` in history mode is the CARRIED QUERY from the Historians shelf's study entrance — the
// entrance routes here instead of running its own retrieval (order 2026-08-20).
export default async function AskPage(props: { searchParams: Promise<{ mode?: string; q?: string }> }) {
  const { mode, q } = await props.searchParams;
  if (mode === 'history') {
    return (
      <>
        <ThreadRestore />
        <ModeToggle mode="history" />
        <HistoryAsk initialQuery={typeof q === 'string' && q.trim() ? q : undefined} />
      </>
    );
  }
  // ADR-116 ruling 3: during gated beta the teacher is owner-only, and the API answers 403.
  // Ask the SAME question here that the route asks, so a reader who cannot use it is told so
  // instead of being handed a form that refuses them on submit. This is a render decision, not
  // a security boundary — `/api/ask` and `/api/ask/stream` enforce it independently, which is
  // what stops a hand-rolled POST. History mode is deliberately untouched: whether it is in
  // beta scope is an open owner decision, not a call this page should make.
  const user = await currentUser();
  if (!user || !isTeacherAllowed(user)) return <TeacherUnavailable />;

  return (
    <div className={FRAME}>
      {/* Back from the reader lands here under a thread URL (the live ask relabelled it with
          replaceState); ThreadRestore turns that into a real navigation to the thread. */}
      <ThreadRestore />
      <ModeToggle mode="voices" />
      <AskClient />
    </div>
  );
}

function TeacherUnavailable() {
  return (
    <div className="reading-measure mx-auto my-12 w-full px-6 sm:my-20">
      <h1 className="font-display text-3xl font-medium text-stone-900 dark:text-stone-100">
        Not open yet
      </h1>
      <p className="mt-4 font-scripture text-lg leading-[1.9] text-stone-900 dark:text-stone-100">
        The study assistant gathers what commentators have said and quotes them back to you. It is
        held back while we finish testing that it never speaks in its own voice — the one promise
        this product cannot get wrong.
      </p>
      <p className="mt-4 text-sm text-stone-500 dark:text-stone-400">
        Everything else is open: the Scriptures, the commentaries, the sermons and the historians
        are all here to read and search.
      </p>
      <div className="mt-10 flex flex-wrap gap-4 border-t edge pt-8">
        <Link
          href="/read/jhn/1"
          className="inline-flex min-h-[44px] items-center border border-stone-900 px-6 py-3 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-900"
        >
          Open the Word
        </Link>
        <Link
          href="/library"
          className="inline-flex min-h-[44px] items-center text-sm font-semibold text-accent-700 hover:text-accent-800 dark:text-accent-300"
        >
          Browse the library
        </Link>
      </div>
    </div>
  );
}
