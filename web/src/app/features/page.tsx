import Link from 'next/link';
import { MarketingNav } from '@/components/marketing/nav';
import { MarketingFooter } from '@/components/marketing/footer';
import { VersePanelDemo } from '@/components/marketing/verse-panel-demo';

// PUBLIC features page (gate.ts isPublicPath, app-shell CHROME_FREE). Part of the
// 2026-08-08 marketing redesign; see app/page.tsx for the design provenance.
//
// TRUTH-PASSED 2026-08-08: all four features below are SHIPPED. The mockup's third
// section ("Beside the Tradition", live suggestions while you draft) described a
// feature that does not exist and was REPLACED by the register lanes, which do. Every
// named work is in the served lists (teacher/routing.ts); the morphology line follows
// MorphGNT (N- NSM for λόγος in John 1:1) and Strong's G3056. Do not "improve" any
// example without re-verifying it against the corpus.
export const metadata = {
  title: 'Features',
  description:
    'The verse panel, the Greek and Hebrew interlinear, labeled register lanes, and a private prayer journal. Tools for the labor of Scripture, never a substitute for it.',
};

// John 1:1a, SBLGNT, with transliteration and gloss — matches the shipped interlinear.
const GREEK = [
  { w: 'Ἐν', t: 'En', g: 'In' },
  { w: 'ἀρχῇ', t: 'archē', g: 'beginning' },
  { w: 'ἦν', t: 'ēn', g: 'was' },
  { w: 'ὁ', t: 'ho', g: 'the' },
  { w: 'λόγος', t: 'logos', g: 'Word' },
];

// The register lanes as they actually ship on /ask (LANE_OPTIONS + the always-on
// commentary answer). Sub-lines: the Romans 6:4 fragment is the KJV verse itself;
// "rose again the third day" is the Nicene Creed's own wording.
const REGISTERS = [
  { register: 'Commentary', line: 'John Calvin on Romans 6:4', sub: 'Buried with him by baptism into death' },
  { register: 'Sermon', line: 'Spurgeon, Metropolitan Tabernacle Pulpit', sub: 'Sixty-three volumes, preached and served whole' },
  { register: 'Theology & Confessions', line: 'Schaff, The Creeds of Christendom', sub: 'Rose again the third day, according to the Scriptures' },
  { register: 'Hymns & Sacred Poetry', line: 'Watts, Hymns and Spiritual Songs', sub: 'With Olney Hymns, Herbert, and the psalters' },
];

function SectionNumber({ n }: { n: string }) {
  return <span className="mb-6 block font-display text-5xl font-light italic text-accent-600/40 sm:text-6xl">{n}</span>;
}

