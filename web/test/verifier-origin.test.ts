// Defect H4 (docs/pm/orders/2026-08-20-uploader-deep-dive.md): the verifier must be
// origin-aware. SERMON_SEARCH_DESIGN.md §7(b)/(c): user-library content is ADDITIVE,
// never load-bearing — a user voice is legal in an answer, but it must NOT satisfy
// the >=2-traditions floor, must NOT count toward the distinct-voice-sections floor,
// and must NOT ground a displayed passage (passages_grounded). Otherwise a user's own
// upload could authorize Scripture display or stand in for a second tradition.
//
// Node env, no DB: drives the SHIPPED verifyV1 against an in-memory CorpusLookup
// keyed `${origin}:${id}` — the exact namespace keying of both
// web/src/lib/teacher/corpus.ts and src/verifier/memory-corpus.ts.

import { describe, expect, it } from 'vitest';
import { verifyV1 } from '../src/verifier/v1';
import type {
  CorpusLookup,
  ResolvedSection,
  RetrievalContext,
  Violation,
} from '../src/verifier/types';
import type { TeacherResponse, VoiceBlock } from '../src/contract/types';

function violations(result: Awaited<ReturnType<typeof verifyV1>>): Violation[] {
  return result.ok ? [] : result.violations;
}

const CHRYSOSTOM_BODY =
  'Wine was given to make us cheerful, not to make us behave ourselves unseemly; ' +
  'to make us laugh, not a laughing-stock.';
const HENRY_BODY =
  'Drunkenness carries men headlong into other evils; those that are filled with ' +
  'wine cannot be filled with the Spirit.';
const CLARKE_BODY =
  'The wine moveth itself aright in the cup, but at the last it stingeth as an adder.';
const USER_SERMON_BODY =
  'Who has woe and who has sorrow? The cup that shines bites like a serpent at the last.';
const USER_NOTES_BODY =
  'The old writers counsel a cheerful table and a clear head, and their counsel holds.';

// Eph 5:18 and Prov 23:29-35, the canonical IDs used across the verifier suites.
const EPH_5_18 = { start: 49005018, end: 49005018 };
const PROV_23 = { start: 20023029, end: 20023035 };

const SECTIONS: ResolvedSection[] = [
  {
    id: 48210,
    body: CHRYSOSTOM_BODY,
    origin: 'corpus',
    source: { id: 7, author: 'John Chrysostom', title: 'Homilies on Ephesians', tradition: 'patristic' },
    verses: EPH_5_18,
  },
  {
    id: 51002,
    body: HENRY_BODY,
    origin: 'corpus',
    source: { id: 12, author: 'Matthew Henry', title: 'Complete Commentary', tradition: 'reformed' },
    verses: EPH_5_18,
  },
  {
    id: 30001,
    body: CLARKE_BODY,
    origin: 'corpus',
    source: { id: 15, author: 'Adam Clarke', title: "Clarke's Commentary", tradition: 'methodist' },
    verses: PROV_23,
  },
  {
    id: 61,
    body: USER_SERMON_BODY,
    origin: 'user_library',
    source: { id: 900, author: 'Uploaded Preacher', title: 'Sunday Sermons 2019', tradition: 'reformed' },
    verses: PROV_23,
  },
  {
    id: 62,
    body: USER_NOTES_BODY,
    origin: 'user_library',
    source: { id: 901, author: 'Second Uploader', title: 'Notes on the Fathers', tradition: 'patristic' },
    verses: EPH_5_18,
  },
];

const sectionMap = new Map(SECTIONS.map((s) => [`${s.origin}:${s.id}`, s]));

const corpus: CorpusLookup = {
  async getSection(sectionId, origin) {
    return sectionMap.get(`${origin}:${sectionId}`) ?? null;
  },
  async getSource() {
    return null; // no reading blocks in these fixtures
  },
  async getTranslation(slug) {
    if (slug === 'web') return { slug: 'web', isActive: true, licensedForDisplay: true };
    return null;
  },
  async verseExists() {
    return true;
  },
};

