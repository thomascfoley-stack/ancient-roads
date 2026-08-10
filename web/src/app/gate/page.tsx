import Link from 'next/link';
import { MarketingGround, SHEET } from '@/components/marketing/ground';

export const metadata = { title: 'Private preview' };

// Password prompt for the pre-launch gate (see middleware.ts). 2026-08-08 "photo as
// ground" pass: one frosted card centred on the photograph — the static-site
// exploration's "card centred in the corridor of light", on the purchased image.
// Still deliberately shallow: no app chrome and no app structure leak past the gate —
// the only links out are the public marketing tier.
export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/home';
  return (
    <main className="relative isolate flex min-h-dvh items-center justify-center px-5 py-16">
      <MarketingGround veil="light" />

      <div className={`${SHEET} relative z-10 w-full max-w-[400px] px-8 py-12 text-center sm:px-10`}>
        <Link href="/" className="inline-flex min-h-[44px] items-center font-display text-2xl tracking-[-0.01em] text-stone-500">
          Ancient Paths
        </Link>
        <h1 className="mt-8 font-display text-4xl text-stone-900 sm:text-5xl">Walk in.</h1>
        <p className="mt-4 font-serif text-lg italic leading-relaxed text-stone-500">
          A private preview. Enter the password to walk in.
        </p>

        <form method="POST" action="/api/gate" className="mt-10 space-y-6 text-left">
          <input type="hidden" name="next" value={dest} />
          <div>
            <label
              htmlFor="gate-password"
              className="mb-2 block font-sans text-xs font-semibold uppercase tracking-[0.08em] text-stone-500"
            >
              Password
            </label>
            <input
              id="gate-password"
              type="password"
              name="password"
              autoFocus
              placeholder="••••••••"
              className="min-h-[52px] w-full rounded-full border border-stone-300/80 bg-stone-50/70 px-6 font-sans text-sm text-stone-900 outline-none transition-[border-color,box-shadow] duration-200 ease-gentle placeholder:text-stone-400 focus:border-accent-600 focus:ring-2 focus:ring-accent-600/20"
            />
            {error && (
              <p className="mt-3 font-serif text-sm italic text-accent-700">
                That wasn&rsquo;t it. Try again.
              </p>
            )}
          </div>
          <button
            type="submit"
            className="min-h-[52px] w-full rounded-full bg-stone-900 font-sans text-sm font-semibold tracking-[0.02em] text-stone-50 shadow-[0_1px_2px_rgba(43,33,25,0.05),0_8px_24px_-8px_rgba(43,33,25,0.10),0_32px_80px_-24px_rgba(43,33,25,0.16)] transition-[background-color,transform] duration-200 ease-gentle hover:bg-stone-800 active:scale-[0.99]"
          >
            Enter
          </button>
        </form>

        <p className="mt-8 text-micro uppercase tracking-[0.2em] text-stone-500">
          No password?{' '}
          <Link
            href="/#doors"
            className="inline-flex min-h-[44px] items-center font-semibold text-accent-600 transition-colors duration-200 ease-gentle hover:text-accent-700 hover:underline"
          >
            Request access
          </Link>
        </p>

        <p className="mt-10 border-t border-stone-200/70 pt-8 font-serif text-base italic leading-relaxed text-stone-500">
          &ldquo;Thy word is a lamp unto my feet, and a light unto my path.&rdquo;
        </p>
        <p className="mt-2 text-micro uppercase tracking-[0.2em] text-stone-400">Psalm 119:105</p>
      </div>
    </main>
  );
}
