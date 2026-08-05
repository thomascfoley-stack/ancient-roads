import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AuthForm } from '@/components/auth-forms';
import { AUTH_PATHS, isAuthPath } from '@/lib/auth/paths';
import { currentUser } from '@/lib/session';

export const dynamicParams = false;

// Was absent while `dynamicParams = false` was set. The prefab shipped its own route table; ours
// has to declare one, and without it every /auth/* URL 404s.
export function generateStaticParams() {
  return AUTH_PATHS.map((path) => ({ path }));
}

// Paths that only make sense to someone who is NOT signed in. A signed-in reader who reached
// /auth/sign-in was served a full login form with "Sign out" visible in the same viewport (A7b
// walk, 2026-08-02) — an invitation to do the thing they had already done, next to the control
// that undoes it. Sign-OUT and the password-reset flows are deliberately absent from this list:
// those are reachable and useful while signed in.
const SIGNED_OUT_ONLY = new Set(['sign-in', 'sign-up']);

export default async function AuthPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;
  if (!isAuthPath(path)) notFound();
  // Redirect rather than render an alternative: a signed-in reader on a sign-in URL almost always
  // arrived by a stale link or the back button, and the useful outcome is to be where they were
  // going. `/home` is the signed-in landing, not `/`, which is the marketing page.
  if (SIGNED_OUT_ONLY.has(path) && (await currentUser())) redirect('/home');

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-10 sm:px-6 sm:py-12">
      <Image
        src="/hero-road.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-stone-950/10 dark:bg-stone-950/50"
      />

      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl shadow-deep">
        <div className="bg-paper px-6 pb-2 pt-8 text-center dark:bg-stone-900">
          <Link
            href="/home"
            className="font-display text-3xl font-medium tracking-tight text-stone-900 dark:text-stone-100"
          >
            Ancient Paths
          </Link>
          <p className="mt-1.5 font-serif text-sm italic text-stone-600 dark:text-stone-400">
            Ask for the ancient paths
          </p>
        </div>
        {/* useSearchParams (the reset token) requires a Suspense boundary to prerender. */}
        <Suspense fallback={<div className="bg-paper px-6 pb-8 pt-4 dark:bg-stone-900" />}>
          <AuthForm path={path} />
        </Suspense>
      </div>
    </main>
  );
}
