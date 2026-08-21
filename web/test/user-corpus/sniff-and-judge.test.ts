// Upload gate: sniffing, caps, checksum, and the scanned-document verdict.
//
// Each test names the SEED that turns it red, because a check nobody has watched fail proves
// nothing (docs/THE_LOOP.md rule 4).

import { describe, expect, it } from 'vitest';
import {
  MAX_UPLOAD_BYTES,
  assertWithinSizeCap,
  checksum,
  sniffType,
} from '@/lib/user-corpus/sniff';
import {
  MAX_LOW_TEXT_PAGE_FRACTION,
  MIN_CHARS_PER_PAGE,
  MIN_DOC_CHARS,
  countExtractable,
  judgeExtraction,
} from '@/lib/user-corpus/parse';
import { UploadRefused } from '@/lib/user-corpus/types';

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);
const withMagic = (magic: number[], rest = 'x'): Uint8Array =>
  new Uint8Array([...magic, ...Array.from(utf8(rest))]);

const PDF = [0x25, 0x50, 0x44, 0x46];
const ZIP = [0x50, 0x4b, 0x03, 0x04];

describe('sniffType reads content, never the extension', () => {
  it('calls a PDF a PDF even when it is named .txt', () => {
    // SEED: route on the extension instead of the magic bytes -> RED. This is the whole reason
    // §8 says "don't trust extension": the text reader would produce mojibake from PDF bytes and
    // index it as a SUCCESS.
    expect(sniffType(withMagic(PDF), 'sermon.txt')).toBe('pdf');
  });

  it('calls a zip a docx even when it is named .pdf', () => {
    expect(sniffType(withMagic(ZIP), 'notes.pdf')).toBe('docx');
  });

  it('separates md from txt by name, because the bytes cannot', () => {
    // Markdown IS text; there is no magic number. The name is the only signal, and it only
    // decides which chunker step 3 picks -- never whether the file is accepted.
    expect(sniffType(utf8('# Heading'), 'notes.md')).toBe('md');
    expect(sniffType(utf8('# Heading'), 'notes.txt')).toBe('txt');
  });

  it('refuses binary junk that carries no magic we accept', () => {
    // SEED: drop the NUL check in looksTextual -> RED, arbitrary binary is accepted as 'txt'.
    const junk = new Uint8Array([0x1f, 0x8b, 0x00, 0x03, 0x41, 0x42]);
    expect(() => sniffType(junk, 'whatever.txt')).toThrow(UploadRefused);
  });

  it('refuses an empty file rather than calling it text', () => {
    expect(() => sniffType(new Uint8Array(0), 'empty.txt')).toThrow(UploadRefused);
  });
});

describe('size cap', () => {
  it('accepts a file at exactly the limit and refuses one byte more', () => {
    // Both sides asserted: a cap tested only from the failing side passes just as happily when
    // it rejects everything.
    expect(() => assertWithinSizeCap(MAX_UPLOAD_BYTES)).not.toThrow();
    let code: string | undefined;
    try {
      assertWithinSizeCap(MAX_UPLOAD_BYTES + 1);
    } catch (e) {
      code = (e as UploadRefused).code;
    }
    expect(code).toBe('too_large');
  });
});

