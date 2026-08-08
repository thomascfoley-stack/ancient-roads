import Link from 'next/link';

// Marketing footer, shared by the public tier. The mockup's LEGAL column (Privacy,
// Terms) is deliberately absent: those pages are owner-authored content that does not
// exist yet (UX_REMEDIATION.md S1 page skeletons, owner-blocked), and shipping dead
// `#` links would be worse than shipping no column. Add the column when the routes exist.
export function MarketingFooter() {
  return (
    <footer className="border-t border-stone-200 bg-stone-100 px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-12 sm:mb-16 sm:grid-cols-2 sm:gap-20">
          <div>
            <Link href="/" className="font-display text-3xl tracking-tight text-stone-900 sm:text-4xl">
              Ancient Paths
            </Link>
            <p className="mt-6 max-w-sm font-serif text-lg leading-relaxed text-stone-900/60 sm:text-xl">
              AI designed to lead you to the Holy Spirit, not be the Holy Spirit.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10">
            <div className="space-y-5">
              <h4 className="text-micro font-bold uppercase tracking-[0.3em] text-stone-900">Product</h4>
              <ul className="space-y-3 text-xs uppercase tracking-widest text-stone-900/50">
                <li>
                  <Link href="/" className="transition-colors ease-gentle hover:text-stone-900">Home</Link>
                </li>
                <li>
                  <Link href="/features" className="transition-colors ease-gentle hover:text-stone-900">Features</Link>
                </li>
                <li>
                  <Link href="/why" className="transition-colors ease-gentle hover:text-stone-900">Why</Link>
                </li>
              </ul>
            </div>
            <div className="space-y-5">
              <h4 className="text-micro font-bold uppercase tracking-[0.3em] text-stone-900">Contact</h4>
              <ul className="space-y-3 text-xs uppercase tracking-widest text-stone-900/50">
                <li>
                  <Link href="/about" className="transition-colors ease-gentle hover:text-stone-900">About</Link>
                </li>
                <li>
                  <Link href="/home" className="transition-colors ease-gentle hover:text-stone-900">Log in</Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-6 border-t border-stone-200 pt-10 md:flex-row">
          <p className="text-micro uppercase tracking-[0.2em] text-stone-900/40">© 2026 Ancient Paths</p>
          <p className="text-micro uppercase tracking-[0.2em] text-stone-900/40">Crafted with reverence</p>
        </div>
      </div>
    </footer>
  );
}
