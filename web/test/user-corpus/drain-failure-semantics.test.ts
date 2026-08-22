// The two failure-semantics defects filed in docs/pm/orders/2026-08-22-drain-failure-semantics.md.
//
// 1. A PERMANENT configuration error was retried as if transient. `processOne`'s catch parked
//    anything that was not an UploadRefused back at 'queued', so `EmbeddingUnavailable(
//    'DEEPINFRA_API_KEY is not set')` — which can never succeed on retry — sat in a state
//    indistinguishable from "waiting its turn" until MAX_ATTEMPTS retired it. A deployment
//    missing that key parks EVERY upload silently while queueStats reports a healthy depth.
//
// 2. `drain()` reported work it did not do. `processed++` ran after ANY outcome, so
//    `{processed: 1, outcomes: {queued: 1}}` — "attempted once, got nowhere" — read as progress
//    to every caller that asserted or logged `processed` alone.
//
// Idiom follows pipeline-to-ready.test.ts: `getUserDocument` is substituted to serve bytes from
// memory; chunking, anchoring and the status writes are real. No DeepInfra call is ever made —
// the first test deletes the key to force the configuration error, the second never reaches the
// embed stage — so this suite does not need DEEPINFRA_API_KEY and must never spend one here.

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

const { runAsUser } = await import('@/lib/db');
const { createDocument, getDocument } = await import('@/lib/user-corpus/documents');
const { drain } = await import('@/lib/user-corpus/queue');
const { checksum } = await import('@/lib/user-corpus/sniff');
const { runtimeDbUrl } = await import('../helpers/env');
const { existsSync } = await import('node:fs');
const path = (await import('node:path')).default;

const APP_URL = runtimeDbUrl();
// The anchor stage scans web/public/bible (gitignored): without it the drain requeues on an
// ENOENT and this suite would red on a missing artifact rather than on the semantics under test.
const HAVE_BIBLE = existsSync(path.resolve(__dirname, '../../public/bible/kjv'));

const SKIP = announceSkip(
  'drain failure semantics',
  [
    { name: 'APP_DATABASE_URL', present: Boolean(APP_URL) },
    { name: 'web/public/bible/kjv (gitignored corpus asset)', present: HAVE_BIBLE, kind: 'artifact' as const },
  ],
  'that a permanent config error fails a document instead of being retried, ' +
    'and that drain() never reports unprocessed work as processed',
);

const RUN = `drainsem-${Date.now().toString(36)}`;
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

// Enough prose to parse and chunk; the anchor stage runs for real against the KJV index.
const SERMON = [
  'THE GOOD SHEPHERD',
  'The LORD is my shepherd; I shall not want. He maketh me to lie down in green pastures: he leadeth me beside the still waters.',
  'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.',
];

async function cleanup() {
  await runAsUser(USER, (sql) => [sql`DELETE FROM user_documents WHERE user_id = ${USER}`]).catch(() => undefined);
}

describe.skipIf(SKIP)('drain failure semantics', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it('a missing DEEPINFRA_API_KEY fails the document PERMANENTLY — it is not parked back at queued', async () => {
    // Defect 1 of the filed order. The observed behaviour (blank key, real run): status=queued
    // attempts=1 parseError="DEEPINFRA_API_KEY is not set" — a document that can never succeed
    // wearing the costume of one waiting its turn. SEED: remove the permanent-error branch from
    // processOne's catch -> RED, the document is 'queued' and outcomes carries {queued: 1}.
    await cleanup();
    const bytes = docx(SERMON);
    const doc = await createDocument(USER, {
      title: 'no key', filename: 'nokey.docx', byteSize: bytes.byteLength,
      checksum: await checksum(bytes), mimeType: 'docx',
    });
    const pathname = `user-corpus/${USER}/${doc.id}`;
    BYTES.set(pathname, bytes);
    await runAsUser(USER, (sql) => [
      sql`UPDATE user_documents SET blob_url = ${pathname} WHERE user_id = ${USER} AND id = ${doc.id}`,
    ]);

    // The embedder reads process.env at call time; delete the key for exactly this drain.
    const savedKey = process.env.DEEPINFRA_API_KEY;
    delete process.env.DEEPINFRA_API_KEY;
    let result;
    try {
      result = await drain(USER, 1);
    } finally {
      if (savedKey !== undefined) process.env.DEEPINFRA_API_KEY = savedKey;
    }

    const after = await getDocument(USER, doc.id);
    expect(after?.status).toBe('failed');
    expect(after?.parseError).toContain('DEEPINFRA_API_KEY');
    expect(result.outcomes.failed ?? 0).toBe(1);
    // A permanent failure is not progress, and must not wait for MAX_ATTEMPTS to say so.
    expect(result.completed).toBe(0);
  }, 60_000);

  it('a drain that gets nowhere reports attempted, not completed', async () => {
    // Defect 2 of the filed order. The blob fetch throws (a transient shape: the bytes are not
    // in the store), so the document is parked back at 'queued' to be retried. The old
    // `processed` counter still read 1 — "attempted once, got nowhere" asserted as progress.
    // SEED: count every outcome as completed (the old unconditional processed++) -> RED,
    // completed reads 1 for a document that went nowhere.
    await cleanup();
    const doc = await createDocument(USER, {
      title: 'transient', filename: 'transient.docx', byteSize: 100,
      checksum: `${RUN}-transient`, mimeType: 'docx',
    });
    await runAsUser(USER, (sql) => [
      sql`UPDATE user_documents SET blob_url = ${`user-corpus/${USER}/never-stored`}
          WHERE user_id = ${USER} AND id = ${doc.id}`,
    ]);

    const result = await drain(USER, 1);

    expect(result.attempted).toBe(1);
    expect(result.completed).toBe(0);
    expect(result.outcomes.queued ?? 0).toBe(1);
    const after = await getDocument(USER, doc.id);
    expect(after?.status).toBe('queued');
  }, 60_000);
});
