import { describe, expect, it } from 'vitest';
import { verifyV1 } from '../src/verifier/v1.js';
import type { Violation } from '../src/verifier/types.js';
import { corpus, retrieval, validResponse } from './fixtures.js';

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
    expect(violations(result).some((v) => v.check.startsWith('screen:'))).toBe(true);
  });

  it('rejects directive prayer prompts (I3)', async () => {
    const r = validResponse();
    (r.blocks[4] as any).text = 'You must repent of this tonight in prayer.';
    const result = await verifyV1(r, corpus, retrieval);
    expect(violations(result).some((v) => v.check === 'screen:I3')).toBe(true);
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
    const thinRetrieval = { sectionIds: [48210], traditions: ['patristic'] };
    const result = await verifyV1(r, corpus, thinRetrieval);
    expect(result.ok).toBe(true);
  });
});