describe('checksum', () => {
  it('is stable for identical bytes and differs for a one-byte change', async () => {
    // This is the dedupe key AND the embedding-cache key (§11), so a collision would silently
    // serve one document's vectors for another's.
    const a = await checksum(utf8('Romans 8 final v2 USETHIS'));
    const b = await checksum(utf8('Romans 8 final v2 USETHIS'));
    const c = await checksum(utf8('Romans 8 final v3 USETHIS'));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('countExtractable ignores whitespace', () => {
  it('counts a page of spaces as blank', () => {
    // SEED: use text.length -> RED. A scanned page whose only text object is a run of spaces
    // would clear the per-page threshold and index as a success.
    expect(countExtractable('   \n\t  \n ')).toBe(0);
    expect(countExtractable('a b\tc\nd')).toBe(4);
  });
});

describe('judgeExtraction — the scanned-document loud failure (§8)', () => {
  const pdf = (chars: number, pages: number) => ({
    text: 'x'.repeat(chars),
    pages,
    extractableChars: chars,
  });

  it('refuses a scanned PDF with needs_ocr, and never returns quietly', () => {
    // The headline requirement of step 2. SEED: delete the per-page branch -> RED, and a 300-page
    // scan is accepted as a document with no text.
    let code: string | undefined;
    try {
      judgeExtraction(pdf(0, 300), 'pdf');
    } catch (e) {
      code = (e as UploadRefused).code;
    }
    expect(code).toBe('needs_ocr');
  });

  it('refuses a scan that carries a little stray text, e.g. a header stamp per page', () => {
    // The failure mode that a naive "extractableChars === 0" check misses entirely: scanners and
    // PDF producers often leave page numbers or a header in a real text object.
    const chars = 10 * 40; // 40 pages, 10 characters each
    let code: string | undefined;
    try {
      judgeExtraction(pdf(chars, 40), 'pdf');
    } catch (e) {
      code = (e as UploadRefused).code;
    }
    expect(code).toBe('needs_ocr');
  });

  it('accepts a real text-layer PDF', () => {
    // The other side of the threshold. Without this the test passes when the rule rejects
    // everything, which would be the same suite reporting the same green.
    expect(() => judgeExtraction(pdf(2000 * 10, 10), 'pdf')).not.toThrow();
  });

  it('puts the boundary exactly where MIN_CHARS_PER_PAGE says', () => {
    const pages = 10;
    expect(() => judgeExtraction(pdf(MIN_CHARS_PER_PAGE * pages, pages), 'pdf')).not.toThrow();
    expect(() => judgeExtraction(pdf(MIN_CHARS_PER_PAGE * pages - 1, pages), 'pdf')).toThrow(UploadRefused);
  });

  it("names the evidence in the message, so 'needs OCR' is checkable", () => {
    // A verdict a user cannot interrogate is indistinguishable from a bug.
    try {
      judgeExtraction(pdf(12, 40), 'pdf');
      throw new Error('expected a refusal');
    } catch (e) {
      expect((e as UploadRefused).message).toContain('12');
      expect((e as UploadRefused).message).toContain('40');
    }
  });

  describe('the per-page leg (uploader deep-dive D2)', () => {
    // The whole-document rule above is an AVERAGE: a 200-page scan bound with a 20-page text
    // appendix averages past MIN_CHARS_PER_PAGE and indexes with ~90% of its content silently
    // missing — the exact silent drop §8 forbids. The per-page leg refuses when MORE THAN 40%
    // of pages (pre-registered in the D2 order before this fix was written) fall below the SAME
    // per-page floor. Floor calibration: docs/evidence/lane-b-slice1/
    // scanned-threshold-calibration.log (2026-08-03) — real text pages median 1350.7 chars,
    // real scans all 0.0. 1350 below is that median, so the rich pages here are realistic.
    const MEDIAN_TEXT_PAGE = 1350;

    const pdfWithPages = (pageChars: number[]) => {
      const extractableChars = pageChars.reduce((a, b) => a + b, 0);
      return { text: 'x'.repeat(extractableChars), pages: pageChars.length, extractableChars, pageChars };
    };

    it('REFUSES a scan bound with a text appendix, though the average clears the floor', () => {
      // SEED: the pre-D2 average-only rule -> RED here: 27,000 chars / 200 pages = 135/page,
      // accepted, with 180 unreadable pages indexed as a success.
      const parsed = pdfWithPages([...Array<number>(180).fill(0), ...Array<number>(20).fill(MEDIAN_TEXT_PAGE)]);
      expect(parsed.extractableChars / parsed.pages).toBeGreaterThan(MIN_CHARS_PER_PAGE); // the trap is real
      let refused: UploadRefused | null = null;
      try {
        judgeExtraction(parsed, 'pdf');
      } catch (e) {
        refused = e as UploadRefused;
      }
      expect(refused?.code).toBe('needs_ocr');
      // The verdict names its evidence as counts, so "needs OCR" is checkable afterwards.
      expect(refused?.message).toContain('180 of 200 pages');
    });

    it('still accepts a uniformly texty document', () => {
      expect(() => judgeExtraction(pdfWithPages(Array<number>(12).fill(MEDIAN_TEXT_PAGE)), 'pdf')).not.toThrow();
    });

    it('still refuses a fully scanned document — both legs agree', () => {
      let code: string | undefined;
      try {
        judgeExtraction(pdfWithPages(Array<number>(40).fill(0)), 'pdf');
      } catch (e) {
        code = (e as UploadRefused).code;
      }
      expect(code).toBe('needs_ocr');
    });

    it('puts the boundary exactly at MORE THAN 40% of pages below the floor', () => {
      // 4 low of 10 is exactly 40% — not MORE than — and the average (810/page) clears: accepted.
      // The counts are stated here rather than derived from the shipped constant, deliberately:
      // deriving the expectation from the artifact under test is the watchlist's fourteenth shape.
      const atBar = pdfWithPages([...Array<number>(4).fill(0), ...Array<number>(6).fill(MEDIAN_TEXT_PAGE)]);
      expect(() => judgeExtraction(atBar, 'pdf')).not.toThrow();
      // 5 low of 10 is over the bar while the average (675/page) still clears — only the
      // per-page leg can see it.
      const overBar = pdfWithPages([...Array<number>(5).fill(0), ...Array<number>(5).fill(MEDIAN_TEXT_PAGE)]);
      expect(() => judgeExtraction(overBar, 'pdf')).toThrow(UploadRefused);
    });

    it('a page at exactly the per-page floor is not a low page', () => {
      // Same strictness as the document leg: < refuses, == passes. Half the pages sit exactly
      // at the floor, so this flips if the comparison drifts to <=.
      const parsed = pdfWithPages([
        ...Array<number>(5).fill(MIN_CHARS_PER_PAGE),
        ...Array<number>(5).fill(MEDIAN_TEXT_PAGE),
      ]);
      expect(() => judgeExtraction(parsed, 'pdf')).not.toThrow();
    });

    it('ships the pre-registered fraction, 0.4, and no other', () => {
      // Stated independently of the boundary counts above, which are hardcoded on purpose: if
      // the constant drifts, BOTH this and the boundary test go red, naming the drift twice.
      expect(MAX_LOW_TEXT_PAGE_FRACTION).toBe(0.4);
    });

    it('without per-page counts, the average leg still governs (older parsed results)', () => {
      // pageChars is optional on ParsedDoc; a parsed result without it must fall through to the
      // document-average leg rather than bypass judgement.
      let code: string | undefined;
      try {
        judgeExtraction({ text: '', pages: 300, extractableChars: 0 }, 'pdf');
      } catch (e) {
        code = (e as UploadRefused).code;
      }
      expect(code).toBe('needs_ocr');
    });
  });

  it('calls a blank non-PDF empty, not needs_ocr — the remedies differ', () => {
    // SEED: collapse 'empty' into 'needs_ocr' -> RED, and the product tells someone to OCR a
    // blank .txt.
    let code: string | undefined;
    try {
      judgeExtraction({ text: '', extractableChars: 0 }, 'txt');
    } catch (e) {
      code = (e as UploadRefused).code;
    }
    expect(code).toBe('empty');
  });

  it('accepts a short but real note', () => {
    expect(() => judgeExtraction({ text: 'x'.repeat(MIN_DOC_CHARS), extractableChars: MIN_DOC_CHARS }, 'txt')).not.toThrow();
  });
});
