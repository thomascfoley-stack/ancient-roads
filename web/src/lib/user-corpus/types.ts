// Slice 1 types. Names follow docs/SLICE_1_DATA_MODEL.md's "Module interfaces" section rather than
// inventing new ones, so the design doc stays readable as a description of this code.
//
// NAMING (Slice 1 order, "Naming"): `doc_type = 'sermon'` is an INTERNAL chunking classification
// and stays. The user-facing product surface is "My Works" and never "Sermons" -- that word is
// already taken by the corpus register (SERMON_CORPUS_FILTER, web/src/lib/teacher/routing.ts).
// Nothing in this file is user-facing copy.

/** Internal chunking classification (§4). Invisible to the user. */
export type DocType = 'sermon' | 'paper' | 'notes' | 'book' | 'unknown';

/**
 * Document lifecycle (§8). Every document has exactly one of these at all times; there is no
 * state in which a document is silently absent from the pipeline.
 *
 * `ready` means INDEXED AND SEARCHABLE. Step 2 never sets it -- chunking and embedding are steps
 * 3 and 4, so a document that parses cleanly in step 2 advances to `chunking` and waits there.
 * That is the order's "prove the pipeline reports honestly before it reports success": a parsed
 * document is not a ready one, and saying so early is cheaper than discovering it late.
 */
export type DocStatus = 'queued' | 'parsing' | 'chunking' | 'embedding' | 'ready' | 'failed' | 'empty';

/** The four file types Slice 1 accepts. Sniffed from content, never from the extension (§8). */
export type SniffedType = 'pdf' | 'docx' | 'txt' | 'md';

export interface ParsedDoc {
  text: string;
  /** Pages, when the format has them. PDF only; undefined elsewhere rather than a fake 1. */
  pages?: number;
  /** Numerator of the scanned-document decision. See judgeExtraction. */
  extractableChars: number;
}

export interface UserDocument {
  id: string;
  userId: string;
  title: string;
  docType: DocType;
  sourceFilename: string | null;
  blobUrl: string | null;
  byteSize: number | null;
  checksum: string | null;
  status: DocStatus;
  parseError: string | null;
  mimeType: string | null;
  pageCount: number | null;
  extractableChars: number | null;
  attempts: number;
  claimedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Every way this pipeline can refuse a document, as a closed set.
 *
 * These are CODES, not messages, because §9 requires "parse-failure rate BY FILE TYPE" -- an
 * aggregate over free-text error strings is not computable, and the moment the string is edited
 * for readability the historical series breaks. The human-readable text lives beside the code.
 */
export type RefusalCode =
  | 'unsupported_type'
  | 'too_large'
  | 'too_large_decompressed'
  | 'needs_ocr'
  | 'corrupt'
  | 'empty';

export class UploadRefused extends Error {
  readonly code: RefusalCode;
  constructor(code: RefusalCode, message: string) {
    super(message);
    this.name = 'UploadRefused';
    this.code = code;
  }
}
