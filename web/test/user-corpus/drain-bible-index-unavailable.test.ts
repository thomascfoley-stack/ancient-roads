// The interim guard: a missing-bible condition (`BibleIndexUnavailable`) fails the document
// PERMANENTLY on the first attempt, instead of retrying it MAX_ATTEMPTS times and retiring it
// with "Gave up after 3 attempts. The last error was: ENOENT: …".
//
// The root-cause fix (bible-index over HTTP) means the index builds and this branch is not taken
// in a healthy deploy. The guard exists for the broken-deploy case — CORPUS_CDN_BASE unset, the
// Blob store 5xx-ing — where no document can succeed and retrying only wastes cycles and buries
// the cause. Modeled on drain-failure-semantics.test.ts (the permanent-EmbeddingUnavailable
// leg): getUserDocument is substituted to serve bytes from memory; parsing, chunking and the
// status writes are real. The bible-index module is mocked to throw BibleIndexUnavailable, so
// neither HAVE_BIBLE nor DEEPINFRA_API_KEY is needed (the drain never reaches the embed stage).

import { Buffer } from 'node:buffer';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { announceSkip } from '../helpers/loud-skip';

const BYTES = new Map<string, Uint8Array>();
vi.mock('@/lib/user-corpus/blob', () => ({
  getUserDocument: async (p: string) => {
    const b = BYTES.get(p);
    if (!b) throw new Error(`no test bytes for ${p}`);
    return b;
  },
  putUserDocument: async () => 'unused',
  deleteUserDocument: async () => undefined,
  blobPathname: (u: string, d: string) => `user-corpus/${u}/${d}`,
}));

// bible-index is mocked to throw the typed missing-bible error. The mock's BibleIndexUnavailable
// is the SAME class queue.ts imports, so processOne's `e instanceof BibleIndexUnavailable` is true
// and the permanent-failure branch fires — which is the behaviour under test.
vi.mock('@/lib/user-corpus/bible-index', () => {
  class BibleIndexUnavailable extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'BibleIndexUnavailable';
    }
  }
  const fail = () =>
    Promise.reject(
      new BibleIndexUnavailable(
        'bible index for kjv not found at /public/bible/kjv — the uncited-quote channel cannot run.',
      ),
    );
  return {
    BibleIndexUnavailable,
    detectDocumentTranslation: vi.fn(() => fail()),
    getAnchorIndexFor: vi.fn(() => fail()),
    getAnchorIndex: vi.fn(() => fail()),
    availableTranslations: vi.fn(() => Promise.resolve([])),
    ANCHOR_TRANSLATION: 'kjv',
    ANCHOR_NGRAM: 6,
  };
});

const { runAsUser } = await import('@/lib/db');
const { createDocument, getDocument } = await import('@/lib/user-corpus/documents');
const { drain, MAX_ATTEMPTS } = await import('@/lib/user-corpus/queue');
const { checksum } = await import('@/lib/user-corpus/sniff');
const { runtimeDbUrl } = await import('../helpers/env');

const APP_URL = runtimeDbUrl();

const SKIP = announceSkip(
  'drain BibleIndexUnavailable permanent-failure guard',
  [{ name: 'APP_DATABASE_URL', present: Boolean(APP_URL) }],
  'that a missing-bible condition fails a document immediately rather than retrying it MAX_ATTEMPTS times',
);

const RUN = `drainbib-${Date.now().toString(36)}`;
const USER = `${RUN}-user`;

/** A minimal, valid .docx (stored entry) containing the given paragraphs. */
function docx(paragraphs: string[]): Uint8Array {
  const xml = Buffer.from(
    `<w:document><w:body>${paragraphs.map((p) => `<w:p><w:t>${p}</w:t></w:p>`).join('')}</w:body></w:document>`,
    'utf8',
  );
  const name = Buffer.from('word/document.xml', 'utf8');
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 8);
  lh.writeUInt32LE(xml.length, 18); lh.writeUInt32LE(xml.length, 22); lh.writeUInt16LE(name.length, 26);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0, 10);
  cd.writeUInt32LE(xml.length, 20); cd.writeUInt32LE(xml.length, 24); cd.writeUInt16LE(name.length, 28);
  cd.writeUInt32LE(0, 42);
  const local = Buffer.concat([lh, name, xml]);
  const central = Buffer.concat([cd, name]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12); eocd.writeUInt32LE(local.length, 16);
  return new Uint8Array(Buffer.concat([local, central, eocd]));
}

const SERMON = [
  'THE GOOD SHEPHERD',
  'The LORD is my shepherd; I shall not want. He maketh me to lie down in green pastures: he leadeth me beside the still waters.',
  'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.',
];

async function cleanup() {
  await runAsUser(USER, (sql) => [sql`DELETE FROM user_documents WHERE user_id = ${USER}`]).catch(() => undefined);
}

describe.skipIf(SKIP)('drain BibleIndexUnavailable permanent-failure guard', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it('fails the document PERMANENTLY on the first attempt, with a clear reason — not 3 retries', async () => {
    // SEED (regression): make the catch treat BibleIndexUnavailable as transient (park at 'queued')
    // -> RED: attempts climbs to MAX_ATTEMPTS and parseError is "Gave up after 3 attempts. … ENOENT",
    // the exact production symptom. The fix keeps it terminal at attempt 1.
    await cleanup();
    const bytes = docx(SERMON);
    const doc = await createDocument(USER, {
      title: 'no bible', filename: 'nobible.docx', byteSize: bytes.byteLength,
      checksum: await checksum(bytes), mimeType: 'docx',
    });
    const pathname = `user-corpus/${USER}/${doc.id}`;
    BYTES.set(pathname, bytes);
    await runAsUser(USER, (sql) => [
      sql`UPDATE user_documents SET blob_url = ${pathname} WHERE user_id = ${USER} AND id = ${doc.id}`,
    ]);

    const result = await drain(USER, 1);

    const after = await getDocument(USER, doc.id);
    expect(after?.status).toBe('failed');
    expect(after?.attempts, 'a permanent failure must not burn the full retry budget').toBe(1);
    expect(after?.attempts).toBeLessThan(MAX_ATTEMPTS);
    // The reason is the typed missing-bible message — actionable — NOT the retry-exhaustion boilerplate.
    expect(after?.parseError).not.toMatch(/Gave up after/);
    expect(after?.parseError).toContain('bible index');
    expect(result.outcomes.failed ?? 0).toBe(1);
    expect(result.completed).toBe(0);
  }, 60_000);

  it('a permanently-failed document is terminal — a second drain does not re-claim it', async () => {
    // The mirror of the retry path: a permanent failure is NOT parked back at 'queued', so the
    // claim predicate (status IN queued/parsing/chunking/embedding) cannot see it again.
    await cleanup();
    const bytes = docx(SERMON);
    const doc = await createDocument(USER, {
      title: 'no bible 2', filename: 'nobible2.docx', byteSize: bytes.byteLength,
      checksum: await checksum(bytes), mimeType: 'docx',
    });
    const pathname = `user-corpus/${USER}/${doc.id}`;
    BYTES.set(pathname, bytes);
    await runAsUser(USER, (sql) => [
      sql`UPDATE user_documents SET blob_url = ${pathname} WHERE user_id = ${USER} AND id = ${doc.id}`,
    ]);

    await drain(USER, 1);
    const second = await drain(USER, 1);
    expect(second.attempted).toBe(0);
    const after = await getDocument(USER, doc.id);
    expect(after?.status).toBe('failed');
    expect(after?.attempts).toBe(1);
  }, 60_000);
});
