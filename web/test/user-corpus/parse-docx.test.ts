// The hand-rolled docx reader, including the zip-bomb cap that is the whole reason it is
// hand-rolled (a library decompresses before any check of ours could run).
//
// The fixtures are real zips built here rather than binary files checked into the repo, so the
// test states what it is testing instead of pointing at opaque bytes.

import { Buffer } from 'node:buffer';
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parseDocx } from '@/lib/user-corpus/parse-docx';
import { MAX_DECOMPRESSED_BYTES } from '@/lib/user-corpus/sniff';
import { UploadRefused } from '@/lib/user-corpus/types';

interface Entry {
  name: string;
  data: Buffer;
  /** Declared uncompressed size. Defaults to the truth; set it to lie, as a bomb does. */
  declaredSize?: number;
  /**
   * Write bytes that are not a valid deflate stream, keeping the headers well-formed.
   *
   * Flipping a couple of bytes inside a real stream is not enough: deflate tolerates plenty of
   * corruption and inflates to something, so a test built that way passes for the wrong reason
   * (it asserts a refusal that never happened, and only notices because `code` is undefined).
   */
  corruptStream?: boolean;
}

/** Minimal but genuine zip writer: local headers, central directory, EOCD. */
function makeZip(entries: Entry[]): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const compressed = e.corruptStream
      ? Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])
      : deflateRawSync(e.data);
    const uncompressedSize = e.declaredSize ?? e.data.length;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(8, 8); // method: deflate
    lh.writeUInt32LE(0, 14); // crc32 — this reader does not verify it
    lh.writeUInt32LE(compressed.length, 18);
    lh.writeUInt32LE(uncompressedSize, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    locals.push(lh, nameBuf, compressed);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(0, 16);
    cd.writeUInt32LE(compressed.length, 20);
    cd.writeUInt32LE(uncompressedSize, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    centrals.push(cd, nameBuf);

    offset += lh.length + nameBuf.length + compressed.length;
  }

  const cdBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return new Uint8Array(Buffer.concat([Buffer.concat(locals), cdBuf, eocd]));
}

const docx = (xml: string, extra: Entry[] = []): Uint8Array =>
  makeZip([{ name: 'word/document.xml', data: Buffer.from(xml, 'utf8') }, ...extra]);

const para = (...runs: string[]): string => `<w:p>${runs.map((r) => `<w:t>${r}</w:t>`).join('')}</w:p>`;

describe('parseDocx extracts prose from WordprocessingML', () => {
  it('reads text out of w:t runs', () => {
    const text = parseDocx(docx(`<w:document><w:body>${para('Doth the plowman plow')}</w:body></w:document>`));
    expect(text).toBe('Doth the plowman plow');
  });

  it('keeps paragraphs apart', () => {
    // SEED: stop translating </w:p> to a newline -> RED, and two paragraphs fuse into one line.
    // That matters beyond tidiness: step 3 shingles 6-grams, and a fused paragraph boundary
    // manufactures a 6-gram that appears in no translation and in no sermon.
    const text = parseDocx(
      docx(`<w:document><w:body>${para('First thought.')}${para('Second thought.')}</w:body></w:document>`),
    );
    expect(text.split('\n').filter(Boolean)).toEqual(['First thought.', 'Second thought.']);
  });

  it('joins runs inside one paragraph without inserting spaces', () => {
    // Word splits a sentence into runs at every formatting change, mid-word included. SEED: join
    // runs with ' ' -> RED, and "predestination" arrives as "pre destin ation".
    const text = parseDocx(docx(`<w:document><w:body>${para('pre', 'destin', 'ation')}</w:body></w:document>`));
    expect(text).toBe('predestination');
  });

  it('turns tabs and breaks into whitespace so words do not fuse', () => {
    const xml = '<w:document><w:body><w:p><w:t>alpha</w:t><w:tab/><w:t>beta</w:t><w:br/><w:t>gamma</w:t></w:p></w:body></w:document>';
    const text = parseDocx(docx(xml));
    expect(text).toMatch(/alpha\s+beta\s+gamma/);
  });

  it('decodes entities, and does not double-decode &amp;lt;', () => {
    // SEED: run the &amp; replacement first -> RED, "&amp;lt;" becomes "<" and the document
    // acquires markup it never had.
    const text = parseDocx(docx(`<w:document><w:body>${para('Jacob &amp; Esau &amp;lt;tag&amp;gt; &quot;quoted&quot;')}</w:body></w:document>`));
    expect(text).toBe('Jacob & Esau &lt;tag&gt; "quoted"');
  });

  it('ignores styling and revision marks', () => {
    const xml =
      '<w:document><w:body><w:p><w:pPr><w:jc w:val="center"/></w:pPr>' +
      '<w:r><w:rPr><w:b/></w:rPr><w:t>Grace</w:t></w:r>' +
      '<w:bookmarkStart w:id="1" w:name="x"/><w:t xml:space="preserve"> abounds</w:t></w:p></w:body></w:document>';
    expect(parseDocx(docx(xml))).toBe('Grace abounds');
  });
});

