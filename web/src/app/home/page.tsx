import Link from 'next/link';
import Image from 'next/image';

// The authenticated app home (behind the SITE_PASSWORD gate + login). The public
// marketing landing lives at `/` (src/app/page.tsx); this is where signed-in users
// land after the gate, and where the in-app "Home" / wordmark links point.
const QUICK_STARTS = [
  { label: 'John 1', href: '/read/jhn/1' },
  { label: 'Genesis 1', href: '/read/gen/1' },
  { label: 'Romans 8', href: '/read/rom/8' },
  { label: 'Psalm 23', href: '/read/psa/23' },
  { label: 'Matthew 5', href: '/read/mat/5' },
  { label: 'Isaiah 53', href: '/read/isa/53' },
];

export default function Home() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10 sm:px-6 sm:py-12">
      <Image
        src="/hero-road.jpg"
        alt="A stone path lined with olive trees, leading to an ancient chapel"
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      {/* Gentle seat for the panel; the photograph stays vivid */}
      <div
        aria-hidden
        className="absolute inset-0 bg-stone-950/10 dark:bg-stone-950/50"
      />

      <div className="relative z-10 w-full max-w-2xl rounded-3xl bg-stone-50/95 px-5 py-10 text-center shadow-deep sm:px-14 sm:py-12 dark:bg-stone-950/90">
        <p className="mx-auto max-w-xl font-display text-lg italic leading-relaxed text-stone-700 dark:text-stone-300">
          &ldquo;Ask for the ancient paths, where the good way is; and walk in
          it.&rdquo;
        </p>
        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.28em] text-stone-500 dark:text-stone-400">
          Jeremiah 6:16
        </p>
        <h1 className="mt-8 font-display text-5xl font-medium tracking-tight text-stone-900 sm:text-6xl dark:text-stone-100">
          Ancient Paths
        </h1>
        <div aria-hidden className="mx-auto mt-8 h-px w-16 bg-stone-400/60" />
        <p className="mx-auto mt-8 max-w-xl font-serif text-[17px] leading-relaxed text-stone-700 dark:text-stone-300">
          Study the Word alongside the theologians and church fathers of the
          past two thousand years. Ancient Paths is built to lead you to the
          Holy Spirit, not to be the Holy Spirit. We will never interpret
          Scripture; we point you to what the faithful before you have said of
          it. Walk these ancient paths, labor as they labored, and unearth the
          treasures hidden in God&rsquo;s Word.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-2.5">
          {QUICK_STARTS.map((qs) => (
            <Link
              key={qs.href}
              href={qs.href}
              className="inline-flex min-h-[44px] items-center rounded-full bg-paper px-4 text-sm font-semibold text-stone-800 shadow-paper transition-all duration-200 ease-gentle hover:text-accent-800 hover:shadow-float active:bg-stone-100 dark:bg-stone-800 dark:text-stone-200 dark:hover:text-accent-300"
            >
              {qs.label}
            </Link>
          ))}
        </div>

        <p className="mt-12 font-display text-base italic text-stone-500 dark:text-stone-400">
          &ldquo;Study to shew thyself approved unto God.&rdquo;{' '}
          <span className="text-sm not-italic text-stone-500/90 dark:text-stone-500">
            2 Timothy 2:15
          </span>
        </p>
      </div>
    </main>
  );
}
