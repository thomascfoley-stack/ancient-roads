import Image from 'next/image';
import { WaitlistForm } from '@/components/waitlist-form';
import { MarketingNav } from '@/components/marketing/nav';
import { MarketingFooter } from '@/components/marketing/footer';
import { VersePanelDemo } from '@/components/marketing/verse-panel-demo';

// PUBLIC marketing landing, outside the SITE_PASSWORD wall (gate.ts isPublicPath).
// The signed-in app home lives at /home. Pre-launch the CTA is a waitlist, not live
// signup; "Log in" links into the gated app for the owner and existing testers.
//
// RESTYLED 2026-08-08 onto the Visual Redesign PRD (Ancient_Paths_Visual_Redesign_PRD.md
// §5 Landing, superseding the UX Pilot sage mockup): parchment/ink/antique-gold, a
// full-viewport hero with NO scrim and its type on a parchment band at the bottom, and
// hairline-separated rows instead of cards. Light-only by design; the reader's theme
// applies to the app, not the brand surface.
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
    'Ask any question, Ancient Paths answers only in the words of those who labored before us. Commentaries, sermons, hymns and creeds from two thousand years, always cited. Request early access.',
};

// The four register rows in the ANSWERED BY block. Register labels match the real /ask
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

const STEPS = [
  'You ask.',
  'Two thousand years are searched.',
  'They answer, in their own words, cited.',
];

// The PRD primary CTA (§6): 1px ink hairline, transparent background, 14px Source Sans
// 600; hover fills ink and inverts instantly (no transition on background, PRD §7).
const CTA =
  'inline-flex min-h-[44px] items-center border border-stone-900 px-6 py-3 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50';

