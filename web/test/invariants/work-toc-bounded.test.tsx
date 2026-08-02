// @vitest-environment jsdom

// PHASE 4 REQUIREMENT B — the TOC drawer must mount O(units), not O(sections).
//
// THE DEFECT (found in the Phase 2 browser pass, deferred to Phase 4): work-toc.tsx rendered a
// unit header PLUS a full <button> for every section chunk. Measured live on Calvin's Institutes:
// opening the drawer mounted 3,448 buttons. The reading-unit grouping (ADR-026) was correct in the
// DATA and correct in groupTocByUnit — the drawer simply did not use it to bound the render.
//
// Two costs: a mobile device mounts thousands of nodes on a drawer open, and the TOC stops being
// navigation — for a chunked work every row reads "TITLE — ref (N/23)", so the list is a wall of
// near-identical labels. It is also the client-side twin of the repo's "never return an unbounded
// result set" rule (CLAUDE.md): bounded on the wire, unbounded in the DOM.
//
// The bound asserted here: mounted nav buttons must scale with UNITS, not sections. One unit may
// be expanded (the one you are reading), so the allowance is units + one unit's chunks + chrome —
// never the section count.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkToc } from '@/components/work-toc';
import type { WorkTocUnit } from '@/lib/work';

afterEach(cleanup);

// jsdom does not implement scrollIntoView, and WorkToc centres the active row on open. Without
// this stub the suite fails on the environment instead of on the thing under test.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function scrollIntoView() {};

const UNITS = 16;
const CHUNKS_PER_UNIT = 215; // 16 * 215 = 3,440 sections — Calvin-scale

// THE FIXTURE IS NOW UNITS, because the SERVER groups (lib/work.ts, 2026-08-02). It used to be
// 3,440 SECTION rows that the client grouped, which is exactly the shape that made the response
// scale with chunking: spurgeon-sermons is 118,371 sections in 3,540 sermons, so a section-shaped
// TOC spent its whole 5,000-row budget on the first ~150 sermons. The bound asserted here did not
// change; what changed is that the wire is bounded too, not only the DOM.
/** A chunked work shaped like the real corpus: 16 units of 215 sections each. */
function bigToc(): WorkTocUnit[] {
  const units: WorkTocUnit[] = [];
  let ordinal = 1;
  for (let u = 1; u <= UNITS; u++) {
    units.push({
      unitOrdinal: u,
      firstId: ordinal,
      firstOrdinal: ordinal,
      lastOrdinal: ordinal + CHUNKS_PER_UNIT - 1,
      sectionCount: CHUNKS_PER_UNIT,
      heading: `SERMON ${u} — PROVERBS 24:30-32 (1/${CHUNKS_PER_UNIT})`,
      verseStart: null,
      verseEnd: null,
    });
    ordinal += CHUNKS_PER_UNIT;
  }
  return units;
}

function navButtons(): HTMLButtonElement[] {
  // every clickable row/disclosure inside the drawer, excluding nothing — this is the mount cost
  return [...document.querySelectorAll('button')] as HTMLButtonElement[];
}

