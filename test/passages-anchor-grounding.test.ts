// owner #4 / LONG_NIGHT H2 — passages_grounded must ground on the SOURCE, not the model's claim.
//
// passages_grounded (the §2 mission) lets a passage through if it intersects a voice-block
// anchor. But anchors are model-self-reported and were only checked for verse-id SHAPE — so a
// model could quote a real Ephesians section verbatim (passing quote/attribution), tag that
// voice with an anchor pointing at Revelation, and then a Revelation passages block rode in
// as "grounded" by the fabricated anchor: a doctrinal verdict smuggled via an unrelated verse
// list. The fix requires an anchor to intersect the cited section's OWN verse range.
//
// Run against v1.ts BEFORE the anchor_offbase check to see the bypass PASS (the proof of the gap).

import { describe, expect, it } from 'vitest';
import { verifyV1 } from '../src/verifier/v1';
import type { TeacherResponse } from '../src/contract/types';
import type { Violation } from '../src/verifier/types';
import { corpus, retrieval, validResponse } from './fixtures';

function violations(result: Awaited<ReturnType<typeof verifyV1>>): Violation[] {
  return result.ok ? [] : result.violations;
}

const REV_1_1 = 66001001; // Revelation 1:1 — far from the Ephesians section the voice actually cites

// A real, verbatim Chrysostom-on-Ephesians voice, but its anchor claims Revelation, and the
// passages block shows Revelation. Every other screen is green; only the fabricated anchor
// grounds the unrelated passage.
function anchorFabricated(): TeacherResponse {
  const r = validResponse();
  (r.blocks[1] as { anchors: Array<{ start: number; end: number }> }).anchors = [{ start: REV_1_1, end: REV_1_1 }];
  (r.blocks[3] as { items: Array<{ start: number; end: number; translation: string }> }).items = [
    { start: REV_1_1, end: REV_1_1, translation: 'web' },
  ];
  return r;
}

describe('owner #4 — anchors must match the cited section, not the model claim', () => {
  it('REJECTS a fabricated cross-book anchor (Eph section anchored to Revelation)', async () => {
    const result = await verifyV1(anchorFabricated(), corpus, retrieval);
    expect(result.ok, 'a voice anchored outside its own section must fail closed').toBe(false);
    expect(violations(result).some((v) => v.check === 'anchor_offbase')).toBe(true);
  });

  it('the fabricated anchor DID ground the passage — anchor_offbase is what catches it', async () => {
    // This is the teeth: without the anchor check, passages_grounded is satisfied (the Rev
    // passage intersects the Rev anchor), so the ONLY thing failing the response is the new
    // anchor_offbase rule — proving the bypass was real and this closes it.
    const v = violations(await verifyV1(anchorFabricated(), corpus, retrieval));
    expect(v.some((x) => x.check === 'passages_grounded'), 'passage was "grounded" by the fake anchor').toBe(false);
    expect(v.every((x) => x.check === 'anchor_offbase'), 'anchor_offbase is the sole violation').toBe(true);
  });

  it('ACCEPTS an on-base anchor (Eph 5:18 voice → Eph 5:18), unchanged', async () => {
    // validResponse anchors Eph 5:18, matching both sections' verse range — still fully valid.
    expect(await verifyV1(validResponse(), corpus, retrieval)).toEqual({ ok: true });
  });
});
