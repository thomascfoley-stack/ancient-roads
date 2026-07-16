import Link from 'next/link';
import Image from 'next/image';
import { WaitlistForm } from '@/components/waitlist-form';

// PUBLIC marketing landing, outside the SITE_PASSWORD wall (gate.ts isPublicPath).
// The signed-in app home lives at /home. Pre-launch the CTA is a waitlist, not live
// signup; "Log in" links into the gated app for the owner and existing testers.
export const metadata = {
  description:
    'Search the Scriptures and learn with the fathers of the faith. Read how Augustine, Calvin, Wesley and others wrestled with the same verses, then pray it through. Request early access.',
};

const BEATS = [
  {
    title: 'Walk the same paths',
    body: 'Sit with the verse in front of you and see how the church read it. On "In the beginning was the Word," hear Augustine, Chrysostom, and Calvin before you settle what it means.',
  },
  {
    title: 'Learn with those who came before',
    body: "Calvin, Wesley, Matthew Henry, the early fathers, each speaking to the passage you're in. Not one voice handed to you. Many, to weigh and pray over.",
  },
  {
    title: 'It will not tell you what to think',
    body: "Ancient Paths never says what a verse means. It leads you to those who wrestled it before you and laid the paths we walk, so your theology is your own, and it's solid.",
  },
];

export default function MarketingHome() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center overflow-hidden px-4 py-10 sm:px-6 sm:py-14">
      <Image
        src="/hero-road.jpg"
        alt="A stone path lined with olive trees, leading to an ancient chapel"
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div aria-hidden className="absolute inset-0 bg-stone-950/15 dark:bg-stone-950/55" />

      {/* Log in (existing access) */}
      <div className="relative z-10 flex w-full max-w-4xl justify-end">
        <Link
          href="/home"
          className="inline-flex min-h-[40px] items-center rounded-full bg-stone-50/85 px-4 text-sm font-semibold text-stone-700 shadow-paper backdrop-blur transition-colors hover:text-accent-800 dark:bg-stone-950/70 dark:text-stone-200 dark:hover:text-accent-300"
        >
          Log in
        </Link>
      </div>

      <div className="relative z-10 mt-6 w-full max-w-2xl rounded-3xl bg-stone-50/95 px-5 py-11 text-center shadow-deep sm:mt-10 sm:px-14 sm:py-14 dark:bg-stone-950/90">
        <p className="mx-auto max-w-xl font-display text-lg italic leading-relaxed text-stone-700 dark:text-stone-300">
          &ldquo;Ask for the ancient paths, where the good way is, and walk in it.&rdquo;
        </p>
        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.28em] text-stone-500 dark:text-stone-400">
          Jeremiah 6:16
        </p>

        <h1 className="mt-8 font-display text-5xl font-medium tracking-tight text-stone-900 sm:text-6xl dark:text-stone-100">
          Ancient Paths
        </h1>
        <div aria-hidden className="mx-auto mt-8 h-px w-16 bg-stone-400/60" />

        <p className="mx-auto mt-8 max-w-xl font-serif text-[17px] leading-relaxed text-stone-700 dark:text-stone-300">
          Search the Scriptures and learn with the fathers of the faith. When a verse is hard, you don&rsquo;t
          have to ask a chatbot what it means. Read how the men who gave their lives to Scripture wrestled with
          the same words. Then wrestle and pray over it yourself. The Holy Spirit is our helper.
        </p>

        <ul className="mx-auto mt-10 grid max-w-xl gap-4 text-left sm:mt-12">
          {BEATS.map((b) => (
            <li key={b.title} className="rounded-2xl bg-paper px-5 py-4 shadow-paper dark:bg-stone-900">
              <h2 className="font-scripture text-base font-semibold text-stone-800 dark:text-stone-100">
                {b.title}
              </h2>
              <p className="mt-1 font-serif text-[15px] leading-relaxed text-stone-600 dark:text-stone-300">
                {b.body}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-11 sm:mt-12">
          <p className="font-display text-lg text-stone-800 dark:text-stone-100">Request early access</p>
          <p className="mx-auto mt-1 mb-5 max-w-md font-serif text-[14px] text-stone-500 dark:text-stone-400">
            We&rsquo;re opening the doors slowly. Leave your email and we&rsquo;ll invite you in.
          </p>
          <WaitlistForm />
        </div>

        <p className="mt-12 font-display text-base italic text-stone-500 dark:text-stone-400">
          &ldquo;Study to shew thyself approved unto God.&rdquo;{' '}
          <span className="text-sm not-italic text-stone-500/90 dark:text-stone-500">2 Timothy 2:15</span>
        </p>
      </div>
    </main>
  );
}
