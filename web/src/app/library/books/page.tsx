import { ComingSoon } from '@/components/coming-soon';

export const metadata = { title: 'My books' };

export default function MyBooksPage() {
  return (
    <ComingSoon
      title="My books"
      description="Your personal shelf of saved commentaries, bookmarks, and books you pin for a study will live here. For now, the full commentary library is open to read."
      cta={{ label: 'Browse commentaries →', href: '/library/commentaries' }}
    />
  );
}
