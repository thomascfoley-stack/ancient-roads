// Section ordinals ride on the retrieval rows so an /ask result card can deep-link into the
// reader (/work/[slug]#s{ordinal}). Two things must hold, and they are the reasons this is a
// teach()-level test rather than a unit test of the helper:
//
//   1. RETRIEVAL ACCURACY IS UNTOUCHED. The resolution only WRITES `metadata.sectionOrdinal`;
//      it never reorders, drops, or adds a row. The accuracy gate (CLAUDE.md) is measured over
//      the rows in the order retrieval returns them, and this must not be able to move it.
//   2. FAIL-SOFT. An ask must never fail because a deep link could not be resolved: a throwing
//      locate leaves the ordinals undefined, says so once on console.error, and teach() still
//      composes.
//
// Also pinned: ONE locateSections call per ask (a batch, never one query per row), carrying
// only the rows whose sourceId did not already name the ordinal.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { teach } from '@/lib/teacher/teach';

const locateSections = vi.hoisted(() => vi.fn());
vi.mock('@/lib/work', () => ({ locateSections }));

vi.mock('@/lib/teacher/deepinfra', () => ({
  embedQuery: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
  compose: vi.fn().mockResolvedValue(JSON.stringify({ ok: true })),
  composeModel: 'test-model',
}));

// A classic-commentary row (five-part sourceId, no section id: resolved through the anchors)
// followed by a register-shaped row (the ordinal is on the sourceId: parsed, never queried).
const CLASSIC_ID = 'commentary:jhn:1:1-1:Matthew Henry';
const REGISTER_ID = 'commentary:matthew-henry:9';
const CLASSIC_BODY = 'In the beginning was the Word — Henry on the eternity of the Son.';

vi.mock('@/lib/teacher/retrieve', () => ({
  // Fresh objects per call: the helper WRITES metadata, and a shared fixture would leak an
  // ordinal from one test into the next.
  retrieveCommentary: vi.fn().mockImplementation(async () => [
    {
      sourceId: 'commentary:jhn:1:1-1:Matthew Henry',
      content: 'In the beginning was the Word — Henry on the eternity of the Son.',
      score: 0.9,
      metadata: {
        author: 'Matthew Henry', year: 1710, tradition: 'Nonconformist', sourceTitle: 'Commentary on the Whole Bible',
        sourceUrl: null, verseId: 43001001, verseEnd: 43001001, model: 'bge', work: 'matthew-henry',
      },
    },
    {
      sourceId: 'commentary:matthew-henry:9',
      content: 'A second chunk of Henry, this one from the register-shaped store.',
      score: 0.8,
      metadata: {
        author: 'Matthew Henry', year: 1710, tradition: 'Nonconformist', sourceTitle: 'Commentary on the Whole Bible',
        sourceUrl: null, verseId: 43001002, verseEnd: 43001002, model: 'bge', work: 'matthew-henry',
      },
    },
  ]),
  retrieveSongVerse: vi.fn().mockResolvedValue([]),
  retrieveSermonLane: vi.fn().mockResolvedValue([]),
  retrieveTheologyLane: vi.fn().mockResolvedValue([]),
  retrieveHistorianLane: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/teacher/normalize-contract', () => ({ normalizeContract: (p: unknown) => p }));
vi.mock('@/verifier/v1', () => ({ verifyV1: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock('@/lib/teacher/routing', () => ({ hasPassageCoverage: vi.fn().mockReturnValue(true) }));
vi.mock('../../bible/pericopes', () => ({ resolveIntent: () => ({ inject: [], floor: [] }) }));
vi.mock('../../bible/verse-id', () => ({ formatVerseId: () => 'John 1:1' }));

type Row = { sourceId: string; metadata: { sectionOrdinal?: number } };

async function composedRetrieval(): Promise<Row[]> {
  const { result } = await teach('What does John 1:1 mean?', {});
  expect(result.kind).toBe('composed');
  return (result as { retrieval: Row[] }).retrieval;
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env.DEEPINFRA_API_KEY = 'test-key';
  locateSections.mockReset();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('teach() attaches section ordinals to retrieval rows', () => {
  it('parses register ids, resolves classic ids in ONE batch, and never reorders or filters', async () => {
    locateSections.mockResolvedValue([1234]);
    const retrieval = await composedRetrieval();

    expect(retrieval.map((r) => r.sourceId)).toEqual([CLASSIC_ID, REGISTER_ID]);
    expect(retrieval[0]!.metadata.sectionOrdinal).toBe(1234);
    expect(retrieval[1]!.metadata.sectionOrdinal).toBe(9);

    // One call, carrying exactly the one row the parser could not name.
    expect(locateSections).toHaveBeenCalledTimes(1);
    expect(locateSections).toHaveBeenCalledWith([
      { work: 'matthew-henry', verseId: 43001001, verseEnd: 43001001, content: CLASSIC_BODY },
    ]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('a locate that THROWS leaves the ordinal undefined, logs once, and the ask still composes', async () => {
    locateSections.mockRejectedValue(new Error('anchors table unreachable'));
    const retrieval = await composedRetrieval();

    expect(retrieval.map((r) => r.sourceId)).toEqual([CLASSIC_ID, REGISTER_ID]);
    expect(retrieval[0]!.metadata.sectionOrdinal).toBeUndefined();
    // The parsed ordinal needs no database and survives the failure.
    expect(retrieval[1]!.metadata.sectionOrdinal).toBe(9);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('a locate that returns null leaves the ordinal undefined (no link is minted from nothing)', async () => {
    locateSections.mockResolvedValue([null]);
    const retrieval = await composedRetrieval();
    expect(retrieval[0]!.metadata.sectionOrdinal).toBeUndefined();
    expect(retrieval[1]!.metadata.sectionOrdinal).toBe(9);
  });
});
