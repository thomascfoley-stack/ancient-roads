'use client';

import { useState } from 'react';

// The interactive verse-panel demo on the PUBLIC marketing tier (owner call 2026-08-08:
// "make these boxes interactive"). Click a voice, read that voice on John 1:1.
//
// WHY THE EXCERPTS ARE BAKED IN, NOT FETCHED. The commentary corpus
// (/commentaries/*.json) is deliberately behind the SITE_PASSWORD wall — the marketing
// page may not open a hole in it. So the demo carries ten short excerpts at build time.
//
// EVERY EXCERPT IS A VERBATIM SUBSTRING of that author's served entry on John 1:1 in
// web/public/commentaries/jhn/1.json, and every author passes
// isPublishedCommentaryEntry — enforced by test/marketing-verse-panel-sync.test.ts,
// which fails if an excerpt drifts from the corpus text or names an unserved voice.
// Do not edit an excerpt without re-running that test: a fabricated quote here would
// break the product's own guarantee on its front door.
export const VERSE_PANEL_VOICES = [
  {
    label: 'Augustine',
    author: 'Augustine of Hippo',
    source: 'Homilies on the Gospel of John',
    excerpt:
      'For he is like one who has drunk in the secret of His divinity more richly and somehow more familiarly than others, as if he drew it from the very bosom of his Lord on which it was his wont to recline when He sat at meat.',
  },
  {
    label: 'Chrysostom',
    author: 'John Chrysostom',
    source: 'Homily IV on John',
    excerpt:
      'the Father was never without the Word, but He was always God with God, yet Each in His proper Person.',
  },
  {
    label: 'Calvin',
    author: 'John Calvin',
    source: 'Commentary on John',
    excerpt:
      'In this introduction he asserts the eternal Divinity of Christ, in order to inform us that he is the eternal God, who was manifested in the flesh',
  },
  {
    label: 'Wesley',
    author: 'John Wesley',
    source: 'Explanatory Notes',
    excerpt:
      'the Word existed, without any beginning. He was when all things began to be, whatsoever had a beginning.',
  },
  {
    label: 'Matthew Henry',
    author: 'Matthew Henry',
    source: 'Commentary on the Whole Bible',
    excerpt:
      'these first verses of St. John’s gospel were worthy to be written in letters of gold.',
  },
  {
    label: 'Adam Clarke',
    author: 'Adam Clarke',
    source: 'Commentary',
    excerpt:
      'Jesus Christ was no part of the creation, as he existed when no part of that existed; and that consequently he is no creature, as all created nature was formed by him',
  },
  {
    label: 'Catena Aurea',
    author: 'Thomas Aquinas (comp.), trans. J.H. Newman',
    source: 'Catena Aurea',
    excerpt:
      'While all the other Evangelists begin with the Incarnation, John, passing over the Conception, Nativity, education, and growth, speaks immediately of the Eternal Generation',
  },
  {
    label: 'Hodge',
    author: 'Charles Hodge',
    source: 'Systematic Theology',
    excerpt:
      'The question why the Son is called “The Word” may be answered by saying that the term expresses both his nature and his office.',
  },
  {
    label: 'Watts',
    author: 'Isaac Watts',
    source: 'Hymns and Spiritual Songs',
    excerpt:
      'Ere the blue heavens were stretch’d abroad, From everlasting was the Word; With God he was; the Word was God, And must divinely be ador’d.',
  },
  {
    label: 'Barnes',
    author: "Barnes' Notes",
    source: "Barnes' New Testament Notes",
    excerpt: 'John was admitted by our Saviour to peculiar favour and friendship.',
  },
] as const;

export function VersePanelDemo() {
  const [active, setActive] = useState(0);
  const voice = VERSE_PANEL_VOICES[active];
  return (
    // No frame of its own: the marketing pages set this inside a frosted sheet, which
    // provides the surface and padding.
    <div>
      <div className="mb-8">
        <p className="font-display text-2xl leading-snug text-stone-900 sm:text-3xl">
          In the beginning was the Word, and the Word was with God, and the Word was God.
        </p>
        <p className="mt-4 font-sans text-micro uppercase tracking-[0.1em] text-stone-500">John 1:1</p>
      </div>
      <div className="space-y-8">
        <div>
          <p className="mb-4 text-micro font-semibold uppercase tracking-[0.2em] text-stone-500">
            Ten voices on this verse
          </p>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Voices on John 1:1">
            {VERSE_PANEL_VOICES.map((v, i) => (
              <button
                key={v.label}
                type="button"
                role="tab"
                aria-selected={i === active}
                onClick={() => setActive(i)}
                className={`min-h-[40px] rounded-full border px-4 text-micro uppercase tracking-widest transition-colors duration-200 ease-gentle ${
                  i === active
                    ? 'border-accent-600 bg-accent-600 text-stone-50'
                    : 'border-stone-300/80 text-stone-500 hover:border-stone-500 hover:text-stone-900'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
        <div className="border-l-[3px] border-l-accent-600 border-t border-t-stone-200 pl-6 pt-8 sm:pl-8" aria-live="polite">
          <p className="max-w-[62ch] font-serif text-[17px] italic leading-[1.75] text-stone-900 sm:text-lg">
            &ldquo;&hellip;{voice.excerpt}&rdquo;
          </p>
          <p className="mt-5 font-serif text-sm uppercase tracking-[0.05em] text-stone-500">
            {voice.label}, {voice.source}
          </p>
        </div>
      </div>
    </div>
  );
}