describe('WorkToc — bounded render (O(units), not O(sections))', () => {
  it('a 3,440-section work mounts on the order of its 16 units, not its sections', () => {
    const toc = bigToc();
    // The fixture is UNIT-shaped now, and still represents a 3,440-section work: the sections are
    // counted through sectionCount rather than by having one row each. Asserting both keeps the
    // test honest about scale — a unit list that had quietly lost its section counts would pass a
    // bare `toc.length === UNITS`.
    expect(toc.length).toBe(UNITS);
    expect(toc.reduce((n, u) => n + u.sectionCount, 0)).toBe(UNITS * CHUNKS_PER_UNIT);

    render(<WorkToc toc={toc} sourceType="sermon" currentOrdinal={1} onNavigate={() => {}} onClose={() => {}} />);

    const buttons = navButtons();
    // Generous allowance: one button per unit, plus a disclosure per unit, plus the chunks of the
    // ONE expanded unit, plus drawer chrome. Still an order of magnitude below the section count.
    const allowance = UNITS * 2 + CHUNKS_PER_UNIT + 10;
    expect(
      buttons.length,
      `TOC mounted ${buttons.length} buttons for ${toc.length} sections — it must bound to units (allowance ${allowance})`,
    ).toBeLessThanOrEqual(allowance);
    // and it must not have collapsed to nothing: every unit is still reachable
    expect(buttons.length, 'every unit must still be reachable').toBeGreaterThanOrEqual(UNITS);
  });

  it('every unit is represented exactly once at rest, labelled by its first heading', () => {
    render(<WorkToc toc={bigToc()} currentOrdinal={1} onNavigate={() => {}} onClose={() => {}} />);
    const text = document.body.textContent ?? '';
    for (let u = 1; u <= UNITS; u++) {
      // the unit label is the first chunk's heading (ADR-026)…
      expect(text, `unit ${u} must appear in the TOC`).toContain(`SERMON ${u} — PROVERBS 24:30-32`);
    }
    // …with the "(i/n)" chunk marker STRIPPED on the unit row. Carrying it made every row read
    // "TITLE — ref (1/215)", which is what turned the TOC into a wall of near-identical labels.
    // (Unit 5 is collapsed here; the expanded unit legitimately shows markers on its chunk rows.)
    expect(text, 'a collapsed unit row must not carry the chunk marker').not.toContain(
      `SERMON 5 — PROVERBS 24:30-32 (1/${CHUNKS_PER_UNIT})`,
    );
  });

  it('a single-section unit still renders as one directly-clickable row', () => {
    const toc: WorkTocRow[] = [
      { id: 1, ordinal: 1, unitOrdinal: 1, heading: 'Preface', verseStart: null, verseEnd: null },
      { id: 2, ordinal: 2, unitOrdinal: 2, heading: 'Chapter I', verseStart: null, verseEnd: null },
      { id: 3, ordinal: 3, unitOrdinal: 3, heading: 'Chapter II', verseStart: null, verseEnd: null },
    ];
    render(<WorkToc toc={toc} sourceType="sermon" currentOrdinal={1} onNavigate={() => {}} onClose={() => {}} />);
    const text = document.body.textContent ?? '';
    for (const h of ['Preface', 'Chapter I', 'Chapter II']) expect(text).toContain(h);
  });
});

// STEP 2 — the DOM stays bounded when the UNIT count itself is large.
//
// Grouping in SQL fixed the wire (3,540 rows instead of 118,371) but not the DOM: bdb-lexicon is
// 9,770 units, and mounting 9,770 buttons on a drawer open is the same unbounded-render defect
// this file was written for, one layer up. The reveal is incremental, and everything stays
// reachable through it.
describe('WorkToc — bounded when the UNIT list is large', () => {
  function manyUnits(n: number): WorkTocUnit[] {
    return Array.from({ length: n }, (_, i) => ({
      unitOrdinal: i + 1,
      firstId: i + 1,
      firstOrdinal: i + 1,
      lastOrdinal: i + 1,
      sectionCount: 1,
      heading: `Entry ${i + 1}`,
      verseStart: null,
      verseEnd: null,
    }));
  }

  it('a 9,770-unit lexicon does not mount 9,770 rows', () => {
    // SEED: render `units` instead of `visible` -> 9,771 buttons and a drawer that janks open.
    render(<WorkToc toc={manyUnits(9_770)} sourceType="lexicon" currentOrdinal={1} onNavigate={() => {}} onClose={() => {}} />);
    const n = navButtons().length;
    expect(n, `mounted ${n} rows for 9,770 units`).toBeLessThanOrEqual(260);
    // and it must not have collapsed to nothing
    expect(n).toBeGreaterThan(100);
  });

  it('the rest stays reachable — "show more" reveals another page', () => {
    render(<WorkToc toc={manyUnits(9_770)} sourceType="lexicon" currentOrdinal={1} onNavigate={() => {}} onClose={() => {}} />);
    const before = navButtons().length;
    const more = [...document.querySelectorAll('button')].find((b) => /Show .* more/.test(b.textContent ?? ''));
    expect(more, 'a large list must offer a way to see the rest').toBeTruthy();
    fireEvent.click(more!);
    expect(navButtons().length).toBeGreaterThan(before);
  });

  it('search narrows what is mounted, and says how many matched', () => {
    render(<WorkToc toc={manyUnits(9_770)} sourceType="lexicon" currentOrdinal={1} onNavigate={() => {}} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Search the contents'), { target: { value: 'Entry 4242' } });
    expect(navButtons().length).toBeLessThan(10);
    expect(document.body.textContent).toContain('1 of 9,770');
  });

  it('a query that matches nothing says so rather than rendering an empty drawer', () => {
    render(<WorkToc toc={manyUnits(500)} sourceType="lexicon" currentOrdinal={1} onNavigate={() => {}} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Search the contents'), { target: { value: 'zzzznope' } });
    expect(document.body.textContent).toContain('No entry matches.');
  });
});
