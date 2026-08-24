import { describe, expect, it } from 'vitest';
import { runScreens } from '../src/verifier/screens';
import { verifyV1 } from '../src/verifier/v1';
import type { Violation } from '../src/verifier/types';
import { corpus, retrieval, validResponse } from './fixtures';

// B15 (#107): the file header in screens.ts promises "Collects ALL violations
// (not fail-fast) so regeneration feedback is complete", but non-global
// patterns + String.match returned only the FIRST hit per pattern. A regen
// attempt told about one prescriptive when there were three could fix one,
// re-offend, and burn the retry budget. These tests pin the complete-feedback
// contract.
describe('runScreens: complete regeneration feedback (B15/#107)', () => {
  it('reports EVERY hit per pattern, not just the first', () => {
    const text = 'You should abstain. You must confess. You need to repent.';
    const hits = runScreens(text).filter((h) => h.rule === 'I3');
    expect(hits).toHaveLength(3);
    expect(hits.map((h) => h.span.toLowerCase())).toEqual([
      'you should',
      'you must',
      'you need to',
    ]);
  });

  it('collects hits across different patterns too', () => {
    const text = 'The Bible clearly teaches this. The truth is you should listen.';
    const rules = runScreens(text).map((h) => h.rule);
    expect(rules.filter((r) => r === 'I1')).toHaveLength(2); // teaches + the truth is
    expect(rules.filter((r) => r === 'I3')).toHaveLength(1);
  });

  it('dedupes identical repeated spans: repeats add noise, not information', () => {
    // Three copies of the same phrase are ONE thing to fix, not three. The
    // regen hint is noisier, not better, with three identical violations.
    const text = 'You should pray first. Later you should rest. Finally you should give.';
    const hits = runScreens(text).filter((h) => h.label === 'second-person prescriptive');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.span.toLowerCase()).toBe('you should');
  });

  it('does not leak match state between calls (shared global patterns)', () => {
    // The patterns are module-level RegExps; a regression to .exec/.test on
    // them would carry lastIndex between calls and silently skip matches.
    const text = 'You should stop.';
    expect(runScreens(text)).toHaveLength(1);
    expect(runScreens(text)).toHaveLength(1);
  });

  it('verifyV1 surfaces one violation per distinct hit (three screen:I3)', async () => {
    const r = validResponse();
    (r.blocks[0] as any).text =
      'You should abstain. You must confess. You need to repent.';
    const result = await verifyV1(r, corpus, retrieval);
    expect(result.ok).toBe(false);
    const i3 = (result as { violations: Violation[] }).violations.filter(
      (v) => v.check === 'screen:I3',
    );
    expect(i3).toHaveLength(3);
  });
});
