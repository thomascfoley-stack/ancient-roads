import Link from 'next/link';

// Shared chrome for the PUBLIC marketing tier (/, /features, /why). Deliberately
// light-only: the marketing surface is a brand statement, not a reader surface, so it
// does not carry dark: variants (the reader's .reader-dark class changes nothing here).
//
// 2026-08-08 "photo as ground" pass: a frosted translucent bar floating over the
// ground photograph — soft blur, hairline only at the bottom edge of the glass, pill
// CTA, smooth 200ms color transitions. A plain <nav>, not <header><nav>: each page's
// own title section owns the single <header>/banner landmark.
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
    <>
      {/* The public pages had NO skip link, while `.skip-link` has been in globals.css all along
          and `app-shell.tsx` renders one — so keyboard readers got the treatment on every surface
          EXCEPT the front door (2026-08-16 QA fleet). First focusable element in the document,
          visible only on focus. Each marketing page carries the matching `id="main"`. */}
      <a
        href="#main"
        className="skip-link bg-accent-700 px-4 py-2 text-sm font-semibold text-stone-50"
      >
        Skip to content
      </a>
    <nav className="sticky top-0 z-40 border-b border-stone-200/40 bg-stone-50/70 backdrop-blur-xl">
      <div className="mx-auto grid max-w-7xl grid-cols-[1fr_auto] items-center px-5 py-2 sm:h-16 sm:grid-cols-[1fr_auto_1fr] sm:px-8 sm:py-0">
        {/* Wordmark: left on all sizes; mobile wraps the links to a second row. */}
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center justify-self-start font-display text-lg font-medium tracking-[-0.01em] text-stone-900 sm:order-1"
        >
          Ancient Paths
        </Link>

        {/* Auth CTA: pill, ink fill on hover, gentle transition. */}
        <Link
          href="/auth/sign-in"
          className="inline-flex min-h-[44px] items-center justify-self-end rounded-full border border-stone-400/70 px-7 font-sans text-micro font-semibold uppercase tracking-[0.2em] text-stone-900 transition-colors duration-200 ease-gentle hover:border-stone-900 hover:bg-stone-900 hover:text-stone-50 sm:order-3"
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
                className="flex min-h-[44px] items-center font-sans text-sm text-stone-500 transition-colors duration-200 ease-gentle hover:text-stone-900"
              >
                {l.label}
              </Link>
            ),
          )}
        </div>
      </div>
    </nav>
    </>
  );
}
