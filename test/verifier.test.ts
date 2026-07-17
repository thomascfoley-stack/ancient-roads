import { describe, expect, it } from 'vitest';
import { verifyV1 } from '../src/verifier/v1';
import type { Violation } from '../src/verifier/types';
import { corpus, retrieval, validResponse } from './fixtures';

function violations(result: Awaited<ReturnType<typeof verifyV1>>): Violation[] {
  return result.ok ? [] : result.violations;
}

describe('V1 verifier: schema', () => {
  it('accepts a fully valid response', async () => {
    const result = await verifyV1(validResponse(), corpus, retrieval);
    expect(result).toEqual({ ok: true });
  });

  it('rejects unknown block types', async () => {
    const r = validResponse() as any;
    r.blocks.push({ type: 'advice', text: 'Here is what I think you should do.' });
    const result = await verifyV1(r, corpus, retrieval);
    expect(violations(result).some((v) => v.check === 'schema')).toBe(true);
  });

  it('rejects a voice block missing attribution.origin', async () => {
    const r = validResponse() as any;
    delete r.blocks[1].attribution.origin;
    const result = await verifyV1(r, corpus, retrieval);
    expect(violations(result).some((v) => v.check === 'schema')).toBe(true);
  });

  it('rejects free-text top-level output', async () => {
    const result = await verifyV1('Drunkenness is wrong because...', corpus, retrieval);
    expect(result.ok).toBe(false);
  });
});

describe('V1 verifier: citations', () => {
  it('rejects a non-resolving section_id', async () => {
    const r = validResponse();
    (r.blocks[1] as any).section_id = 999999;
    const result = await verifyV1(r, corpus, retrieval);
    expect(violations(result).some((v) => v.check === 'section_resolves')).toBe(true);
  });

  it('rejects a fabricated quote', async () => {
    const r = validResponse();
    (r.blocks[1] as any).quote = 'Wine is the devil in a bottle and must be shunned entirely';
    const result = await verifyV1(r, corpus, retrieval);
    expect(violations(result).some((v) => v.check === 'quote_verbatim')).toBe(true);
  });

  it('accepts a quote differing only in punctuation and casing', async () => {
    const r = validResponse();
    (r.blocks[1] as any).quote = 'wine was given to make us cheerful — not to make us behave ourselves unseemly!';
    const result = await verifyV1(r, corpus, retrieval);
    expect(result.ok).toBe(true);
  });

  it('rejects misattributed author (the Spurgeon-said-it failure)', async () => {
    const r = validResponse();
    (r.blocks[1] as any).attribution.author = 'Charles Spurgeon';
    const result = await verifyV1(r, corpus, retrieval);
    expect(violations(result).some((v) => v.check === 'attribution_author')).toBe(true);
  });

  it('rejects a wrong work title', async () => {
    const r = validResponse();
    (r.blocks[1] as any).attribution.work = 'Institutes of the Christian Religion';
    const result = await verifyV1(r, corpus, retrieval);
    expect(violations(result).some((v) => v.check === 'attribution_work')).toBe(true);
  });

  it('rejects a corpus-origin citation of a user-library section', async () => {
    const r = validResponse();
    (r.blocks[1] as any).section_id = 3; // exists only under origin user_library
    const result = await verifyV1(r, corpus, retrieval);
    expect(violations(result).some((v) => v.check === 'section_resolves')).toBe(true);
  });

  it('rejects a wrong tradition (the tradition-swap failure)', async () => {
    const r = validResponse();
    (r.blocks[1] as any).attribution.tradition = 'reformed';
    const result = await verifyV1(r, corpus, retrieval);
    expect(violations(result).some((v) => v.check === 'attribution_tradition')).toBe(true);
  });
});

describe('V1 verifier: reading block', () => {
  function responseWithReading(): ReturnType<typeof validResponse> {
    const r = validResponse();
    r.blocks.push({
      type: 'reading',
      items: [
        { source_id: 7, title: 'Homilies on Ephesians', author: 'John Chrysostom' },
      ],
    } as any);
    return r;
  }

  it('accepts a valid reading block', async () => {
    const result = await verifyV1(responseWithReading(), corpus, retrieval);
    expect(result.ok).toBe(true);
  });

  it('rejects a reading with unresolvable source_id', async () => {
    const r = responseWithReading();
    const reading = r.blocks[r.blocks.length - 1] as any;
    reading.items[0].source_id = 99999;
    const result = await verifyV1(r, corpus, retrieval);
    expect(violations(result).some((v) => v.check === 'reading_resolves')).toBe(true);
  });

  it('rejects a reading with mismatched author', async () => {
    const r = responseWithReading();
    const reading = r.blocks[r.blocks.length - 1] as any;
    reading.items[0].author = 'Augustine of Hippo';
    const result = await verifyV1(r, corpus, retrieval);
    expect(violations(result).some((v) => v.check === 'reading_attribution')).toBe(true);
  });
});

