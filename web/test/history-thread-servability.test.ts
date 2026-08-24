// D19 (DEEP_SWEEP.md): /ask/[id] renders a saved HISTORY thread straight from stored jsonb.
// ask/[id]/page.tsx:33 returns <HistoryResults data={hist.payload}> and returns early, so
// servedOf() at :69 — the research branch's per-row servability re-check — never runs on this
// path. history-search-db.ts:34 states the invariant this breaks, in its own words: "a
// quarantined work must stop serving instantly even if its vectors still carry served=true.
// Fail closed." That SCOPE predicate only runs on NEW searches; a saved thread quotes the
// work forever.
//
// The re-check is WORK-level, not section-level, because quarantine is a work-level
// disposition: `sources.status` flips off 'published' for the whole work.
import { describe, expect, it } from 'vitest';
import { filterServableHistory } from '@/lib/history-threads';
import type { HistoryResponse } from '@/lib/history-search-db';

const sec = (sectionId: number) => ({
  sectionId, ordinal: 1, headingPath: ['I'], period: null, excerpt: 'text', matched: ['text' as const],
});
const payload = (): HistoryResponse => ({
  interpretation: { entities: [], period: null },
  closest: { ...sec(1), work: { slug: 'schaff-hcc-1', title: 'HCC I', author: 'Schaff', edition: null } },
  results: [
    { work: { slug: 'schaff-hcc-1', title: 'HCC I', author: 'Schaff', edition: null }, periodSpan: null, sections: [sec(1), sec(2)] },
    { work: { slug: 'quarantined-work', title: 'Bad', author: 'X', edition: null }, periodSpan: null, sections: [sec(3)] },
  ],
  coverage: { works: 2, sections: 3 },
});

describe('D19 — a saved history thread re-checks servability before it renders', () => {
  it('drops a work that is no longer servable, keeps the rest', () => {
    const out = filterServableHistory(payload(), new Set(['schaff-hcc-1']));
    expect(out.results.map((r) => r.work.slug)).toEqual(['schaff-hcc-1']);
    expect(out.results[0]!.sections).toHaveLength(2);
  });

  it('recomputes coverage from what survived, so the count cannot advertise dropped works', () => {
    const out = filterServableHistory(payload(), new Set(['schaff-hcc-1']));
    expect(out.coverage).toEqual({ works: 1, sections: 2 });
  });

  it('drops `closest` when its work is withdrawn', () => {
    const out = filterServableHistory(payload(), new Set(['quarantined-work']));
    expect(out.closest).toBeNull();
  });

  it('keeps `closest` when its work still serves', () => {
    const out = filterServableHistory(payload(), new Set(['schaff-hcc-1']));
    expect(out.closest?.work.slug).toBe('schaff-hcc-1');
  });

  // The posture that matters: servedOf returns null when it CANNOT vouch, and the caller
  // tombstones everything. Same here — an unresolvable check must not render.
  it('FAILS CLOSED: a null servable set drops everything, it does not pass everything', () => {
    const out = filterServableHistory(payload(), null);
    expect(out.results).toEqual([]);
    expect(out.closest).toBeNull();
    expect(out.coverage).toEqual({ works: 0, sections: 0 });
  });

  it('an empty servable set drops everything too', () => {
    const out = filterServableHistory(payload(), new Set());
    expect(out.results).toEqual([]);
    expect(out.closest).toBeNull();
  });
});
