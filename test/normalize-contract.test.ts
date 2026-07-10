import { describe, expect, it } from 'vitest';
import {
  normalizeContract,
  type SectionAttribution,
} from '../web/src/lib/teacher/normalize-contract';
import { isNormalizedSubstring } from '../src/verifier/normalize';

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

describe('normalizeContract: snap-to-source quote repair', () => {
  const MACLAREN =
    'The king who had been the shepherd-boy, and had been taken from the quiet ' +
    'sheep-cotes to rule over Israel, sings this little psalm of Him who is the ' +
    'true Shepherd and King of men. We do not know at what period of David’s life ' +
    'it was written, but it sounds as if it were the work of his later years.';
  const withBody = (_quote: string): SectionAttribution[] => [
    { author: 'Alexander MacLaren', work: 'Expositions', tradition: 'Baptist', body: MACLAREN },
  ];
  const voice = (quote: string) => ({
    contract_version: '1.1', teacher: 'qwen',
    blocks: [{ type: 'voice', section_id: 1, attribution: {}, quote }],
  });
  const quoteOf = (out: unknown) => (out as { blocks: Array<{ quote: string }> }).blocks[0]!.quote;

  it('trims a drifted quote back to its verbatim prefix', () => {
    // Verbatim opening, then the model stitches on a non-adjacent sentence.
    const drifted =
      'sings this little psalm of Him who is the true Shepherd and King of men. ' +
      'There is a fulness of experience about it, and a tone of quiet confidence.';
    const out = normalizeContract(voice(drifted), withBody(drifted));
    const q = quoteOf(out);
    expect(q).toBe('sings this little psalm of Him who is the true Shepherd and King of men.');
    // and the repaired quote IS a verbatim substring of the source
    expect(isNormalizedSubstring(q, MACLAREN)).toBe(true);
  });

  it('leaves an already-verbatim quote unchanged', () => {
    const exact = 'the true Shepherd and King of men';
    expect(quoteOf(normalizeContract(voice(exact), withBody(exact)))).toBe(exact);
  });

  it('does NOT repair a mostly-fabricated quote (fail-closed, verifier rejects)', () => {
    // Only a short fragment matches; the rest is invented → below SNAP_MIN_RATIO.
    const fabricated =
      'true Shepherd. This psalm proves the doctrine of eternal security beyond all doubt and forever.';
    const q = quoteOf(normalizeContract(voice(fabricated), withBody(fabricated)));
    expect(q).toBe(fabricated); // untouched
    expect(isNormalizedSubstring(q, MACLAREN)).toBe(false); // so the verifier still fails it
  });

  it('never lengthens or invents — repaired quote is a prefix of the model quote', () => {
    const drifted = 'sings this little psalm of Him who is the true Shepherd and King of men. INVENTED TAIL.';
    const q = quoteOf(normalizeContract(voice(drifted), withBody(drifted)));
    expect(drifted.startsWith(q)).toBe(true);
    expect(q.length).toBeLessThan(drifted.length);
  });

  it('does not touch quotes when the section body is absent (attribution-only mode)', () => {
    const noBody: SectionAttribution[] = [{ author: 'A', work: 'W', tradition: 'T' }];
    const drifted = 'anything at all that will not match';
    expect(quoteOf(normalizeContract(voice(drifted), noBody))).toBe(drifted);
  });
});
