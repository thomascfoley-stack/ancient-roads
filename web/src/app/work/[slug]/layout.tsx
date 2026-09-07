// Mounts the landing strip without touching the reader page's JSX — the strip renders nothing
// unless the arrival carries ?from=hist:<threadId> (HISTORY_RETRIEVAL_DESIGN §5 stage 3) or
// ?from=ask:<threadId> (a result card on a research thread, 2026-09-06). It is mounted AFTER the
// page: the strip is `sticky bottom-0`, and a bottom-sticky element only holds while its natural
// position is below the scrollport — placed first in the flow it would scroll away on landing.
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
      {children}
      <Suspense fallback={null}>
        <HistoryContextBar />
      </Suspense>
    </>
  );
}
