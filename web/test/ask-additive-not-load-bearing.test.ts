// Slice 4 trust boundary at the PIPELINE level (H4 / SERMON_SEARCH_DESIGN §7(b)(c)): an /ask
// answer must never rest solely on the asker's own uploads. This drives the REAL components
// exactly as teach.ts wires them — buildCorpusLookup(corpusVoices, userVoices) +
// normalizeContract(parsed, sectionAttributions) + verifyV1 — with a seeded compose output
// standing in for the model (the live compose path itself is covered by the pre-registered
// bait run, docs/evidence/swarm-2026-08-22/w-slice4/PRE-REG.md). Verifier-level coverage of
// the same rules lives in verifier-origin.test.ts; this file proves the teach.ts wiring
// (user_library namespace + attributions origin) feeds that machine honestly.
//
// RED-PROOF (§2.2): re-introducing the exact H4 defect in normalize-contract.ts — stamping
// `origin: 'corpus'` unconditionally — turns test (1) RED (the all-user answer passes).
// Watched red + revert-to-green transcripts:
// docs/evidence/swarm-2026-08-22/w-slice4/additive-redproof.log

import { describe, expect, it } from 'vitest';

const { buildCorpusLookup } = await import('@/lib/teacher/corpus');
const { normalizeContract } = await import('@/lib/teacher/normalize-contract');
const { verifyV1 } = await import('@/verifier/v1');

const EPH_5_18 = { start: 49005018, end: 49005018 };

const CORPUS_CHUNKS = [
  {
    sourceId: 'c1', score: 0.9,
    content: 'Wine was given to make us cheerful, not to make us behave ourselves unseemly.',
    metadata: {
      author: 'John Chrysostom', year: 390, tradition: 'patristic', sourceTitle: 'Homilies on Ephesians',
      sourceUrl: null, verseId: 49005018, verseEnd: 49005018, model: 'bge', work: 'chrysostom-ephesians',
    },
  },
  {
    sourceId: 'c2', score: 0.88,
    content: 'Drunkenness carries men headlong into other evils; those filled with wine cannot be filled with the Spirit.',
    metadata: {
      author: 'Matthew Henry', year: 1710, tradition: 'reformed', sourceTitle: 'Complete Commentary',
      sourceUrl: null, verseId: 49005018, verseEnd: 49005018, model: 'bge', work: 'henry-commentary',
    },
  },
];

const USER_VOICES = [
  {
    sectionId: 'u1', documentId: 'd1', title: 'Sunday Sermons 2019', score: 0.8,
    text: 'The cup that shines bites like a serpent at the last, and I have watched it bite.',
    verses: { start: 49005001, end: 49005033 },
  },
  {
    sectionId: 'u2', documentId: 'd2', title: 'Notes on the Fathers', score: 0.7,
    text: 'The old writers counsel a cheerful table and a clear head, and their counsel holds.',
    verses: { start: 49005001, end: 49005033 },
  },
  {
    sectionId: 'u3', documentId: 'd3', title: 'Journal 2024', score: 0.6,
    text: 'Sobriety is not gloom; the merry heart and the watchful heart are neighbours here.',
    verses: { start: 49005001, end: 49005033 },
  },
];

// sectionAttributions exactly as teach.ts builds them: corpus entries first (origin absent —
// normalize-contract's corpus-only default), user entries appended with origin user_library.
const sectionAttributions = [
  ...CORPUS_CHUNKS.map((r) => ({
    author: r.metadata.author,
    work: r.metadata.sourceTitle,
    slug: r.metadata.work,
    tradition: r.metadata.tradition,
    body: r.content,
  })),
  ...USER_VOICES.map((v) => ({
    author: 'You',
    work: v.title,
    tradition: 'unknown',
    body: v.text,
    origin: 'user_library' as const,
  })),
];

// RetrievalContext as teach.ts builds it: CORPUS-ONLY sectionIds and traditions (the
// verdict-condition-1 rule — user ids are never appended).
const retrievalContext = {
  sectionIds: CORPUS_CHUNKS.map((_, i) => i + 1),
  traditions: ['patristic', 'reformed'],
};

function userVoiceBlock(sectionId: number, quote: string) {
  return {
    type: 'voice',
    section_id: sectionId,
    attribution: { author: 'placeholder', work: 'placeholder', tradition: 'placeholder', origin: 'user_library' },
    quote,
    anchors: [{ ...EPH_5_18 }],
  };
}

