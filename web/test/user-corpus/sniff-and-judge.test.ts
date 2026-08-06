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
import { MIN_CHARS_PER_PAGE, MIN_DOC_CHARS, countExtractable, judgeExtraction } from '@/lib/user-corpus/parse';
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
