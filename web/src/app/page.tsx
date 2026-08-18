import { WaitlistForm } from '@/components/waitlist-form';
import { MarketingNav } from '@/components/marketing/nav';
import { MarketingFooter } from '@/components/marketing/footer';
import { MarketingGround, SHEET } from '@/components/marketing/ground';
import { VersePanelDemo } from '@/components/marketing/verse-panel-demo';

// PUBLIC marketing landing, outside the SITE_PASSWORD wall (gate.ts isPublicPath).
// The signed-in app home lives at /home. Pre-launch the CTA is a waitlist, not live
// signup; "Log in" links into the gated app for the owner and existing testers.
//
// 2026-08-08 "PHOTO AS GROUND" pass (owner direction, after the static-site
// exploration): the purchased photograph sits fixed and translucent behind the WHOLE
// page; content floats over it on frosted parchment sheets with soft radii, layered
// shadows and gentle motion. Hard edges gone; the land shows through everywhere.
//
// EVERY FEATURE CLAIM BELOW WAS TRUTH-PASSED against the shipped code and served corpus
// on 2026-08-08: "ten voices" on John 1:1 is the measured post-filter count (exactly 10
// distinct served authors); the Chrysostom pull quote is VERBATIM from his Homily IV as
// served by this corpus; the four "Answered by" rows name only served works, mirroring
// the real /ask lanes. Do not swap any of these for nicer-sounding examples without
// re-verifying — a fabricated quote here would break the product's own guarantee on its
// front door.
export const metadata = {
  description:
    'Ask any question, Ancient Paths answers only in the words of those who labored before us. Commentaries, sermons, hymns and creeds from two thousand years, always cited. Request early access.',
};

const ANSWERED_BY = [
  { register: 'Commentary', line: 'John Calvin on Romans 6:4' },
  { register: 'Sermon', line: 'Spurgeon, Metropolitan Tabernacle Pulpit' },
  { register: 'Hymn', line: 'Watts, Hymns and Spiritual Songs' },
  { register: 'Creed', line: 'Nicene, rose again the third day' },
];

const STEPS = [
  'You ask.',
  'Two thousand years are searched.',
  'They answer, in their own words, cited.',
];

// Primary CTA, softened for the marketing tier: pill, ink fill, gentle transition.
const CTA =
  'inline-flex min-h-[52px] items-center rounded-full bg-stone-900 px-9 font-sans text-sm font-semibold tracking-[0.02em] text-stone-50 shadow-[0_1px_2px_rgba(43,33,25,0.05),0_8px_24px_-8px_rgba(43,33,25,0.10),0_32px_80px_-24px_rgba(43,33,25,0.16)] transition-[background-color,transform] duration-200 ease-gentle hover:bg-stone-800 active:scale-[0.99]';