function corpusVoiceBlock(sectionId: number, quote: string) {
  return { ...userVoiceBlock(sectionId, quote), attribution: { author: 'p', work: 'p', tradition: 'p', origin: 'corpus' } };
}

function response(blocks: unknown[]) {
  return { contract_version: '1.1', teacher: 'study-guide', blocks };
}

describe('/ask pipeline: user voices are additive, never load-bearing', () => {
  it('(1) a composed answer resting SOLELY on user voices is rejected', async () => {
    // Corpus sources were in the prompt (ids 1-2) but the seeded model cited only the three
    // user sections (ids 3-5) and displayed Eph 5:18. Zero corpus-origin sections -> the
    // voices floor fails; zero corpus-origin anchors -> the passage is ungrounded.
    const seeded = response([
      userVoiceBlock(3, USER_VOICES[0]!.text),
      userVoiceBlock(4, USER_VOICES[1]!.text),
      userVoiceBlock(5, USER_VOICES[2]!.text),
      { type: 'passages', items: [{ ...EPH_5_18, translation: 'web' }] },
    ]);
    const parsed = normalizeContract(seeded, sectionAttributions);
    const result = await verifyV1(parsed, buildCorpusLookup(CORPUS_CHUNKS, USER_VOICES), retrievalContext);
    expect(result.ok).toBe(false);
    const checks = result.ok ? [] : result.violations.map((v) => v.check);
    expect(checks).toContain('diversity_voices');
    expect(checks).toContain('passages_grounded');
    // and the origin stamping is true (the thing the H4 defect laundered)
    const blocks = (parsed as { blocks: { attribution?: { origin?: string } }[] }).blocks;
    expect(blocks.slice(0, 3).every((b) => b.attribution?.origin === 'user_library')).toBe(true);
  });

  it('(2) user voices are LEGAL in a passing answer: corpus voices carry the floors, a user voice rides along', async () => {
    const seeded = response([
      corpusVoiceBlock(1, CORPUS_CHUNKS[0]!.content),
      corpusVoiceBlock(2, CORPUS_CHUNKS[1]!.content),
      userVoiceBlock(3, USER_VOICES[0]!.text),
      { type: 'passages', items: [{ ...EPH_5_18, translation: 'web' }] },
    ]);
    const parsed = normalizeContract(seeded, sectionAttributions);
    const result = await verifyV1(parsed, buildCorpusLookup(CORPUS_CHUNKS, USER_VOICES), retrievalContext);
    expect(result).toEqual({ ok: true });
  });

  it('(3) control: the same all-user QUOTES laundered as corpus origin pass — proving (1) turns on origin alone', async () => {
    // The in-test witness: identical words, identical structure, but resolved under the
    // corpus namespace (as if the user uploads were corpus rows). Everything passes — so
    // test (1)'s rejection is the trust boundary working, not an incidental failure. The
    // out-of-test red-proof re-introduces the H4 defect in normalize-contract and watches
    // (1) go red (additive-redproof.log).
    const launderedChunks = USER_VOICES.map((v, j) => ({
      sourceId: `x${j}`, score: 0.5,
      content: v.text,
      metadata: {
        author: 'You', year: null, tradition: j === 1 ? 'reformed' : 'patristic', sourceTitle: v.title,
        sourceUrl: null, verseId: 49005018, verseEnd: 49005018, model: 'bge',
      },
    }));
    const launderedAttributions = launderedChunks.map((r) => ({
      author: r.metadata.author,
      work: r.metadata.sourceTitle,
      tradition: r.metadata.tradition,
      body: r.content,
    }));
    const seeded = response([
      corpusVoiceBlock(1, USER_VOICES[0]!.text),
      corpusVoiceBlock(2, USER_VOICES[1]!.text),
      corpusVoiceBlock(3, USER_VOICES[2]!.text),
      { type: 'passages', items: [{ ...EPH_5_18, translation: 'web' }] },
    ]);
    const parsed = normalizeContract(seeded, launderedAttributions);
    const result = await verifyV1(parsed, buildCorpusLookup(launderedChunks), {
      sectionIds: [1, 2, 3],
      traditions: ['patristic', 'reformed'],
    });
    expect(result).toEqual({ ok: true });
  });
});
