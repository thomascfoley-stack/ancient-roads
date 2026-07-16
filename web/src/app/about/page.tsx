import Link from 'next/link';

// PUBLIC about page — served OUTSIDE the SITE_PASSWORD wall (gate.ts isPublicPath,
// app-shell.tsx CHROME_FREE). Kept minimal; the marketing landing is `/`.
export const metadata = {
  title: 'About',
  description:
    'Ancient Paths is a concordance, not a commentator — it reports what the faithful of the past two thousand years have said of Scripture, quoted and attributed, and never interprets in its own voice.',
};

const PRINCIPLES = [
  {
    h: 'A concordance, not a commentator',
    p: 'The guarantee is architectural, not a promise. Retrieval over a licensed corpus feeds a strict output contract, and a verifier rejects any answer that interprets, fabricates, or fails to attribute — before it is ever shown to you.',
  },
  {
    h: 'Two thousand years of voices',
    p: 'From the early fathers through the Reformers — Chrysostom, Augustine, Calvin, Matthew Henry and more — each grounded in the passage in front of you, so you weigh them together, not one editor’s verdict.',
  },
  {
    h: 'Sourced and licensed',
    p: 'Only public-domain and permissively licensed works, each carrying its provenance and license. What you read is what they wrote — verified before it reaches you, never scraped, never fabricated.',
  },
];

export default function About() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 py-14 sm:px-8 sm:py-20">
      <p className="font-display text-lg italic leading-relaxed text-stone-600 dark:text-stone-400">
        &ldquo;Ask for the ancient paths, where the good way is; and walk in it.&rdquo;
        <span className="ml-2 text-sm not-italic uppercase tracking-[0.2em] text-stone-500">Jeremiah 6:16</span>
      </p>
      <h1 className="mt-8 font-display text-4xl font-medium tracking-tight text-stone-900 sm:text-5xl dark:text-stone-100">
        About Ancient Paths
      </h1>
      <p className="mt-6 font-serif text-[17px] leading-relaxed text-stone-700 dark:text-stone-300">
        Ancient Paths is built to lead you to the Holy Spirit, not to be the Holy Spirit. It will never
        interpret Scripture; it points you to what the faithful before you have said of it — quoted, attributed,
        and verified.
      </p>

      <div className="mt-12 grid gap-6">
        {PRINCIPLES.map((x) => (
          <section key={x.h}>
            <h2 className="font-scripture text-lg font-semibold text-stone-800 dark:text-stone-100">{x.h}</h2>
            <p className="mt-1.5 font-serif text-[15px] leading-relaxed text-stone-600 dark:text-stone-300">{x.p}</p>
          </section>
        ))}
      </div>

      <div className="mt-14 flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex min-h-[48px] items-center rounded-full bg-accent-700 px-6 text-[15px] font-semibold text-stone-50 shadow-float transition-colors hover:bg-accent-800 dark:bg-accent-600 dark:hover:bg-accent-500"
        >
          Request early access
        </Link>
        <Link
          href="/home"
          className="inline-flex min-h-[48px] items-center rounded-full bg-paper px-6 text-[15px] font-semibold text-stone-700 shadow-paper transition-colors hover:text-accent-800 dark:bg-stone-800 dark:text-stone-200"
        >
          Log in
        </Link>
      </div>
    </main>
  );
}
