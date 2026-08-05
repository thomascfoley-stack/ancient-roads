'use client';

import { useEffect } from 'react';
import Link from 'next/link';

// There was no error boundary anywhere in the app. Every server component that can throw
// (the library hub's DB queries, the catalog queries, the session lookup) replaced the
// whole app with Next's stock error screen on failure: no shell, no navigation, no way
// back. This keeps the reader inside the app and gives them a retry.
//
// The message is deliberately not the exception text. `reset()` re-runs the failed render,
// which is the right first move for a transient DB or network fault.

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Server-side causes are already logged where they happened; this catches the client
    // half, which otherwise went nowhere. No silent failures (CLAUDE.md).
    console.error('[app] render failed', error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-xl flex-col items-center justify-center px-5 text-center">
      <h1 className="font-display text-3xl tracking-tight text-stone-900 dark:text-stone-100">
        Something went wrong
      </h1>
      <p className="mt-3 font-serif text-base leading-relaxed text-stone-600 dark:text-stone-400">
        This page failed to load. Nothing you have saved is affected.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-[44px] items-center rounded-lg bg-accent-700 px-5 text-sm font-semibold text-stone-50 transition-colors ease-gentle hover:bg-accent-800 dark:bg-accent-500 dark:hover:bg-accent-400"
        >
          Try again
        </button>
        <Link
          href="/home"
          className="inline-flex min-h-[44px] items-center rounded-lg bg-paper px-5 text-sm font-semibold text-stone-700 shadow-paper transition-shadow ease-gentle hover:shadow-float dark:bg-stone-800 dark:text-stone-200 dark:shadow-none"
        >
          Go home
        </Link>
      </div>
      {error.digest && (
        <p className="mt-6 font-mono text-xs text-stone-500 dark:text-stone-400">Reference {error.digest}</p>
      )}
    </div>
  );
}
