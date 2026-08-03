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
 * PRE-REGISTERED, and it must be measured against real files rather than trusted: this number is
 * reasoning, not measurement, and the honest test is a corpus of genuine scans and genuine
 * text-layer PDFs. Recorded in WORKLOG as UNVERIFIED until that runs.
 */
export const MIN_CHARS_PER_PAGE = 100;

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
  const { extractableChars, pages } = parsed;

  if (type === 'pdf' && pages !== undefined && pages > 0) {
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
    const { text, pages } = await parsePdf(bytes);
    return { parsed: { text, pages, extractableChars: countExtractable(text) }, type };
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
