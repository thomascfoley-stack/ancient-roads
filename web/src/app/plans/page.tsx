import { PlansClient } from '@/components/plans-client';

export const metadata = {
  title: 'Reading plans',
  description: 'Build a dated reading plan through a book or passage — the schedule is arithmetic, the readings are Scripture.',
};

export default function PlansPage() {
  return <PlansClient />;
}
