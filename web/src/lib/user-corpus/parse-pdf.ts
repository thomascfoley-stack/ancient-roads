// PDF text extraction via pdfjs-dist's legacy build (the one that runs under Node rather than in
// a browser worker).
//
// This file extracts and counts. It does NOT decide whether the result means "scanned" -- that
// judgement lives in parse.ts beside the same rule for every other format, so there is one place
// that can say a document has no usable text.

import { UploadRefused } from './types';

export interface PdfExtraction {
  text: string;
  pages: number;
}

/**
 * pdfjs is imported dynamically because it is the largest thing in the upload root and nothing on
 * the request path except an actual PDF upload should pay to load it.
 */
export async function parsePdf(bytes: Uint8Array): Promise<PdfExtraction> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  let doc;
  try {
    doc = await pdfjs.getDocument({
      // pdfjs takes ownership of the buffer it is given and detaches it. Copy, so a caller that
      // still needs the raw bytes (to compute a checksum, or to upload the original to blob
      // storage) does not silently receive an empty Uint8Array afterwards.
      data: new Uint8Array(bytes),
      // No worker thread in a serverless function.
      useWorkerFetch: false,
      // Font rendering is irrelevant when only the text layer is wanted, and both of these would
      // otherwise mean network fetches or local font lookups from inside a parse.
      disableFontFace: true,
      useSystemFonts: false,
    }).promise;
  } catch (e) {
    // An encrypted PDF also lands here. Both are refusals the user can act on, and neither may be
    // allowed to look like a document with no text -- that is the scanned-PDF confusion in reverse.
    const msg = String((e as Error)?.message ?? e);
    throw new UploadRefused(
      'corrupt',
      /password|encrypt/i.test(msg)
        ? 'That PDF is password-protected, so its text cannot be read.'
        : 'That PDF could not be read; it may be damaged.',
    );
  }

  const pages = doc.numPages;
  const chunks: string[] = [];
  try {
    for (let n = 1; n <= pages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const line = content.items
        // TextContent mixes TextItem with TextMarkedContent (structure markers carrying no text).
        // Narrowing on the presence of `str` keeps this honest without casting through `any`.
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ');
      chunks.push(line);
      // Release per-page resources as we go; a 400-page PDF otherwise holds every page's operator
      // list at once, which is the shape of an out-of-memory in a serverless function.
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }

  const text = chunks
    .join('\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text, pages };
}
