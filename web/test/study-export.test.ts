import { describe, expect, it } from 'vitest';
import { exportStudyMarkdown, type ExportBlock } from '../src/lib/study-export';
import { blockRenderState, isTombstone, TOMBSTONE_NOTICE, type ServabilityResolution } from '../src/lib/servability';

// Export is a RENDER PATH (design Flow E), so both Flow D legs must hold in the serialized
// bytes exactly as on screen: the data-state tombstone (quote IS NULL + attribution) and the
// re-check belt (quote present but key unservable → tombstone anyway). The rule itself lives
// in servability.ts — these tests pin that the export consumes it rather than re-deriving it,
// and that a tombstone keeps attribution and drops quote AND link (S-10's shape, at the unit
// level; the S-suite proper is P2's).
// Red-proofed by mutation (docs/evidence/study-docs-p1/): make blockRenderState return
// 'clipping' for tombstones — the tombstone cases go red.

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
  quote: 'Now Jericho was straitly shut up because of the children of Israel.',
  attribution: { author: 'Matthew Henry', work_title: 'Commentary on the Whole Bible', reference: 'Joshua 2' },
  section_id: '101',
  source_id: null,
  ...over,
});

describe('exportStudyMarkdown', () => {
  it('serializes title, text verbatim, and a live clipping as blockquote + attribution', () => {
    const md = exportStudyMarkdown(
      { title: 'Rahab' },
      [textBlock('My own thoughts on Rahab.'), clipping()],
      resolved(['101']),
    );
    expect(md).toContain('# Rahab');
    expect(md).toContain('My own thoughts on Rahab.');
    expect(md).toContain('> Now Jericho was straitly shut up');
    expect(md).toContain('— Matthew Henry, *Commentary on the Whole Bible* (Joshua 2)');
  });

  it('renders a DATA-STATE tombstone (purged quote) as attribution + notice, no quote', () => {
    const purged = clipping({ quote: null });
    expect(isTombstone(purged)).toBe(true);
    const md = exportStudyMarkdown({ title: 'Rahab' }, [purged], resolved(['101']));
    expect(md).toContain(TOMBSTONE_NOTICE);
    expect(md).toContain('Matthew Henry');
    expect(md).not.toContain('Jericho'); // the quote is gone from the bytes, not just hidden
  });

  it('applies the BELT: a stored quote whose key is no longer servable exports as a tombstone', () => {
    const stale = clipping(); // quote still present in the row…
    const md = exportStudyMarkdown({ title: 'Rahab' }, [stale], resolved([], [])); // …but nothing resolves
    expect(md).toContain(TOMBSTONE_NOTICE);
    expect(md).not.toContain('Jericho');
  });

  it('fails closed: a failedClosed resolution tombstones every keyed clipping', () => {
    const failed: ServabilityResolution = {
      servableSectionIds: new Set(),
      servableSourceIds: new Set(),
      failedClosed: true,
    };
    expect(blockRenderState(clipping(), failed)).toBe('tombstone');
    const md = exportStudyMarkdown({ title: 'Rahab' }, [clipping()], failed);
    expect(md).not.toContain('Jericho');
  });

  it('serves a source_id-keyed clipping when its source leg resolves', () => {
    const ask = clipping({ section_id: null, source_id: 'commentary:jos:2:1-7:Matthew Henry' });
    const md = exportStudyMarkdown(
      { title: 'Rahab' },
      [ask],
      resolved([], ['commentary:jos:2:1-7:Matthew Henry']),
    );
    expect(md).toContain('> Now Jericho');
  });

  it('keeps multi-paragraph quotes inside one blockquote', () => {
    const md = exportStudyMarkdown(
      { title: 'T' },
      [clipping({ quote: 'First paragraph.\n\nSecond paragraph.' })],
      resolved(['101']),
    );
    expect(md).toContain('> First paragraph.\n>\n> Second paragraph.');
  });

  it('is deterministic: same inputs, same bytes', () => {
    const blocks = [textBlock('a'), clipping()];
    const r = resolved(['101']);
    expect(exportStudyMarkdown({ title: 'T' }, blocks, r)).toBe(exportStudyMarkdown({ title: 'T' }, blocks, r));
  });
});
