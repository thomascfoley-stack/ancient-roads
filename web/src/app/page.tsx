import Image from 'next/image';
import { WaitlistForm } from '@/components/waitlist-form';
import { MarketingNav } from '@/components/marketing/nav';
import { MarketingFooter } from '@/components/marketing/footer';

// PUBLIC marketing landing, outside the SITE_PASSWORD wall (gate.ts isPublicPath).
// The signed-in app home lives at /home. Pre-launch the CTA is a waitlist, not live
// signup; "Log in" links into the gated app for the owner and existing testers.
//
// REDESIGNED 2026-08-08 from the owner's UX Pilot mockup (see docs/DECISIONS.md ADR
// superseding S1's "do not rewrite the hero"): cream editorial-magazine layout, sage
// accent, EB Garamond display. Light-only by design; the reader's theme applies to the
// app, not the brand surface.
//
// EVERY FEATURE CLAIM BELOW WAS TRUTH-PASSED against the shipped code and served corpus
// on 2026-08-08. In particular: "ten voices" on John 1:1 is the measured post-filter
// count (exactly 10 distinct served authors); the Chrysostom pull quote is VERBATIM from
// his Homily IV on John 1:1 as served by this corpus (replacing the mockup's invented
// paraphrase); and the four "Answered by" rows name only served works, mirroring the
// real /ask lanes. Do not swap any of these for nicer-sounding examples without
// re-verifying — a fabricated quote here would break the product's own guarantee on its
// front door.
export const metadata = {
  description:
    'Ask any question of Scripture. Ancient Paths answers only in the words of the Church, always cited, never its own. Commentaries, sermons, hymns and creeds from two thousand years. Request early access.',
};

// The four register rows in the ANSWERED BY card. Register labels match the real /ask
// lanes (ask-client.tsx LANE_OPTIONS + the always-on commentary answer); every work
// named is in the served lists (teacher/routing.ts) and, for Calvin on Romans 6:4, the
// static reader data. The Nicene phrase is the creed's own wording, served via Schaff's
// Creeds of Christendom in the theology lane.
const ANSWERED_BY = [
  { register: 'Commentary', line: 'John Calvin on Romans 6:4' },
  { register: 'Sermon', line: 'Spurgeon, Metropolitan Tabernacle Pulpit' },
  { register: 'Hymn', line: 'Watts, Hymns and Spiritual Songs' },
  { register: 'Creed', line: 'Nicene, rose again the third day' },
];

// The verse panel demo: the REAL served voices on John 1:1 (10 distinct authors through
// isPublishedCommentaryEntry; the five named here plus Adam Clarke, Barnes, Aquinas'
// Catena, Hodge and Watts behind "+5 more").
const VOICES = ['Augustine', 'Chrysostom', 'Calvin', 'Wesley', 'Matthew Henry'];

const STEPS = [
  'You ask.',
  'Two thousand years are searched.',
  'They answer, in their own words, cited.',
];

