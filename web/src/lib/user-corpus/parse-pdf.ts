// PDF text extraction via pdfjs-dist's legacy build (the one that runs under Node rather than in
// a browser worker).
//
// This file extracts and counts. It does NOT decide whether the result means "scanned" -- that
// judgement lives in parse.ts beside the same rule for every other format, so there is one place
// that can say a document has no usable text.

import { installPdfDomGlobals } from './dom-matrix';
import { UploadRefused } from './types';

export interface PdfExtraction {
  text: string;
  pages: number;
  /**
   * Non-whitespace characters PER PAGE, in page order. This file counts and does not judge (see
   * the header); the per-page rule that consumes these lives in parse.ts judgeExtraction. The
   * count uses the same rule as parse.ts countExtractable — whitespace is not extractable text —
   * duplicated as a one-liner rather than imported, because parse.ts imports this file and the
   * reverse import would be a cycle.
   */
  pageChars: number[];
}

/**
 * pdfjs is imported dynamically because it is the largest thing in the upload root and nothing on
 * the request path except an actual PDF upload should pay to load it.
 */
export async function parsePdf(bytes: Uint8Array): Promise<PdfExtraction> {
  // BEFORE the import, not after: pdfjs 5.x runs `new DOMMatrix()` at module scope, so the
  // throw happens while the module is being evaluated, not when a PDF is parsed. Every PDF
  // upload on production failed with "DOMMatrix is not defined" until this line existed.
  installPdfDomGlobals();
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  // pdfjs reads its worker and its base-14 font data off disk, relative to its own location.
  // Resolving them here (rather than letting pdfjs guess) means one place knows where they are,
  // and next.config's outputFileTracingIncludes is what guarantees they were shipped.
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  let standardFontDataUrl: string | undefined;
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
    standardFontDataUrl = `${require.resolve('pdfjs-dist/package.json').replace(/package\.json$/, '')}standard_fonts/`;
  } catch {
    // Leave pdfjs to its own defaults. A resolution failure here is not worth refusing an upload
    // over on its own -- if it matters, getDocument fails below and the reason reaches the user.
  }

  // The LOADING TASK is kept, not discarded by chaining `.promise` off it. pdfjs 6 removed
  // `PDFDocumentProxy.destroy()` (the CVE fix for GHSA-hq66-cqwq-w95j is 6.2.108, so the upgrade
  // is not optional); teardown now lives on the loading task, which is the more honest handle
  // anyway — it is what owns the WORKER, and an undestroyed worker is the leak that matters
  // inside a serverless function.
  let task;
  let doc;
  try {
    task = pdfjs.getDocument({
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
      standardFontDataUrl,
    });
    doc = await task.promise;
  } catch (e) {
    // An encrypted PDF also lands here. Both are refusals the user can act on, and neither may be
    // allowed to look like a document with no text -- that is the scanned-PDF confusion in reverse.
    const msg = String((e as Error)?.message ?? e);
    // The CAUSE is carried through. "That PDF could not be read; it may be damaged" was true and
    // useless: it read as a claim about the file when the actual fault was ours (pdfjs failing to
    // initialise in the serverless bundle). The owner only diagnosed the DOMMatrix outage because
    // a different layer happened to surface the raw message, so this one now does too.
    throw new UploadRefused(
      'corrupt',
      /password|encrypt/i.test(msg)
        ? 'That PDF is password-protected, so its text cannot be read.'
        : `That PDF could not be opened. The reader reported: ${msg}`,
    );
  }

  const pages = doc.numPages;
  const chunks: string[] = [];
  const pageChars: number[] = [];
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
      // Counted here, per page, because after the join below the page boundaries are gone and no
      // later stage can recover which pages were blank. Same rule as countExtractable (see the
      // PdfExtraction doc comment for why it is not imported).
      pageChars.push(line.replace(/\s+/g, '').length);
      // Release per-page resources as we go; a 400-page PDF otherwise holds every page's operator
      // list at once, which is the shape of an out-of-memory in a serverless function.
      page.cleanup();
    }
  } finally {
    // `task.destroy()` also tears the document down — it is documented as "abort all network
    // requests and destroy the worker", and it is the only teardown pdfjs 6 still exposes here.
    await task.destroy();
  }

  const text = chunks
    .join('\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text, pages, pageChars };
}
