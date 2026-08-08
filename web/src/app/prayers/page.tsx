import { PrayerJournal } from '@/components/prayer-journal';

// `/prayers` — block PR1a. `force-dynamic` because the journal is per-reader and must never be
// prerendered or cached; a cached prayer page is the worst possible cache.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Prayer journal' };

export default async function PrayersPage({ searchParams }: { searchParams: Promise<{ verse?: string }> }) {
  const { verse } = await searchParams;
  // `?verse=` PRE-FILLS the reference; it never requires one. A prayer stands alone (owner ruling
  // 2026-08-08), so anything unparseable simply opens the journal rather than erroring.
  const n = Number(verse);
  const verseId = Number.isInteger(n) && n > 0 ? n : null;
  return <PrayerJournal initialVerseId={verseId} />;
}
