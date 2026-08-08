import Link from 'next/link';
import { MarketingNav } from '@/components/marketing/nav';
import { MarketingFooter } from '@/components/marketing/footer';

// PUBLIC essay page (gate.ts isPublicPath, app-shell CHROME_FREE). Part of the
// 2026-08-08 marketing redesign; see app/page.tsx for provenance.
//
// Two copy corrections against the mockup, both deliberate:
// - The mockup's "It cannot lead you to the Holy Spirit" contradicted the product's own
//   tagline ("AI designed to lead you to the Holy Spirit, not be the Holy Spirit").
//   The essay now says what the product means: the model cannot TEACH or witness; its
//   only job is carrying you to the witnesses.
// - "that Luther wrestled with" became Calvin: every named voice on this page is in the
//   served corpus, so the page never implies a voice the product cannot show.
export const metadata = {
  title: 'Why',
  description:
    'Why Ancient Paths exists: the path forward is a path backward, into the two-thousand-year conversation of the Church. AI that leads you to the witnesses, and never replaces them.',
};

export default function WhyPage() {
  return (
    <main className="bg-stone-50">
      <MarketingNav active="why" />

      <header className="px-5 pb-12 pt-16 sm:px-8 sm:pb-20 sm:pt-28">
        <div className="mx-auto max-w-4xl text-center">
          <p className="mb-5 text-micro font-semibold uppercase tracking-[0.3em] text-stone-500">Why we exist</p>
          <h1 className="font-display text-5xl leading-tight tracking-[-0.01em] text-stone-900 sm:text-7xl lg:text-8xl">
            Why we built this
          </h1>
        </div>
      </header>

      <article className="mx-auto max-w-[66ch] px-5 pb-24 font-serif text-lg leading-[1.8] text-stone-700 sm:px-8 sm:pb-40">
        <p className="mb-12 first-letter:float-left first-letter:pr-3 first-letter:pt-1 first-letter:font-display first-letter:text-7xl first-letter:leading-[0.8] first-letter:text-accent-600">
          In an age defined by the immediate, the shallow, and the algorithmic, we found ourselves
          drifting further from the quiet waters of tradition. The modern world offers a thousand
          interpretations at the speed of a keystroke, yet few provide the depth required to nourish a
          weary soul. We believe that the path forward is actually a path backward: reclaiming the
          rhythms and voices that have sustained the Church for two millennia.
        </p>

        <h2 className="mb-8 mt-20 font-display text-3xl text-stone-900 sm:text-4xl">The fallacy of the new</h2>
        <p className="mb-8">
          We live in a culture that assumes the newest information is the most accurate. In technology,
          this is often true. In theology, it is almost always false. The great minds of our faith did
          not have the internet, but they had a depth of meditation and a proximity to the original
          contexts that we have traded for convenience. Ancient Paths is a refusal of that trade.
        </p>

        <h2 className="mb-8 mt-20 font-display text-3xl text-stone-900 sm:text-4xl">Why not just ask AI?</h2>
        <p className="mb-8">
          Generative AI is a mirror of the present: a statistical model of human language, not a
          witness. It did not live, suffer, or die for what it believes, because it believes nothing.
          So we refuse to let it teach. It will not tell you what a verse means, on purpose. The one
          job we give it is carrying you to the witnesses: finding, quoting, and citing the people who
          did live and die for these words. AI designed to lead you to the Holy Spirit, not be the
          Holy Spirit.
        </p>

        {/* PRD verse blockquote: 3px antique-gold left border, small-caps citation. */}
        <div className="my-16 border-l-[3px] border-accent-600 pl-8 sm:my-20 sm:pl-10">
          <blockquote className="font-serif text-2xl italic leading-snug text-stone-900 sm:text-3xl">
            &ldquo;But the Comforter, which is the Holy Ghost&hellip; he shall teach you all things.&rdquo;
          </blockquote>
          <cite className="mt-6 block font-sans text-micro font-semibold not-italic uppercase tracking-[0.2em] text-stone-500">
            John 14:26
          </cite>
        </div>

        <h2 className="mb-8 mt-20 font-display text-3xl italic text-stone-900 sm:text-4xl">
          The path is not new, but it is forgotten.
        </h2>
        <p className="mb-8">
          To walk the ancient paths is to reject the hurry of the present. It is to sit with a single
          verse for an hour, exploring its Greek roots, its historical context, and the way it has been
          prayed over by generations before us. This is the labor of the faithful, and it is the labor
          we aim to support. We are not building a search engine: we are building a gateway to the
          historic Christian mind.
        </p>

        <h2 className="mb-8 mt-20 font-display text-3xl text-stone-900 sm:text-4xl">The cloud of witnesses</h2>
        <p className="mb-8">
          When you read a verse in Ancient Paths, you are not just reading text. You are stepping into a
          two-thousand-year-old conversation. You are hearing the same words that Augustine heard,
          that Calvin wrestled with, and that Wesley preached. It is the steady, quiet voice of the
          Church that has survived empires, schisms, and wars. It is a path that has already been
          walked.
        </p>

        <div aria-hidden className="my-16 flex justify-center text-accent-600/40 sm:my-20">
          <span className="text-2xl tracking-[1.5em]">• • •</span>
        </div>

        <p className="mt-12 text-center font-serif italic text-stone-500">
          Our hope is that through this labor, you would find not just information, but a deeper
          communion with the One who spoke the Word in the beginning.
        </p>

        <div className="mt-16 text-center sm:mt-20">
          <Link
            href="/#doors"
            className="inline-flex min-h-[44px] items-center border border-stone-900 px-6 py-3 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50"
          >
            Request access
          </Link>
        </div>
      </article>

      <MarketingFooter />
    </main>
  );
}
