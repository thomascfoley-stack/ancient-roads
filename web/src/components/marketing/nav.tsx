import Link from 'next/link';

// Shared chrome for the PUBLIC marketing tier (/, /features, /why). Deliberately
// light-only: the marketing surface is a brand statement, not a reader surface, so it
// does not carry dark: variants (the reader's .reader-dark class changes nothing here).
//
// Server component; the active page is a prop rather than usePathname so these pages
// stay fully static.
export type MarketingPage = 'home' | 'features' | 'why';

const LINKS: { key: MarketingPage; href: string; label: string }[] = [
  { key: 'home', href: '/', label: 'Home' },
  { key: 'features', href: '/features', label: 'Features' },
  { key: 'why', href: '/why', label: 'Why' },
];

export function MarketingNav({ active, onDark = false }: { active?: MarketingPage; onDark?: boolean }) {
  // Over the hero photograph the bar is transparent with light text; on cream pages it
  // is the mockup's translucent cream bar with ink text.
  const text = onDark ? 'text-stone-50' : 'text-stone-900';
  const dim = onDark ? 'text-stone-50/70 hover:text-stone-50' : 'text-stone-900/60 hover:text-stone-900';
  return (
    <header
      className={`${
        onDark
          ? 'absolute inset-x-0 top-0 z-40'
          : 'sticky top-0 z-40 border-b border-sage-500/10 bg-stone-100/90 backdrop-blur-sm'
      }`}
    >
      <nav className="mx-auto grid max-w-7xl grid-cols-[1fr_auto] items-center gap-y-1 px-5 py-4 sm:grid-cols-[1fr_auto_1fr] sm:px-8 sm:py-5">
        {/* Wordmark: left on mobile, centered on sm+ (mockup order restored via CSS order). */}
        <Link
          href="/"
          className={`font-display text-2xl tracking-tight sm:order-2 sm:justify-self-center sm:text-3xl ${text}`}
        >
          Ancient Paths
        </Link>

        <Link
          href="/home"
          className={`justify-self-end rounded-full border px-5 py-2 text-micro font-semibold uppercase tracking-[0.2em] transition-colors ease-gentle sm:order-3 sm:px-7 sm:py-2.5 ${
            onDark
              ? 'border-stone-50/40 text-stone-50/95 hover:bg-stone-50 hover:text-stone-900'
              : 'border-stone-900/30 text-stone-900 hover:bg-stone-900 hover:text-stone-50'
          }`}
        >
          Log in
        </Link>

        <div className="col-span-2 flex items-center gap-6 sm:order-1 sm:col-span-1 sm:gap-8">
          {LINKS.map((l) =>
            l.key === active ? (
              <span
                key={l.key}
                aria-current="page"
                className={`flex items-center gap-2 text-micro font-semibold uppercase tracking-[0.2em] ${text}`}
              >
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-sage-500" />
                {l.label}
              </span>
            ) : (
              <Link
                key={l.key}
                href={l.href}
                className={`text-micro uppercase tracking-[0.2em] transition-colors ease-gentle ${dim}`}
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
