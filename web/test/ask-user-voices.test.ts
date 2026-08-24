// Unit tests for the user-voices lane (Slice 4, web/src/lib/teacher/user-voices.ts) and the
// user_library namespace in buildCorpusLookup (web/src/lib/teacher/corpus.ts). Node env, no
// DB: semanticSearch and runAsUser are mocked — what is tested is the LANE's own logic
// (K bound, fail-soft, anchor-span merge, prompt-block shape) and the lookup wiring the
// verifier's H4 trust boundary keys on.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const semanticSearch = vi.fn();
const runAsUser = vi.fn();
vi.mock('@/lib/user-corpus/search', () => ({
  semanticSearch: (...args: unknown[]) => semanticSearch(...args),
}));
vi.mock('@/lib/db', () => ({
  runAsUser: (...args: unknown[]) => runAsUser(...args),
  getDb: () => { throw new Error('getDb must not be reached in these tests'); },
}));

const { retrieveUserVoices, formatUserLibrarySources, USER_VOICE_K } = await import('@/lib/teacher/user-voices');
const { buildCorpusLookup } = await import('@/lib/teacher/corpus');

const HIT = (sectionId: string, title: string, score = 0.5) => ({
  documentId: `doc-${sectionId}`,
  sectionId,
  title,
  heading: null,
  ordinal: 1,
  text: `body of ${sectionId}`,
  score,
  createdAt: '2026-08-23',
});

const CHUNK = (n: number) => ({
  sourceId: `s${n}`,
  score: 0.9,
  content: `corpus content ${n}`,
  metadata: {
    author: `Author ${n}`, year: null, tradition: 'reformed', sourceTitle: `Work ${n}`,
    sourceUrl: null, verseId: 45008001, verseEnd: 45008010, model: 'bge',
  },
});

beforeEach(() => {
  semanticSearch.mockReset();
  runAsUser.mockReset();
});

describe('retrieveUserVoices', () => {
  it('passes the K bound through to semanticSearch (default USER_VOICE_K = 3)', async () => {
    semanticSearch.mockResolvedValue([]);
    await retrieveUserVoices('user-a', [0.1, 0.2]);
    expect(semanticSearch).toHaveBeenCalledWith('user-a', [0.1, 0.2], { limit: USER_VOICE_K });
    expect(USER_VOICE_K).toBe(3);
  });

  it('fails soft: a retrieval error resolves to [] and never throws', async () => {
    semanticSearch.mockRejectedValue(new Error('db down'));
    await expect(retrieveUserVoices('user-a', [0.1])).resolves.toEqual([]);
  });

  it('fails soft when the anchor-span read errors', async () => {
    semanticSearch.mockResolvedValue([HIT('sec1', 'Sermon')]);
    runAsUser.mockRejectedValue(new Error('db down'));
    await expect(retrieveUserVoices('user-a', [0.1])).resolves.toEqual([]);
  });

  it('merges anchor spans onto hits; unanchored sections get no verses', async () => {
    semanticSearch.mockResolvedValue([HIT('sec1', 'Sermon One'), HIT('sec2', 'Sermon Two')]);
    runAsUser.mockResolvedValue([[{ section_id: 'sec1', s: 45008001, e: 45008039 }]]);
    const voices = await retrieveUserVoices('user-a', [0.1]);
    expect(voices).toHaveLength(2);
    expect(voices[0]).toMatchObject({
      sectionId: 'sec1', title: 'Sermon One', text: 'body of sec1',
      verses: { start: 45008001, end: 45008039 },
    });
    expect(voices[1]!.verses).toBeUndefined();
  });

  it('returns [] without an anchor query when there are no hits', async () => {
    semanticSearch.mockResolvedValue([]);
    await expect(retrieveUserVoices('user-a', [0.1])).resolves.toEqual([]);
    expect(runAsUser).not.toHaveBeenCalled();
  });
});

describe('formatUserLibrarySources', () => {
  it('is empty for no voices', () => {
    expect(formatUserLibrarySources([], 6)).toBe('');
  });

  it('numbers sources continuing after the corpus voices and labels origin user_library', () => {
    const out = formatUserLibrarySources(
      [
        { sectionId: 's1', documentId: 'd1', title: 'Sunday Sermons 2019', text: 'my words', score: 0.81234, verses: { start: 45008001, end: 45008039 } },
        { sectionId: 's2', documentId: 'd2', title: 'Notes', text: 'more words', score: 0.5 },
      ],
      6,
    );
    expect(out).toContain('--- SOURCE 6 ---');
    expect(out).toContain('--- SOURCE 7 ---');
    expect(out).toContain('section_id: 6');
    expect(out).toContain('work: Sunday Sermons 2019');
    expect(out).toContain('origin: user_library');
    expect(out).toContain('tradition: unknown');
    expect(out).toContain('verse_range: 45008001-45008039');
    expect(out).toContain('verse_range: unanchored');
    expect(out).toContain('NEVER count toward the >=2 voices/traditions requirements');
  });
});

describe('buildCorpusLookup user_library namespace', () => {
  const lookup = buildCorpusLookup(
    [CHUNK(1), CHUNK(2)],
    [
      { sectionId: 'u1', documentId: 'd1', title: 'My Sermon', text: 'user body one', score: 0.7, verses: { start: 45008001, end: 45008039 } },
      { sectionId: 'u2', documentId: 'd2', title: 'My Notes', text: 'user body two', score: 0.6 },
    ],
  );

  it('resolves user sections under user_library with ids continuing after the corpus set', async () => {
    const s = await lookup.getSection(3, 'user_library');
    expect(s).toMatchObject({
      id: 3,
      body: 'user body one',
      origin: 'user_library',
      source: { author: 'You', title: 'My Sermon', tradition: 'unknown' },
      verses: { start: 45008001, end: 45008039 },
    });
    const s2 = await lookup.getSection(4, 'user_library');
    expect(s2?.body).toBe('user body two');
    expect(s2?.verses).toBeUndefined();
  });

  it('keeps the namespaces disjoint: no cross-origin resolution', async () => {
    expect(await lookup.getSection(3, 'corpus')).toBeNull();
    expect(await lookup.getSection(1, 'user_library')).toBeNull();
    expect((await lookup.getSection(1, 'corpus'))?.body).toBe('corpus content 1');
  });

  it('defaults to corpus-only when no user voices are given (legacy callers unchanged)', async () => {
    const plain = buildCorpusLookup([CHUNK(1)]);
    expect(await plain.getSection(2, 'user_library')).toBeNull();
  });
});
