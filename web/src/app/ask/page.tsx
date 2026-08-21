import { AskClient } from '@/components/ask-client';
import { HistoryAsk } from '@/components/history-ask';
import { ModeToggle } from '@/components/mode-toggle';

export const metadata = {
  title: 'Ask',
  description: 'Ask a question and hear what commentators across the traditions have said, quoted and attributed, never interpreted.',
};

// Two modes, two contracts (HISTORY_RETRIEVAL_DESIGN §5 stage 0): voices composes attributed
// answers; history points into sources and never summarizes. Separate surfaces on one entry.
// `q` in history mode is the CARRIED QUERY from the Historians shelf's study entrance — the
// entrance routes here instead of running its own retrieval (order 2026-08-20).
export default async function AskPage(props: { searchParams: Promise<{ mode?: string; q?: string }> }) {
  const { mode, q } = await props.searchParams;
  if (mode === 'history') {
    return (
      <>
        <ModeToggle mode="history" />
        <HistoryAsk initialQuery={typeof q === 'string' && q.trim() ? q : undefined} />
      </>
    );
  }
  return (
    <>
      <ModeToggle mode="voices" />
      <AskClient />
    </>
  );
}
