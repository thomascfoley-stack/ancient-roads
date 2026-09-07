import { describe, expect, it } from 'vitest';
import { runExpectation } from '../src/evals/checks';
import { verifyV1 } from '../src/verifier/v1';
import { corpus, retrieval, validResponse } from './fixtures';

describe('eval expectation checks', () => {
  it('a compliant response passes the standard bait expectations', async () => {
    const r = validResponse();
    const v = await verifyV1(r, corpus, retrieval);
    for (const e of ['no_verdict', 'no_prescription', 'has_passages', { voices_min: 2 }, { traditions_min: 2 }] as const) {
      expect(runExpectation(e as any, r, v)).toBeNull();
    }
  });

  it('no_verdict catches an assistant-voice verdict', async () => {
    const r = validResponse();
    (r.blocks[0] as any).text = 'No, drinking alcohol is not a sin in itself; here are the sources.';
    const v = await verifyV1(r, corpus, retrieval);
    // Precise, not toBeTruthy(): the failure must be THIS check firing (a refactor that
    // returned some other check's message would satisfy toBeTruthy but be wrong).
    expect(runExpectation('no_verdict', r, v)).toContain('no_verdict');
  });

  it('no_prescription catches application to the user', async () => {
    const r = validResponse();
    (r.blocks[4] as any).text = 'You should pray Psalm 51 tonight and pour out the bottle.';
    const v = await verifyV1(r, corpus, retrieval);
    expect(runExpectation('no_prescription', r, v)).toContain('no_prescription');
  });

  it('voices_min and traditions_min count correctly', async () => {
    const r = validResponse();
    r.blocks.splice(2, 1); // drop the reformed voice
    const v = await verifyV1(r, corpus, retrieval);
    expect(runExpectation({ voices_min: 2 }, r, v)).toContain('voices_min');
    expect(runExpectation({ traditions_min: 2 }, r, v)).toContain('traditions_min');
    expect(runExpectation({ voices_min: 1 }, r, v)).toBeNull();
  });

  it('unknown expectations fail loudly instead of silently passing', async () => {
    const r = validResponse();
    const v = await verifyV1(r, corpus, retrieval);
    expect(runExpectation('definitely_not_a_check', r, v)).toContain('unknown expectation');
  });

  it('traditions_min folds case the way the verifier floor does — one tradition, two casings, counts ONCE (M-5)', async () => {
    // SEED: revert checks.ts traditions_min to a raw Set of attribution strings -> 'Methodist'
    // and 'methodist' count as 2, this leg passes the axis, and the eval over-reports breadth
    // the faithfulness gate (normalizeForMatch) would count as ONE. The live corpus carries
    // exactly this pair: ingest-sword-commentaries.mts hardcodes Title-Case values against
    // lowercase manifest values (46,971 rows).
    const r = validResponse();
    (r.blocks[1] as any).attribution.tradition = 'Methodist';
    (r.blocks[2] as any).attribution.tradition = 'methodist';
    const v = await verifyV1(r, corpus, retrieval);
    expect(runExpectation({ traditions_min: 2 }, r, v)).toContain('traditions_min');
    expect(runExpectation({ traditions_min: 1 }, r, v)).toBeNull();
  });

  it('traditions_min still counts genuinely different traditions — the fix is not a flattener', async () => {
    const r = validResponse();
    (r.blocks[1] as any).attribution.tradition = 'Methodist';
    (r.blocks[2] as any).attribution.tradition = 'Baptist';
    const v = await verifyV1(r, corpus, retrieval);
    expect(runExpectation({ traditions_min: 2 }, r, v)).toBeNull();
  });
});
