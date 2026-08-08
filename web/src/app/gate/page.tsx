import Image from 'next/image';
import Link from 'next/link';

export const metadata = { title: 'Private preview' };

// Password prompt for the pre-launch gate (see middleware.ts). Restyled 2026-08-08 into
// the marketing redesign's split layout (form beside the dusk forest, Psalm 119:105).
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
    <main className="flex min-h-dvh bg-stone-100">
      {/* Form column */}
      <div className="flex w-full items-center justify-center px-5 py-16 lg:w-2/3">
        <div className="w-full max-w-[380px] text-center">
          <Link href="/" className="font-display text-2xl tracking-tight text-stone-900/40">
            Ancient Paths
          </Link>
          <h1 className="mt-10 font-display text-4xl text-stone-900 sm:text-5xl">Walk in.</h1>
          <p className="mt-4 font-serif text-lg italic leading-relaxed text-stone-900/60">
            A private preview. Enter the password to walk in.
          </p>

          <form method="POST" action="/api/gate" className="mt-10 space-y-7 text-left">
            <input type="hidden" name="next" value={dest} />
            <div>
              <label
                htmlFor="gate-password"
                className="mb-3 block text-micro font-bold uppercase tracking-[0.3em] text-stone-900"
              >
                Password
              </label>
              <input
                id="gate-password"
                type="password"
                name="password"
                autoFocus
                placeholder="••••••••"
                className="min-h-[52px] w-full rounded-xl border border-stone-200 bg-paper px-5 font-serif text-lg text-stone-900 shadow-paper outline-none transition-colors ease-gentle placeholder:text-stone-400 focus:border-sage-500"
              />
              {error && (
                <p className="mt-3 font-serif text-sm italic text-accent-700">
                  That wasn&rsquo;t it. Try again.
                </p>
              )}
            </div>
            <button
              type="submit"
              className="min-h-[52px] w-full rounded-full bg-accent-600 text-micro font-semibold uppercase tracking-[0.2em] text-stone-50 shadow-float transition-colors duration-200 ease-gentle hover:bg-accent-700 active:bg-accent-800"
            >
              Enter
            </button>
          </form>

          <p className="mt-10 text-micro uppercase tracking-[0.2em] text-stone-900/40">
            No password?{' '}
            <Link href="/#doors" className="font-bold text-sage-600 transition-colors ease-gentle hover:text-stone-900">
              Request access
            </Link>
          </p>
        </div>
      </div>

      {/* Photo column */}
      <div className="relative hidden overflow-hidden lg:block lg:w-1/3">
        <Image
          src="/marketing/forest-dusk-1.jpg"
          alt=""
          aria-hidden
          fill
          sizes="(min-width: 1024px) 33vw, 0vw"
          className="object-cover brightness-[0.55]"
        />
        <div aria-hidden className="absolute inset-0 bg-stone-950/30" />
        <div className="absolute inset-x-10 bottom-16">
          <p className="text-center font-serif text-xl italic leading-relaxed text-stone-50/85 sm:text-2xl">
            &ldquo;Thy word is a lamp unto my feet, and a light unto my path.&rdquo;
          </p>
          <p className="mt-5 text-center text-micro uppercase tracking-[0.2em] text-stone-50/40">
            Psalm 119:105
          </p>
        </div>
      </div>
    </main>
  );
}
