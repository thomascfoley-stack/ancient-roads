import Link from 'next/link';

// The app had no not-found.tsx anywhere, while /library/[catalog] calls notFound()
// for an unknown catalog. That reader got Next's stock 404: black on white, system
// font, no shell, no way back into the library.

export const metadata = { title: 'Not found' };

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-xl flex-col items-center justify-center px-5 text-center">
      <p className="text-micro font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">404</p>
      <h1 className="mt-3 font-display text-3xl tracking-tight text-stone-900 dark:text-stone-100">
        That page isn&rsquo;t here
      </h1>
      <p className="mt-3 max-w-[62ch] font-serif text-lg leading-relaxed text-stone-500 dark:text-stone-400">
        The link may be mistaken, or the work may not be published yet. The Scriptures and
        the library are both still where you left them.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        {/* PRD §6 buttons: hairline-bordered, square, no shadow. Primary is the 1px ink
            hairline that fills on hover; secondary steps down to ink-wash. */}
        <Link
          href="/read/jhn/1"
          className="inline-flex min-h-[44px] items-center border border-stone-900 bg-transparent px-6 text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-200 dark:hover:text-stone-900"
        >
          Open the Bible
        </Link>
        <Link
          href="/library"
          className="inline-flex min-h-[44px] items-center border border-stone-500 bg-transparent px-6 text-sm font-semibold tracking-[0.02em] text-stone-600 hover:bg-stone-500 hover:text-stone-50 dark:border-stone-400 dark:text-stone-300 dark:hover:bg-stone-400 dark:hover:text-stone-950"
        >
          Browse the library
        </Link>
      </div>
    </div>
  );
}
