// .docx text extraction, hand-rolled over the zip container.
//
// WHY NOT A LIBRARY. §8 requires a DECOMPRESSED-size cap ("zip-bomb / a 2GB docx") as well as a
// raw-size cap. Every docx library takes the file and hands back the extracted content, which
// means the decompression has already completed before any check of ours can run -- the cap would
// be a check on a number that could only be produced by doing the dangerous thing first. Node's
// zlib takes `maxOutputLength` and aborts the inflate mid-stream, which is the cap the design
// actually asks for. That capability, not dependency-minimalism, is the reason this file exists.
//
// A docx is a zip whose main body is word/document.xml. We read exactly that one entry: headers,
// footers, footnotes and comments are deliberately out of scope for Slice 1's prose chunker.

import { inflateRawSync } from 'node:zlib';
import { MAX_DECOMPRESSED_BYTES } from './sniff';
import { UploadRefused } from './types';

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const MAX_EOCD_SCAN = 65557; // 22-byte EOCD + max 65535-byte comment
const DOCUMENT_ENTRY = 'word/document.xml';

interface CentralEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

/** Locate the End Of Central Directory record by scanning backwards from the tail. */
function findEocd(view: DataView, len: number): number {
  const start = Math.max(0, len - MAX_EOCD_SCAN);
  for (let i = len - 22; i >= start; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) return i;
  }
  throw new UploadRefused('corrupt', 'That Word document could not be read: no zip directory found.');
}

function readCentralDirectory(bytes: Uint8Array, view: DataView): CentralEntry[] {
  const eocd = findEocd(view, bytes.length);
  const entryCount = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);

  // ZIP64 sentinels. Our raw cap is 25 MB so a genuine zip64 docx cannot reach here; if these
  // appear the file is not what it claims. Refusing beats parsing it wrong, because parsing it
  // wrong yields plausible partial text and indexes as a success.
  if (entryCount === 0xffff || cdOffset === 0xffffffff) {
    throw new UploadRefused('corrupt', 'That Word document uses a zip64 container this reader does not support.');
  }

  const entries: CentralEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== CD_SIG) {
      throw new UploadRefused('corrupt', 'That Word document has a damaged zip directory.');
    }
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    entries.push({
      method: view.getUint16(p + 10, true),
      compressedSize: view.getUint32(p + 20, true),
      uncompressedSize: view.getUint32(p + 24, true),
      localHeaderOffset: view.getUint32(p + 42, true),
      name: new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen)),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * Inflate one entry, refusing to produce more than MAX_DECOMPRESSED_BYTES.
 *
 * The declared uncompressedSize is checked FIRST as a cheap rejection, but it is attacker-supplied
 * and a bomb will simply lie about it -- so `maxOutputLength` is the guard that actually holds, and
 * it aborts the inflate rather than trusting the header.
 */
function inflateEntry(bytes: Uint8Array, view: DataView, entry: CentralEntry): Uint8Array {
  if (entry.uncompressedSize > MAX_DECOMPRESSED_BYTES) {
    throw new UploadRefused(
      'too_large_decompressed',
      `That Word document expands to ${(entry.uncompressedSize / 1024 / 1024).toFixed(0)} MB of content, ` +
        `over the ${MAX_DECOMPRESSED_BYTES / 1024 / 1024} MB limit.`,
    );
  }
  const lh = entry.localHeaderOffset;
  if (lh + 30 > bytes.length) {
    throw new UploadRefused('corrupt', 'That Word document has a damaged entry header.');
  }
  // The local header's own name/extra lengths, NOT the central directory's -- they are permitted
  // to differ, and using the wrong one lands the read a few bytes into the compressed stream.
  const nameLen = view.getUint16(lh + 26, true);
  const extraLen = view.getUint16(lh + 28, true);
  const dataStart = lh + 30 + nameLen + extraLen;
  const data = bytes.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.method === 0) return data; // stored
  if (entry.method !== 8) {
    throw new UploadRefused('corrupt', `That Word document uses an unsupported compression method (${entry.method}).`);
  }
  try {
    return new Uint8Array(inflateRawSync(data, { maxOutputLength: MAX_DECOMPRESSED_BYTES }));
  } catch (e) {
    // zlib reports the cap breach as a buffer-size error; anything else is a genuinely broken
    // stream. Both are refusals, but they are DIFFERENT refusals and the codes must not merge --
    // 'too_large_decompressed' is a defended attack and 'corrupt' is a bad file, and §9's
    // failure-rate-by-type series is only meaningful if they stay distinguishable.
    const msg = String((e as Error)?.message ?? e);
    if (/buffer|length|size/i.test(msg)) {
      throw new UploadRefused(
        'too_large_decompressed',
        `That Word document expands past the ${MAX_DECOMPRESSED_BYTES / 1024 / 1024} MB content limit.`,
      );
    }
    throw new UploadRefused('corrupt', 'That Word document could not be decompressed.');
  }
}

