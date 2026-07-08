import { ComingSoon } from '@/components/coming-soon';

export const metadata = { title: 'Channel' };

export default function ChannelPage() {
  return (
    <ComingSoon
      title="Channels"
      description="Group study spaces, where a class or cohort can work through a passage together, are being built. The study assistant that powers them arrives with the trained model."
      cta={{ label: 'Read Scripture →', href: '/read/jhn/1' }}
    />
  );
}
