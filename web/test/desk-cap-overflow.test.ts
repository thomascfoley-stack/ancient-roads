// A078 — THE THREE-PANE CAP MUST REPORT WHAT IT REFUSED.
//
// THE DEFECT. `decodeDesk` truncated a desk URL to MAX_PANES and returned only the survivors, so
// `/desk?p=a&p=b&p=c&p=d` rendered three panes and said nothing whatsoever about the fourth. The
// parser's own comment argues that dropping is safe because "a missing pane is visibly missing" —
// which is true for the person who built the URL and false for the person who was SENT it, and
// desk URLs exist to be sent (that is the stated reason the state lives in the URL at all).
//
// WHAT IS TESTED HERE is the count, because the count is the load-bearing part: a notice is only
// worth showing if the number in it is right, and a number that is wrong in the reader's favour
// ("1 pane did not open" when nothing was lost) is a worse bug than the silence. So the cases
// below are mostly about what must NOT be counted — malformed entries and duplicates are dropped
// for their own documented reasons and cost the reader nothing.
//
// The cap ITSELF is unchanged and is covered by test/desk-panes.test.ts; the assertions here
// re-check that `panes` is still the same three, because a report that changed the thing it
// reports on would be no better than no report.

import { describe, expect, it } from 'vitest';
import { MAX_PANES, decodeDesk, decodeDeskReport, encodePane } from '@/lib/desk';

describe('decodeDeskReport counts the panes the cap refused', () => {
  it('reports zero overflow when everything fits', () => {
    const r = decodeDeskReport(['work:a', 'scripture:john/3']);
    expect(r.panes.map(encodePane)).toEqual(['work:a', 'scripture:john/3']);
    expect(r.overflow).toBe(0);
  });

  it('reports zero overflow on an exactly-full desk', () => {
    // The boundary in the direction that matters: three panes is not an overflow of any kind, and
    // an off-by-one here would put "1 pane did not open" on every full desk in the product.
    const r = decodeDeskReport(['work:a', 'work:b', 'work:c']);
    expect(r.panes).toHaveLength(MAX_PANES);
    expect(r.overflow).toBe(0);
  });

  it('reports the one pane a four-pane URL could not open', () => {
    const r = decodeDeskReport(['work:a', 'work:b', 'work:c', 'work:d']);
    expect(r.panes.map(encodePane)).toEqual(['work:a', 'work:b', 'work:c']);
    expect(r.overflow).toBe(1);
  });

  it('counts every refused pane, not just the first', () => {
    const r = decodeDeskReport(['work:a', 'work:b', 'work:c', 'work:d', 'work:e', 'scripture:psa/23']);
    expect(r.panes).toHaveLength(MAX_PANES);
    expect(r.overflow).toBe(3);
  });

  it('counts across comma-joined values the same as repeated params', () => {
    // Both URL shapes are supported, so a reader must not get a different count depending on which
    // one produced the link.
    expect(decodeDeskReport(['work:a,work:b,work:c,work:d']).overflow).toBe(1);
    expect(decodeDeskReport(['work:a', 'work:b', 'work:c', 'work:d']).overflow).toBe(1);
  });

  it('does NOT count malformed entries — they were never panes', () => {
    // `decodePane` refuses these on its own terms and always did; folding them into the overflow
    // would announce a loss that never happened.
    const r = decodeDeskReport(['work:a', 'garbage', 'scripture:john/0', 'work:Uppercase', '']);
    expect(r.panes.map(encodePane)).toEqual(['work:a']);
    expect(r.overflow).toBe(0);
  });

  it('does NOT count duplicates — the reader already has that pane in front of them', () => {
    const r = decodeDeskReport(['work:a', 'work:a', 'work:b', 'work:b']);
    expect(r.panes.map(encodePane)).toEqual(['work:a', 'work:b']);
    expect(r.overflow).toBe(0);
  });

  it('a duplicate BEYOND the cap is still not a loss', () => {
    // a,b,c fills the desk and the fourth entry repeats one of them: nothing was refused that the
    // reader is not already looking at, so the honest count is zero. Counting position instead of
    // identity is the easy way to get this wrong.
    const r = decodeDeskReport(['work:a', 'work:b', 'work:c', 'work:a']);
    expect(r.panes.map(encodePane)).toEqual(['work:a', 'work:b', 'work:c']);
    expect(r.overflow).toBe(0);
  });

  it('separates the two reasons in one URL: 1 refused, the rest merely malformed or duplicate', () => {
    const r = decodeDeskReport(['work:a', 'nonsense', 'work:b', 'work:a', 'work:c', 'work:d']);
    expect(r.panes.map(encodePane)).toEqual(['work:a', 'work:b', 'work:c']);
    expect(r.overflow).toBe(1);
  });
});

describe('decodeDesk still behaves exactly as it did', () => {
  it('returns the report’s panes and nothing else', () => {
    // decodeDesk is now a wrapper, and it has callers that are not this pass's to change
    // (library/[catalog], ask-client). Its contract must be byte-for-byte what it was.
    for (const values of [
      ['work:a', 'work:b', 'work:c', 'work:d'],
      ['work:a,work:a,work:b,work:c'],
      ['work:a', 'garbage', 'scripture:john/3'],
      [],
    ]) {
      expect(decodeDesk(values)).toEqual(decodeDeskReport(values).panes);
    }
  });

  it('never returns more than MAX_PANES', () => {
    expect(decodeDesk(['work:a', 'work:b', 'work:c', 'work:d', 'work:e'])).toHaveLength(MAX_PANES);
  });
});
