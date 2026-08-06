// The pipeline end to end over REAL files: sniff -> checksum -> row -> claim -> parse -> verdict
// -> status, against the real database.
//
// WHAT IS SUBSTITUTED, AND WHY THAT IS NOT CHEATING. Only `getUserDocument` is replaced, and only
// to hand back bytes from disk instead of over the network. Everything the slice actually builds
// runs for real: the sniffer, the docx reader, pdfjs, the verdict, the queue's claim/status
// machinery, and Postgres under RLS as app_runtime.
//
// What this therefore does NOT prove, stated plainly rather than left to be assumed: that
// @vercel/blob's put/get/del work as written against a live store. That needs
// BLOB_READ_WRITE_TOKEN and a provisioned Blob store, and no amount of local testing can stand in
// for it. This narrows the unproven surface to that one network hop; it does not close it.
//
//   REALFILE_DOCX_DIR=… REALFILE_PDF_DIR=… REALFILE_SCAN_DIR=… npx vitest run …

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/** documentId -> file on disk, populated per test before the drain runs. */
const BYTES = new Map<string, Uint8Array>();

vi.mock('@/lib/user-corpus/blob', () => ({
  getUserDocument: async (pathname: string) => {
    const b = BYTES.get(pathname);
    if (!b) throw new Error(`no test bytes registered for ${pathname}`);
    return b;
  },
  putUserDocument: async () => 'unused-in-this-suite',
  deleteUserDocument: async () => undefined,
  blobPathname: (u: string, d: string) => `user-corpus/${u}/${d}`,
}));

const { runAsUser } = await import('@/lib/db');
const { createDocument, getDocument } = await import('@/lib/user-corpus/documents');
const { drain } = await import('@/lib/user-corpus/queue');
const { sniffType, checksum } = await import('@/lib/user-corpus/sniff');
const { runtimeDbUrl } = await import('../helpers/env');

const APP_URL = runtimeDbUrl();
const DOCX_DIR = process.env.REALFILE_DOCX_DIR;
const PDF_DIR = process.env.REALFILE_PDF_DIR;
const SCAN_DIR = process.env.REALFILE_SCAN_DIR;
const enabled = Boolean(APP_URL && DOCX_DIR && PDF_DIR && SCAN_DIR);

if (!enabled) {
  console.warn(
    '⚠ SKIPPED (visibly): real-file end-to-end needs APP_DATABASE_URL plus REALFILE_DOCX_DIR / ' +
      'REALFILE_PDF_DIR / REALFILE_SCAN_DIR.',
  );
}

const RUN = `realfile-${Date.now().toString(36)}`;
const USER = `${RUN}-user`;

function pick(dir: string, ext: string, n: number): string[] {
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(ext) && !f.startsWith('~$'))
    .slice(0, n)
    .map((f) => path.join(dir, f));
}

/** Push a real file all the way through the pipeline and return its final row. */
async function ingest(file: string) {
  const bytes = new Uint8Array(readFileSync(file));
  // The real sniffer and the real checksum, on the real bytes.
  const type = sniffType(bytes, path.basename(file));
  const sum = await checksum(bytes);
  const doc = await createDocument(USER, {
    title: 'real file',            // never the real filename: these are the operator's documents
    filename: `upload.${type}`,
    byteSize: bytes.byteLength,
    checksum: sum,
    mimeType: type,
  });
  const pathname = `user-corpus/${USER}/${doc.id}`;
  BYTES.set(pathname, bytes);
  await runAsUser(USER, (sql) => [
    sql`UPDATE user_documents SET blob_url = ${pathname} WHERE user_id = ${USER} AND id = ${doc.id}`,
  ]);
  await drain(USER, 1);
  return { doc: await getDocument(USER, doc.id), type };
}

async function cleanup() {
  await runAsUser(USER, (sql) => [sql`DELETE FROM user_documents WHERE user_id = ${USER}`]).catch(() => undefined);
  BYTES.clear();
}

