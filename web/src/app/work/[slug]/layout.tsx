// Mounts the history landing strip without touching the reader page's JSX — the strip renders
// nothing unless the arrival carries ?from=hist:<threadId> (HISTORY_RETRIEVAL_DESIGN §5 stage 3).
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HistoryContextBar } from '@/components/history-context-bar';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  // Humanise the slug: "matthew-henry" -> "Matthew Henry".
  const title = slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return { title };
}

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
