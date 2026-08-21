// THE DEEP LINK RESOLVES TO THE RIGHT PASSAGE (order 2026-08-20-historians-study-entrance,
// deep-audit domain finding 1, CRITICAL).
//
// A history result becomes `/work/{slug}#s{ordinal}`, and the reader resolves that hash by keyset
// over `sections.ordinal` (UNIQUE(source_id, ordinal)) — the raw section number, the same column
// catalog-search.tsx puts in the identical URL. The mapper had been emitting `unit_ordinal`, the
// migration-024 collapsed-unit numbering: a different, smaller sequence that is NULL for 11 of the
// 28 served history works. So every "Open in book" either landed on the wrong passage (Josephus:
// max unit 2687 vs real 4112) or, on a NULL row, produced `#snull`, which `^#s(\d+)$` cannot match,
// and the reader silently opened the work at the top. Confirmed against the dev corpus 2026-08-21.
//
// This pins the contract at the one seam a DB-free test can reach: the row carries BOTH a raw
// `ordinal` and (as separate DB reality) may have a differing/NULL unit number, and the result MUST
// carry the raw ordinal. SEED to prove it fails: change `sectionId: row.id, ordinal: row.ordinal`
// back toward a unit number in rowToResult and the ordinal assertions below go red.

import { describe, expect, it } from 'vitest';
import { rowToResult } from '@/lib/history-search-db';

// The mapper's Row shape is internal; this is the subset it reads, built to mirror a real
// `SELECT s.id, s.ordinal, s.heading, s.body, …` row where the section sits deep in the work.
const row = {
  id: 90210,
  source_id: 7,
  ordinal: 4112, // sections.ordinal — what the reader keysets to
  heading: 'Book VI — Chapter 4 — The Fall of the Temple',
  body: 'And thus was Jerusalem taken, in the second year of the reign of Vespasian.',
  period_start_year: 70,
  period_end_year: 70,
  slug: 'josephus-whiston',
  title: 'The Complete Works',
  author: 'Flavius Josephus',
} as unknown as Parameters<typeof rowToResult>[0];

describe('rowToResult — the deep-link ordinal is the reader-resolvable section ordinal', () => {
  it('carries sections.ordinal, so #s{ordinal} lands on the hit', () => {
    const r = rowToResult(row, ['text'], undefined);
    expect(r.ordinal).toBe(4112); // NOT a collapsed unit number, NEVER null
    expect(Number.isInteger(r.ordinal)).toBe(true);
    expect(r.sectionId).toBe(90210); // the section id is the row id, unchanged
  });

  it('splits the heading path and windows the excerpt verbatim', () => {
    const r = rowToResult(row, ['text'], undefined);
    expect(r.headingPath).toEqual(['Book VI', 'Chapter 4', 'The Fall of the Temple']);
    // The excerpt is a pure slice of the body — the verbatim gate inside rowToResult would throw
    // otherwise, so reaching this line at all is part of the assertion.
    expect(row.body).toContain(r.excerpt.replace(/…$/, ''));
  });

  it('maps a present period to a [start, end] pair', () => {
    expect(rowToResult(row, ['period'], undefined).period).toEqual([70, 70]);
  });
});
