// Slice 4 two-account RLS proof for the /ask user-voices lane: user A's lane retrieval must
// NEVER return user B's sections. Driven through the REAL lane (retrieveUserVoices →
// semanticSearch → runAsUser), not a raw SELECT — the same discipline as the two-account leg
// in user-corpus/search.test.ts.
//
// RED-PROOF (§2.2, verdict condition 2). Under migration 122's FORCE RLS + the NOBYPASSRLS
// runtime shape, removing the explicit user_id predicate alone CANNOT go red (RLS still
// binds), so the red leg weakens BOTH bindings at the wiring level: the lane is fed the
// WRONG user (B's id on what should be A's retrieval — the miswire defect this suite exists
// to catch), the "only A's rows" assertion goes red, then the correct call is restored to
// green. The FORCE-RLS binding's own red is already watched and logged (table owner without
// the GUC sees all rows BEFORE, policy-bound AFTER):
// docs/evidence/uploader-deep-dive-2026-08-20/migration-12x-redproof.log — reused, not
// rebuilt. Transcripts: docs/evidence/swarm-2026-08-22/w-slice4/rls-redproof.log.

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
const { embedChunks } = await import('@/lib/user-corpus/embed');
const { retrieveUserVoices, USER_VOICE_K } = await import('@/lib/teacher/user-voices');
const { localEnv, runtimeDbUrl } = await import('./helpers/env');
const { existsSync } = await import('node:fs');
const path = (await import('node:path')).default;

const KEY = localEnv('DEEPINFRA_API_KEY');
if (KEY && !process.env.DEEPINFRA_API_KEY) process.env.DEEPINFRA_API_KEY = KEY;
const HAVE_KJV = existsSync(path.resolve(__dirname, '../public/bible/kjv'));
const enabled = Boolean(runtimeDbUrl() && KEY && HAVE_KJV);
const { announceSkip } = await import('./helpers/loud-skip');
announceSkip(
  'the /ask user-voices lane two-account RLS proof',
  [
    { name: 'APP_DATABASE_URL', present: Boolean(runtimeDbUrl()) },
    { name: 'DEEPINFRA_API_KEY', present: Boolean(KEY) },
    { name: 'web/public/bible/kjv (gitignored corpus asset)', present: HAVE_KJV, kind: 'artifact' as const },
  ],
  'user A never sees user B in /ask user-voice retrieval',
);

const RUN = `slice4-${Date.now().toString(36)}`;
const USER_A = `${RUN}-A`;
const USER_B = `${RUN}-B`;

// Both fixtures are ON THE SAME TOPIC (comfort in affliction) so that, absent tenancy, B's
// rows would rank highly in A's retrieval — a fixture where B's text is topically remote
// could pass the "only A" assertion without tenancy doing any work (the discrimination
// precondition below).
const A_PARAS = [
  'COMFORT IN AFFLICTION',
  'Our text is Romans 8:28, and I would have you weigh it with me, for it is the ground of every comfort we possess in the hour of affliction.',
  'And we know that all things work together for good to them that love God, to them who are the called according to his purpose. There is the promise entire.',
  'Consider the whole argument of Romans 8, from the first verse to the last, and see whether the apostle ever permits the believer to imagine himself abandoned by providence.',
  'I have known men who could recite the promise and yet could not rest in it, and others, far less able to argue, who laid their whole weight upon it and were not ashamed.',
  'The promise is often refused not because it is doubted but because it is too plain to be believed by a mind in torment, and so the afflicted reach past the nearest comfort.',
  'Observe that the apostle does not say all things ARE good, which any mourner could refute, but that they work TOGETHER for good, a claim about the end of the weaving.',
  'And so we return to the text itself, and to the God who stands behind it, who has never yet been found unfaithful by anyone who trusted him long enough to find out.',
];
const B_PARAS = [
  'THE AFFLICTED COMFORTED',
  'Our text likewise is Romans 8:28, that all things work together for good to them that love God, and we take it as the sheet anchor of the afflicted soul.',
  'There is no promise in the whole of Romans 8 more often upon the lips of the suffering, and none more commonly half-believed in the hour when it is most needed.',
  'Mark that the working together is of ALL things, not of the pleasant things only; the dark threads are in the loom as surely as the gold, and the pattern needs them.',
];

function docx(paragraphs: string[]): Uint8Array {
  const xml = Buffer.from(`<w:document><w:body>${paragraphs.map((p) => `<w:p><w:t>${p}</w:t></w:p>`).join('')}</w:body></w:document>`, 'utf8');
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

async function index(user: string, paragraphs: string[], title: string): Promise<string> {
  const bytes = docx(paragraphs);
  const doc = await createDocument(user, {
    title, filename: 'x.docx', byteSize: bytes.byteLength, checksum: await checksum(bytes), mimeType: 'docx',
  });
  const p = `user-corpus/${user}/${doc.id}`;
  BYTES.set(p, bytes);
  await runAsUser(user, (sql) => [sql`UPDATE user_documents SET blob_url = ${p} WHERE user_id = ${user} AND id = ${doc.id}`]);
  await drain(user, 1);
  const after = await getDocument(user, doc.id);
  if (after?.status !== 'ready') throw new Error(`indexing failed: ${after?.status} ${after?.parseError}`);
  return doc.id;
}

async function cleanup() {
  for (const u of [USER_A, USER_B]) {
    await runAsUser(u, (sql) => [sql`DELETE FROM user_documents WHERE user_id = ${u}`]).catch(() => undefined);
  }
}

let docA = '';
let docB = '';
let queryVec: number[] = [];

describe.skipIf(!enabled)('the /ask user-voices lane: two-account RLS', () => {
  beforeAll(async () => {
    await cleanup();
    docA = await index(USER_A, A_PARAS, 'Comfort in Affliction');
    docB = await index(USER_B, B_PARAS, 'The Afflicted Comforted');
    [queryVec] = await embedChunks(['comfort in affliction and the providence of God']);
  }, 300_000);
  afterAll(cleanup);

  it('fixture can discriminate: B has on-topic indexed rows that WOULD rank for this query', async () => {
    // If B's rows are not semantically competitive, "A never sees B" passes without tenancy
    // doing any work. SEED: point the query at an unrelated topic -> RED here, not a silent pass.
    const bHits = await retrieveUserVoices(USER_B, queryVec);
    expect(bHits.length, 'B produced no hits for the shared topic — the tenancy assertion below is unearned').toBeGreaterThan(0);
    expect(bHits.every((h) => h.documentId === docB)).toBe(true);
  }, 60_000);

  it('user A retrieval returns ONLY user A rows (K bound respected)', async () => {
    const hits = await retrieveUserVoices(USER_A, queryVec);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThanOrEqual(USER_VOICE_K);
    expect(hits.every((h) => h.documentId === docA && h.title === 'Comfort in Affliction')).toBe(true);
  }, 60_000);

  it('A never sees B even at MAX fan-out (the lane K is not what protects tenancy)', async () => {
    // Ask for far more than K so the assertion is about tenancy, not about the limit.
    const hits = await retrieveUserVoices(USER_A, queryVec, 100);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.documentId === docA)).toBe(true);
    expect(hits.some((h) => h.documentId === docB)).toBe(false);
  }, 60_000);
});