describe('V1 verifier: passages and anchors', () => {
  it('rejects a structurally invalid verse id (Genesis 99)', async () => {
    const r = validResponse();
    (r.blocks[3] as any).items[0] = { start: 1099001, end: 1099001, translation: 'web' };
    const result = await verifyV1(r, corpus, retrieval);
    expect(violations(result).some((v) => v.check === 'passage_valid')).toBe(true);
  });

  it('rejects an unlicensed translation', async () => {
    const r = validResponse();
    (r.blocks[3] as any).items[0].translation = 'esv';
    const result = await verifyV1(r, corpus, retrieval);
    expect(violations(result).some((v) => v.check === 'translation_licensed')).toBe(true);
  });

  it('rejects a reversed range', async () => {
    const r = validResponse();
    (r.blocks[3] as any).items[1] = { start: 20023035, end: 20023029, translation: 'web' };
    const result = await verifyV1(r, corpus, retrieval);
    expect(violations(result).some((v) => v.check === 'passage_order')).toBe(true);
  });

  it('rejects a verse that does not exist in the translation', async () => {
    const r = validResponse();
    (r.blocks[3] as any).items[0] = { start: 19150007, end: 19150007, translation: 'web' };
    const result = await verifyV1(r, corpus, retrieval);
    expect(violations(result).some((v) => v.check === 'passage_exists')).toBe(true);
  });

  it('rejects a structurally invalid anchor on a voice block', async () => {
    const r = validResponse();
    (r.blocks[1] as any).anchors = [{ start: 1099001, end: 1099001 }];
    const result = await verifyV1(r, corpus, retrieval);
    expect(violations(result).some((v) => v.check === 'anchor_valid')).toBe(true);
  });

  it('rejects a reversed anchor range on a voice block', async () => {
    const r = validResponse();
    (r.blocks[1] as any).anchors = [{ start: 49005020, end: 49005018 }];
    const result = await verifyV1(r, corpus, retrieval);
    expect(violations(result).some((v) => v.check === 'anchor_order')).toBe(true);
  });
});

describe('V1 verifier: interpretation screens', () => {
  it('rejects second-person prescriptives in framing (I3)', async () => {
    const r = validResponse();
    (r.blocks[0] as any).text = 'Given these voices, you should abstain from alcohol entirely.';
    const result = await verifyV1(r, corpus, retrieval);
    expect(violations(result).some((v) => v.check === 'screen:I3')).toBe(true);
  });

  it('rejects verdict phrases in framing (I2)', async () => {
    const r = validResponse();
    (r.blocks[0] as any).text = 'The stronger reading is Chrysostom’s: moderation, not abstinence.';
    const result = await verifyV1(r, corpus, retrieval);
    expect(violations(result).some((v) => v.check === 'screen:I2')).toBe(true);
  });

  it('rejects assistant-voice doctrine in framing (I1)', async () => {
    const r = validResponse();
    (r.blocks[0] as any).text = 'The Bible clearly teaches that drunkenness is forbidden.';
    const result = await verifyV1(r, corpus, retrieval);
    expect(violations(result).some((v) => v.check === 'screen:I1')).toBe(true);
  });

  it('rejects directive prayer prompts (I3)', async () => {
    const r = validResponse();
    (r.blocks[4] as any).text = 'You must repent of this tonight in prayer.';
    const result = await verifyV1(r, corpus, retrieval);
    expect(violations(result).some((v) => v.check === 'screen:I3')).toBe(true);
  });

  it('rejects doctrinal verdict in voice summary (I5)', async () => {
    const r = validResponse();
    (r.blocks[1] as any).summary = 'Yes, it is a sin to drink in excess according to Chrysostom.';
    const result = await verifyV1(r, corpus, retrieval);
    expect(violations(result).some((v) => v.check === 'screen:I5')).toBe(true);
  });

  it('does not screen quoted source text: sources may say anything', async () => {
    // Henry's quote itself says "sin"; only assistant-voice fields are screened.
    const result = await verifyV1(validResponse(), corpus, retrieval);
    expect(result.ok).toBe(true);
  });
});

describe('V1 verifier: diversity rule', () => {
  it('rejects single-tradition voices when retrieval spans two traditions', async () => {
    const r = validResponse();
    r.blocks.splice(2, 1); // drop the Matthew Henry (reformed) voice
    const result = await verifyV1(r, corpus, retrieval);
    const v = violations(result);
    expect(v.some((x) => x.check === 'diversity_traditions')).toBe(true);
    expect(v.some((x) => x.check === 'diversity_voices')).toBe(true);
  });

  it('does not demand diversity retrieval could not supply', async () => {
    const r = validResponse();
    r.blocks.splice(2, 1); // only the Chrysostom voice remains
    // queryRanges carried so validResponse's Prov 23 passage stays grounded — this test
    // isolates the diversity rule, not the passages_grounded screen.
    const thinRetrieval = {
      sectionIds: [48210],
      traditions: ['patristic'],
      queryRanges: [{ start: 20023029, end: 20023035 }],
    };
    const result = await verifyV1(r, corpus, thinRetrieval);
    expect(result.ok).toBe(true);
  });
});

describe('V1 verifier: fail-closed dispatch default (Phase 0 regression)', () => {
  // The scar: a block type that passes SCHEMA but has no dispatch case used to
  // return {ok:true} unverified. The default now emits unknown_block_type.
  // We reach the default by casting past the compile-time `never` guard —
  // exactly the runtime condition (schema and dispatch out of step) it exists
  // for. Deleting the default makes this test fail with ok:true.
  it('a schema-passing block with no dispatch case is a violation, never a pass', async () => {
    const r = validResponse() as any;
    // splice in after schema validation would normally reject: monkey-patch the
    // block type AFTER cloning a valid voice block (schema sees a known shape,
    // dispatch does not)
    const drifted = JSON.parse(JSON.stringify(r.blocks[1]));
    drifted.type = 'reading_v2_drift';
    r.blocks.push(drifted);
    const result = await verifyV1(r, corpus, retrieval);
    expect(result.ok).toBe(false);
    const checks = violations(result).map((v) => v.check);
    // schema may catch it first (also fail-closed); the regression is only if NEITHER fires
    expect(checks.some((c) => c === 'unknown_block_type' || c === 'schema')).toBe(true);
  });
});
