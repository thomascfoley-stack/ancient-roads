// The tradition-gap join — the corpus half of the moat.
//
// THE CORPUS PREDICATE IS A PARAMETER, per ADR-104: `routing.ts` on this branch is byte-identical
// to `main` and its LEGAL_CORPUS_FILTER is still the author allowlist, while the `served` COLUMN is
// on the database. Importing the canonical symbol today returns the WRONG filter.
//
// The predicate strings below are TEST FIXTURES exercising that parameter. They are NOT a shipped
// copy of the canonical predicate, and production must import `LEGAL_CORPUS_FILTER` from
// `routing.ts` once Lane A merges. That distinction is the whole of ADR-104, so the tests assert
// the parameter is genuinely applied rather than assuming it.

import { Buffer } from 'node:buffer';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const BYTES = new Map<string, Uint8Array>();
vi.mock('@/lib/user-corpus/blob', () => ({
  getUserDocument: async (p: string) => {
    const b = BYTES.get(p);
    if (!b) throw new Error(`no bytes for ${p}`);
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
const { MAX_VOICES, corpusPredicate, traditionGap } = await import('@/lib/user-corpus/tradition-gap');
const { localEnv, runtimeDbUrl, seedOwnerUrl } = await import('../helpers/env');
const { existsSync } = await import('node:fs');
const path = (await import('node:path')).default;

const KEY = localEnv('DEEPINFRA_API_KEY');
if (KEY && !process.env.DEEPINFRA_API_KEY) process.env.DEEPINFRA_API_KEY = KEY;
const enabled = Boolean(runtimeDbUrl() && KEY && existsSync(path.resolve(__dirname, '../../public/bible/kjv')));
if (!enabled) console.warn('⚠ SKIPPED (visibly): tradition-gap suite needs APP_DATABASE_URL, DEEPINFRA_API_KEY and public/bible/kjv.');

const RUN = `gap-${Date.now().toString(36)}`;
const USER = `${RUN}-user`;
const OTHER = `${RUN}-other`;

// Test fixtures for the injected parameter — NOT the shipped predicate. See the header.
const SERVED = corpusPredicate('e.served');
const EVERYTHING = corpusPredicate('true');
const NOTHING = corpusPredicate('false');

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

const SERMON = [
  'THE GOOD SHEPHERD',
  'Our text is Romans 8:28, and I would have you weigh it with me this morning, for it is the ground of every comfort we possess in the hour of affliction and of loss.',
  'And we know that all things work together for good to them that love God, to them who are the called according to his purpose, and there is the promise entire.',
  'Consider the whole argument of Romans 8, from the first verse to the last, and see whether the apostle permits the believer to imagine himself abandoned.',
  'The LORD is my shepherd; I shall not want. He maketh me to lie down in green pastures: he leadeth me beside the still waters, and restoreth my soul.',
];

let docId = '';

async function indexFor(user: string): Promise<string> {
  const bytes = docx(SERMON);
  const doc = await createDocument(user, {
    title: 'The Good Shepherd', filename: 's.docx', byteSize: bytes.byteLength,
    checksum: await checksum(bytes), mimeType: 'docx',
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
  for (const u of [USER, OTHER]) {
    await runAsUser(u, (sql) => [sql`DELETE FROM user_documents WHERE user_id = ${u}`]).catch(() => undefined);
  }
}

describe.skipIf(!enabled)('the tradition-gap join', () => {
  beforeAll(async () => { await cleanup(); docId = await indexFor(USER); }, 300_000);
  afterAll(cleanup);

  it('returns corpus voices on the passages the document engages', async () => {
    const r = await traditionGap(USER, docId, SERVED);
    expect(r.rangesConsidered).toBeGreaterThan(0); // the document really anchored something
    expect(r.voices.length).toBeGreaterThan(0);
    // Non-vacuous in the way that matters: several DISTINCT authors, not one commentator repeated.
    expect(r.authorCount).toBeGreaterThan(1);
    for (const v of r.voices) {
      expect(v.author).toBeTruthy();
      expect(v.origin).toBe('corpus');
    }
  }, 120_000);

  it('THE INJECTED PREDICATE IS ACTUALLY APPLIED — this is ADR-104s load-bearing assertion', async () => {
    // If the parameter were ignored, the join would silently return the whole corpus regardless of
    // what production later passes — and the licensing fence would be decorative.
    // SEED: drop `AND ${predicate}` from the query -> RED.
    const none = await traditionGap(USER, docId, NOTHING);
    expect(none.voices).toEqual([]);
    expect(none.authorCount).toBe(0);

    const all = await traditionGap(USER, docId, EVERYTHING);
    const served = await traditionGap(USER, docId, SERVED);
    expect(all.voices.length).toBeGreaterThan(0);
    // `served` is a strict subset of everything: 328,775 of 1,070,674 rows carry it, and the 796
    // staged sources are exactly what must not surface.
    expect(served.voices.length).toBeLessThanOrEqual(all.voices.length);
  }, 120_000);

  it('a voice is an AUTHOR, not an entry', async () => {
    // today.ts:127-140: counting entries let ONE commentator satisfy a "≥2 voices" floor and
    // concealed a zero-coverage hole. authorCount must be over distinct authors.
    const r = await traditionGap(USER, docId, SERVED);
    expect(r.authorCount).toBe(new Set(r.voices.map((v) => v.author)).size);
    // And rows are one per (author, work) — no duplicates of the same pair.
    const pairs = r.voices.map((v) => `${v.author}|${v.work}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  }, 120_000);

  it('the LIMIT counts VOICES, not anchor×entry pairs', async () => {
    // work.ts:155 — a plain join multiplies rows and the limit silently starts counting the wrong
    // thing. Here BOTH sides are many, so the product is quadratic. This document anchors several
    // ranges and Romans 8 alone carries 1,892 served entries from 17 authors.
    // SEED: remove the DISTINCT ON -> RED, the cap fills with duplicate authors.
    const r = await traditionGap(USER, docId, SERVED, { maxVoices: 5 });
    expect(r.voices.length).toBeLessThanOrEqual(5);
    const pairs = r.voices.map((v) => `${v.author}|${v.work}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  }, 120_000);

  it('never returns the user’s own words — the trust boundary (§7)', async () => {
    // User content is additive, never load-bearing, and this function is a CORPUS query. A user
    // section leaking in here would be presented as an attributed historical voice.
    const r = await traditionGap(USER, docId, EVERYTHING);
    for (const v of r.voices) {
      expect(v.origin).toBe('corpus');
      expect(v.author).not.toBe(USER);
      expect(v.work).not.toContain('Good Shepherd'); // the user's own title
    }
  }, 120_000);

  it('is scoped to the asking user’s document — another user gets nothing from it', async () => {
    // The user half of the join is RLS-bound. B asking about A's document id must see no ranges,
    // and therefore no voices — not A's voices.
    const r = await traditionGap(OTHER, docId, SERVED);
    expect(r.rangesConsidered).toBe(0);
    expect(r.voices).toEqual([]);
  }, 120_000);

  it('returns nothing for a document that anchors nothing', async () => {
    const bytes = docx(['ON THE PARISH ROOF', 'The weather has been disagreeable this fortnight and the roof leaks badly above the vestry, which is a nuisance to everyone concerned with the fabric.']);
    const doc = await createDocument(USER, {
      title: 'Roof', filename: 'r.docx', byteSize: bytes.byteLength, checksum: await checksum(bytes), mimeType: 'docx',
    });
    const p = `user-corpus/${USER}/${doc.id}`;
    BYTES.set(p, bytes);
    await runAsUser(USER, (sql) => [sql`UPDATE user_documents SET blob_url = ${p} WHERE user_id = ${USER} AND id = ${doc.id}`]);
    await drain(USER, 1);
    const r = await traditionGap(USER, doc.id, SERVED);
    expect(r.voices).toEqual([]);
  }, 180_000);

  it('A2 — a user-owned row seeded INTO the corpus table never surfaces', async () => {
    // THIS TEST EXISTS BECAUSE THE RED-PROOF FOUND IT MISSING. Deleting `e.user_id IS NULL` from
    // the corpus fence left the suite GREEN, because no test user had a row in `embeddings` — the
    // fence had nothing to hold back and could not be observed.
    //
    // It is not hypothetical. `embeddings` carries a `user_id` column and its write policy permits
    // `user_id = current_user_id`, which is why migration 101 revoked app_runtime's INSERT in the
    // first place. UPLOADER_DESIGN §8 A2 asks for exactly this: seed a user-owned row and prove no
    // platform pool surfaces it.
    //
    // Seeded as the OWNER, because app_runtime can no longer write this table (migration 101) —
    // which is itself the point.
    const ownerUrl = seedOwnerUrl();
    if (!ownerUrl) { console.warn('⚠ A2 leg SKIPPED: no owner URL'); return; }
    const { Client } = (await import('pg')).default;
    const c = new Client({ connectionString: ownerUrl, ssl: { rejectUnauthorized: false } });
    await c.connect();
    // SORTS FIRST, DELIBERATELY. The first version used `LEAKED-${RUN}` and the seed STILL escaped:
    // 270 (author, work) pairs exist on these passages, MAX_VOICES is 50, and 107 authors sort
    // before "LEAKED" — so the row was cut by the LIMIT long before the fence could matter. The
    // test could not observe the thing it named. A leading "AAA" puts it first among all 270, so
    // if the fence ever stops holding, this row is the first thing the caller sees.
    const marker = `AAA-LEAKED-${RUN}`;
    try {
      await c.query(
        `INSERT INTO embeddings (user_id, source_type, source_id, chunk_index, content, embedding, metadata)
         VALUES ($1,'commentary',$2,0,$3,array_fill(0.01::real,ARRAY[1024])::vector,$4::jsonb)`,
        [USER, `${RUN}-leak`, 'private words that must never be attributed',
         JSON.stringify({ author: marker, work: marker, tradition: marker, verseId: 45008028, model: 'BAAI/bge-large-en-v1.5' })],
      );
      // Precondition: the row really is there and really is on a verse this document anchors —
      // otherwise "it did not surface" is the empty-set tautology all over again.
      const check = await c.query(`SELECT count(*)::int AS n FROM embeddings WHERE metadata->>'author' = $1`, [marker]);
      expect(check.rows[0].n, 'seed did not land').toBe(1);

      // SEED: drop `e.user_id IS NULL` from the fence -> RED here, and only here.
      for (const pred of [EVERYTHING, SERVED]) {
        const r = await traditionGap(USER, docId, pred);
        expect(r.voices.map((v) => v.author), 'a user-owned row surfaced as an attributed voice').not.toContain(marker);
      }
      // NOT VACUOUS: prove the row is reachable at all, so "absent" means fenced out rather than
      // merely out of range. Queried directly, under the same RLS binding the join runs in.
      const [reachable] = await runAsUser(USER, (sql) => [
        sql`SELECT count(*)::int AS n FROM embeddings
             WHERE metadata->>'author' = ${marker}
               AND (metadata->>'verseId')::int BETWEEN 45008001 AND 45008999`,
      ]);
      expect((reachable as { n: number }[])[0]!.n, 'the seeded row was not even visible to RLS — the test proves nothing').toBe(1);
    } finally {
      await c.query(`DELETE FROM embeddings WHERE source_id = $1`, [`${RUN}-leak`]).catch(() => undefined);
      await c.end().catch(() => undefined);
    }
  }, 180_000);

  it('bounds its own output', async () => {
    const r = await traditionGap(USER, docId, EVERYTHING, { maxVoices: 10_000 });
    expect(r.voices.length).toBeLessThanOrEqual(MAX_VOICES);
  }, 120_000);
});

describe('corpusPredicate — the tripwire, not a sanitiser', () => {
  it('accepts a plain fragment', () => {
    expect(String(corpusPredicate('e.served'))).toBe('e.served');
  });

  it('refuses a statement terminator or comment marker', () => {
    // Not a security boundary — a determined caller defeats it, and relying on it would be
    // dangerous. It exists so `corpusPredicate(userInput)` fails loudly instead of silently.
    for (const bad of ["e.served; DROP TABLE embeddings", 'e.served -- x', 'e.served /* x */']) {
      expect(() => corpusPredicate(bad), bad).toThrow();
    }
  });
});
