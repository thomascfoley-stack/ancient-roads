import { SettingsForm } from './settings-form';

export const metadata = { title: 'Settings' };

// Was a ComingSoon stub behind a first-class nav entry, whose own copy promised the three controls
// below "will live here" (A7b walk, 2026-08-02). They already existed in the reader; what was
// missing was this page. See settings-form.tsx for why none of the logic is duplicated here.
export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-medium tracking-tight text-stone-900 dark:text-stone-100">Settings</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500 dark:text-stone-400">
          How the text reads, and which translation a chapter opens in. Saved on this device.
        </p>
      </header>
      <SettingsForm />
    </div>
  );
}
