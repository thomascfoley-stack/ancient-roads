// Copy-chip payloads (design §10.1: Copy styled · Copy lines · Text only). The attribution
// discipline is asserted here: the label is Author · Work · locus shaped and the formats never
// introduce a host URL; the styled HTML half escapes markup.
import { describe, expect, it } from 'vitest';
import { formatLines, formatStyledHtml, formatStyledText, formatTextOnly } from '@/lib/copy-format';

const src = {
  text: 'For God so loved the world',
  label: 'John 3:16 · KJV',
  lineNo: '16',
};

describe('copy formats', () => {
  it('Text only is the bare words — no quotes, no reference', () => {
    expect(formatTextOnly(src)).toBe('For God so loved the world');
  });

  it('Copy lines is a numbered line with the reference on its own line', () => {
    expect(formatLines(src)).toBe('16  For God so loved the world\nJohn 3:16 · KJV');
  });

  it('Copy lines without a line number omits the number, keeps the reference', () => {
    expect(formatLines({ text: src.text, label: src.label })).toBe(
      'For God so loved the world\nJohn 3:16 · KJV',
    );
  });

  it('Copy styled (plain fallback) quotes the text and attributes it', () => {
    expect(formatStyledText(src)).toBe('“For God so loved the world”\nJohn 3:16 · KJV');
  });

  it('Copy styled (HTML half) escapes markup in the text', () => {
    const html = formatStyledHtml({ text: 'a <b> & c', label: 'John 3:16 · KJV' });
    expect(html).toContain('a &lt;b&gt; &amp; c');
    expect(html).not.toContain('<b>');
  });

  it('no format introduces a host URL (attribution is author · work · locus, never a link)', () => {
    for (const out of [formatTextOnly(src), formatLines(src), formatStyledText(src), formatStyledHtml(src)]) {
      expect(out).not.toMatch(/https?:\/\//);
    }
  });
});
