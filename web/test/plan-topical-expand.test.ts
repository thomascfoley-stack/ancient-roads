// expandTopicalPlan invariants (web/src/lib/plan/expand.ts, ADR-048
// addendum). Pure — entries in, dated buckets out, no I/O.

import { describe, expect, it } from 'vitest';
import { expandTopicalPlan, type TopicalEntryInput } from '@/lib/plan/expand';

const entries = (n: number): TopicalEntryInput[] =>
  Array.from({ length: n }, (_, i) => ({
    label: `sub ${i + 1}`,
    verseStart: 19_001_001 + i,
    verseEnd: 19_001_001 + i,
  }));

describe('expandTopicalPlan', () => {
  it('distributes every entry exactly once, in the author’s order', () => {
    // 711 entries (Nave PRAYER’s real count) over 8w x 5d = 40 days.
    const r = expandTopicalPlan(entries(711), 8, 5, '2026-08-03');
    if (!r.ok) throw new Error(r.reason);
    expect(r.days).toHaveLength(40);
    const flat = r.days.flatMap((d) => d.readings);
    expect(flat).toHaveLength(711); // nothing lost, nothing doubled
    expect(flat.map((e) => e.verseStart)).toEqual(entries(711).map((e) => e.verseStart)); // order preserved
    // Even distribution: day sizes differ by at most 1 (17 or 18 here).
    const sizes = new Set(r.days.map((d) => d.readings.length));
    expect([...sizes].every((s) => s === 17 || s === 18)).toBe(true);
  });

  it('dates follow the same weekly cadence as chapter plans', () => {
    const r = expandTopicalPlan(entries(10), 2, 2, '2026-03-02');
    if (!r.ok) throw new Error(r.reason);
    expect(r.days.map((d) => d.date)).toEqual(['2026-03-02', '2026-03-03', '2026-03-09', '2026-03-10']);
  });

  it('refuses a topic thinner than the schedule instead of padding', () => {
    // SEED: repeat entries to fill and this goes red — same no-padding rule
    // as expandPlan.
    const r = expandTopicalPlan(entries(9), 2, 5, '2026-08-03');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/cannot fill/);
  });

  it('refuses an empty topic with a reason', () => {
    const r = expandTopicalPlan([], 1, 1, '2026-08-03');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/no passages/);
  });

  it('every day carries at least one reading (no empty buckets)', () => {
    // Exact fit: 14 entries over 14 days = 1 each.
    const r = expandTopicalPlan(entries(14), 2, 7, '2026-08-03');
    if (!r.ok) throw new Error(r.reason);
    expect(r.days.every((d) => d.readings.length === 1)).toBe(true);
  });
});
