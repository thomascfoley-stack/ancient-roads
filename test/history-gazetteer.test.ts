// Exit test for B12 (#115): the gazetteer entry for the Easter controversy must
// match controversy-specific surface forms only. The bare label 'Easter'
// anchored EVERY Easter mention in a historian section (resurrection
// narratives, calendar references) to `easter-controversy`.

import { describe, expect, it } from 'vitest';
import { verbatimAnchors } from '../src/ingest/history-gazetteer';

const slugs = (heading: string, body: string) =>
  verbatimAnchors(heading, body).map((g) => g.slug);

describe('history gazetteer — easter-controversy (B12)', () => {
  it('does not anchor a bare Easter mention', () => {
    expect(slugs('', 'He rose on Easter morning.')).not.toContain('easter-controversy');
  });

  it('anchors the Quartodeciman alias', () => {
    expect(slugs('', 'the Quartodeciman dispute')).toContain('easter-controversy');
  });

  it('anchors the Synod of Whitby alias', () => {
    expect(slugs('', 'the Synod of Whitby settled the question')).toContain(
      'easter-controversy',
    );
  });

  it('anchors the full label', () => {
    expect(slugs('', 'the Easter controversy divided the churches')).toContain(
      'easter-controversy',
    );
  });
});
