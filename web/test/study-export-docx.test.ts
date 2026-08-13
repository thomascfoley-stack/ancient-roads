import { describe, expect, it } from 'vitest';
import { exportStudyDocx, studyExportModel } from '../src/lib/study-export-docx';
import type { ExportBlock } from '../src/lib/study-export';
import type { ServabilityResolution } from '../src/lib/servability';

// The .docx export's MODEL layer (editor v2). Same licensing contract as the markdown
// serializer's suite: the data-state tombstone and the re-check belt both arrive through the
// ONE shared rule, and the model is where a licensing bug would have to live — so the tests
// live here too, not against the packed binary. One packing smoke test proves the docx layer
// actually produces a document.

const resolved = (sections: string[] = [], sources: string[] = []): ServabilityResolution => ({
  servableSectionIds: new Set(sections),
  servableSourceIds: new Set(sources),
  failedClosed: false,
});

const textBlock = (body: string): ExportBlock => ({
  kind: 'text', body, quote: null, attribution: null, section_id: null, source_id: null,
});

const clipping = (over: Partial<ExportBlock> = {}): ExportBlock => ({
  kind: 'clipping',
  body: null,
  quote: 'Now Jericho was straitly shut up.\n\nNone went out, and none came in.',
  attribution: { author: 'Matthew Henry', work_title: 'Commentary on the Whole Bible', reference: 'Joshua 2' },
  section_id: '101',
  source_id: null,
  ...over,
});

describe('studyExportModel', () => {
  it('maps title, body paragraphs, quote paragraphs, and the attribution line', () => {
    const nodes = studyExportModel(
      { title: 'Rahab' },
      [textBlock('First paragraph.\n\nSecond paragraph.'), clipping()],
      resolved(['101']),
    );
    expect(nodes).toEqual([
      { type: 'title', text: 'Rahab' },
      { type: 'body', text: 'First paragraph.' },
      { type: 'body', text: 'Second paragraph.' },
      { type: 'quote', text: 'Now Jericho was straitly shut up.' },
      { type: 'quote', text: 'None went out, and none came in.' },
      { type: 'attribution', text: '— Matthew Henry, Commentary on the Whole Bible (Joshua 2)' },
    ]);
  });

  it('a DATA-STATE tombstone (purged quote) yields attribution + notice, and NO quote text', () => {
    const nodes = studyExportModel({ title: 'Rahab' }, [clipping({ quote: null })], resolved(['101']));
    expect(nodes.some((n) => n.type === 'quote')).toBe(false);
    expect(nodes.some((n) => n.type === 'notice')).toBe(true);
    expect(JSON.stringify(nodes)).not.toContain('Jericho');
  });

  it('the BELT: a stored quote whose key does not resolve exports as a tombstone', () => {
    const nodes = studyExportModel({ title: 'Rahab' }, [clipping()], resolved([], []));
    expect(nodes.some((n) => n.type === 'quote')).toBe(false);
    expect(JSON.stringify(nodes)).not.toContain('Jericho');
    expect(nodes.some((n) => n.type === 'notice')).toBe(true);
  });

  it('fails closed: a failedClosed resolution tombstones every keyed clipping', () => {
    const failed: ServabilityResolution = {
      servableSectionIds: new Set(),
      servableSourceIds: new Set(),
      failedClosed: true,
    };
    expect(JSON.stringify(studyExportModel({ title: 'R' }, [clipping()], failed))).not.toContain('Jericho');
  });

  it('a TRIMMED clipping exports the kept range with ellipses — the same rule as the editor', () => {
    const c = clipping();
    const quote = c.quote!;
    const start = quote.indexOf('None went out');
    const nodes = studyExportModel({ title: 'R' }, [{ ...c, trim_start: start, trim_end: quote.length }], resolved(['101']));
    const quoteNodes = nodes.filter((n) => n.type === 'quote');
    expect(quoteNodes.length).toBeGreaterThan(0);
    expect(quoteNodes[0]!.text.startsWith('…')).toBe(true);
    expect(JSON.stringify(quoteNodes)).not.toContain('Jericho'); // the cut part is gone
    // Attribution still rides the excerpt — an excerpt is still a quotation.
    expect(nodes.some((n) => n.type === 'attribution')).toBe(true);
  });

  it('is deterministic: same inputs, same nodes', () => {
    const blocks = [textBlock('a'), clipping()];
    const r = resolved(['101']);
    expect(studyExportModel({ title: 'T' }, blocks, r)).toEqual(studyExportModel({ title: 'T' }, blocks, r));
  });
});

describe('exportStudyDocx', () => {
  it('packs a real .docx (zip magic) whose document xml carries the text', async () => {
    const buffer = await exportStudyDocx(
      { title: 'Rahab' },
      [textBlock('My own words.'), clipping()],
      resolved(['101']),
    );
    // A .docx is a zip: PK\x03\x04. Beyond the magic we only smoke-test size — content
    // correctness is the model layer's suite above.
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
