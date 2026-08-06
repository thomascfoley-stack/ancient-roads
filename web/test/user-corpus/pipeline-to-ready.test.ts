// THE END-TO-END PROOF: a document goes in and comes out searchable.
//
// Everything before this suite tested a stage in isolation. This is the one that says the stages
// are connected — upload bytes → parse → chunk → anchor → embed → store → `ready`, with rows in all
// three tables and a model_slug the corpus will actually join against.
//
// Only `getUserDocument` is substituted, to serve bytes from memory rather than the network; the
// blob round-trip is proven separately against the live store. Chunking, anchoring, the KJV index,
// the DeepInfra call and the transactional write are all real.

import { Buffer } from 'node:buffer';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

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
const { EMBEDDING_DB_SLUG, isJoinable } = await import('@/lib/user-corpus/model');
const { localEnv, runtimeDbUrl } = await import('../helpers/env');
const { existsSync } = await import('node:fs');
const path = (await import('node:path')).default;

// The embedder reads process.env directly.
const KEY = localEnv('DEEPINFRA_API_KEY');
if (KEY && !process.env.DEEPINFRA_API_KEY) process.env.DEEPINFRA_API_KEY = KEY;

const APP_URL = runtimeDbUrl();
const HAVE_BIBLE = existsSync(path.resolve(__dirname, '../../public/bible/kjv'));
const enabled = Boolean(APP_URL && KEY && HAVE_BIBLE);
if (!enabled) {
  console.warn(
    '⚠ SKIPPED (visibly): pipeline-to-ready needs APP_DATABASE_URL, DEEPINFRA_API_KEY and ' +
      'public/bible/kjv. The end-to-end claim is UNPROVEN when this does not run.',
  );
}

const RUN = `e2e-${Date.now().toString(36)}`;
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

// A short sermon that BOTH cites and quotes, so both anchor channels have something to find.
const SERMON = [
  'THE GOOD SHEPHERD',
  'Our text this morning is Romans 8:28, and I would have you consider it with me at length, for it is the ground of all our comfort in affliction and in the long watches of the night.',
  'And we know that all things work together for good to them that love God, to them who are the called according to his purpose. That is the promise, and it is not a small one.',
  'Hear also what the Lord himself declared: For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.',
  'The LORD is my shepherd; I shall not want. He maketh me to lie down in green pastures: he leadeth me beside the still waters. Beloved, is that not enough for any soul?',
  'Let us then take heart, and go forward in the strength of these words, until the day break and the shadows flee away.',
];

async function cleanup() {
  await runAsUser(USER, (sql) => [sql`DELETE FROM user_documents WHERE user_id = ${USER}`]).catch(() => undefined);
}

async function counts(): Promise<{ sections: number; embeddings: number; anchors: number }> {
  const [rows] = await runAsUser(USER, (sql) => [
    sql`SELECT
          (SELECT count(*)::int FROM user_sections WHERE user_id = ${USER}) AS sections,
          (SELECT count(*)::int FROM user_section_embeddings WHERE user_id = ${USER}) AS embeddings,
          (SELECT count(*)::int FROM user_section_anchors WHERE user_id = ${USER}) AS anchors`,
  ]);
  return (rows as { sections: number; embeddings: number; anchors: number }[])[0]!;
}

