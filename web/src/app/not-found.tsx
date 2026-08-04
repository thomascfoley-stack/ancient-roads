import Link from 'next/link';

// The app had no not-found.tsx anywhere, while /library/[catalog] calls notFound()
// for an unknown catalog. That reader got Next's stock 404: black on white, system
// font, no shell, no way back into the library.

export const metadata = { title: 'Not found' };

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-xl flex-col items-center justify-center px-5 text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">404</p>
      <h1 className="mt-3 font-display text-3xl tracking-tight text-stone-900 dark:text-stone-100">
        That page isn&rsquo;t here
      </h1>
      <p className="mt-3 font-serif text-base leading-relaxed text-stone-600 dark:text-stone-400">
        The link may be mistaken, or the work may not be published yet. The Scriptures and
        the library are both still where you left them.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/read/jhn/1"
          className="inline-flex min-h-[44px] items-center rounded-lg bg-accent-700 px-5 text-sm font-semibold text-stone-50 transition-colors ease-gentle hover:bg-accent-800 dark:bg-accent-500 dark:hover:bg-accent-400"
        >
          Open the Bible
        </Link>
        <Link
          href="/library"
          className="inline-flex min-h-[44px] items-center rounded-lg bg-paper px-5 text-sm font-semibold text-stone-700 shadow-paper transition-shadow ease-gentle hover:shadow-float dark:bg-stone-800 dark:text-stone-200 dark:shadow-none"
        >
          Browse the library
        </Link>
      </div>
    </div>
  );
}
