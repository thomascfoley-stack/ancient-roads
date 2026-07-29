import { ComingSoon } from '@/components/coming-soon';

export const metadata = { title: 'Study space' };

export default function StudySpacePage() {
  return (
    <ComingSoon
      title="Study spaces"
      description="A place of your own for each sermon, class, or study — save your work, keep notes, and talk it through with the voices who came before you. Study spaces are coming soon."
      cta={{ label: 'Explore the paths →', href: '/ask' }}
    />
  );
}
