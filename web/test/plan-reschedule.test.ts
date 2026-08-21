// THE CATCH-UP RESCHEDULE IS PURE ARITHMETIC, AND THESE CASES PIN IT.
//
// A lapsed plan's remaining days move forward to `fromDate` at the plan's own
// cadence — the same first-daysPerWeek-days-of-each-week rule expandPlan uses —
// so "Resume from today" changes WHEN, never WHAT or HOW MUCH. Completed days
// are not this function's business: the caller redates only the incomplete set.

import { describe, expect, it } from 'vitest';
import { rescheduleDates, addDays } from '@/lib/plan/expand';

describe('rescheduleDates', () => {
  it('follows the first-N-days-of-each-week cadence from the new start', () => {
    // 5/week from a date: days 0-4, then skip 2, then 7-11.
    const dates = rescheduleDates(5, 7, '2026-08-21');
    expect(dates).toEqual([
      '2026-08-21', '2026-08-22', '2026-08-23', '2026-08-24', '2026-08-25',
      '2026-08-28', '2026-08-29',
    ]);
  });

  it('returns exactly `count` dates, ascending, with no duplicates', () => {
    const dates = rescheduleDates(3, 11, '2026-01-30');
    expect(dates).toHaveLength(11);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
    expect(new Set(dates).size).toBe(11);
  });

  it('crosses a month boundary and a leap boundary by calendar arithmetic', () => {
    // 2028 is a leap year: Feb 28 -> 29 -> Mar 1 at 7/week (every day).
    expect(rescheduleDates(7, 3, '2028-02-28')).toEqual(['2028-02-28', '2028-02-29', '2028-03-01']);
    // 2026 is not: Feb 28 -> Mar 1.
    expect(rescheduleDates(7, 2, '2026-02-28')).toEqual(['2026-02-28', '2026-03-01']);
  });

  it('a 1-day-a-week plan advances a full week per reading', () => {
    const dates = rescheduleDates(1, 3, '2026-08-21');
    expect(dates).toEqual(['2026-08-21', '2026-08-28', '2026-09-04']);
  });

  it('zero remaining days is an empty list, not an error', () => {
    expect(rescheduleDates(5, 0, '2026-08-21')).toEqual([]);
  });

  it('agrees with addDays about what a week later means', () => {
    const [first, , , , , sixth] = rescheduleDates(5, 6, '2026-12-28');
    expect(first).toBe('2026-12-28');
    expect(sixth).toBe(addDays('2026-12-28', 7)); // day 6 of a 5/week plan = offset 7
  });
});
