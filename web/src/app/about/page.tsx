import Link from 'next/link';
import { MarketingFooter } from '@/components/marketing/footer';

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
    <>
      <main id="main" className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 py-14 sm:px-8 sm:py-20">
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
        {/* PRD §6 buttons: primary = 1px ink hairline that fills ink on hover;
            secondary = same shape in ink-wash gray. No shadows, no radius. */}
        <Link
          href="/"
          className="inline-flex min-h-[48px] items-center border border-stone-900 px-6 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50 dark:border-stone-200 dark:text-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-900"
        >
          Request early access
        </Link>
        {/* /home is where a reader LANDS after signing in, not where they sign in. On the one
            public page a stranger reaches, this button was the front door and it opened onto a
            gated route. /auth/sign-in is the real form, and the only sign-in route in the app. */}
        <Link
          href="/auth/sign-in"
          className="inline-flex min-h-[48px] items-center border border-stone-500 px-6 font-sans text-sm font-semibold tracking-[0.02em] text-stone-600 hover:bg-stone-500 hover:text-stone-50 dark:border-stone-400 dark:text-stone-300 dark:hover:bg-stone-400 dark:hover:text-stone-950"
        >
          Log in
        </Link>
      </div>
      </main>
      {/* DeepSeek-F03 / K-3: this page was the one public marketing surface with no footer, so it
          was also the one with no way back to Features/Why and no legal column to add copy to when
          the owner's Privacy/Terms text lands. */}
      <MarketingFooter />
    </>
  );
}
