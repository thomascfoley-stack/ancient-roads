import Link from 'next/link';

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
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6">
      <div className="text-center">
        <h1 className="font-scripture text-5xl font-medium tracking-tight text-stone-800 sm:text-6xl">
          What others<br />have said
        </h1>
        <p className="mx-auto mt-6 max-w-sm text-base leading-relaxed text-stone-500">
          Read what theologians across 2,000 years have written about every
          verse. Tap any verse to see the commentary. We never interpret
          scripture — we show you what others have said, and you pray on it.
        </p>
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
        {QUICK_STARTS.map((qs) => (
          <Link
            key={qs.href}
            href={qs.href}
            className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition-all hover:border-stone-300 hover:bg-stone-50 hover:shadow"
          >
            {qs.label}
          </Link>
        ))}
      </div>

      <p className="mt-16 font-scripture text-sm italic text-stone-400">
        &ldquo;Study to shew thyself approved unto God&rdquo; — 2 Timothy 2:15
      </p>
    </main>
  );
}
