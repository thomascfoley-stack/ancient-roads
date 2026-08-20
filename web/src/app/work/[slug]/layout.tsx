// Mounts the history landing strip without touching the reader page's JSX — the strip renders
// nothing unless the arrival carries ?from=hist:<threadId> (HISTORY_RETRIEVAL_DESIGN §5 stage 3).
import { Suspense } from 'react';
import { HistoryContextBar } from '@/components/history-context-bar';

export default function WorkLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <HistoryContextBar />
      </Suspense>
      {children}
    </>
  );
}
