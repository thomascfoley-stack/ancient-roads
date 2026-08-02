// Reading-unit grouping (docs/LIBRARY_READER_DESIGN.md §2 + ADR-026): the TOC drawer
// groups consecutive rows that share a unit_ordinal into ONE reading unit, in order —
// chunked ingest splits a single sermon/chapter into several sections, and the reader
// navigates units, not chunks.

import { describe, expect, it } from 'vitest';
import { groupTocByUnit } from '@/lib/work-reader';
import type { WorkTocRow } from '@/lib/work';

function row(ordinal: number, unitOrdinal: number | null, heading: string | null): WorkTocRow {
  return { id: ordinal * 10, ordinal, unitOrdinal, heading, verseStart: null, verseEnd: null };
}

describe('groupTocByUnit — reading-unit grouping (ADR-026)', () => {
  it('groups (1,1,1,2,3,3) into 3 units in order', () => {
    const toc = [
      row(1, 1, 'Sermon I (1/3)'),
      row(2, 1, 'Sermon I (2/3)'),
      row(3, 1, 'Sermon I (3/3)'),
      row(4, 2, 'Sermon II'),
      row(5, 3, 'Sermon III (1/2)'),
      row(6, 3, 'Sermon III (2/2)'),
    ];
    const units = groupTocByUnit(toc);

    expect(units).toHaveLength(3);
    expect(units.map((u) => u.unitOrdinal)).toEqual([1, 2, 3]); // order preserved
    expect(units.map((u) => u.rows.length)).toEqual([3, 1, 2]);
    // The unit label is the first heading of the unit.
    expect(units.map((u) => u.label)).toEqual(['Sermon I (1/3)', 'Sermon II', 'Sermon III (1/2)']);
    // Rows stay ordinal-ascending inside each unit.
    expect(units[0]!.rows.map((r) => r.ordinal)).toEqual([1, 2, 3]);
    expect(units[2]!.rows.map((r) => r.ordinal)).toEqual([5, 6]);
  });

  it('rows with a null unit_ordinal never group — each stands alone (pre-024 data)', () => {
    const units = groupTocByUnit([row(1, null, 'One'), row(2, null, 'Two'), row(3, 5, 'Three')]);
    expect(units).toHaveLength(3);
    expect(units.map((u) => u.rows.length)).toEqual([1, 1, 1]);
  });

  it('a missing heading falls back to a Section N label', () => {
    const units = groupTocByUnit([row(9, 4, null)]);
    expect(units[0]!.label).toBe('Section 9');
  });
});
