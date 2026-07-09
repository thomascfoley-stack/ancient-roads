import Image from 'next/image';
import Link from 'next/link';
import { AuthView } from '@neondatabase/auth/react';

export const dynamicParams = false;

export default async function AuthPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;
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
            href="/"
            className="font-display text-3xl font-medium tracking-tight text-stone-900 dark:text-stone-100"
          >
            Ancient Paths
          </Link>
          <p className="mt-1.5 font-serif text-sm italic text-stone-600 dark:text-stone-400">
            Ask for the ancient paths
          </p>
        </div>
        <AuthView path={path} />
      </div>
    </main>
  );
}
