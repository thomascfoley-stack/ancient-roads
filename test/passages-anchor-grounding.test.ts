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

// HARDENING (Track 2) — lock the OFF-BY-ONE boundary of anchor_offbase's overlap operator.
// The Chrysostom section (block[1], id 48210) is indexed to a single verse, Eph 5:18 (49005018).
// The overlap test is `anchor.start <= section.end && section.start <= anchor.end` — the `<=`
// endpoints are where a refactor (e.g. `<=`→`<`) would silently re-open the H2 hole for a
// near-miss anchor. These cases pin both `<=` edges: an anchor touching the section at exactly
// one verse must GROUND; an anchor one verse short must be OFFBASE. block[2] (Henry) keeps its
// valid Eph 5:18 anchor so the passages block stays grounded and block[1]'s anchor is the only
// thing under test.
describe('anchor_offbase — off-by-one boundary of the overlap operator', () => {
  const EPH_5_18 = 49005018;
  function withChrysostomAnchor(start: number, end: number): TeacherResponse {
    const r = validResponse();
    (r.blocks[1] as { anchors: Array<{ start: number; end: number }> }).anchors = [{ start, end }];
    return r;
  }

  it('ACCEPTS an anchor touching the section verse from below (Eph 5:10–5:18)', async () => {
    // ends exactly AT the section verse — overlaps only at the boundary → must ground (locks `section.start <= anchor.end`)
    expect(await verifyV1(withChrysostomAnchor(EPH_5_18 - 8, EPH_5_18), corpus, retrieval)).toEqual({ ok: true });
  });

  it('ACCEPTS an anchor touching the section verse from above (Eph 5:18–5:25)', async () => {
    // starts exactly AT the section verse → must ground (locks `anchor.start <= section.end`)
    expect(await verifyV1(withChrysostomAnchor(EPH_5_18, EPH_5_18 + 7), corpus, retrieval)).toEqual({ ok: true });
  });

  it('REJECTS an anchor ending one verse short (Eph 5:10–5:17) as anchor_offbase', async () => {
    const v = violations(await verifyV1(withChrysostomAnchor(EPH_5_18 - 8, EPH_5_18 - 1), corpus, retrieval));
    expect(v.some((x) => x.check === 'anchor_offbase'), 'a one-verse miss must be caught').toBe(true);
  });

  it('REJECTS an anchor starting one verse past (Eph 5:19–5:25) as anchor_offbase', async () => {
    const v = violations(await verifyV1(withChrysostomAnchor(EPH_5_18 + 1, EPH_5_18 + 7), corpus, retrieval));
    expect(v.some((x) => x.check === 'anchor_offbase'), 'a one-verse miss must be caught').toBe(true);
  });

  it('REJECTS a reversed anchor (start > end) as anchor_order, before offbase', async () => {
    const v = violations(await verifyV1(withChrysostomAnchor(EPH_5_18 + 7, EPH_5_18), corpus, retrieval));
    expect(v.some((x) => x.check === 'anchor_order'), 'start>end must be caught by anchor_order').toBe(true);
  });
});

// A6 line-by-line 2026-07-17 regressions — the overlap operator let two holes through.
describe('A6: containment closes the overlap holes', () => {
  const EPH_5_18 = 49005018;
  it('REJECTS a canon-spanning anchor (Gen 1:1–Rev 22:21) even though it overlaps the section', async () => {
    const r = validResponse();
    (r.blocks[1] as { anchors: Array<{ start: number; end: number }> }).anchors = [{ start: 1001001, end: 66022021 }];
    const v = violations(await verifyV1(r, corpus, retrieval));
    expect(v.some((x) => x.check === 'anchor_offbase'), 'a canon-spanning anchor must be offbase').toBe(true);
  });

  it('REJECTS a passage that extends far beyond its grounding anchor (passages_grounded)', async () => {
    // voice anchors Eph 5:18 (in-section); the passages block shows Eph 5:18–6:24 —
    // grounded only by a sliver of overlap under the old rule, ungrounded under containment.
    const r = validResponse();
    (r.blocks[1] as { anchors: Array<{ start: number; end: number }> }).anchors = [{ start: EPH_5_18, end: EPH_5_18 }];
    (r.blocks[3] as { items: Array<{ start: number; end: number; translation: string }> }).items = [
      { start: EPH_5_18, end: 49006024, translation: 'web' },
    ];
    const v = violations(await verifyV1(r, corpus, retrieval));
    expect(v.some((x) => x.check === 'passages_grounded'), 'a passage beyond its anchor must be ungrounded').toBe(true);
  });
});
