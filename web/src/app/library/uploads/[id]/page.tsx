import { WorkBesideTradition } from '@/components/work-beside-tradition';

export const metadata = { title: 'My Works' };

// SYNCHRONOUS, deliberately, and for the reason written at length in ../page.tsx:
// `app/library/loading.tsx` wraps every /library/* route in a Suspense boundary, and an async
// server component under it left a hard load showing the library skeleton and never swapping in
// the resolved segment. Everything this page needs is user-scoped and fetched client-side through
// the guarded API, so there is nothing to await here anyway.
export default async function WorkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkBesideTradition documentId={id} />;
}