// A voice block derived from a fixture section: verbatim quote, matching
// attribution, anchor on the section's own verse range. Structurally flawless —
// the ONLY thing distinguishing these blocks is `attribution.origin`.
function voiceFor(id: number): VoiceBlock {
  const s = SECTIONS.find((x) => x.id === id);
  if (!s) throw new Error(`no fixture section ${id}`);
  return {
    type: 'voice',
    section_id: s.id,
    attribution: {
      author: s.source.author,
      work: s.source.title,
      tradition: s.source.tradition,
      origin: s.origin,
    },
    quote: s.body,
    anchors: [{ ...s.verses! }],
  };
}

function response(blocks: TeacherResponse['blocks']): TeacherResponse {
  return { contract_version: '1.1', teacher: 'study-guide', blocks };
}

describe('V1 verifier: user-library voices are additive, never load-bearing (H4)', () => {
  it('(a) an all-user_library answer fails the diversity floors — user voices do not count', async () => {
    // Two user uploads spanning two "traditions", both perfectly cited. Retrieval
    // offered two sections across two traditions, so both floors engage at 2.
    // User voices must satisfy NEITHER: zero corpus sections, zero corpus traditions.
    const retrieval: RetrievalContext = {
      sectionIds: [61, 62],
      traditions: ['reformed', 'patristic'],
    };
    const result = await verifyV1(response([voiceFor(61), voiceFor(62)]), corpus, retrieval);
    expect(result.ok).toBe(false);
    const checks = violations(result).map((v) => v.check);
    expect(checks).toContain('diversity_traditions');
    expect(checks).toContain('diversity_voices');
  });

  it('(b) a user voice must not raise the tradition/section count above the corpus voice alone', async () => {
    // One corpus voice (patristic) + one user voice (reformed). Pre-H4 the user
    // voice made this look like 2 sections / 2 traditions and the answer passed.
    // The corpus voice ALONE provides 1 of each, so both floors must fire.
    const retrieval: RetrievalContext = {
      sectionIds: [48210, 61],
      traditions: ['patristic', 'reformed'],
    };
    const result = await verifyV1(response([voiceFor(48210), voiceFor(61)]), corpus, retrieval);
    expect(result.ok).toBe(false);
    const checks = violations(result).map((v) => v.check);
    expect(checks).toContain('diversity_traditions');
    expect(checks).toContain('diversity_voices');
  });

  it('(c) a passage grounded ONLY by a user-origin anchor fails passages_grounded', async () => {
    // Two corpus voices (satisfying diversity, both anchored Eph 5:18) plus one
    // user voice anchored Prov 23. The displayed Prov 23 passage is contained in
    // NO corpus anchor — only the user upload "authorizes" it. That is a user
    // document selecting Scripture for display: fail closed.
    const retrieval: RetrievalContext = {
      sectionIds: [48210, 51002],
      traditions: ['patristic', 'reformed'],
    };
    const r = response([
      voiceFor(48210),
      voiceFor(51002),
      voiceFor(61),
      { type: 'passages', items: [{ ...EPH_5_18, translation: 'web' }, { ...PROV_23, translation: 'web' }] },
    ]);
    const result = await verifyV1(r, corpus, retrieval);
    expect(result.ok).toBe(false);
    const v = violations(result);
    expect(v.some((x) => x.check === 'passages_grounded')).toBe(true);
    // and it is the Prov 23 passage (the user-grounded one), not the Eph 5:18 one
    expect(v.filter((x) => x.check === 'passages_grounded')).toHaveLength(1);
  });

  it('(d) control: the same shape with all-corpus origins still passes', async () => {
    // Identical structure to (c), but the Prov 23 voice is the corpus Clarke
    // section. Everything is corpus-grounded: no violation, no regression.
    const retrieval: RetrievalContext = {
      sectionIds: [48210, 51002, 30001],
      traditions: ['patristic', 'reformed', 'methodist'],
    };
    const r = response([
      voiceFor(48210),
      voiceFor(51002),
      voiceFor(30001),
      { type: 'passages', items: [{ ...EPH_5_18, translation: 'web' }, { ...PROV_23, translation: 'web' }] },
    ]);
    const result = await verifyV1(r, corpus, retrieval);
    expect(result).toEqual({ ok: true });
  });
});