export default function MarketingHome() {
  return (
    <main id="main" className="relative isolate">
      <MarketingGround veil="light" />
      <MarketingNav active="home" />

      {/* 1 — HERO: type set directly on the photograph, nothing between the reader and
          the land but the light veil. */}
      <section className="relative z-10 flex min-h-[88dvh] flex-col justify-center px-5 sm:px-8">
        {/* A soft radial pool of parchment light behind the hero type — legibility over
            the busy midfield of the photograph without a scrim edge anywhere. The rgba
            literal is stone-50 (#FBF8F2); Tailwind arbitrary gradients cannot read the
            token with an alpha. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_55%_45%_at_50%_46%,rgba(251,248,242,0.72),rgba(251,248,242,0)_72%)]"
        />
        <div className="relative mx-auto w-full max-w-5xl pb-24 pt-16 text-center sm:pb-32">
          <p className="mb-6 text-micro font-semibold uppercase tracking-[0.3em] text-stone-700">
            For those who preach and study the Word
          </p>
          <h1 className="font-display text-[44px] leading-[1.04] tracking-[-0.015em] text-stone-900 sm:text-[64px] lg:text-[80px]">
            In the multitude of counsellors
            <br />
            <span className="font-normal italic">there is safety.</span>
          </h1>
          <p className="mt-5 text-micro font-semibold uppercase tracking-[0.3em] text-stone-700">
            Proverbs 11:14
          </p>
          <p className="mx-auto mt-8 max-w-xl font-serif text-lg leading-relaxed text-stone-800 sm:text-xl">
            Ask any question, Ancient Paths answers only in the words of those who labored before us.
            AI designed to lead you to the Holy Spirit, not be the Holy Spirit.
          </p>
          <div className="mt-10">
            <a href="#ask" className={CTA}>
              See it answered
            </a>
          </div>
        </div>
      </section>

      {/* 2 — THE ASK MOMENT: two frosted sheets floating side by side. */}
      <section id="ask" className="scroll-mt-24 px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center sm:mb-16">
            <p className="mb-4 text-micro font-semibold uppercase tracking-[0.3em] text-stone-700">Ask the tradition</p>
            <h2 className="font-display text-4xl leading-tight text-stone-900 sm:text-6xl">
              Ask, and be answered by the Church.
            </h2>
          </div>

          <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
            {/* Your question — the reader's own study; the product never reads or writes it. */}
            <div className={`${SHEET} flex flex-col p-8 sm:p-12`}>
              <div className="mb-auto">
                <p className="mb-5 text-micro font-semibold uppercase tracking-[0.3em] text-stone-500">Your study</p>
                <h3 className="mb-5 font-display text-2xl text-stone-900 sm:text-3xl">Easter Sunrise Sermon</h3>
                <div className="max-w-[62ch] space-y-4 font-serif text-[17px] leading-[1.75] text-stone-500">
                  <p>The stone was not rolled away to let Jesus out, but to let the witnesses in.</p>
                  <p>As we gather this morning, we recall that our hope is built on a physical reality.</p>
                  <p>If Christ be not raised, our faith is in vain.</p>
                </div>
              </div>
              <div className="mt-8 flex items-center gap-4 rounded-[1.25rem] border border-stone-200/70 bg-stone-50/60 px-6 py-4">
                <svg aria-hidden viewBox="0 0 8 12" className="h-3 w-2 shrink-0 fill-accent-600">
                  <path d="M0 0l8 6-8 6z" />
                </svg>
                <span className="font-serif text-sm italic text-stone-900 sm:text-base">
                  What did the early Church say about the resurrection body?
                </span>
              </div>
            </div>

            {/* Answered by — the four real registers, real served works. */}
            <div className={`${SHEET} flex flex-col p-8 sm:p-12`}>
              <div>
                <p className="mb-7 text-micro font-semibold uppercase tracking-[0.3em] text-stone-500">Answered by</p>
                <div className="space-y-5">
                  {ANSWERED_BY.map((row, i) => (
                    <div
                      key={row.register}
                      className={i < ANSWERED_BY.length - 1 ? 'border-b border-stone-200/70 pb-5' : 'pb-1'}
                    >
                      <p className="mb-1 text-micro font-semibold uppercase tracking-[0.2em] text-accent-600">
                        {row.register}
                      </p>
                      <p className="font-display text-lg text-stone-900 sm:text-xl">{row.line}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-auto flex justify-between gap-3 border-t border-stone-200/70 pt-7 text-micro font-semibold uppercase tracking-[0.25em] text-stone-500">
                <span>No paraphrase</span>
                <span>No summary</span>
                <span>Their words</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3 — HOW IT WORKS: one wide, low sheet. */}
      <section className="relative z-10 px-5 py-8 sm:px-8 sm:py-12">
        <div className={`${SHEET} mx-auto grid max-w-7xl gap-10 p-10 md:grid-cols-3 md:gap-0 sm:p-14`}>
          {STEPS.map((step, i) => (
            <div
              key={step}
              className={`text-center md:px-12 ${i < STEPS.length - 1 ? 'md:border-r md:border-stone-200/70' : ''}`}
            >
              <span className="mb-3 block font-display text-3xl italic text-accent-600/50 sm:text-4xl">
                0{i + 1}
              </span>
              <p className="font-serif text-lg text-stone-900 sm:text-xl">{step}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 4 — CONVICTION: the one dark sheet — night ink floating on the golden land. */}
      <section className="relative z-10 px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-5xl rounded-[1.75rem] bg-stone-950/95 px-6 py-20 text-center text-stone-100 backdrop-blur-xl shadow-[0_1px_2px_rgba(43,33,25,0.05),0_8px_24px_-8px_rgba(43,33,25,0.10),0_32px_80px_-24px_rgba(43,33,25,0.16)] sm:px-16 sm:py-28">
          <h2 className="mb-8 font-display text-4xl sm:mb-10 sm:text-6xl">
            Built to never interpret Scripture
          </h2>
          <p className="mx-auto mb-12 max-w-2xl font-serif text-lg leading-relaxed text-stone-100/70 sm:mb-16 sm:text-xl">
            We believe interpretation is the work of the Holy Spirit through the historic community of
            the Church, not the work of a large language model.
          </p>
          <div className="border-t border-stone-100/10 pt-12 sm:pt-16">
            <p className="mb-6 font-serif text-2xl italic leading-snug sm:text-3xl">
              &ldquo;Study to shew thyself approved unto God, a workman that needeth not to be ashamed,
              rightly dividing the word of truth.&rdquo;
            </p>
            <p className="font-serif text-base text-stone-100/60 sm:text-lg">2 Timothy 2:15</p>
          </div>
        </div>
      </section>

      {/* 5 — PHILOSOPHY: type straight on the ground — a breath between sheets. */}
      <section className="relative z-10 px-5 py-16 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-5xl text-center">
          <p className="mb-7 text-micro font-semibold uppercase tracking-[0.3em] text-stone-700">Our philosophy</p>
          <h2 className="mb-9 font-display text-4xl leading-tight text-stone-900 sm:text-6xl">
            Reconnecting with <span className="italic">ancient wisdom</span> in a{' '}
            <span className="italic">hurried</span> world
          </h2>
          <p className="mx-auto max-w-[62ch] font-serif text-[17px] leading-[1.75] text-stone-800 sm:text-lg">
            The great cloud of witnesses gave their lives to these Scriptures. Ancient Paths bridges the
            gap between the reader in a hurried age and the slow, deep wells of the historic Church.
          </p>
        </div>
      </section>

      {/* 6 — THE VERSE PANEL: copy on the ground, the interactive demo on its sheet. */}
      <section className="relative z-10 px-5 py-8 sm:px-8 sm:py-12">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="mb-5 text-micro font-semibold uppercase tracking-[0.3em] text-stone-700">The verse panel</p>
            <h2 className="mb-6 font-display text-4xl leading-[1.1] text-stone-900 sm:text-5xl">
              Walk the same paths
            </h2>
            <p className="max-w-[62ch] font-serif text-[17px] leading-[1.75] text-stone-800">
              Sit with the verse in front of you and hear how the Church has read it, across
              seventeen centuries, without the noise of modern algorithms.
            </p>
          </div>

          {/* Interactive: click a voice, read that voice. Every excerpt is verbatim served
              corpus text, pinned by test/marketing-verse-panel-sync.test.ts. */}
          <div className={`${SHEET} p-8 sm:p-12`}>
            <VersePanelDemo />
          </div>
        </div>
      </section>

      {/* 7 — EMAIL CAPTURE. #doors is the cross-page CTA target. */}
      <section id="doors" className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28">
        <div className={`${SHEET} mx-auto max-w-3xl px-6 py-16 text-center sm:px-14 sm:py-20`}>
          <h2 className="mb-10 font-display text-4xl text-stone-900 sm:text-5xl">
            We are opening the doors slowly
          </h2>
          <WaitlistForm />
          <p className="mt-4 font-serif text-sm text-stone-500">
            The preview is free. We invite a few readers at a time, and your email is used for the
            invitation alone.
          </p>
          <p className="mt-10 font-serif text-lg italic text-stone-500 sm:text-xl">
            &ldquo;Ask for the ancient paths, where the good way is, and walk in it.&rdquo;
          </p>
          <p className="mt-2 text-micro uppercase tracking-[0.3em] text-stone-500">Jeremiah 6:16</p>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
