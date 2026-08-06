// MIME sniff + size caps (§8: "MIME sniff (don't trust extension); size cap AND decompressed-size
// cap (zip-bomb / a 2GB docx)").
//
// WHY SNIFF AT ALL. The extension is attacker-controlled and, more mundanely, wrong all the time:
// pastors rename files. If we routed by extension, a PDF named .txt would be handed to the text
// reader, produce mojibake, and index as a SUCCESS -- the silent-drop class this slice exists to
// refuse, arriving through the front door.

import { UploadRefused, type SniffedType } from './types';

/**
 * Hard byte ceiling on an upload. 25 MB comfortably holds a scanned book chapter or a
 * 400-page docx of prose; it is small enough that a request holding one in memory is not itself
 * the outage. Enforced on the RAW bytes, before anything is decompressed.
 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Ceiling on DECOMPRESSED bytes drawn out of a container (docx is a zip). This is the zip-bomb
 * cap, and it is the reason the docx reader is hand-rolled rather than delegated: a library
 * inflates the entry and hands you the result, which means the bomb has already gone off by the
 * time you could check its size. The reader below stops mid-stream at this number.
 *
 * 80 MB of XML is far more than any real .docx of prose and far less than a bomb needs.
 */
export const MAX_DECOMPRESSED_BYTES = 80 * 1024 * 1024;

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.length < magic.length) return false;
  return magic.every((b, i) => bytes[i] === b);
}

/**
 * Is this byte range plausibly UTF-8 text? Used only to separate txt/md from binary junk that
 * carries no recognisable magic -- NOT to validate encoding.
 *
 * A NUL byte is the tell: real text files essentially never contain one, and virtually every
 * binary format does within its first kilobyte. Checking a prefix rather than the whole file
 * keeps this O(1) on a 25 MB upload.
 */
function looksTextual(bytes: Uint8Array): boolean {
  const probe = bytes.subarray(0, 1024);
  if (probe.length === 0) return false;
  return !probe.includes(0x00);
}

/**
 * Decide the type from CONTENT, with the filename used only to split txt from md -- a distinction
 * that genuinely does not exist in the bytes (markdown IS text) and that only affects which
 * chunker step 3 picks, never whether the file is accepted.
 *
 * A docx is a zip, and so are .xlsx/.pptx/.jar/.epub. This returns 'docx' for any zip and lets the
 * docx reader be the thing that refuses a zip without word/document.xml -- one place that knows
 * what a docx is, rather than two that must agree.
 */
export function sniffType(bytes: Uint8Array, filename: string): SniffedType {
  if (startsWith(bytes, PDF_MAGIC)) return 'pdf';
  if (startsWith(bytes, ZIP_MAGIC)) return 'docx';
  if (looksTextual(bytes)) {
    return /\.(md|markdown|mdown)$/i.test(filename) ? 'md' : 'txt';
  }
  throw new UploadRefused(
    'unsupported_type',
    'That file is not a PDF, Word document, or text file. Slice 1 accepts .pdf, .docx, .txt and .md.',
  );
}

/** Enforce the raw-byte ceiling. Separate from sniffing so the caller can refuse before reading. */
export function assertWithinSizeCap(byteLength: number): void {
  if (byteLength > MAX_UPLOAD_BYTES) {
    throw new UploadRefused(
      'too_large',
      `That file is ${(byteLength / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
    );
  }
}

/**
 * sha256 of the raw bytes, hex. Dedupe key AND the embedding-cache key (§11 cost control), so it
 * must be over the RAW file rather than the extracted text: two files with identical prose but
 * different formatting are different uploads and re-parsing is cheap, whereas re-embedding is the
 * expensive thing the cache exists to avoid.
 */
export async function checksum(bytes: Uint8Array): Promise<string> {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