export default function MarketingHome() {
  return (
    <main className="bg-stone-100">
      {/* 1 — HERO. The misty forest carries the section; type sits on a left-weighted scrim. */}
      <section className="relative flex min-h-dvh flex-col overflow-hidden">
        <Image
          src="/marketing/hero-forest.jpg"
          alt="Misty pine forest at dawn, sunlight breaking through the trees"
          fill
          priority
          sizes="100vw"
          quality={90}
          className="object-cover object-center"
        />
        <div aria-hidden className="absolute inset-0 bg-linear-to-r from-stone-950/55 via-stone-950/25 to-transparent" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-stone-950/40 to-transparent" />

        <MarketingNav active="home" onDark />

        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 items-center px-5 pb-16 pt-28 sm:px-8">
          <div className="max-w-3xl">
            <p className="mb-6 text-micro font-bold uppercase tracking-[0.3em] text-stone-50/90 sm:mb-8">
              For those who preach and study the Word
            </p>
            <h1 className="font-display text-5xl leading-[1.02] text-stone-50 sm:text-6xl lg:text-7xl xl:text-[80px] xl:leading-[0.95]">
              You aren&rsquo;t the first
              <br />
              <span className="font-normal italic">to study or preach this text.</span>
            </h1>
            <p className="mt-6 max-w-lg font-serif text-lg leading-relaxed text-stone-50/90 sm:mt-8 sm:text-xl">
              Ask any question of Scripture. Ancient Paths answers only in the words of the Church,
              always cited, never its own.
            </p>
            <div className="mt-8 sm:mt-10">
              <a
                href="#ask"
                className="inline-flex min-h-[52px] items-center rounded-full bg-sage-500 px-9 text-micro font-semibold uppercase tracking-[0.2em] text-stone-50 shadow-float transition-colors duration-300 ease-gentle hover:bg-stone-50 hover:text-stone-900"
              >
                See it answered
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 2 — THE ASK MOMENT */}
      <section id="ask" className="px-5 py-20 sm:px-8 sm:py-32">
        <div className="mx-auto max-w-7xl">
          <div className="mb-14 text-center sm:mb-20">
            <p className="mb-5 text-micro font-bold uppercase tracking-[0.3em] text-sage-600">Ask the tradition</p>
            <h2 className="font-display text-4xl leading-tight text-stone-900 sm:text-6xl lg:text-7xl">
              Ask, and be answered by the Church.
            </h2>
          </div>

          <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
            {/* Your question — the reader's own study; the product never reads or writes it. */}
            <div className="flex flex-col rounded-2xl border border-stone-200 bg-paper p-8 shadow-card sm:p-12">
              <div className="mb-auto">
                <p className="mb-5 text-micro font-bold uppercase tracking-[0.3em] text-stone-500">Your study</p>
                <h3 className="mb-5 font-display text-2xl text-stone-900 sm:text-3xl">Easter Sunrise Sermon</h3>
                <div className="space-y-4 font-serif text-base text-stone-900/60 sm:text-lg">
                  <p>The stone was not rolled away to let Jesus out, but to let the witnesses in.</p>
                  <p>As we gather this morning, we recall that our hope is built on a physical reality.</p>
                  <p>If Christ be not raised, our faith is in vain.</p>
                </div>
              </div>
              <div className="mt-8 flex items-center gap-4 rounded-full border border-stone-200 bg-stone-100 px-6 py-4">
                <svg aria-hidden viewBox="0 0 8 12" className="h-3 w-2 shrink-0 fill-sage-500">
                  <path d="M0 0l8 6-8 6z" />
                </svg>
                <span className="font-serif text-sm italic text-stone-900 sm:text-base">
                  What did the early Church say about the resurrection body?
                </span>
              </div>
            </div>

            {/* Answered by — the four real registers, real served works. */}
            <div className="flex flex-col rounded-2xl border border-stone-200 bg-paper p-8 shadow-card sm:p-12">
              <div>
                <p className="mb-7 text-micro font-bold uppercase tracking-[0.3em] text-stone-500">Answered by</p>
                <div className="space-y-5">
                  {ANSWERED_BY.map((row, i) => (
                    <div
                      key={row.register}
                      className={i < ANSWERED_BY.length - 1 ? 'border-b border-stone-200/60 pb-5' : 'pb-1'}
                    >
                      <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.2em] text-sage-600">
                        {row.register}
                      </p>
                      <p className="font-display text-lg text-stone-900 sm:text-xl">{row.line}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-auto flex justify-between gap-3 border-t border-stone-200 pt-7 text-[9px] font-bold uppercase tracking-[0.25em] text-stone-500/70">
                <span>No paraphrase</span>
                <span>No summary</span>
                <span>Their words</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3 — HOW IT WORKS */}
      <section className="border-y border-stone-200/60 px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-3 md:gap-0">
          {STEPS.map((step, i) => (
            <div
              key={step}
              className={`text-center md:px-12 ${i < STEPS.length - 1 ? 'md:border-r md:border-stone-200/60' : ''}`}
            >
              <span className="mb-3 block font-display text-3xl italic text-sage-500/40 sm:text-4xl">
                0{i + 1}
              </span>
              <p className="font-serif text-lg text-stone-900 sm:text-xl">{step}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 4 — CONVICTION */}
      <section className="bg-stone-950 px-5 py-24 text-stone-100 sm:px-8 sm:py-36">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-8 font-display text-4xl sm:mb-12 sm:text-6xl lg:text-7xl">
            Built to never interpret Scripture
          </h2>
          <p className="mx-auto mb-14 max-w-2xl font-serif text-lg leading-relaxed opacity-70 sm:mb-20 sm:text-xl">
            We believe interpretation is the work of the Holy Spirit through the historic community of
            the Church, not the work of a large language model.
          </p>
          <div className="border-t border-stone-100/10 pt-14 sm:pt-20">
            <p className="mb-6 font-serif text-2xl italic leading-snug sm:text-3xl">
              &ldquo;Study to shew thyself approved unto God, a workman that needeth not to be ashamed,
              rightly dividing the word of truth.&rdquo;
            </p>
            <p className="font-serif text-base opacity-60 sm:text-lg">2 Timothy 2:15</p>
          </div>
        </div>
      </section>

      {/* 5 — PHILOSOPHY */}
      <section className="px-5 py-24 sm:px-8 sm:py-36">
        <div className="mx-auto max-w-5xl text-center">
          <p className="mb-8 text-micro font-bold uppercase tracking-[0.3em] text-sage-600">Our philosophy</p>
          <h2 className="mb-10 font-display text-4xl uppercase leading-tight text-stone-900 sm:text-6xl lg:text-7xl">
            Reconnecting with <span className="normal-case italic">ancient wisdom</span> in a{' '}
            <span className="normal-case italic">hurried</span> world
          </h2>
          <p className="mx-auto max-w-2xl font-serif text-lg leading-relaxed text-stone-900/70 sm:text-xl">
            The great cloud of witnesses gave their lives to these Scriptures. Ancient Paths bridges the
            gap between the reader in a hurried age and the slow, deep wells of the historic Church.
          </p>
        </div>
      </section>

      {/* 6 — THE VERSE PANEL */}
      <section className="px-5 pb-24 sm:px-8 sm:pb-36">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <p className="mb-5 text-micro font-bold uppercase tracking-[0.3em] text-sage-600">The verse panel</p>
            <h2 className="mb-6 font-display text-4xl leading-[1.1] text-stone-900 sm:text-5xl">
              Walk the same paths
            </h2>
            <p className="max-w-md font-serif text-lg text-stone-900/60">
              Sit with the verse in front of you and hear how the Church has read it, across
              seventeen centuries, without the noise of modern algorithms.
            </p>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-paper p-8 shadow-card sm:p-12">
            <div className="mb-8 sm:mb-10">
              <p className="font-display text-2xl leading-snug text-stone-900 sm:text-3xl">
                In the beginning was the Word, and the Word was with God, and the Word was God.
              </p>
              <p className="mt-4 text-micro uppercase tracking-[0.1em] text-stone-500">John 1:1</p>
            </div>

            <div className="space-y-8">
              <div>
                <p className="mb-4 text-micro font-bold uppercase tracking-[0.2em] text-stone-500">
                  Ten voices on this verse
                </p>
                <div className="flex flex-wrap gap-2">
                  {VOICES.map((v, i) => (
                    <span
                      key={v}
                      className={`rounded-full px-4 py-2 text-micro uppercase tracking-widest sm:px-5 ${
                        i === 0 ? 'bg-sage-500 text-stone-50' : 'bg-stone-100 text-stone-900/60'
                      }`}
                    >
                      {v}
                    </span>
                  ))}
                  <span className="rounded-full px-3 py-2 text-micro uppercase tracking-widest text-sage-600">
                    +5 more
                  </span>
                </div>
              </div>

              {/* VERBATIM from the served corpus: Chrysostom, Homily IV on John 1:1 (NPNF
                  translation; entry present in web/public/commentaries/jhn/1.json). Replaces
                  the mockup's invented paraphrase. Re-verify before ever changing this. */}
              <div className="border-l-4 border-l-sage-500 border-t border-t-stone-200 pl-6 pt-8 sm:pl-8">
                <p className="font-serif text-lg italic leading-relaxed text-stone-900 sm:text-xl">
                  &ldquo;&hellip;the Father was never without the Word, but He was always God with God,
                  yet Each in His proper Person.&rdquo;
                </p>
                <p className="mt-5 text-micro uppercase tracking-[0.2em] text-stone-500">
                  Chrysostom, Homily IV on John
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7 — EMAIL CAPTURE. #doors is the cross-page CTA target (Features/Why "Request access"). */}
      <section id="doors" className="relative overflow-hidden px-5 py-28 sm:px-8 sm:py-44">
        <Image
          src="/marketing/steps-fog.jpg"
          alt=""
          aria-hidden
          fill
          sizes="100vw"
          className="object-cover grayscale"
        />
        <div aria-hidden className="absolute inset-0 bg-stone-100/85" />

        <div className="relative z-10 mx-auto max-w-2xl text-center">
          <h2 className="mb-10 font-display text-4xl text-stone-900 sm:mb-12 sm:text-6xl">
            We are opening the doors slowly
          </h2>
          <WaitlistForm />
          <p className="mt-4 font-serif text-sm text-stone-900/60">
            The preview is free. We invite a few readers at a time, and your email is used for the
            invitation alone.
          </p>
          <p className="mt-10 font-serif text-lg italic text-stone-900/60 sm:text-xl">
            &ldquo;Ask for the ancient paths, where the good way is, and walk in it.&rdquo;
          </p>
          <p className="mt-2 text-micro uppercase tracking-[0.3em] text-stone-900/40">Jeremiah 6:16</p>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
