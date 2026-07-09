import { describe, expect, it } from 'vitest';
import {
  normalizeContract,
  type SectionAttribution,
} from '../web/src/lib/teacher/normalize-contract';

// The teacher normalizes the model's parsed JSON before the verifier sees it:
// it coerces quoted numeric IDs and backfills attribution from the cited
// section. These tests pin that it is a LOSSLESS pre-parser, not a relaxed gate
// — it never rescues genuinely wrong output.

const SECTIONS: SectionAttribution[] = [
  { author: 'John Calvin', work: 'Commentary on John', tradition: 'Reformed' },
  { author: 'John Chrysostom', work: 'Homilies on John', tradition: 'Patristic' },
];

describe('normalizeContract', () => {
  it('coerces quoted numeric anchor/passage IDs to integers', () => {
    const out = normalizeContract(
      {
        contract_version: '1.1',
        teacher: 'qwen',
        blocks: [
          { type: 'voice', section_id: '1', attribution: {}, quote: 'x', anchors: [{ start: '43001001', end: '43001014' }] },
          { type: 'passages', items: [{ start: '43001001', end: '43001001', translation: 'web' }] },
        ],
      },
      SECTIONS,
    ) as { blocks: Array<Record<string, unknown>> };

    const voice = out.blocks[0]!;
    expect(voice.section_id).toBe(1);
    expect((voice.anchors as Array<Record<string, unknown>>)[0]!.start).toBe(43001001);
    expect((voice.anchors as Array<Record<string, unknown>>)[0]!.end).toBe(43001014);
    const passages = out.blocks[1]!;
    expect((passages.items as Array<Record<string, unknown>>)[0]!.start).toBe(43001001);
  });

  it('backfills attribution from the cited section, overriding a mislabel', () => {
    const out = normalizeContract(
      {
        contract_version: '1.1',
        teacher: 'qwen',
        blocks: [
          // model cited section 2 (Chrysostom) but typed Calvin — backfill fixes it
          { type: 'voice', section_id: 2, attribution: { author: 'John Calvin', work: 'Wrong', tradition: 'Reformed', origin: 'corpus' }, quote: 'x' },
        ],
      },
      SECTIONS,
    ) as { blocks: Array<{ attribution: Record<string, unknown> }> };

    expect(out.blocks[0]!.attribution).toEqual({
      author: 'John Chrysostom',
      work: 'Homilies on John',
      tradition: 'Patristic',
      origin: 'corpus',
    });
  });

  it('does NOT backfill a hallucinated (out-of-range) section_id — verifier still catches it', () => {
    const out = normalizeContract(
      {
        contract_version: '1.1',
        teacher: 'qwen',
        blocks: [
          { type: 'voice', section_id: 99, attribution: { author: 'Made Up', work: 'Fake', tradition: 'None', origin: 'corpus' }, quote: 'x' },
        ],
      },
      SECTIONS,
    ) as { blocks: Array<{ attribution: Record<string, unknown> }> };

    expect(out.blocks[0]!.attribution.author).toBe('Made Up'); // untouched → verifier rejects
  });

  it('leaves non-numeric strings and quotes/framing text untouched', () => {
    const out = normalizeContract(
      {
        contract_version: '1.1',
        teacher: 'qwen',
        blocks: [
          { type: 'framing', text: 'A neutral orientation sentence.' },
          { type: 'voice', section_id: 'abc', attribution: {}, quote: 'For God so loved the world', anchors: [{ start: 'not-a-number', end: '43001001' }] },
        ],
      },
      SECTIONS,
    ) as { blocks: Array<Record<string, unknown>> };

    expect(out.blocks[0]!.text).toBe('A neutral orientation sentence.');
    const voice = out.blocks[1]!;
    expect(voice.section_id).toBe('abc'); // non-numeric → left as-is (fails schema, as it should)
    expect(voice.quote).toBe('For God so loved the world');
    expect((voice.anchors as Array<Record<string, unknown>>)[0]!.start).toBe('not-a-number');
    expect((voice.anchors as Array<Record<string, unknown>>)[0]!.end).toBe(43001001);
  });

  it('is a no-op on malformed roots (no blocks array)', () => {
    expect(normalizeContract(null)).toBeNull();
    expect(normalizeContract({ blocks: 'nope' })).toEqual({ blocks: 'nope' });
  });
});
