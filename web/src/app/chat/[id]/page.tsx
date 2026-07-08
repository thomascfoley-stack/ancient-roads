import { ComingSoon } from '@/components/coming-soon';

export const metadata = { title: 'Study partner' };

export default function ChatPage() {
  return (
    <ComingSoon
      title="Study partners"
      description="One-on-one study conversations that only ever cite what others before you have said, never their own interpretation. They arrive with the trained model."
      cta={{ label: 'Read Scripture →', href: '/read/jhn/1' }}
    />
  );
}
