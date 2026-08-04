export const metadata = { title: 'Private preview' };

// Password prompt for the pre-launch gate (see middleware.ts). Kept
// deliberately plain: no app chrome leaks past the gate.
export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/home';
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-xs rounded-2xl bg-paper px-6 py-8 text-center shadow-deep dark:bg-stone-900">
        <h1 className="font-display text-2xl font-medium tracking-tight text-stone-900 dark:text-stone-100">
          Ancient Paths
        </h1>
        <p className="mt-2 font-serif text-sm italic text-stone-600 dark:text-stone-400">
          A private preview — enter the password to walk in.
        </p>
        <form method="POST" action="/api/gate" className="mt-6">
          <input type="hidden" name="next" value={dest} />
          <input
            type="password"
            name="password"
            autoFocus
            placeholder="Password"
            className="min-h-[44px] w-full rounded-lg bg-stone-100 px-3 text-base text-stone-900 outline-none placeholder:text-stone-400 sm:text-sm dark:bg-stone-800 dark:text-stone-100"
          />
          {error && (
            <p className="mt-2 text-xs text-accent-700 dark:text-accent-300">
              That wasn&rsquo;t it — try again.
            </p>
          )}
          <button
            type="submit"
            className="mt-4 min-h-[44px] w-full rounded-lg bg-accent-700 px-4 text-sm font-semibold text-stone-50 transition-colors duration-200 ease-gentle hover:bg-accent-800 active:bg-accent-900 dark:bg-accent-500 dark:hover:bg-accent-400"
          >
            Enter
          </button>
        </form>
      </div>
    </main>
  );
}
