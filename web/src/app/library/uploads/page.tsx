import { ComingSoon } from '@/components/coming-soon';

export const metadata = { title: 'Uploaded files' };

export default function UploadsPage() {
  return (
    <ComingSoon
      title="Uploaded files"
      description="Bring your own notes, PDFs, and study material into the app to read alongside Scripture and the commentaries. File uploads are coming soon."
      cta={{ label: 'Browse commentaries →', href: '/library/commentaries' }}
    />
  );
}
