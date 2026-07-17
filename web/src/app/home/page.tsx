import { TodayView } from '@/components/today-view';

// The authenticated app home (behind the SITE_PASSWORD gate + login). It IS the daily "Today"
// screen now: today's Spurgeon Morning/Evening devotional + the grounded corpus voices on its
// verse. The view is client-side because the day + AM/PM key off the user's LOCAL clock and it
// reuses the reader's client-only commentary loader (see today-view.tsx / today.ts).
export default function Home() {
  return <TodayView />;
}
