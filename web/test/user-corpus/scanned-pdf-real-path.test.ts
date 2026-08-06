// The scanned-PDF loud failure (§8), driven through the REAL extractor.
//
// sniff-and-judge.test.ts proves the RULE against synthetic numbers. That is not enough on its
// own: the number the rule consumes is produced by pdfjs, and a correct rule fed a wrong number
// decides nothing. This drives genuine PDF bytes through the real parse path, so the extractor and
// the rule are tested joined together rather than each against a stub of the other.
//
// The two PDFs are GENERATED, not committed, so the fixture states what it is:
//   A. real text objects              -> must be ACCEPTED
//   B. same page count, no text layer -> must be REFUSED, needs_ocr
//
// B is what a scanner produces: the pages are real, the text layer is absent. Indexing it as an
// empty success is the silent drop this slice exists to refuse.

import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { parsePdf } from '@/lib/user-corpus/parse-pdf';
import { MIN_CHARS_PER_PAGE, countExtractable, judgeExtraction } from '@/lib/user-corpus/parse';
import { UploadRefused } from '@/lib/user-corpus/types';

/** A syntactically valid PDF with `pages` pages, with or without a text layer. */
function makePdf(pages: number, withText: boolean): Uint8Array {
  const objects: string[] = [];
  const pageIds: number[] = [];
  let nextId = 3;
  for (let i = 0; i < pages; i++) {
    pageIds.push(nextId);
    nextId += 2;
  }
  const fontId = nextId;

  objects[1] = '<</Type/Catalog/Pages 2 0 R>>';
  objects[2] = `<</Type/Pages/Kids[${pageIds.map((id) => `${id} 0 R`).join(' ')}]/Count ${pages}>>`;

  pageIds.forEach((pageId, i) => {
    const contentId = pageId + 1;
    objects[pageId] =
      `<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents ${contentId} 0 R` +
      (withText ? `/Resources<</Font<</F1 ${fontId} 0 R>>>>` : '/Resources<<>>') +
      '>>';
    // With text: real BT/Tj/ET text objects. Without: a filled rectangle -- the page has content
    // and a non-trivial content stream, but no text at all. That distinction is the whole test.
    const stream = withText
      ? `BT /F1 12 Tf 72 720 Td (Sermon page ${i + 1}.) Tj ` +
        '0 -14 Td (The plowman plows for sowing and opens and harrows his ground,) Tj ' +
        '0 -14 Td (that he may sow wheat in rows and barley in its proper place.) Tj ' +
        '0 -14 Td (This paragraph exists so the page clears the per-page character floor.) Tj ET'
      : '0.5 0.5 0.5 rg 72 72 468 648 re f';
    objects[contentId] = `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`;
  });

  objects[fontId] = '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>';

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let id = 1; id <= fontId; id++) {
    if (!objects[id]) continue;
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefAt = pdf.length;
  pdf += `xref\n0 ${fontId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= fontId; id++) {
    pdf += `${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<</Size ${fontId + 1}/Root 1 0 R>>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, 'latin1'));
}

const PAGES = 12;

describe('a PDF with a real text layer', () => {
  it('is read, and accepted', async () => {
    const { text, pages } = await parsePdf(makePdf(PAGES, true));
    const chars = countExtractable(text);
    expect(pages).toBe(PAGES);
    expect(chars / pages).toBeGreaterThan(MIN_CHARS_PER_PAGE);
    expect(text).toContain('plowman');
    // The other side of the threshold. Without it, a rule that refused everything would pass the
    // scan test below and this suite would report the same green.
    expect(() => judgeExtraction({ text, pages, extractableChars: chars }, 'pdf')).not.toThrow();
  });
});

describe('a scan: real pages, no text layer', () => {
  it('is REFUSED needs_ocr rather than indexed as an empty success', async () => {
    const { text, pages } = await parsePdf(makePdf(PAGES, false));
    const chars = countExtractable(text);

    // The pages are genuinely there -- this is not a broken file, which is exactly why the
    // failure has to be loud. A document with 12 readable pages and no text reads as "indexed,
    // 0 results" to everyone who does not know to look.
    expect(pages).toBe(PAGES);
    expect(chars).toBeLessThan(MIN_CHARS_PER_PAGE * pages);

    let refused: UploadRefused | null = null;
    try {
      judgeExtraction({ text, pages, extractableChars: chars }, 'pdf');
    } catch (e) {
      refused = e as UploadRefused;
    }
    // SEED: delete the per-page branch in judgeExtraction -> RED here, and the pipeline accepts a
    // 12-page scan.
    expect(refused).not.toBeNull();
    expect(refused?.code).toBe('needs_ocr');
    // The verdict must carry its evidence, or 'needs OCR' is an assertion nobody can check.
    expect(refused?.message).toContain(String(PAGES));
  });
});
