// The number the reader is SHOWN must be the number the gate COUNTS.
//
// `/ask` renders "Found N voices across M traditions" (ask-client.tsx:673). `M` came from raw
// `metadata.tradition` strings; the `diversity_traditions` gate that makes M mean anything folds
// case first (verifier/v1.ts, via normalizeForMatch). The corpus carries the pairs that make them
// disagree — Methodist/methodist, Patristic/patristic, Nonconformist/nonconformist, with Augustine
// served under both cases — so a retrieval the gate counts as ONE tradition could be reported to
// the reader as TWO.
//
// This is not the faithfulness gate failing. The gate normalised all along, and the claim that it
// was defeatable by case was independently RE-MEASURED and REFUTED on 2026-08-18. It is the
// display overstating attribution breadth on a product whose guarantee is attribution — which is
// its own defect, and a cheaper one.
//
// Pinned on the two functions rather than through a live ask, because the property is exactly
// "these two agree" and a live ask would prove it for one query's worth of data.
import { describe, expect, it } from 'vitest';
import { normalizeForMatch } from '../src/verifier/normalize';
import { readFileSync } from 'node:fs';

describe('the reported tradition count agrees with the gate that gives it meaning', () => {
  it('case variants of one tradition count ONCE, as the verifier counts them', () => {
    // The exact corpus pairs, measured on dev 2026-08-18.
    const retrieval = [
      { tradition: 'Patristic' },
      { tradition: 'patristic' },
      { tradition: 'Methodist' },
      { tradition: 'methodist' },
    ];
    const shown = new Set(retrieval.map((r) => normalizeForMatch(r.tradition ?? 'unknown')));
    expect(shown.size, 'four rows of two traditions must report 2, not 4').toBe(2);
  });

  it('genuinely different traditions still count separately — the fix is not a flattener', () => {
    // Without this, `() => 'x'` passes the leg above and the count becomes permanently 1.
    const retrieval = [{ tradition: 'Reformed Baptist' }, { tradition: 'Presbyterian' }];
    expect(new Set(retrieval.map((r) => normalizeForMatch(r.tradition))).size).toBe(2);
  });

  it('teach.ts builds the count through normalizeForMatch, not raw strings', () => {
    // SEED: revert to `new Set(retrieval.map((r) => r.metadata.tradition ?? 'unknown'))` -> RED.
    // The two legs above pass against the UNFIXED code, because they test the helper rather than
    // the caller — the A084 shape. This leg is the one that holds the call site.
    const src = readFileSync(new URL('../src/lib/teacher/teach.ts', import.meta.url), 'utf8')
      .replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
    const decl = src.match(/const traditions = new Set\([\s\S]{0,200}?\);/);
    expect(decl, 'the tradition count must exist').toBeTruthy();
    expect(decl![0], 'the count must fold case the way the gate does').toContain('normalizeForMatch');
  });

  it('`unassigned` is NOT folded into a real tradition — the genuine floor defeat stays visible', () => {
    // Measured 2026-08-18: gill-song carries tradition `unassigned` while john-gill carries
    // `Reformed Baptist`, and jamieson-jfb `unassigned` against jfb's `Presbyterian`. Those are
    // SEMANTIC differences, not case, so one author really can satisfy a two-tradition floor.
    // Case-folding must not paper over it — the fix for that is metadata, filed separately.
    expect(normalizeForMatch('unassigned')).not.toBe(normalizeForMatch('Reformed Baptist'));
    expect(normalizeForMatch('unassigned')).not.toBe(normalizeForMatch('Presbyterian'));
  });
});
