import Link from 'next/link';
import Image from 'next/image';
import { WaitlistForm } from '@/components/waitlist-form';

// PUBLIC marketing landing, outside the SITE_PASSWORD wall (gate.ts isPublicPath).
// The signed-in app home lives at /home. Pre-launch the CTA is a waitlist, not live
// signup; "Log in" links into the gated app for the owner and existing testers.
//
// DESIGN: the photograph carries the page. It is the message (you are standing on the
// ancient path; it leads to the church door), so it fills the viewport uncovered. The
// chapel and the path's vanishing point stay clear; type sits low, on the stones,
// over a gradient scrim. Everything secondary lives below the fold on parchment.
export const metadata = {
  description:
    'Search the Scriptures and learn with the fathers of the faith. Read how Augustine, Calvin, Wesley and others wrestled with the same verses, then pray it through. Request early access.',
};

const BEATS = [
  {
    title: 'Walk the same paths',
    body: 'Sit with the verse in front of you and see how the church read it. On "In the beginning was the Word," hear what Augustine, Chrysostom, and Calvin have to say about it.',
  },
  {
    title: 'Learn with those who came before',
    body: "Calvin, Wesley, Matthew Henry, the early fathers, each speaking to the passage you're in. Not one voice handed to you. Many, to weigh and pray over.",
  },
  {
    title: 'Built to never interpret Scripture',
    body: "Ancient Paths is designed to never tell you what a verse means. It leads you to those who wrestled these words before you and laid the paths we walk, so your theology is your own, and it's solid.",
  },
  {
    title: 'AI is not the Holy Spirit',
    body: "People are starting to ask AI about the Bible, its meaning and how to apply it to their lives. We won't answer those questions on purpose. The Holy Spirit speaks to our hearts as we labor over the Word and wrestle our lives and wills into submission to it. Ancient Paths is designed to give you the best of today's technology to assist you as you labor and never replace the Helper. The teaching belongs to Him, as does the glory.",
  },
];

export default function MarketingHome() {
  return (
    <main>
      {/* The photograph, full viewport */}
      <section className="relative flex min-h-dvh flex-col overflow-hidden">
        <Image
          src="/hero-road.jpg"
          alt="A worn stone path lined with olive trees, leading up to an ancient chapel"
          fill
          priority
          sizes="100vw"
          // Keep the chapel + path in frame when portrait crops the sides (chapel sits
          // right of center, upper third).
          className="object-cover object-[62%_30%]"
        />
        {/* Scrims: a whisper at the top for the bar, weight at the bottom for the type.
            The midsection (path + chapel) stays untouched. */}
        <div aria-hidden className="absolute inset-x-0 top-0 h-32 bg-linear-to-b from-stone-950/60 to-transparent" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-[78%] bg-linear-to-t from-stone-950/95 via-stone-950/55 to-transparent" />

        {/* Top bar */}
        <header className="relative z-10 flex w-full items-center justify-between px-5 py-4 sm:px-8 sm:py-5">
          <div className="flex max-w-[240px] flex-col sm:max-w-none">
            <span className="font-scripture text-base font-medium tracking-wide text-stone-50/95">
              Ancient Paths
            </span>
            <span className="mt-0.5 font-serif text-[11px] leading-snug text-stone-200/85 [text-shadow:0_1px_8px_rgba(0,0,0,0.7)]">
              AI Designed To Lead You To The Holy Spirit, Not Be The Holy Spirit
            </span>
          </div>
          <Link
            href="/home"
            className="inline-flex min-h-[40px] items-center rounded-full border border-stone-50/30 px-4 text-sm font-semibold text-stone-50/95 backdrop-blur-sm transition-colors hover:border-stone-50/60 hover:text-white"
          >
            Log in
          </Link>
        </header>

        {/* The words, set on the stones */}
        <div className="relative z-10 mt-auto flex w-full flex-col items-center px-5 pb-12 pt-24 text-center sm:pb-16">
          <p className="max-w-xl font-display text-base italic leading-relaxed text-stone-100/95 [text-shadow:0_1px_12px_rgba(0,0,0,0.6)] sm:text-lg">
            &ldquo;Ask for the ancient paths, where the good way is, and walk in it.&rdquo;
          </p>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-stone-200/90 [text-shadow:0_1px_10px_rgba(0,0,0,0.7)]">
            Jeremiah 6:16
          </p>

          <h1 className="mt-6 font-display text-5xl font-medium tracking-tight text-stone-50 [text-shadow:0_2px_24px_rgba(0,0,0,0.45)] sm:text-7xl">
            Ancient Paths
          </h1>

          <p className="mt-4 max-w-md font-serif text-[17px] leading-relaxed text-stone-100/95 sm:max-w-lg">
            Search the Scriptures and learn with the fathers of the faith.
          </p>

          <div className="mt-8 w-full max-w-md">
            <WaitlistForm />
            <p className="mt-3 font-serif text-[13px] text-stone-200/75">
              We&rsquo;re opening the doors slowly. Leave your email and we&rsquo;ll invite you in.
            </p>
          </div>
        </div>
      </section>

      {/* Below the fold: parchment */}
      <section className="bg-stone-50 px-5 py-16 sm:py-20 dark:bg-stone-950">
        <div className="mx-auto max-w-2xl">
          <p className="text-center font-serif text-[17px] leading-relaxed text-stone-700 dark:text-stone-300">
            When a verse is hard, you don&rsquo;t have to ask a chatbot what it means. Read how the men
            who gave their lives to Scripture wrestled with the same words. Then wrestle and pray over
            it yourself. The Holy Spirit is our helper, and He will teach you all things.{' '}
            <span className="whitespace-nowrap text-[15px] text-stone-500 dark:text-stone-400">John 14:26</span>
          </p>

          <div aria-hidden className="mx-auto mt-12 h-px w-16 bg-stone-400/60" />

          <ul className="mt-12 grid gap-4">
            {BEATS.map((b) => (
              <li key={b.title} className="rounded-2xl bg-paper px-6 py-5 shadow-paper dark:bg-stone-900">
                <h2 className="font-scripture text-base font-semibold text-stone-800 dark:text-stone-100">
                  {b.title}
                </h2>
                <p className="mt-1.5 font-serif text-[15px] leading-relaxed text-stone-600 dark:text-stone-300">
                  {b.body}
                </p>
              </li>
            ))}
          </ul>

          <p className="mt-16 text-center font-display text-base italic text-stone-500 dark:text-stone-400">
            &ldquo;Study to shew thyself approved unto God.&rdquo;{' '}
            <span className="text-sm not-italic text-stone-500/90 dark:text-stone-500">2 Timothy 2:15</span>
          </p>
        </div>
      </section>
    </main>
  );
}
