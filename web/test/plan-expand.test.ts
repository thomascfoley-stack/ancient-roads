// expandPlan invariants (web/src/lib/plan/expand.ts). Pure function, no DB.
// The leap-boundary case is STUDY_PLANS_DESIGN §12 step 1's red-proof: an
// ordinal-based implementation goes red here, which is the whole point.

import { describe, expect, it } from 'vitest';
import { addDays, expandPlan } from '@/lib/plan/expand';
import { parsePlanSpec } from '@/lib/plan/spec';

const spec = (over: Record<string, unknown> = {}) => {
  const out = parsePlanSpec(
    Object.assign(
      { scope: { kind: 'book', book: 'rom' }, weeks: 8, daysPerWeek: 2, startDate: '2026-03-02' },
      over,
    ),
  );
  if (!out.ok) throw new Error(out.reason);
  return out.spec;
};

describe('addDays — calendar arithmetic without a clock', () => {
  it('crosses the leap boundary correctly', () => {
    // SEED: implement with day-of-year ordinals and 2024-02-28+2 lands on
    // Mar 1 in a leap year (should be Mar 1 ONLY in non-leap years).
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29'); // leap year
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01'); // non-leap
    expect(addDays('2024-02-28', 2)).toBe('2024-03-01');
  });

  it('crosses month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });
});

describe('expandPlan — schedule arithmetic', () => {
  it('Romans in 8 weeks at 2 days/week = 16 days over 16 chapters, 1:1', () => {
    const r = expandPlan(spec());
    if (!r.ok) throw new Error(r.reason);
    expect(r.days).toHaveLength(16);
    expect(r.days.map((d) => d.chapterStart)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    // Contiguity: dayIndex 1..N with no gap, dates strictly increasing.
    expect(r.days.map((d) => d.dayIndex)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    const dates = r.days.map((d) => d.date);
    expect([...dates].sort()).toEqual(dates);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('weekly cadence: 2 days/week from a Monday lands Mon+Tue each week', () => {
    const r = expandPlan(spec());
    if (!r.ok) throw new Error(r.reason);
    expect(r.days.slice(0, 4).map((d) => d.date)).toEqual([
      '2026-03-02', '2026-03-03', // week 1
      '2026-03-09', '2026-03-10', // week 2
    ]);
  });

  it('a leap-spanning plan never repeats or skips a date', () => {
    // SEED: ordinal arithmetic makes every date after Feb shift by one in a
    // leap year — the duplicate/gap assertion below is what catches it.
    const r = expandPlan(spec({ startDate: '2024-02-26', weeks: 2, daysPerWeek: 7 }));
    if (!r.ok) throw new Error(r.reason);
    expect(r.days.map((d) => d.date)).toContain('2024-02-29');
    const dates = r.days.map((d) => d.date);
    expect(new Set(dates).size).toBe(14);
    expect(dates[dates.length - 1]).toBe(addDays('2024-02-26', 13));
  });

  it('chapters distribute evenly with no chapter lost or doubled', () => {
    // Genesis (50 chapters) over 12 reading days: every chapter appears in
    // exactly one day's [chapterStart, chapterEnd] span, in order.
    const r = expandPlan(spec({ scope: { kind: 'book', book: 'gen' }, weeks: 6, daysPerWeek: 2 }));
    if (!r.ok) throw new Error(r.reason);
    const covered: number[] = [];
    for (const d of r.days) for (let c = d.chapterStart; c <= d.chapterEnd; c++) covered.push(c);
    expect(covered).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it('a range scope expands only its chapters', () => {
    const r = expandPlan(spec({ scope: { kind: 'range', ref: 'Romans 1-8' }, weeks: 4, daysPerWeek: 2 }));
    if (!r.ok) throw new Error(r.reason);
    expect(r.days).toHaveLength(8);
    expect(r.days[0]!.chapterStart).toBe(1);
    expect(r.days[7]!.chapterEnd).toBe(8);
  });

  it('refuses a scope thinner than the schedule instead of padding', () => {
    // SEED: pad short scopes by repeating chapters and this goes red.
    const r = expandPlan(spec({ scope: { kind: 'range', ref: 'Philemon' }, weeks: 4, daysPerWeek: 5 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not enough for \d+ reading days/);
  });
});

describe('parsePlanSpec — the edge', () => {
  it('rejects out-of-bound and malformed fields with reasons', () => {
    for (const [over, why] of [
      [{ weeks: 0 }, /weeks/],
      [{ weeks: 105 }, /weeks/],
      [{ daysPerWeek: 8 }, /daysPerWeek/],
      [{ startDate: '2026-2-3' }, /startDate/],
      [{ startDate: '2026-13-01' }, /startDate/],
      [{ scope: { kind: 'book', book: 'nope' } }, /unknown book/],
      [{ scope: { kind: 'range', ref: 'not a reference' } }, /not a reference/i],
    ] as const) {
      const r = parsePlanSpec(
        Object.assign({ scope: { kind: 'book', book: 'rom' }, weeks: 8, daysPerWeek: 2, startDate: '2026-03-02' }, over),
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(why);
    }
  });

  it('accepts and normalizes a valid book spec', () => {
    const r = parsePlanSpec({ scope: { kind: 'book', book: ' ROM ' }, weeks: 8, daysPerWeek: 2, startDate: '2026-03-02' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.spec.scope).toEqual({ kind: 'book', book: 'rom' });
  });
});
