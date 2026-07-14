// §2 — the passages-grounding screen. The bait the rest of the suite cannot express:
// a doctrinal answer delivered ENTIRELY through which verses the model picks, with
// clean prose and valid, verbatim, correctly-attributed voices. Every existing screen
// defends against generated WORDS; `passages` is a generated CHOICE. Interpretation
// expressed as selection rather than as a sentence passes framing/screen/quote/diversity
// green. This asserts the verifier now fails closed on an ungrounded passage: a passage
// item may appear iff it intersects a voice-block anchor in the same response OR a range
// resolveIntent resolved from the query (RetrievalContext.queryRanges).
//
// Run this file BEFORE the v1.ts change to see it RED (the current verifier accepts the
// ungrounded selection) — that red is the proof of the gap.

import { describe, expect, it } from 'vitest';
import { verifyV1 } from '../src/verifier/v1';
import type { TeacherResponse } from '../src/contract/types';
import type { Violation } from '../src/verifier/types';
import { corpus, retrieval, validResponse } from './fixtures';

function violations(result: Awaited<ReturnType<typeof verifyV1>>): Violation[] {
  return result.ok ? [] : result.violations;
}

// A response that answers "does drunkenness cost a believer the kingdom?" NOT in any
// sentence — the framing is neutral, the two voices are the real verbatim drunkenness
// quotes anchored to Eph 5:18 — but through a passages block that selects the verdict
// verses ("drunkards shall not inherit the kingdom of God", 1 Cor 6:9-10; Gal 5:19-21).
// No voice anchors them; the query named no numeric reference. The doctrinal claim lives
// entirely in the selection.
function verdictBySelection(): TeacherResponse {
  const r = validResponse();
  (r.blocks[0] as { type: 'framing'; text: string }).text =
    'On drunkenness, here is Chrysostom, and Matthew Henry, with passages to read alongside them.';
  (r.blocks[3] as { type: 'passages'; items: Array<{ start: number; end: number; translation: string }> }).items = [
    { start: 46006009, end: 46006010, translation: 'web' }, // 1 Corinthians 6:9-10
    { start: 48005019, end: 48005021, translation: 'web' }, // Galatians 5:19-21
  ];
  return r;
}

describe('§2 passages must be grounded (fail closed on interpretation-by-selection)', () => {
  it('REJECTS a doctrinal verdict delivered through ungrounded passage selection', async () => {
    const result = await verifyV1(verdictBySelection(), corpus, retrieval);
    expect(result.ok, 'ungrounded doctrinal passages must fail closed').toBe(false);
    expect(violations(result).some((v) => v.check === 'passages_grounded')).toBe(true);
  });

  it('every OTHER screen is green on that bait — the gap is passages-only', async () => {
    // Prove the bait is clean everywhere else: strip the passages block and it passes.
    const r = verdictBySelection();
    r.blocks = r.blocks.filter((b) => b.type !== 'passages');
    const result = await verifyV1(r, corpus, retrieval);
    expect(result, 'the bait fails ONLY on the passages grounding, nothing else').toEqual({ ok: true });
  });

  it('ACCEPTS a passage grounded by a voice-block anchor', async () => {
    // validResponse's Eph 5:18 passage is anchored by both voices.
    const r = validResponse();
    (r.blocks[3] as { items: Array<{ start: number; end: number; translation: string }> }).items = [
      { start: 49005018, end: 49005018, translation: 'web' }, // Eph 5:18, anchored by both voices
    ];
    const result = await verifyV1(r, corpus, retrieval);
    expect(result).toEqual({ ok: true });
  });

  it('ACCEPTS a passage grounded by a query-resolved range', async () => {
    // The fixture retrieval carries queryRanges = Prov 23:29-35; a passage there is grounded
    // even though no voice anchors it.
    const r = validResponse();
    (r.blocks[3] as { items: Array<{ start: number; end: number; translation: string }> }).items = [
      { start: 20023029, end: 20023035, translation: 'web' }, // Prov 23:29-35, from queryRanges
    ];
    const result = await verifyV1(r, corpus, retrieval);
    expect(result).toEqual({ ok: true });
  });
});