export default function FeaturesPage() {
  return (
    <main className="bg-stone-50">
      <MarketingNav active="features" />

      <header className="border-b edge px-5 pb-16 pt-16 sm:px-8 sm:pb-24 sm:pt-28">
        <div className="mx-auto max-w-7xl">
          <p className="mb-5 text-micro font-semibold uppercase tracking-[0.3em] text-stone-500">Features</p>
          <h1 className="font-display text-5xl tracking-[-0.01em] text-stone-900 sm:text-7xl lg:text-8xl">Tools for the labor</h1>
        </div>
      </header>

      {/* 01 — The Verse Panel. Demo blocks are type and hairlines, no cards (PRD §5). */}
      <section className="border-b edge px-5 py-16 sm:px-8 sm:py-28">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2 lg:gap-20">
          <div>
            <SectionNumber n="01" />
            <h2 className="mb-6 font-display text-4xl text-stone-900 sm:text-5xl">The Verse Panel</h2>
            <p className="max-w-[62ch] font-serif text-[17px] leading-[1.75] text-stone-500 sm:text-lg">
              See how the Church has understood the Word across centuries, continents, and traditions,
              all in one quiet view.
            </p>
          </div>

          {/* Interactive demo, shared with app/page.tsx §6 (3rd call-site threshold waived:
              a stateful client component should not be duplicated). Excerpts pinned verbatim
              by test/marketing-verse-panel-sync.test.ts. */}
          <VersePanelDemo />
        </div>
      </section>

      {/* 02 — The Interlinear */}
      <section className="border-b edge px-5 py-16 sm:px-8 sm:py-28">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2 lg:gap-20">
          <div className="lg:order-2">
            <SectionNumber n="02" />
            <h2 className="mb-6 font-display text-4xl text-stone-900 sm:text-5xl">The Interlinear</h2>
            <p className="max-w-[62ch] font-serif text-[17px] leading-[1.75] text-stone-500 sm:text-lg">
              Peel back the layers of translation. Touch the original Greek and Hebrew with a layout
              designed for meditation, not just mechanics.
            </p>
          </div>

          <div className="border-t edge pt-8 sm:pt-10 lg:order-1">
            <div className="flex flex-wrap gap-x-10 gap-y-8 sm:gap-x-12">
              {GREEK.map((x) => (
                <div key={x.w} className="text-center">
                  <p lang="grc" className="font-display text-2xl text-stone-900 sm:text-3xl">{x.w}</p>
                  <p className="mt-2 text-micro uppercase tracking-widest text-accent-600">{x.t}</p>
                  <p className="mt-1 font-serif text-sm italic text-stone-500">{x.g}</p>
                </div>
              ))}
            </div>
            <div className="mt-12 border-t edge pt-7">
              <p className="text-micro font-semibold uppercase tracking-[0.2em] text-stone-500">Morphology</p>
              <p className="mt-3 max-w-[62ch] font-serif text-[17px] leading-[1.75] text-stone-500">
                λόγος: noun, masculine, singular, nominative. Word, speech; the Divine Expression
                (Strong&rsquo;s G3056).
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 03 — The Registers (replaces the mockup's unshipped "Beside the Tradition") */}
      <section className="border-b edge px-5 py-16 sm:px-8 sm:py-28">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2 lg:gap-20">
          <div>
            <SectionNumber n="03" />
            <h2 className="mb-6 font-display text-4xl text-stone-900 sm:text-5xl">Every voice in its register</h2>
            <p className="max-w-[62ch] font-serif text-[17px] leading-[1.75] text-stone-500 sm:text-lg">
              Ask a question and each register answers separately: commentary, sermons, theology and
              confessions, hymns and sacred poetry. Labeled and attributed, never blended into one
              anonymous voice.
            </p>
          </div>

          <div className="border-t edge pt-8 sm:pt-10">
            <p className="mb-7 text-micro font-semibold uppercase tracking-[0.3em] text-stone-500">
              One question, four registers
            </p>
            <div className="space-y-6">
              {REGISTERS.map((row) => (
                <div key={row.register} className="flex items-start gap-4">
                  <span className="mt-1 shrink-0 border border-stone-200 px-2 py-0.5 text-micro font-semibold uppercase tracking-widest text-stone-500">
                    {row.register}
                  </span>
                  <div>
                    <p className="font-display text-base text-stone-900 sm:text-lg">{row.line}</p>
                    <p className="mt-1 text-micro uppercase tracking-widest text-stone-500">{row.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 04 — Prayer Journal */}
      <section className="border-b edge px-5 py-16 sm:px-8 sm:py-28">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2 lg:gap-20">
          <div className="lg:order-2">
            <SectionNumber n="04" />
            <h2 className="mb-6 font-display text-4xl text-stone-900 sm:text-5xl">Prayer Journal</h2>
            <p className="max-w-[62ch] font-serif text-[17px] leading-[1.75] text-stone-500 sm:text-lg">
              A space for your own labor of prayer, kept beside the Scriptures you pray over. Your
              prayers are yours alone: never indexed, never sent to a model, never used to train
              anything.
            </p>
          </div>

          <div className="border-t edge pt-8 sm:pt-10 lg:order-1">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div>
                <p className="font-sans text-sm uppercase tracking-[0.05em] text-stone-500">Friday, August 8</p>
                <p className="mt-2 font-display text-xl italic text-stone-900 sm:text-2xl">He restores my soul</p>
              </div>
              <span className="border border-stone-200 px-3 py-1 text-micro uppercase tracking-widest text-stone-500">
                Psalm 23
              </span>
            </div>
            <div className="max-w-[62ch] space-y-5 font-serif text-[17px] italic leading-[1.75] text-stone-900">
              <p>
                The restoration is not a fixing of what was broken, but a return to what was intended.
                In the quiet of this morning, I feel the weight of the last month lifting.
              </p>
              <p>Guide me in paths of righteousness for Thy name&rsquo;s sake. Not for my own comfort, but for Your glory.</p>
            </div>
            <div className="mt-10 border-t edge pt-6">
              <p className="text-micro uppercase tracking-widest text-stone-500">Yours alone</p>
            </div>
          </div>
        </div>
      </section>

      {/* Closing */}
      <section className="px-5 py-20 text-center sm:px-8 sm:py-32">
        <h2 className="mb-10 font-display text-4xl text-stone-900 sm:text-6xl">Begin your journey</h2>
        <Link
          href="/#doors"
          className="inline-flex min-h-[44px] items-center border border-stone-900 px-6 py-3 font-sans text-sm font-semibold tracking-[0.02em] text-stone-900 hover:bg-stone-900 hover:text-stone-50"
        >
          Request access
        </Link>
      </section>

      <MarketingFooter />
    </main>
  );
}
