import { ComingSoon } from '@/components/coming-soon';

export const metadata = { title: 'Settings' };

export default function SettingsPage() {
  return (
    <ComingSoon
      title="Settings"
      description="Preferences for your default translation, reading theme, and account will live here. In the meantime, your translation choice is remembered as you read."
      cta={{ label: 'Go to the reader →', href: '/read/jhn/1' }}
    />
  );
}
