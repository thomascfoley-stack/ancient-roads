import Link from 'next/link';

// Shared chrome for the PUBLIC marketing tier (/, /features, /why). Deliberately
// light-only: the marketing surface is a brand statement, not a reader surface, so it
// does not carry dark: variants (the reader's .reader-dark class changes nothing here).
//
// PRD §6 navigation: 56px parchment bar with a 1px hairline bottom border, EB Garamond
// wordmark left, 14px Source Sans links center (ink-wash, hover ink), hairline-bordered
// auth CTA right. The old `onDark` transparent-over-hero variant is gone: the PRD hero
// puts its type on a parchment band at the bottom, so the bar never sits over imagery.
//
// Server component; the active page is a prop rather than usePathname so these pages
// stay fully static.
export type MarketingPage = 'home' | 'features' | 'why';

const LINKS: { key: MarketingPage; href: string; label: string }[] = [
  { key: 'home', href: '/', label: 'Home' },
  { key: 'features', href: '/features', label: 'Features' },
  { key: 'why', href: '/why', label: 'Why' },
];

export function MarketingNav({ active }: { active?: MarketingPage }) {
  return (
    <header className="sticky top-0 z-40 border-b edge bg-stone-50">
      <nav className="mx-auto grid max-w-7xl grid-cols-[1fr_auto] items-center px-5 py-2 sm:h-14 sm:grid-cols-[1fr_auto_1fr] sm:px-8 sm:py-0">
        {/* Wordmark: left on all sizes (PRD §6); mobile wraps the links to a second row. */}
        <Link
          href="/"
          className="justify-self-start font-display text-lg font-medium tracking-[-0.01em] text-stone-900 sm:order-1"
        >
          Ancient Paths
        </Link>

        {/* Auth CTA: the PRD primary button — 1px ink hairline, instant fill on hover. */}
        <Link
          href="/home"
          className="inline-flex min-h-[44px] items-center justify-self-end border border-stone-900 px-5 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 sm:order-3"
        >
          Log in
        </Link>

        <div className="col-span-2 flex items-center gap-6 sm:order-2 sm:col-span-1 sm:justify-self-center sm:gap-8">
          {LINKS.map((l) =>
            l.key === active ? (
              <span
                key={l.key}
                aria-current="page"
                className="flex min-h-[44px] items-center border-b border-stone-900 font-sans text-sm text-stone-900"
              >
                {l.label}
              </span>
            ) : (
              <Link
                key={l.key}
                href={l.href}
                className="flex min-h-[44px] items-center font-sans text-sm text-stone-500 transition-colors duration-150 ease-gentle hover:text-stone-900"
              >
                {l.label}
              </Link>
            ),
          )}
        </div>
      </nav>
    </header>
  );
}
