import type { Metadata } from 'next';
import { PlansClient } from '@/components/plans-client';

export const metadata: Metadata = { title: 'Reading plan · Ancient Paths' };

// A plan has a URL. The id is not validated here — PlansClient fetches
// /api/plans/[id], which UUID-checks and 404s; the client renders the
// same honest error state it uses for any failed open.
export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlansClient initialPlanId={id} />;
}
