import Link from 'next/link';

// PUBLIC about page, outside the SITE_PASSWORD wall (gate.ts isPublicPath,
// app-shell.tsx CHROME_FREE). Kept short; the marketing landing is `/`.
export const metadata = {
  title: 'About',
  description:
    'Ancient Paths helps you search the Scriptures and learn with the fathers of the faith. It does not interpret for you. It shows you how the church has read the passage for two thousand years.',
};

const PRINCIPLES = [
  {
    h: 'Learn with those who came before',
    p: 'The men who laid the foundations of the faith gave their lives to these Scriptures. Read Augustine, Chrysostom, Calvin, Wesley, Matthew Henry and others on the passage in front of you, and weigh them together.',
  },
  {
    h: 'Built to never interpret Scripture',
    p: 'Ancient Paths is designed to never tell you what a verse means. It points you to those who wrestled the same words before you, and to prayer. The Holy Spirit is our helper, and He will teach you all things (John 14:26).',
  },
  {
    h: 'AI is not the Holy Spirit',
    // Curly apostrophes, matching the &rsquo; entities elsewhere on this page and the
    // identical paragraph on the landing page. This copy is duplicated verbatim in
    // app/page.tsx BEATS; the design pass fixed it there and missed it here, so the two
    // public pages rendered the same sentence with different punctuation.
    p: 'People are starting to ask AI about the Bible, its meaning and how to apply it to their lives. We won’t answer those questions on purpose. The Holy Spirit speaks to our hearts as we labor over the Word and wrestle our lives and wills into submission to it. Ancient Paths is designed to give you the best of today’s technology to assist you as you labor and never replace the Helper. The teaching belongs to Him, as does the glory.',
  },
];

export default function About() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 py-14 sm:px-8 sm:py-20">
      <p className="font-display text-lg italic leading-relaxed text-stone-600 dark:text-stone-400">
        &ldquo;Ask for the ancient paths, where the good way is, and walk in it.&rdquo;
        <span className="ml-2 text-sm not-italic uppercase tracking-[0.2em] text-stone-500">Jeremiah 6:16</span>
      </p>
      <h1 className="mt-8 font-display text-4xl font-medium tracking-tight text-stone-900 sm:text-5xl dark:text-stone-100">
        About Ancient Paths
      </h1>
      <p className="mt-6 font-serif text-lg leading-relaxed text-stone-700 dark:text-stone-300">
        Ancient Paths helps you search the Scriptures and learn with the fathers of the faith. When you are
        wrestling with a verse, it does not hand you an answer. It shows you how the church has read that
        passage for two thousand years, so you can wrestle and pray it through yourself.
      </p>

      <div className="mt-12 grid gap-6">
        {PRINCIPLES.map((x) => (
          <section key={x.h}>
            <h2 className="font-scripture text-lg font-semibold text-stone-800 dark:text-stone-100">{x.h}</h2>
            <p className="mt-1.5 font-serif text-base leading-relaxed text-stone-600 dark:text-stone-300">{x.p}</p>
          </section>
        ))}
      </div>

      <div className="mt-14 flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex min-h-[48px] items-center rounded-lg bg-accent-700 px-6 text-base font-semibold text-stone-50 shadow-float transition-colors hover:bg-accent-800 dark:bg-accent-500 dark:hover:bg-accent-400"
        >
          Request early access
        </Link>
        <Link
          href="/home"
          className="inline-flex min-h-[48px] items-center rounded-lg bg-paper px-6 text-base font-semibold text-stone-700 shadow-paper transition-colors hover:text-accent-800 dark:bg-stone-800 dark:text-stone-200"
        >
          Log in
        </Link>
      </div>
    </main>
  );
}
