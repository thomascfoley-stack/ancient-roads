import { PrayerJournal } from '@/components/prayer-journal';

// `/prayers` — block PR1a. `force-dynamic` because the journal is per-reader and must never be
// prerendered or cached; a cached prayer page is the worst possible cache.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Prayer journal' };

export default function PrayersPage() {
  return <PrayerJournal />;
}
