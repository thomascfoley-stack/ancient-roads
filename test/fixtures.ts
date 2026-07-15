import type { TeacherResponse } from '../src/contract/types';
import { createMemoryCorpus } from '../src/verifier/memory-corpus';
import type { RetrievalContext } from '../src/verifier/types';

export const CHRYSOSTOM_BODY =
  'Hear this, ye that pass your time in revels and intemperance. Wine was given ' +
  'to make us cheerful, not to make us behave ourselves unseemly; to make us laugh, ' +
  'not a laughing-stock; to make us healthful, not sickly; to strengthen what is ' +
  'weak in our body, not to overturn what is strong in our soul. Drunkenness is a ' +
  'voluntary madness, a self-chosen slavery of the will.';

export const HENRY_BODY =
  'Drunkenness is a sin that rarely goes alone; it carries men headlong into other ' +
  'evils. It is a sin against the body itself, which is bought with a price. Those ' +
  'that are filled with wine cannot be filled with the Spirit; the two are set one ' +
  'against the other.';

export const corpus = createMemoryCorpus({
  sections: [
    {
      id: 48210,
      body: CHRYSOSTOM_BODY,
      origin: 'corpus',
      heading: 'Homily 19 on Ephesians',
      source: { id: 7, author: 'John Chrysostom', title: 'Homilies on Ephesians', tradition: 'patristic' },
      verses: { start: 49005018, end: 49005018 }, // this section is indexed to Eph 5:18
    },
    {
      id: 51002,
      body: HENRY_BODY,
      origin: 'corpus',
      heading: 'Ephesians 5',
      source: { id: 12, author: 'Matthew Henry', title: 'Complete Commentary', tradition: 'reformed' },
      verses: { start: 49005018, end: 49005018 }, // Eph 5:18
    },
    {
      id: 3,
      body: 'A personal note on habits from my own reading: temperance grows by small refusals.',
      origin: 'user_library',
      source: { id: 900, author: 'Uploaded Author', title: 'My Notes on Discipline', tradition: 'unknown' },
    },
  ],
  translations: [
    { slug: 'web', isActive: true, licensedForDisplay: true },
    { slug: 'esv', isActive: false, licensedForDisplay: false },
  ],
  missingVerses: [{ translation: 'web', verseId: 19150007 }],
});

export const retrieval: RetrievalContext = {
  sectionIds: [48210, 51002],
  traditions: ['patristic', 'reformed'],
  // NOTE: no queryRanges — removed as a grounding authority (T2§7). Passages are grounded
  // only by source-grounded voice anchors now. validResponse's Eph 5:18 passage is grounded
  // by both voices' anchors; a Prov 23 passage with no voice anchor is now (correctly) ungrounded.
};

// A fully valid response against the fixture corpus.
export function validResponse(): TeacherResponse {
  return {
    contract_version: '1.1',
    teacher: 'study-guide',
    blocks: [
      {
        type: 'framing',
        text: 'On drunkenness, the early church spoke often. Here is Chrysostom, with Matthew Henry below.',
      },
      {
        type: 'voice',
        section_id: 48210,
        attribution: {
          author: 'John Chrysostom',
          work: 'Homily 19 on Ephesians',
          year: 390,
          tradition: 'patristic',
          origin: 'corpus',
        },
        quote: 'Wine was given to make us cheerful, not to make us behave ourselves unseemly',
        summary: 'Chrysostom calls drunkenness a voluntary madness and a self-chosen slavery of the will.',
        anchors: [{ start: 49005018, end: 49005018 }],
      },
      {
        type: 'voice',
        section_id: 51002,
        attribution: {
          author: 'Matthew Henry',
          work: 'Complete Commentary',
          tradition: 'reformed',
          origin: 'corpus',
        },
        quote: 'Drunkenness is a sin that rarely goes alone',
        summary: 'Henry calls drunkenness a sin against the body and sets being filled with wine against being filled with the Spirit.',
        anchors: [{ start: 49005018, end: 49005018 }],
      },
      {
        type: 'passages',
        items: [
          { start: 49005018, end: 49005018, translation: 'web' }, // Eph 5:18 — grounded by both voices' anchors
        ],
      },
      {
        type: 'prayer_prompt',
        text: 'You may want to bring this before God in prayer. Psalm 51 has been prayed for this for three thousand years.',
      },
    ],
  };
}
