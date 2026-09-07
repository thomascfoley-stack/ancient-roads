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
const { announceSkip } = await import('../helpers/loud-skip');
const { existsSync } = await import('node:fs');
const path = (await import('node:path')).default;

const KEY = localEnv('DEEPINFRA_API_KEY');
if (KEY && !process.env.DEEPINFRA_API_KEY) process.env.DEEPINFRA_API_KEY = KEY;
const enabled = Boolean(runtimeDbUrl() && KEY && existsSync(path.resolve(__dirname, '../../public/bible/kjv')));
if (!enabled) console.warn('⚠ SKIPPED (visibly): tradition-gap suite needs APP_DATABASE_URL, DEEPINFRA_API_KEY and public/bible/kjv.');

/**
 * The OWNER connection, resolved once — the three seeded legs below (A2, D9, D8) need it because
 * `app_runtime` can no longer write `embeddings` (migration 101), which is itself the point.
 *
 * HOISTED SO THE LEGS CAN `it.skipIf` ON IT. Each of them used to open with
 * `if (!ownerUrl) { console.warn(…); return; }` INSIDE the `it()` — and a bare return from a test
 * body is a PASS, not a skip. So wherever the owner connection is absent (which is CI, and this
 * machine) all three reported a green tick having asserted nothing — including A2, the only test
 * in the repo that seeds a user-owned row into `embeddings` and proves no platform pool surfaces
 * it, whose own comment records that deleting the fence once left the suite green because nothing
 * was there to hold back. Found by the false-confidence audit, 2026-09-07; the honest sibling is
 * `queue-never-drops.test.ts`, which gates the same precondition with `announceSkip` + `it.skipIf`
 * and is reported as skipped.
 */
