import { AskClient } from '@/components/ask-client';
import { HistoryAsk } from '@/components/history-ask';
import { ModeToggle } from '@/components/mode-toggle';

export const metadata = {
  title: 'Ask',
  description: 'Ask a question and hear what commentators across the traditions have said, quoted and attributed, never interpreted.',
};

// Two modes, two contracts (HISTORY_RETRIEVAL_DESIGN §5 stage 0): voices composes attributed
// answers; history points into sources and never summarizes. Separate surfaces on one entry.
export default async function AskPage(props: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await props.searchParams;
  if (mode === 'history') {
    return (
      <>
        <ModeToggle mode="history" />
        <HistoryAsk />
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
