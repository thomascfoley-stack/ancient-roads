import Link from 'next/link';

// Marketing footer, shared by the public tier. The LEGAL column landed 2026-09-16, when the two
// routes it names became real pages (app/privacy, app/terms) and were added to gate.ts
// PUBLIC_PATHS. It was deliberately absent before that, and the rule that kept it absent still
// holds: a link here must resolve OUTSIDE the password wall, or it is a dead link for everyone
// who has not been let in yet.
export function MarketingFooter() {
  return (
    <footer className="relative z-10 border-t border-stone-200/40 bg-stone-50/70 px-5 py-16 backdrop-blur-xl sm:px-8 sm:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-12 sm:mb-16 sm:grid-cols-2 sm:gap-20">
          <div>
            <Link href="/" className="inline-flex min-h-[44px] items-center font-display text-3xl tracking-tight text-stone-900 sm:text-4xl">
              Ancient Paths
            </Link>
            <p className="mt-6 max-w-sm font-serif text-lg leading-relaxed text-stone-900/60 sm:text-xl">
              AI designed to lead you to the Holy Spirit, not be the Holy Spirit.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            <div className="space-y-5">
              <h4 className="text-micro font-bold uppercase tracking-[0.3em] text-stone-900">Product</h4>
              <ul className="space-y-1 text-xs uppercase tracking-widest text-stone-500">
                <li>
                  <Link href="/" className="inline-flex min-h-[44px] items-center transition-colors ease-gentle hover:text-stone-900">Home</Link>
                </li>
                <li>
                  <Link href="/features" className="inline-flex min-h-[44px] items-center transition-colors ease-gentle hover:text-stone-900">Features</Link>
                </li>
                <li>
                  <Link href="/why" className="inline-flex min-h-[44px] items-center transition-colors ease-gentle hover:text-stone-900">Why</Link>
                </li>
              </ul>
            </div>
            <div className="space-y-5">
              <h4 className="text-micro font-bold uppercase tracking-[0.3em] text-stone-900">More</h4>
              <ul className="space-y-1 text-xs uppercase tracking-widest text-stone-500">
                <li>
                  <Link href="/about" className="inline-flex min-h-[44px] items-center transition-colors ease-gentle hover:text-stone-900">About</Link>
                </li>
                <li>
                  <Link href="/auth/sign-in" className="inline-flex min-h-[44px] items-center transition-colors ease-gentle hover:text-stone-900">Log in</Link>
                </li>
              </ul>
            </div>
            <div className="space-y-5">
              <h4 className="text-micro font-bold uppercase tracking-[0.3em] text-stone-900">Legal</h4>
              <ul className="space-y-1 text-xs uppercase tracking-widest text-stone-500">
                <li>
                  <Link href="/privacy" className="inline-flex min-h-[44px] items-center transition-colors ease-gentle hover:text-stone-900">Privacy</Link>
                </li>
                <li>
                  <Link href="/terms" className="inline-flex min-h-[44px] items-center transition-colors ease-gentle hover:text-stone-900">Terms</Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* No photograph attribution line: the hero is now a licensed iStock purchase
            (standard license, no credit required), not a CC-licensed photo. */}
        <div className="mt-12 flex flex-col items-center justify-between gap-6 border-t edge pt-10 md:flex-row">
          <p className="text-micro uppercase tracking-[0.2em] text-stone-500">© 2026 Ancient Paths</p>
          <p className="text-micro uppercase tracking-[0.2em] text-stone-500">Crafted with reverence</p>
        </div>
      </div>
    </footer>
  );
}
