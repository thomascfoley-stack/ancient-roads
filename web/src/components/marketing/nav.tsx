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
    {/* A098 — DOM ORDER IS THE TAB ORDER, SO THE DOM IS AUTHORED IN READING ORDER.
        (2026-08-16 QA fleet: "keyboard focus order in the header zigzags — logo → Log in on the
        far right → Features → Why — rather than following visual left-to-right order.")

        The children used to be authored wordmark → Log in → links and then reordered for paint
        with `sm:order-1 / sm:order-3 / sm:order-2`. CSS `order` moves the PAINT and never the tab
        stop, so at ≥640px a keyboard reader watched focus jump from the left edge to the right
        edge and back to the middle — WCAG 2.4.3 as filed. Positive `tabindex` would "fix" it by
        hoisting these five above every control in the document; that is the anti-pattern, not the
        cure. The cure is that the source now reads left-to-right and each cell is PLACED
        explicitly (`col-start-*` / `row-start-*`) instead of ordered, which pins the two layouts
        without a utility that can decouple them again.

        THE ONE PLACE THIS TRADE IS VISIBLE: below 640px the bar is two rows — wordmark and the
        pill on row 1, the links beneath on row 2 — so no single DOM order can match both axes.
        Tab now reaches the links before the pill on a phone. That is a VERTICAL reading
        difference, not a left-right zigzag, it groups the three navigation items together, and
        it makes the tab order identical at every width, which is the stronger property.
        Asserted in `test/components/marketing-nav-focus-order.test.tsx`. */}
    <nav className="sticky top-0 z-40 border-b border-stone-200/40 bg-stone-50/70 backdrop-blur-xl">
      <div className="mx-auto grid max-w-7xl grid-cols-[1fr_auto] items-center px-5 py-2 sm:h-16 sm:grid-cols-[1fr_auto_1fr] sm:px-8 sm:py-0">
        {/* Wordmark: left on all sizes; mobile wraps the links to a second row. Row 1 / column 1
            at both breakpoints, so it needs no `sm:` override. */}
        <Link
          href="/"
          className="col-start-1 row-start-1 inline-flex min-h-[44px] items-center justify-self-start font-display text-lg font-medium tracking-[-0.01em] text-stone-900"
        >
          Ancient Paths
        </Link>

        <div className="col-span-2 col-start-1 row-start-2 flex items-center gap-6 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:justify-self-center sm:gap-8">
          {/* THE CURRENT PAGE STAYS A LINK. It used to render as a `<span aria-current="page">`,
              which is why the same finding also says "'Home' is not itself focusable" — on `/`
              the item had no tab stop at all. Dropping the current item from the tab order is a
              defensible convention elsewhere, but not in this app: the reader's own rail already
              makes the opposite call (`SidebarLink` renders every row as a `<Link>` and marks the
              current one with `aria-current`), so the product's two navigations disagreed, and
              `aria-current` exists exactly so an item can be both current AND a link. Concretely
              it cost a keyboard reader the ability to tab back to the top of the site, and made
              the header's tab-stop count depend on which page they were standing on.

              One element with a conditional class, not two branches: two branches is how the
              active and inactive states drift apart, and it is what put a `<span>` here. */}
          {LINKS.map((l) => (
            <Link
              key={l.key}
              href={l.href}
              aria-current={l.key === active ? 'page' : undefined}
              className={`flex min-h-[44px] items-center font-sans text-sm transition-colors duration-200 ease-gentle ${
                l.key === active
                  ? 'border-b border-stone-900 text-stone-900'
                  : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* THE TWO DOORS, right-hand cell at both breakpoints — column 2 of 2 on a phone, column 3
            of 3 from `sm` up. Authored left-to-right as they paint (see A098 above): the outlined
            secondary first, the ink-filled primary last, which is where the eye ends.

            "Request access" is here because until 2026-09-06 it was NOWHERE ELSE a visitor could
            reach without work: the landing page's only call to action was the waitlist form, the
            LAST element of a ~4,500px scroll, and the one piece of chrome that follows a reader
            down that scroll offered only "Log in" — a door for people who already have an account.
            `/#doors` is the same anchor features/page.tsx and why/page.tsx already point at, so
            one href serves all three marketing surfaces.

            The compact `px-4` below `sm` is load-bearing, not tidying: at 390px the bar carries the
            wordmark and both pills on one row, and the desktop `px-7` on both overflowed it. */}
        <div className="col-start-2 row-start-1 flex items-center gap-2 justify-self-end sm:col-start-3 sm:gap-3">
          <Link
            href="/auth/sign-in"
            className="inline-flex min-h-[44px] items-center rounded-full border border-stone-400/70 px-4 font-sans text-micro font-semibold uppercase tracking-[0.14em] text-stone-900 transition-colors duration-200 ease-gentle hover:border-stone-900 hover:bg-stone-900 hover:text-stone-50 sm:px-7 sm:tracking-[0.2em]"
          >
            Log in
          </Link>
          <Link
            href="/#doors"
            className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full bg-stone-900 px-4 font-sans text-micro font-semibold uppercase tracking-[0.14em] text-stone-50 transition-colors duration-200 ease-gentle hover:bg-stone-700 sm:px-7 sm:tracking-[0.2em]"
          >
            Request access
          </Link>
        </div>
      </div>
    </nav>
    </>
  );
}
