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

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkToc } from '@/components/work-toc';
import type { WorkTocRow } from '@/lib/work';

afterEach(cleanup);

// jsdom does not implement scrollIntoView, and WorkToc centres the active row on open. Without
// this stub the suite fails on the environment instead of on the thing under test.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function scrollIntoView() {};

const UNITS = 16;
const CHUNKS_PER_UNIT = 215; // 16 * 215 = 3,440 sections — Calvin-scale

/** A chunked work shaped like the real corpus: each unit's chunks repeat the unit title. */
function bigToc(): WorkTocRow[] {
  const rows: WorkTocRow[] = [];
  let ordinal = 1;
  for (let u = 1; u <= UNITS; u++) {
    for (let c = 1; c <= CHUNKS_PER_UNIT; c++) {
      rows.push({
        id: ordinal,
        ordinal,
        unitOrdinal: u,
        heading: `SERMON ${u} — PROVERBS 24:30-32 (${c}/${CHUNKS_PER_UNIT})`,
      });
      ordinal++;
    }
  }
  return rows;
}

function navButtons(): HTMLButtonElement[] {
  // every clickable row/disclosure inside the drawer, excluding nothing — this is the mount cost
  return [...document.querySelectorAll('button')] as HTMLButtonElement[];
}

describe('WorkToc — bounded render (O(units), not O(sections))', () => {
  it('a 3,440-section work mounts on the order of its 16 units, not its sections', () => {
    const toc = bigToc();
    expect(toc.length).toBe(UNITS * CHUNKS_PER_UNIT);

    render(<WorkToc toc={toc} currentOrdinal={1} onNavigate={() => {}} onClose={() => {}} />);

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
      { id: 1, ordinal: 1, unitOrdinal: 1, heading: 'Preface' },
      { id: 2, ordinal: 2, unitOrdinal: 2, heading: 'Chapter I' },
      { id: 3, ordinal: 3, unitOrdinal: 3, heading: 'Chapter II' },
    ];
    render(<WorkToc toc={toc} currentOrdinal={1} onNavigate={() => {}} onClose={() => {}} />);
    const text = document.body.textContent ?? '';
    for (const h of ['Preface', 'Chapter I', 'Chapter II']) expect(text).toContain(h);
  });
});