describe.skipIf(!enabled)('a document goes in and comes out searchable', () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it('reaches ready, with sections, vectors and anchors all written', async () => {
    const bytes = docx(SERMON);
    const doc = await createDocument(USER, {
      title: 'The Good Shepherd', filename: 'sermon.docx', byteSize: bytes.byteLength,
      checksum: await checksum(bytes), mimeType: 'docx',
    });
    const pathname = `user-corpus/${USER}/${doc.id}`;
    BYTES.set(pathname, bytes);
    await runAsUser(USER, (sql) => [
      sql`UPDATE user_documents SET blob_url = ${pathname} WHERE user_id = ${USER} AND id = ${doc.id}`,
    ]);

    const result = await drain(USER, 1);
    expect(result.processed).toBe(1);

    const after = await getDocument(USER, doc.id);
    // THE ASSERTION THIS WHOLE SLICE HAS BEEN WORKING TOWARD.
    expect(after?.status, `parse_error: ${after?.parseError}`).toBe('ready');

    const c = await counts();
    expect(c.sections).toBeGreaterThan(0);
    // Every section must carry a vector. A section without one is searchable by FTS and invisible
    // to semantic search — half-indexed, and reporting ready.
    expect(c.embeddings).toBe(c.sections);
    // And the anchoring found something: this sermon cites Romans 8:28 and quotes three passages.
    expect(c.anchors).toBeGreaterThan(0);
  }, 180_000);

  it('wrote a model_slug the CORPUS will actually join against', async () => {
    // Parity checked against the corpus's own recorded value, read from the database — not against
    // our constant, which would be the tautology ADR-102 exists to prevent.
    const [rows] = await runAsUser(USER, (sql) => [
      sql`SELECT DISTINCT e.model_slug AS user_slug,
                 (SELECT metadata->>'model' FROM embeddings WHERE user_id IS NULL LIMIT 1) AS corpus_model
            FROM user_section_embeddings e WHERE e.user_id = ${USER}`,
    ]);
    const r = (rows as { user_slug: string; corpus_model: string }[])[0];
    expect(r, 'no user embeddings were written').toBeTruthy();
    expect(r!.user_slug).toBe(EMBEDDING_DB_SLUG);
    // The corpus plane the tradition-gap join reads records the QUALIFIED form; ours records the
    // short one. isJoinable normalises, so they are the same model — which is the point.
    expect(r!.corpus_model).toBe('BAAI/bge-large-en-v1.5');
    expect(isJoinable(r!.user_slug, r!.corpus_model)).toBe(true);
  }, 60_000);

  it('found BOTH anchor channels, and their agreement survives', async () => {
    // The sermon cites Romans 8:28 explicitly AND quotes it verbatim, which is exactly the pair
    // migration 103 put `channel` in the primary key to preserve.
    const [rows] = await runAsUser(USER, (sql) => [
      sql`SELECT channel, count(*)::int AS n FROM user_section_anchors
           WHERE user_id = ${USER} GROUP BY channel ORDER BY channel`,
    ]);
    const byChannel = Object.fromEntries((rows as { channel: string; n: number }[]).map((x) => [x.channel, x.n]));
    expect(byChannel.uncited ?? 0).toBeGreaterThan(0);
    expect(byChannel.explicit ?? 0).toBeGreaterThan(0);

    const [pair] = await runAsUser(USER, (sql) => [
      sql`SELECT verse_id_start, count(DISTINCT channel)::int AS channels
            FROM user_section_anchors WHERE user_id = ${USER}
           GROUP BY verse_id_start HAVING count(DISTINCT channel) > 1`,
    ]);
    expect((pair as unknown[]).length, 'no verse was found by both channels').toBeGreaterThan(0);
  }, 60_000);

  it('re-indexing is idempotent — a retry replaces rather than duplicates', async () => {
    const before = await counts();
    const [docs] = await runAsUser(USER, (sql) => [
      sql`SELECT id FROM user_documents WHERE user_id = ${USER} LIMIT 1`,
    ]);
    const id = (docs as { id: string }[])[0]!.id;
    await runAsUser(USER, (sql) => [
      sql`UPDATE user_documents SET status = 'queued', attempts = 0, claimed_at = NULL
           WHERE user_id = ${USER} AND id = ${id}`,
    ]);
    await drain(USER, 1);
    const after = await counts();
    // SEED: drop the DELETE from storeSections -> RED, every retry doubles the index.
    expect(after).toEqual(before);
    expect((await getDocument(USER, id))?.status).toBe('ready');
  }, 180_000);
});
