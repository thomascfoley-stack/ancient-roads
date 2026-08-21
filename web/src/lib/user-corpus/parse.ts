// The parse dispatcher, and the one place that decides a document has no usable text.
//
// §8: "Scanned-PDF detection that fails LOUD -- a scanned PDF has no text layer; indexing it as an
// empty success is the silent-drop that erodes trust. Detect (near-zero extractable text over N
// pages) -> status `failed: needs OCR`, never `indexed`."

import { parseDocx } from './parse-docx';
import { parsePdf } from './parse-pdf';
import { sniffType } from './sniff';
import { UploadRefused, type ParsedDoc, type SniffedType } from './types';

/**
 * Below this many characters per page, a PDF is a scan rather than a document.
 *
 * Calibration: a page of set prose runs 1500-3000 characters. A scanned page yields 0, or a
 * handful from a stray OCR-less text object such as a header stamp or a page number. 100 sits an
 * order of magnitude below any real page of text and an order of magnitude above the stray-object
 * noise floor, so it does not need to be precise to be right -- there is almost nothing in the gap.
 *
 * PRE-REGISTERED, then MEASURED 2026-08-03 (docs/evidence/lane-b-slice1/
 * scanned-threshold-calibration.log, via scanned-threshold-calibration.test.ts): TEXT n=120 real
 * PDFs through the real extractor, chars/page median 1350.7, p05 316.3; SCAN n=12 rasterised
 * image-only rebuilds of the same documents, all 0.0. Zero scans wrongly accepted at 100, and the
 * threshold sits in the observed empty band between 74 (the one stamp-only outlier) and 316. The
 * limitation that survives the measurement: scans carrying stray header-stamp text are represented
 * by a single observation, so 100 is evidence-backed but not tightly bracketed from below.
 */
export const MIN_CHARS_PER_PAGE = 100;

/**
 * Refuse a PDF when MORE THAN this fraction of its pages fall below MIN_CHARS_PER_PAGE.
 *
 * The second leg of the scanned-document rule (uploader deep-dive D2), PRE-REGISTERED at 0.4 in
 * that order before this fix was written. The whole-document rule below is an AVERAGE, and an
 * average cannot see a mixed binding: a 200-page scan bound with a 20-page text appendix runs
 * 135 chars/page overall, sails past the floor, and indexes with ~90% of its content silently
 * missing -- the exact silent drop §8 forbids. The per-page floor this leg reuses is the same
 * calibrated MIN_CHARS_PER_PAGE (real text pages measured median 1350.7 chars/page; real scan
 * pages 0.0 -- see the calibration note above), so a "low" page here is one that measures like a
 * scan page, and 0.4 tolerates a scanned cover, plates, or an inserted facsimile without letting
 * a majority-scan volume through.
 */
export const MAX_LOW_TEXT_PAGE_FRACTION = 0.4;

/**
 * Below this many characters TOTAL, any document is empty regardless of format.
 *
 * Distinct from the per-page rule because the remedies differ: a scanned PDF needs OCR (an action
 * the user can take), whereas a genuinely blank file needs a different file. Collapsing them would
 * tell someone to OCR an empty .txt.
 */
export const MIN_DOC_CHARS = 32;

/** Non-whitespace character count. Whitespace is not extractable text -- a page of spaces is blank. */
export function countExtractable(text: string): number {
  return text.replace(/\s+/g, '').length;
}

/**
 * Decide whether an extraction is usable, and refuse LOUDLY if not.
 *
 * Returns nothing on success; throws UploadRefused otherwise. It never returns a "probably fine"
 * -- the whole point is that there is no state between accepted and refused in which a document
 * can sit quietly and be treated as indexed.
 */
export function judgeExtraction(parsed: ParsedDoc, type: SniffedType): void {
  const { extractableChars, pages, pageChars } = parsed;

  if (type === 'pdf' && pages !== undefined && pages > 0) {
    // Leg 1, PER PAGE: more than MAX_LOW_TEXT_PAGE_FRACTION of pages below the per-page floor is
    // a scan (possibly bound with some text pages), whatever the document-wide average says.
    // Strictness matches leg 2 in both comparisons: a page AT the floor is not low, and a
    // fraction AT the bar is not over it.
    if (pageChars && pageChars.length > 0) {
      const low = pageChars.filter((c) => c < MIN_CHARS_PER_PAGE).length;
      if (low / pageChars.length > MAX_LOW_TEXT_PAGE_FRACTION) {
        throw new UploadRefused(
          'needs_ocr',
          `${low} of ${pageChars.length} pages have no readable text — this looks like a scan, ` +
            'and needs OCR before it can be searched.',
        );
      }
    }

    // Leg 2, WHOLE-DOCUMENT AVERAGE: kept beside leg 1 rather than replaced by it, because it is
    // what still fires for a parsed result carrying no per-page counts (pageChars is optional --
    // older results, or a future paged format that cannot count per page), and it is the leg the
    // 2026-08-03 calibration measured directly.
    const perPage = extractableChars / pages;
    if (perPage < MIN_CHARS_PER_PAGE) {
      throw new UploadRefused(
        'needs_ocr',
        `That PDF has no readable text layer (${extractableChars} characters across ${pages} ` +
          `page${pages === 1 ? '' : 's'}). It looks like a scan, and needs OCR before it can be searched.`,
      );
    }
  }

  if (extractableChars < MIN_DOC_CHARS) {
    throw new UploadRefused('empty', 'That file contains no readable text.');
  }
}

/**
 * bytes -> text, by SNIFFED type. Does not judge; call judgeExtraction on the result.
 *
 * Split that way because the queue needs to record what was extracted (page count, character
 * count) even for a document it is about to refuse -- those two numbers are the evidence for the
 * refusal, and discarding them would leave 'needs OCR' as an assertion nobody can check later.
 */
export async function extractText(bytes: Uint8Array, filename: string): Promise<{ parsed: ParsedDoc; type: SniffedType }> {
  const type = sniffType(bytes, filename);

  if (type === 'pdf') {
    const { text, pages, pageChars } = await parsePdf(bytes);
    return { parsed: { text, pages, pageChars, extractableChars: countExtractable(text) }, type };
  }

  if (type === 'docx') {
    const text = parseDocx(bytes);
    return { parsed: { text, extractableChars: countExtractable(text) }, type };
  }

  // txt / md. Decoded strictly: a byte sequence that is not valid UTF-8 is a file we have
  // mis-sniffed, and mojibake indexed as prose is precisely the silent success this refuses.
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new UploadRefused('unsupported_type', 'That text file is not valid UTF-8 and could not be read.');
  }
  return { parsed: { text: text.trim(), extractableChars: countExtractable(text) }, type };
}

export { UploadRefused };
