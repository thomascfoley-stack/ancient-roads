// D5 (DEEP_SWEEP, P2) — buildCorpusLookup passed `verseEnd` straight through to the verifier's
// anchor-grounding range. register-writer.ts:248 writes `verseEnd: a?.verseIdEnd ?? 0` for a row
// with no anchor, and unanchored SERVED rows exist by design (the historian lane measures 92.4%
// of historian rows anchorless; the exegetical pool admits commentary/father rows from the same
// writer).
//
// v1.ts:141 then tests `anchor.start <= section.verses.end`, so a section anchored at a real
// verseId with verseEnd 0 has an INVERTED range and rejects every anchor as anchor_offbase — the
// message renders as "Book 0 0:0-Book 0 0:0". Such a voice can never satisfy passages_grounded,
// and a retrieval set dominated by these forces the retry loop into the fallback.
//
// routing.ts:457-463 already defends against exactly this ("verseEnd can be 0/null/invalid under
// data drift"); the verifier path did not.
//
// WHAT THIS FIX DELIBERATELY DOES NOT DO. The sweep offers a second option: "skip anchor-range
// grounding (not rejection) when the section has no real anchor". That would turn a FAIL-CLOSED
// into a FAIL-OPEN on the faithfulness path — a fabricated anchor on an unanchored source would
// stop being rejected. A fully unanchored row (verseId 0) therefore still rejects everything,
// which is correct and stays. Only the recoverable case is repaired: a real verseId with a
// missing or inverted verseEnd.
import { describe, expect, it } from 'vitest';
import { buildCorpusLookup } from '@/lib/teacher/corpus';
import type { RetrievedChunk } from '@/lib/teacher/retrieve';

const JOHN_10_11 = 43010011;
const JOHN_10_18 = 43010018;

const chunk = (verseId: number, verseEnd: number): RetrievedChunk => ({
  content: 'the good shepherd giveth his life for the sheep',
  score: 1,
  metadata: {
    author: 'Matthew Henry', sourceTitle: 'Commentary', tradition: 'reformed',
    verseId, verseEnd, sourceType: 'commentary', sourceId: 's1',
  },
} as unknown as RetrievedChunk);

const rangeOf = async (c: RetrievedChunk) => {
  const s = await buildCorpusLookup([c]).getSection(1, 'corpus');
  return s!.verses;
};

describe('D5 — a missing verseEnd must not invert the grounding range', () => {
  it('a real verseId with verseEnd 0 falls back to verseId, not an inverted range', async () => {
    expect(await rangeOf(chunk(JOHN_10_11, 0))).toEqual({ start: JOHN_10_11, end: JOHN_10_11 });
  });

  it('a verseEnd BELOW verseId is likewise treated as absent', async () => {
    expect(await rangeOf(chunk(JOHN_10_18, JOHN_10_11))).toEqual({ start: JOHN_10_18, end: JOHN_10_18 });
  });

  it('a valid range is passed through untouched', async () => {
    expect(await rangeOf(chunk(JOHN_10_11, JOHN_10_18))).toEqual({ start: JOHN_10_11, end: JOHN_10_18 });
  });

  // The fail-closed half, asserted so a later "improvement" cannot quietly open it.
  it('a FULLY unanchored row still grounds at 0/0 — rejection here is correct, not a bug', async () => {
    expect(await rangeOf(chunk(0, 0)), 'skipping grounding here would fail OPEN').toEqual({ start: 0, end: 0 });
  });
});
