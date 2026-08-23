// THE CITATION'S PROVENANCE TAG IS DERIVED SERVER-SIDE FROM THE SOURCE RECORD
// (WORKLOG 2026-08-21 deferred security finding: "`(CCEL)` hardcoded provenance";
// order 2026-08-22-autonomous-swarm-closeout §6 W-SEC-CCEL: "derive from the source record").
// sources.provenance->>'url' is the record's own declaration of where the text came from;
// its host is the short tag the copied citation carries. Same two-place lesson as the
// deep-link CRITICAL (history-row-to-result.test.ts): the derivation helper AND the SELECT
// that feeds it are both pinned — a mapper-only test cannot see ROW_COLS lose the url.
//
// RED-PROOF: drop `src.provenance->>'url'` from ROW_COLS (or make provenanceHostOf return a
// constant) and this file goes red. Mutation transcript:
// docs/evidence/swarm-2026-08-22/w-sec-ccel/.
import { describe, expect, it } from 'vitest';
import { provenanceHostOf, ROW_COLS } from '@/lib/history-search-db';

describe('provenanceHostOf — host of the source record’s provenance url', () => {
  it('derives the tag from real served-history provenance urls', () => {
    expect(provenanceHostOf('https://www.ccel.org/ccel/schaff/hcc1')).toBe('ccel.org');
    expect(provenanceHostOf('https://crosswire.org/sword/modules/ModInfo.jsp?modName=Josephus')).toBe('crosswire.org');
  });
  it('fails closed: no url or an unparseable url yields NO tag, never an invented one', () => {
    expect(provenanceHostOf(null)).toBeNull();
    expect(provenanceHostOf('not a url')).toBeNull();
  });
});

describe('ROW_COLS — the SQL half of the provenance contract', () => {
  it('selects the source record’s provenance url so the tag can be derived at all', () => {
    expect(ROW_COLS).toContain(`src.provenance->>'url'`);
  });
});