/**
 * Pull readable prose out of WordprocessingML.
 *
 * `<w:t>` holds the runs of literal text; `</w:p>` ends a paragraph. Everything else -- styling,
 * revision marks, bookmarks, section properties -- is dropped. `<w:tab/>` and `<w:br/>` become
 * whitespace so words either side do not fuse into one token, which would corrupt the 6-gram
 * shingles the uncited-quote channel depends on in step 3.
 *
 * PARAGRAPHS ARE BLANK-LINE SEPARATED (uploader deep-dive D1). chunk.ts splits paragraph blocks
 * on /\n{2,}/ and its isHeadingLine only fires on a single-line block, so a single \n per </w:p>
 * made a whole Word sermon arrive downstream as ONE block with headings glued into body prose.
 * `\n\n` per </w:p> is the chunker's actual contract. This also covers Word's own heading
 * paragraphs (`<w:pStyle w:val="Heading1"/>` inside `<w:pPr>`) by construction: EVERY paragraph
 * lands as its own block, a heading paragraph included, so no pStyle scan is needed -- which is
 * deliberate, because a new attribute-scanning regex here would be new ReDoS surface (A1-1) for
 * zero behavioural gain. Whether the heading text then trips isHeadingLine is the chunker's call.
 */
function xmlToText(xml: string): string {
  // `[^<>]`, NOT `[^>]`, in every attribute scan below — audit A1-1 (CRITICAL).
  //
  // `<w:tab` + `[^>]*` + a required `>` is quadratic on input where the `>` never arrives: the
  // engine retries every prefix from every start offset. Measured before this change, a 919-BYTE
  // upload (512 KB of document.xml, compressed) burned 46 seconds of CPU through parseDocx and
  // extracted zero characters. MAX_DECOMPRESSED_BYTES is 80 MB, three orders of magnitude above
  // what the attack needs, so the zip-bomb cap authorised this rather than bounding it.
  //
  // Excluding `<` bounds each start position's scan to the distance to the next `<`, so the total
  // is linear. It is semantically identical on well-formed input: an XML attribute value cannot
  // contain a raw `<` (it must be `&lt;`).
  const withBreaks = xml
    .replace(/<w:tab\b[^<>]*\/?>/g, '\t')
    .replace(/<w:br\b[^<>]*\/?>/g, '\n')
    // \n\n, NOT \n: the chunker's paragraph-block contract (see the doc comment above). Two
    // consecutive \n survive the alternation below as two single-char matches, and the final
    // \n{3,} squeeze keeps runs (empty paragraphs, a trailing <w:br/>) at exactly one blank line.
    .replace(/<\/w:p>/g, '\n\n'); // literal, no quantifier, so never quadratic — kept that way deliberately
  const out: string[] = [];
  // The alternation must carry BOTH separators the substitutions above introduce. It listed only
  // \n, so every <w:tab/> was substituted and then silently dropped, fusing the words either side
  // of a tab -- which manufactures a 6-gram that exists in no translation and in no sermon, and
  // would have quietly cost recall in step 3's uncited-quote channel.
  // Two narrowings here, both for A1-1. The attribute scan takes the same `[^<>]` as above. The
  // BODY moves from `[\s\S]*?` to `[^<]*`: a lazy any-char body searching for a `</w:t>` that never
  // arrives is the same quadratic in a different costume, and it was the most expensive of the
  // three (3,081 ms on 128 KB, against 1,059 ms for the tab pass).
  //
  // `[^<]*` is not merely faster, it is the correct class: `<w:t>` holds character data, and a raw
  // `<` cannot appear inside it — a literal must be `&lt;`. The one behaviour it gives up is
  // matching ACROSS a nested element, which `<w:t>` may not contain in any valid document; such a
  // run now yields no match instead of swallowing the markup as text, which is the safer failure.
  const re = /<w:t(?:\s[^<>]*)?>([^<]*)<\/w:t>|([\n\t])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(withBreaks)) !== null) {
    if (m[2]) out.push(m[2]);
    else if (m[1] !== undefined) out.push(decodeEntities(m[1]));
  }
  return out
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Out-of-range code points keep the original entity text rather than throwing a RangeError
    // that the upload queue would retry three times on a deterministic input. Same guard as
    // web/src/verifier/normalize.ts's decodeHtmlEntities, which predates this parser.
    .replace(/&#(\d+);/g, (m, d: string) => {
      const cp = Number(d);
      if (!Number.isFinite(cp) || cp < 1 || cp > 0x10ffff) return m;
      return String.fromCodePoint(cp);
    })
    .replace(/&#x([0-9a-f]+);/gi, (m, h: string) => {
      const cp = parseInt(h, 16);
      if (!Number.isFinite(cp) || cp < 1 || cp > 0x10ffff) return m;
      return String.fromCodePoint(cp);
    })
    .replace(/&amp;/g, '&'); // last, so &amp;lt; does not become <
}

export function parseDocx(bytes: Uint8Array): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = readCentralDirectory(bytes, view);
  const doc = entries.find((e) => e.name === DOCUMENT_ENTRY);
  if (!doc) {
    // A zip without word/document.xml is some other OOXML container (.xlsx, .pptx) or a plain
    // archive. sniffType returns 'docx' for every zip on purpose and lets this be the one place
    // that decides what a docx is.
    throw new UploadRefused(
      'unsupported_type',
      'That zip file is not a Word document (no word/document.xml). Slice 1 accepts .pdf, .docx, .txt and .md.',
    );
  }
  return xmlToText(new TextDecoder().decode(inflateEntry(bytes, view, doc)));
}

// Test seam for `web/test/invariants/docx-extract-redos.test.ts`. `xmlToText` is the whole of the
// A1-1 attack surface, and the invariant it must hold — linear cost in input size — is measurable
// only by calling it directly; going through parseDocx would time the zip reader too.
export const xmlToTextForTest = xmlToText;