export default function MarketingHome() {
  return (
    <main className="bg-stone-50">
      <MarketingNav active="home" />

      {/* 1 — HERO. Full-viewport imagery dissolving into parchment via a gradient — the
          same banded language as Why/Features, just taller and at full strength since
          this photo IS the hero rather than a faint mood behind a title. */}
      <section className="relative flex min-h-dvh flex-col">
        {/* Image band min-height: 42dvh mobile / 44dvh desktop — tall enough that the
            gradient dissolve below has room to read as a transition, not a hard crop. */}
        <div className="relative min-h-[42dvh] flex-1 sm:min-h-[44dvh]">
          {/* iStock #1337429689 (credit: RnDmS), purchased/licensed by the owner directly —
              NOT CC, so no attribution line is required and none is given (unlike the prior
              two photos, an iStock standard license does not obligate a credit). Ancient
              stone path atop a hillside at golden hour — Tel Megiddo, Jezreel Valley. Own
              filename again: the optimizer caches by URL. */}
          <Image
            src="/marketing/hero-path.jpg"
            alt="An ancient stone path along a golden hillside at sunset, leading toward trees on a ridge"
            fill
            priority
            sizes="100vw"
            quality={90}
            className="object-cover object-[38%_50%]"
          />
          {/* The dissolve: the photo shows clean through the top 60%, then runs into
              solid stone-50 over the bottom 40%, so the text band below picks up on
              already-parchment ground with no seam. */}
          <div aria-hidden className="absolute inset-0 bg-linear-to-b from-transparent from-60% to-stone-50" />
        </div>

        <div className="relative bg-stone-50">
          <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-12">
            <p className="mb-5 text-micro font-semibold uppercase tracking-[0.3em] text-stone-500 sm:mb-6">
              For those who preach and study the Word
            </p>
            {/* PRD hero headline: 56–72px responsive (40px mobile) EB Garamond,
                line-height 1.05, tracking -0.01em, ink on parchment.
                KJV wording, deliberately (owner asked for the "abundance of counselors"
                line, which is the ESV's copyrighted rendering; the KJV in our own served
                corpus says this, one word different, and needs no license tag). */}
            <h1 className="font-display text-[40px] leading-[1.05] tracking-[-0.01em] text-stone-900 sm:text-[56px] lg:text-[72px]">
              In the multitude of counsellors
              <br />
              <span className="font-normal italic">there is safety.</span>
            </h1>
            <p className="mt-4 text-micro font-semibold uppercase tracking-[0.3em] text-stone-500">
              Proverbs 11:14
            </p>
            <p className="mt-6 max-w-[66ch] font-serif text-lg leading-relaxed text-stone-500 sm:mt-8">
              Ask any question, Ancient Paths answers only in the words of those who labored before
              us. Trading AI for the voices of the church fathers.
            </p>
            <div className="mt-8 sm:mt-10">
              <a href="#ask" className={CTA}>
                See it answered
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 2 — THE ASK MOMENT. Type and hairlines, no cards (PRD §5 beat rows). */}
      <section id="ask" className="border-t edge px-5 py-20 sm:px-8 sm:py-32">
        <div className="mx-auto max-w-7xl">
          <div className="mb-14 text-center sm:mb-20">
            <p className="mb-5 text-micro font-semibold uppercase tracking-[0.3em] text-stone-500">Ask the tradition</p>
            <h2 className="font-display text-4xl leading-tight text-stone-900 sm:text-6xl lg:text-7xl">
              Ask, and be answered by the Church.
            </h2>
          </div>

          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            {/* Your question — the reader's own study; the product never reads or writes it. */}
            <div className="flex flex-col border-t edge pt-10">
              <div className="mb-auto">
                <p className="mb-5 text-micro font-semibold uppercase tracking-[0.3em] text-stone-500">Your study</p>
                <h3 className="mb-5 font-display text-2xl text-stone-900 sm:text-3xl">Easter Sunrise Sermon</h3>
                <div className="max-w-[62ch] space-y-4 font-serif text-[17px] leading-[1.75] text-stone-500">
                  <p>The stone was not rolled away to let Jesus out, but to let the witnesses in.</p>
                  <p>As we gather this morning, we recall that our hope is built on a physical reality.</p>
                  <p>If Christ be not raised, our faith is in vain.</p>
                </div>
              </div>
              <div className="mt-8 flex items-center gap-4 border border-stone-200 px-6 py-4">
                <svg aria-hidden viewBox="0 0 8 12" className="h-3 w-2 shrink-0 fill-accent-600">
                  <path d="M0 0l8 6-8 6z" />
                </svg>
                <span className="font-serif text-sm italic text-stone-900 sm:text-base">
                  What did the early Church say about the resurrection body?
                </span>
              </div>
            </div>

            {/* Answered by — the four real registers, real served works. */}
            <div className="flex flex-col border-t edge pt-10">
              <div>
                <p className="mb-7 text-micro font-semibold uppercase tracking-[0.3em] text-stone-500">Answered by</p>
                <div className="space-y-5">
                  {ANSWERED_BY.map((row, i) => (
                    <div
                      key={row.register}
                      className={i < ANSWERED_BY.length - 1 ? 'border-b edge pb-5' : 'pb-1'}
                    >
                      <p className="mb-1 text-micro font-semibold uppercase tracking-[0.2em] text-stone-500">
                        {row.register}
                      </p>
                      <p className="font-display text-lg text-stone-900 sm:text-xl">{row.line}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-auto flex justify-between gap-3 border-t edge pt-7 text-micro font-semibold uppercase tracking-[0.25em] text-stone-500">
                <span>No paraphrase</span>
                <span>No summary</span>
                <span>Their words</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3 — HOW IT WORKS */}
      <section className="border-y edge px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-3 md:gap-0">
          {STEPS.map((step, i) => (
            <div
              key={step}
              className={`text-center md:px-12 ${i < STEPS.length - 1 ? 'md:border-r md:border-stone-200' : ''}`}
            >
              <span className="mb-3 block font-display text-3xl italic text-accent-600/40 sm:text-4xl">
                0{i + 1}
              </span>
              <p className="font-serif text-lg text-stone-900 sm:text-xl">{step}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 4 — CONVICTION. The one night-surface band; separation here is the full-bleed
          parchment-to-night flip, not elevation. */}
      <section className="bg-stone-950 px-5 py-24 text-stone-100 sm:px-8 sm:py-36">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-8 font-display text-4xl sm:mb-12 sm:text-6xl lg:text-7xl">
            Built to never interpret Scripture
          </h2>
          <p className="mx-auto mb-14 max-w-2xl font-serif text-lg leading-relaxed text-stone-100/70 sm:mb-20 sm:text-xl">
            We believe interpretation is the work of the Holy Spirit through the historic community of
            the Church, not the work of a large language model.
          </p>
          <div className="border-t border-stone-800 pt-14 sm:pt-20">
            <p className="mb-6 font-serif text-2xl italic leading-snug sm:text-3xl">
              &ldquo;Study to shew thyself approved unto God, a workman that needeth not to be ashamed,
              rightly dividing the word of truth.&rdquo;
            </p>
            <p className="font-serif text-base text-stone-100/60 sm:text-lg">2 Timothy 2:15</p>
          </div>
        </div>
      </section>

      {/* 5 — PHILOSOPHY */}
      <section className="px-5 py-24 sm:px-8 sm:py-36">
        <div className="mx-auto max-w-5xl text-center">
          <p className="mb-8 text-micro font-semibold uppercase tracking-[0.3em] text-stone-500">Our philosophy</p>
          <h2 className="mb-10 font-display text-4xl uppercase leading-tight text-stone-900 sm:text-6xl lg:text-7xl">
            Reconnecting with <span className="normal-case italic">ancient wisdom</span> in a{' '}
            <span className="normal-case italic">hurried</span> world
          </h2>
          <p className="mx-auto max-w-[62ch] font-serif text-[17px] leading-[1.75] text-stone-500 sm:text-lg">
            The great cloud of witnesses gave their lives to these Scriptures. Ancient Paths bridges the
            gap between the reader in a hurried age and the slow, deep wells of the historic Church.
          </p>
        </div>
      </section>

      {/* 6 — THE VERSE PANEL */}
      <section className="border-t edge px-5 py-24 sm:px-8 sm:py-36">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <p className="mb-5 text-micro font-semibold uppercase tracking-[0.3em] text-stone-500">The verse panel</p>
            <h2 className="mb-6 font-display text-4xl leading-[1.1] text-stone-900 sm:text-5xl">
              Walk the same paths
            </h2>
            <p className="max-w-[62ch] font-serif text-[17px] leading-[1.75] text-stone-500">
              Sit with the verse in front of you and hear how the Church has read it, across
              seventeen centuries, without the noise of modern algorithms.
            </p>
          </div>

          {/* Interactive (owner call 2026-08-08): click a voice, read that voice. Every
              excerpt is verbatim served corpus text, pinned by
              test/marketing-verse-panel-sync.test.ts. */}
          <VersePanelDemo />
        </div>
      </section>

      {/* 7 — EMAIL CAPTURE. #doors is the cross-page CTA target (Features/Why "Request access").
          Plain parchment: the PRD's landing texture is hairlines and whitespace, so the old
          fog photograph and its scrim are gone. */}
      <section id="doors" className="border-t edge px-5 py-24 sm:px-8 sm:py-36">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-10 font-display text-4xl text-stone-900 sm:mb-12 sm:text-6xl">
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
