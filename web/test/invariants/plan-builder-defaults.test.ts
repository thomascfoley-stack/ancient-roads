// L2b — THE PLAN BUILDER MUST NOT OPEN IN AN ERROR STATE.
//
// Exit test for block `L2b` of docs/UX_REMEDIATION.md, written before the fix (§0.1).
//
// THE DEFECT, confirmed live on production 2026-08-07 (INSTR): the builder opens at
// `rom` / 8 weeks / 5 days = 40 reading days against Romans's 16 chapters, so it renders
// "This has only 16 chapters, not enough for 40 reading days" and `Create plan` is DISABLED
// before the reader has touched anything. Measured: `createDisabled: true` on open.
//
// The block's Do-NOT is as important as its ask: the validation copy and the pre-commit preview
// are the two best pieces of interaction design in the product. The validation must become
// UNREACHABLE THROUGH NORMAL USE, not deleted — so this file asserts both directions.
//
// L2b's three exit checks are all BROWSER (cycling a live selector). This is the AGENT-verifiable
// core underneath them: the derivation itself. It does not replace the browser pass and the block
// stays open until that runs.

import { describe, expect, it } from 'vitest';
import { BOOKS, BOOK_BY_SLUG } from '@/bible/books';
import { defaultPlanShape } from '@/lib/plan/defaults';

describe('L2b — default weeks are derived from the book', () => {
  // SEED: return a constant 8 -> RED on Romans, Jude and every short book.
  it('never proposes more reading days than the book has chapters', () => {
    const tooLong: string[] = [];
    for (const b of BOOKS) {
      for (const daysPerWeek of [1, 3, 5, 7]) {
        const shape = defaultPlanShape(b.slug, daysPerWeek);
        if (shape.weeks * shape.daysPerWeek > b.chapterCount) {
          tooLong.push(`${b.slug} (${b.chapterCount}ch) @${daysPerWeek}/wk -> ${shape.weeks}wk x ${shape.daysPerWeek}d`);
        }
      }
    }
    expect(tooLong, 'these open the builder in its own validation error').toEqual([]);
  });

  it('the specific case the audits screenshotted: Romans at the default 5 days/week', () => {
    // 16 chapters / 5 per week -> 4 weeks (20 slots) would still exceed 16. ceil is not enough on
    // its own; the derivation must bound total slots by chapters, not just round the weeks.
    const { weeks, daysPerWeek } = defaultPlanShape('rom', 5);
    expect(weeks * daysPerWeek).toBeLessThanOrEqual(BOOK_BY_SLUG.get('rom')!.chapterCount);
  });

  it('handles the single-chapter book without proposing zero weeks', () => {
    // Jude is 1 chapter. Zero weeks is not a plan; one week of one day is.
    expect(defaultPlanShape('jud', 5).weeks).toBeGreaterThanOrEqual(1);
    expect(defaultPlanShape('jud', 5).daysPerWeek).toBe(1); // 1 chapter cannot fill 5 days
  });

  it('gives a long book a proportionate plan rather than a token one', () => {
    // Psalms is 150 chapters. The derivation must not collapse everything to 1 week.
    expect(defaultPlanShape('psa', 5).weeks).toBeGreaterThan(4);
  });

  it('stays within the builder\'s own bounds', () => {
    // The weeks input is min 1 / max 104 (measured on the live builder). A derived default outside
    // that range would be rejected by the control it feeds.
    for (const b of BOOKS) {
      const w = defaultPlanShape(b.slug, 5).weeks;
      expect(w, `${b.slug} derived ${w}`).toBeGreaterThanOrEqual(1);
      expect(w, `${b.slug} derived ${w}`).toBeLessThanOrEqual(104);
    }
  });

  it('falls back safely for an unknown slug rather than throwing', () => {
    expect(defaultPlanShape('nope', 5).weeks).toBeGreaterThanOrEqual(1);
  });
});