describe.skipIf(!enabled)('real files, end to end, against the real database', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it('ingests real .docx files and advances them to chunking, never ready', async () => {
    const files = pick(DOCX_DIR!, '.docx', 6);
    expect(files.length, 'precondition: need real .docx files').toBeGreaterThan(2);

    const outcomes: Record<string, number> = {};
    let charsTotal = 0;
    for (const f of files) {
      const { doc, type } = await ingest(f);
      expect(type).toBe('docx'); // sniffed from the zip magic, not the extension
      // 'ready' means indexed and searchable. Nothing is indexed yet, and a pipeline that said
      // otherwise here is exactly what step 2 exists to rule out.
      expect(doc?.status).not.toBe('ready');
      outcomes[doc?.status ?? 'missing'] = (outcomes[doc?.status ?? 'missing'] ?? 0) + 1;
      if (doc?.status === 'chunking') {
        expect(doc.extractableChars ?? 0).toBeGreaterThan(0);
        charsTotal += doc.extractableChars ?? 0;
      }
      await cleanup();
    }
    const advanced = outcomes.chunking ?? 0;
    // Reported, not just asserted: "more than one advanced" would pass with four silent failures
    // behind it, and a committed log that cannot show the split is not evidence of much.
    console.log(`\nDOCX n=${files.length} outcomes=${JSON.stringify(outcomes)} extracted=${charsTotal} chars\n`);
    expect(advanced, `most real Word documents must parse; got ${JSON.stringify(outcomes)}`)
      .toBeGreaterThanOrEqual(Math.ceil(files.length * 0.8));
  }, 120_000);

  it('ingests real text-layer PDFs and advances them to chunking', async () => {
    const files = pick(PDF_DIR!, '.pdf', 6);
    expect(files.length).toBeGreaterThan(2);

    const outcomes: Record<string, number> = {};
    let pagesTotal = 0;
    for (const f of files) {
      const { doc, type } = await ingest(f);
      expect(type).toBe('pdf');
      expect(doc?.status).not.toBe('ready');
      outcomes[doc?.status ?? 'missing'] = (outcomes[doc?.status ?? 'missing'] ?? 0) + 1;
      if (doc?.status === 'chunking') {
        // The evidence for the verdict is recorded, not just the verdict.
        expect(doc.pageCount ?? 0).toBeGreaterThan(0);
        expect(doc.extractableChars ?? 0).toBeGreaterThan(0);
        pagesTotal += doc.pageCount ?? 0;
      }
      await cleanup();
    }
    console.log(`\nPDF n=${files.length} outcomes=${JSON.stringify(outcomes)} pages=${pagesTotal}\n`);
    expect(outcomes.chunking ?? 0, `most real PDFs must parse; got ${JSON.stringify(outcomes)}`)
      .toBeGreaterThanOrEqual(Math.ceil(files.length * 0.8));
  }, 120_000);

  it('REFUSES real scans with needs OCR, and records the evidence for that verdict', async () => {
    // The headline requirement, proven through the database rather than at the function boundary.
    const files = pick(SCAN_DIR!, '.pdf', 5);
    expect(files.length).toBeGreaterThan(2);

    for (const f of files) {
      const { doc } = await ingest(f);
      expect(doc?.status).toBe('failed');
      expect(doc?.parseError).toMatch(/OCR/i);
      // page_count and extractable_chars are written BEFORE the judgement, so 'needs OCR' is a
      // checkable claim afterwards rather than an assertion.
      expect(doc?.pageCount ?? 0).toBeGreaterThan(0);
      expect(doc?.extractableChars).toBe(0);
      await cleanup();
    }
  }, 120_000);

  it('dedupes a re-upload of the identical file by checksum', async () => {
    // §8: "they keep Rom8-FINAL-v2-USETHIS.docx".
    await cleanup();
    const file = pick(DOCX_DIR!, '.docx', 1)[0]!;
    const bytes = new Uint8Array(readFileSync(file));
    const sum = await checksum(bytes);
    await createDocument(USER, { title: 'a', filename: 'a.docx', byteSize: bytes.byteLength, checksum: sum, mimeType: 'docx' });
    // The partial unique index on (user_id, checksum) is the backstop behind the route's explicit
    // pre-check; this asserts the database itself refuses, not merely that the route remembers to.
    await expect(
      createDocument(USER, { title: 'b', filename: 'b.docx', byteSize: bytes.byteLength, checksum: sum, mimeType: 'docx' }),
    ).rejects.toThrow();
    await cleanup();
  }, 60_000);
});