describe('parseDocx refuses what it cannot honestly read', () => {
  it('refuses a zip with no word/document.xml as unsupported, not corrupt', () => {
    // sniffType returns 'docx' for EVERY zip on purpose; this is the one place that knows what a
    // docx actually is. An .xlsx must not be reported as a damaged Word file.
    const xlsx = makeZip([{ name: 'xl/workbook.xml', data: Buffer.from('<workbook/>', 'utf8') }]);
    let code: string | undefined;
    try {
      parseDocx(xlsx);
    } catch (e) {
      code = (e as UploadRefused).code;
    }
    expect(code).toBe('unsupported_type');
  });

  it('refuses a file with no zip directory', () => {
    expect(() => parseDocx(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toThrow(UploadRefused);
  });

  it('refuses a bomb that DECLARES its huge size', () => {
    const bomb = docx('<w:document/>');
    // Rebuild with an honest-but-enormous declaration.
    const declared = makeZip([
      { name: 'word/document.xml', data: Buffer.from('<w:document/>', 'utf8'), declaredSize: MAX_DECOMPRESSED_BYTES + 1 },
    ]);
    expect(bomb.length).toBeGreaterThan(0);
    let code: string | undefined;
    try {
      parseDocx(declared);
    } catch (e) {
      code = (e as UploadRefused).code;
    }
    expect(code).toBe('too_large_decompressed');
  });

  it('refuses a bomb that LIES about its size — the case the declaration cannot catch', () => {
    // This is the assertion that justifies hand-rolling the reader. The header says 100 bytes;
    // the stream inflates to 81 MB. Only an inflate that aborts mid-stream can refuse this, which
    // is exactly what a library that returns the finished buffer cannot do.
    // SEED: drop `maxOutputLength` from inflateRawSync -> RED (and the process allocates 81 MB
    // on demand from a ~80 KB upload).
    const huge = Buffer.alloc(MAX_DECOMPRESSED_BYTES + 1024 * 1024, 0);
    const lying = makeZip([{ name: 'word/document.xml', data: huge, declaredSize: 100 }]);
    let code: string | undefined;
    try {
      parseDocx(lying);
    } catch (e) {
      code = (e as UploadRefused).code;
    }
    expect(code).toBe('too_large_decompressed');
  }, 30_000);

  it('keeps a defended bomb distinguishable from a broken file', () => {
    // §9 needs parse-failure rate BY TYPE to be meaningful; merging an attack into 'corrupt'
    // would hide it in the noise of ordinary bad files.
    const broken = makeZip([
      { name: 'word/document.xml', data: Buffer.from('irrelevant', 'utf8'), corruptStream: true },
    ]);
    let code: string | undefined;
    try {
      parseDocx(broken);
    } catch (e) {
      code = (e as UploadRefused).code;
    }
    expect(code).toBe('corrupt');
  });
});
