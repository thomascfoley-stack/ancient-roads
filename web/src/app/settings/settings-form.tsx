'use client';

// The real /settings. It was a ComingSoon stub behind a FIRST-CLASS NAV ENTRY, and its own copy
// promised "your default translation, reading theme, and account will live here" (A7b walk,
// 2026-08-02). A nav item that leads to a promise is worse than no nav item: the reader spends a
// tap to learn nothing, and every visit re-teaches them that part of the app is not real.
//
// All three controls already existed — theme and size in the reader's Aa popover, translation in
// its header dropdown. None of that logic is re-implemented here: theme/size come from
// `useReadingPrefs`, and the translation list is `TRANSLATIONS` from lib/bible. This page is
// layout over shared state, which is the only way two surfaces can offer one setting and agree.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DEFAULT_TRANSLATION, TRANSLATIONS, type Translation } from '@/lib/bible';
import { READING_SIZES, useReadingPrefs } from '@/lib/reading-prefs';

const TRANSLATION_KEY = 'translation';

const SIZE_LABELS = ['Small', 'Medium', 'Large', 'Larger', 'Largest'];

export function SettingsForm() {
  const { dark, sizeIdx, ready, setDark, setSizeIdx } = useReadingPrefs();
  // The DEFAULT during the first client render, never localStorage — the reader page's translation
  // badge was a React #418 hydration error for exactly this reason until earlier today.
  const [translation, setTranslation] = useState<string>(DEFAULT_TRANSLATION);

  useEffect(() => {
    const stored = localStorage.getItem(TRANSLATION_KEY);
    if (stored && TRANSLATIONS.some((t) => t.id === stored)) setTranslation(stored);
  }, []);

  function chooseTranslation(id: string) {
    setTranslation(id);
    // The same key the reader reads, so a change here is live the next time a chapter opens.
    localStorage.setItem(TRANSLATION_KEY, id);
  }

  const row = 'rounded-xl bg-paper px-4 py-4 shadow-paper dark:bg-stone-800/60 dark:shadow-none';
  const label = 'mb-2 text-micro font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400';

  return (
    <div className="space-y-4">
      <section className={row}>
        <p className={label}>Reading theme</p>
        <div className="flex rounded-lg bg-stone-100 p-0.5 dark:bg-stone-700">
          {([false, true] as const).map((v) => (
            <button
              key={String(v)}
              onClick={() => setDark(v)}
              aria-pressed={dark === v}
              className={`min-h-[44px] flex-1 rounded-md text-sm font-medium transition-colors ease-gentle ${
                dark === v
                  ? 'bg-paper text-stone-800 shadow-paper dark:bg-stone-900 dark:text-stone-100'
                  : 'text-stone-500 dark:text-stone-300'
              }`}
            >
              {v ? 'Dark' : 'Light'}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
          Applies everywhere, and is remembered on this device.
        </p>
      </section>

      <section className={row}>
        <p className={label}>Text size</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSizeIdx(sizeIdx - 1)}
            disabled={sizeIdx === 0}
            aria-label="Smaller text"
            className="h-11 w-11 rounded-lg bg-stone-100 text-sm text-stone-600 hover:bg-stone-200 disabled:opacity-40 dark:bg-stone-700 dark:text-stone-300"
          >
            A−
          </button>
          <div className="flex-1 text-center text-sm text-stone-600 dark:text-stone-300">
            {ready ? (SIZE_LABELS[sizeIdx] ?? `${sizeIdx + 1}`) : '·'}
          </div>
          <button
            onClick={() => setSizeIdx(sizeIdx + 1)}
            disabled={sizeIdx === READING_SIZES.length - 1}
            aria-label="Larger text"
            className="h-11 w-11 rounded-lg bg-stone-100 text-base text-stone-700 hover:bg-stone-200 disabled:opacity-40 dark:bg-stone-700 dark:text-stone-200"
          >
            A+
          </button>
        </div>
      </section>

      <section className={row}>
        <p className={label}>Default translation</p>
        <div className="flex flex-wrap gap-2">
          {TRANSLATIONS.map((t: Translation) => (
            <button
              key={t.id}
              onClick={() => chooseTranslation(t.id)}
              aria-pressed={translation === t.id}
              title={t.name}
              className={`min-h-[40px] rounded-lg px-4 text-sm font-medium transition-colors ease-gentle ${
                translation === t.id
                  ? 'bg-accent-700 text-stone-50 dark:bg-accent-500'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-700 dark:text-stone-300'
              }`}
            >
              {t.abbr}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
          The translation a chapter opens in. You can still switch while reading.
        </p>
      </section>

      {/* A UX walk read this section as mislabelled — "Account" holding nothing but a link to
          highlights and notes — and suggested either building profile/subscription UI or renaming
          the heading. Both were the wrong fix: `/account/settings` ALREADY EXISTS, renders the
          signed-in email and a working change-password form (account-settings.tsx), and NOTHING
          in the app linked to it. Grepped: zero `href` to /account anywhere outside the route
          itself, so it could only ever be reached by typing the URL. This is the orphaned-surface
          bug this repo has now hit on the Library hub, the Historians shelf and My Works — the
          heading was accurate all along and the destination was missing.

          "Your saved work" is split out under its own heading because it is genuinely not
          account settings, which is the part of the complaint that was right. */}
      <section className={row}>
        <p className={label}>Account</p>
        <Link
          href="/account/settings"
          className="inline-flex min-h-[44px] items-center text-sm font-medium text-accent-700 hover:text-accent-800 dark:text-accent-300"
        >
          Email and password →
        </Link>
      </section>

      <section className={row}>
        <p className={label}>Your saved work</p>
        <Link
          href="/library/notes"
          className="inline-flex min-h-[44px] items-center text-sm font-medium text-accent-700 hover:text-accent-800 dark:text-accent-300"
        >
          Your highlights, notes and bookmarks →
        </Link>
      </section>
    </div>
  );
}