const OWNER_URL = seedOwnerUrl();
announceSkip(
  'the tradition-gap fence (A2/D9/D8)',
  [{ name: 'DATABASE_URL (owner, to seed embeddings directly)', present: Boolean(OWNER_URL) }],
  'the seeded legs that prove a user-owned or forbidden-provenance row never surfaces',
);

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

  it('every returned voice is a corpus row, and the user’s document is not among them', async () => {
    // WHAT THIS CAN AND CANNOT SEE, stated because the previous version of this test claimed the
    // whole trust boundary and could not fail (false-confidence audit, 2026-09-07): `origin` is a
    // hardcoded literal in the row mapper, `USER` is never a value of `metadata->>'author'`, and
    // the user's title lives in `user_documents`, a table this statement never reads — so all
    // three assertions were unfalsifiable by any change to the SQL.
    //
    // The behavioural proof of the fence is A2 below, which seeds a user-owned row INTO
    // `embeddings` and needs the owner connection. The structural proof is the sibling test after
    // this describe, which runs everywhere. This leg keeps only what it can honestly check: the
    // query returns rows, they are shaped as corpus voices, and the reachability control holds.
    const r = await traditionGap(USER, docId, EVERYTHING);
    expect(r.voices.length, 'nothing surfaced — the assertions below would be vacuous').toBeGreaterThan(0);
    for (const v of r.voices) {
      expect(v.origin).toBe('corpus');
      expect(v.author).toBeTruthy();
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

  it.skipIf(!OWNER_URL)('A2 — a user-owned row seeded INTO the corpus table never surfaces', async () => {
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
    const ownerUrl = OWNER_URL!;
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

  it.skipIf(!OWNER_URL)('D9 — a corpus row with forbidden provenance never surfaces, even under the widest predicate', async () => {
    // The uploader deep-dive's D9: this join gated on `(served)` + `user_id IS NULL` while
    // servability.ts / studies.ts / research.ts also apply the forbidden-provenance denylist —
    // and ADR-044's served-but-forbidden rows are live exposure, so `(served)` does not subsume
    // it. Seeded exactly like A2 above (owner connection; markers sort FIRST so the LIMIT cannot
    // cut them — the A2 lesson), with a CLEAN twin as the reachability control: if the clean row
    // does not surface, the dirty row's absence is the empty-set tautology and proves nothing.
    const ownerUrl = OWNER_URL!;
    const { Client } = (await import('pg')).default;
    const c = new Client({ connectionString: ownerUrl, ssl: { rejectUnauthorized: false } });
    await c.connect();
    const dirty = `AAA-DIRTY-${RUN}`;
    const clean = `AAB-CLEAN-${RUN}`;
    const fixtures: [string, string, string][] = [
      [dirty, `${RUN}-d9-dirty`, 'https://biblehub.com/commentaries/romans/8-28.htm'],
      [clean, `${RUN}-d9-clean`, 'https://www.ccel.org/ccel/anon/romans.html'],
    ];
    try {
      for (const [marker, srcId, url] of fixtures) {
        await c.query(
          `INSERT INTO embeddings (user_id, source_type, source_id, chunk_index, content, embedding, metadata)
           VALUES (NULL,'commentary',$1,0,$2,array_fill(0.01::real,ARRAY[1024])::vector,$3::jsonb)`,
          [srcId, `provenance fixture ${marker}`,
           JSON.stringify({ author: marker, work: marker, tradition: marker, verseId: 45008028,
                            model: 'BAAI/bge-large-en-v1.5', sourceUrl: url })],
        );
      }
      const r = await traditionGap(USER, docId, EVERYTHING);
      const authors = r.voices.map((v) => v.author);
      expect(authors, 'the clean control row did not surface — this leg observed nothing').toContain(clean);
      // SEED: remove the provenance leg from the hits CTE -> RED (the dirty row surfaces).
      expect(authors, 'a forbidden-provenance corpus row surfaced as an attributed voice').not.toContain(dirty);
    } finally {
      await c.query(`DELETE FROM embeddings WHERE source_id = ANY($1)`,
        [fixtures.map(([, srcId]) => srcId)]).catch(() => undefined);
      await c.end().catch(() => undefined);
    }
  }, 180_000);

  it.skipIf(!OWNER_URL)('D8 — a USER-owned embeddings row is invisible to the clip-failure probe', async () => {
    // The uploader deep-dive's D8: `probeEmbeddingClipFailure` in studies.ts was the ONE
    // `FROM embeddings` read of fifteen without `user_id IS NULL`. It returns a reason code, not
    // content — but pre-fix a user-owned row made it answer 'not_servable', i.e. "this corpus
    // source exists", about a row the corpus plane does not contain. It belongs with this suite
    // because it is the same fence A2 proves for the join, on a neighbouring read.
    const ownerUrl = OWNER_URL!;
    const { createStudy, insertClippingFromEmbedding } = await import('@/lib/studies');
    const { Client } = (await import('pg')).default;
    const c = new Client({ connectionString: ownerUrl, ssl: { rejectUnauthorized: false } });
    await c.connect();
    const srcId = `commentary:${RUN}-d8`;
    let studyId: string | null = null;
    try {
      // A user-owned row whose key LOOKS like a corpus key (source_type matches its prefix, so
      // the probe's index-riding equality matches it too). Seeded as the owner, like A2.
      await c.query(
        `INSERT INTO embeddings (user_id, source_type, source_id, chunk_index, content, embedding, metadata)
         VALUES ($1,'commentary',$2,0,'a user chunk that must never read as corpus',
                 array_fill(0.01::real,ARRAY[1024])::vector,'{}'::jsonb)`,
        [USER, srcId],
      );
      // Reachability precondition (the A2 lesson): the row IS visible to this user under RLS,
      // so 'source_not_found' below means fenced out, not merely invisible.
      const [vis] = await runAsUser(USER, (sql) => [
        sql`SELECT count(*)::int AS n FROM embeddings WHERE source_id = ${srcId}`,
      ]);
      expect((vis as { n: number }[])[0]!.n, 'seed not visible under RLS — this leg observes nothing').toBe(1);

      const study = await createStudy(USER, `D8 probe ${RUN}`);
      studyId = study.id;
      const r = await insertClippingFromEmbedding(USER, study.id, { sourceId: srcId });
      expect(r.ok).toBe(false);
      // SEED: drop `user_id IS NULL` from the probe -> RED here ('not_servable').
      if (!r.ok) expect(r.reason).toBe('source_not_found');
    } finally {
      await c.query(`DELETE FROM embeddings WHERE source_id = $1`, [srcId]).catch(() => undefined);
      if (studyId) await c.query(`DELETE FROM studies WHERE id = $1`, [studyId]).catch(() => undefined);
      await c.end().catch(() => undefined);
    }
  }, 180_000);

  // ── REAL EXECUTION of the two sibling joins ───────────────────────────────────────────────────
  // corpus-join-integrity.test.ts proves WHAT is in their statements (GUC, provenance leg, bound
  // denylist) against a mocked driver; these prove the statements RUN — parameter counts, the
  // array binds, set_config inside the runAsUser transaction, and the corpus-model read — against
  // real Postgres. Dev's served corpus records exactly one model ('BAAI/bge-large-en-v1.5' on
  // every served row, 0 NULLs; measured 2026-08-21), so `comparable: true` below is the parity
  // check PASSING on a real read, not being skipped.

  it('REAL EXECUTION — relatedVoices runs its sweeps (ef_search + provenance leg) live', async () => {
    const { relatedVoices } = await import('@/lib/user-corpus/related-voices');
    const r = await relatedVoices(USER, docId, SERVED);
    expect(r.comparable).toBe(true);
    expect(r.voices.length).toBeGreaterThan(0);
    for (const v of r.voices) expect(v.origin).toBe('corpus');
  }, 120_000);

  it('REAL EXECUTION — computeSuggestedReadings runs its category scan (provenance leg) live', async () => {
    const { computeSuggestedReadings } = await import('@/lib/user-corpus/suggested-readings');
    // Hymns: the smallest category (6,887 served rows on dev), so the exact scan stays cheap.
    const rows = await computeSuggestedReadings(USER, docId, ['hymns'], SERVED, async () => {});
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.category).toBe('hymns');
      expect(row.author).toBeTruthy();
    }
  }, 300_000);
});

/**
 * THE FENCE, CHECKED WHERE NO CREDENTIAL IS NEEDED.
 *
 * A2 is the behavioural proof that a user-owned row in `embeddings` never surfaces, and it needs
 * an OWNER connection to seed one — which CI does not have, so A2 skips there. That left the
 * repo's most important user-corpus boundary with no check at all in CI, and until 2026-09-07 the
 * skip was reported as a PASS.
 *
 * This is the cheap half: the shipped statement carries `e.user_id IS NULL`. It cannot prove the
 * fence WORKS — only A2 can — but it fails on the exact seed A2 exists for, runs with no database
 * anywhere, and cannot be satisfied by a comment.
 */
describe('the corpus fence is in the shipped statement', () => {
  it('the tradition-gap join filters embeddings to platform-owned rows', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(path.resolve(__dirname, '../../src/lib/user-corpus/tradition-gap.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    // Positive control: the scan is looking at the file that really builds this query.
    expect(src, 'tradition-gap.ts no longer reads FROM embeddings — re-point this check').toMatch(/FROM\s+embeddings/i);
    expect(
      src,
      'the corpus fence `e.user_id IS NULL` is gone from the join — a user-owned row in embeddings '
        + 'would surface as an attributed historical voice (UPLOADER_DESIGN §8 A2)',
    ).toMatch(/e\.user_id\s+IS\s+NULL/i);
  });
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
