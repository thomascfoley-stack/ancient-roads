// The three searches, over really indexed rows, with two accounts.
//
// Covers two of the three invariants SLICE_1_DATA_MODEL names as gating Slice 1:
//   * test 1, two-account tenancy — driven through the REAL search functions, not a raw SELECT
//   * test 2, no-HNSW recall — semanticSearch must equal a brute-force cosine computed here over
//     the same rows, because the absence of a vector index is a deliberate design decision and
//     this is its canary
// (test 3, model parity, lives in model-parity.test.ts and the tradition-gap join it guards is
// gated on Lane A per ADR-104.)

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
const {
  MAX_LIMIT, MAX_OFFSET, fuseByRRF, keywordSearch, searchMyWorks, semanticSearch, verseAnchorScan,
} = await import('@/lib/user-corpus/search');
const { localEnv, runtimeDbUrl } = await import('../helpers/env');
const { existsSync } = await import('node:fs');
const path = (await import('node:path')).default;

const KEY = localEnv('DEEPINFRA_API_KEY');
if (KEY && !process.env.DEEPINFRA_API_KEY) process.env.DEEPINFRA_API_KEY = KEY;
const enabled = Boolean(runtimeDbUrl() && KEY && existsSync(path.resolve(__dirname, '../../public/bible/kjv')));
if (!enabled) {
  console.warn('⚠ SKIPPED (visibly): search suite needs APP_DATABASE_URL, DEEPINFRA_API_KEY and public/bible/kjv.');
}

const RUN = `search-${Date.now().toString(36)}`;
const USER_A = `${RUN}-A`;
const USER_B = `${RUN}-B`;
const ROM_8_28 = 45008028;

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

// LONG ENOUGH TO PRODUCE SEVERAL CHUNKS, and that is not decoration — see the preconditions below.
// The first version of this fixture was 490 characters against a 1200-char budget, so it produced
// exactly ONE section, and every ordering test was comparing a one-element list to itself.
//
// It also cites Romans 8 at CHAPTER grain as well as 8:28 at verse grain, so a chapter-wide anchor
// exists that a single-verse query must still find. Without that, overlap and containment give the
// same answer and the range logic is untested.
const A_SERMON = [
  'THE GOOD SHEPHERD',
  'Our text is Romans 8:28, and I would have you weigh it with me this morning, for it is the ground of every comfort we possess in the hour of affliction, and the anchor of the soul when every other mooring has been cut away by grief.',
  'And we know that all things work together for good to them that love God, to them who are the called according to his purpose. There is the promise entire, and I would not have you take one clause of it without the others.',
  'Consider the whole argument of Romans 8, from the first verse to the last, and see whether the apostle ever once permits the believer to imagine himself abandoned by the providence that called him.',
  'The LORD is my shepherd; I shall not want. He maketh me to lie down in green pastures: he leadeth me beside the still waters, and restoreth my soul continually, and the restoring is as constant as the leading.',
  'Now the husbandman is a figure often used, and it will bear a little pressing here, for the patience of the farmer is not idleness but a settled expectation grounded upon the ordinary faithfulness of God in the seasons.',
  'Beloved, when the night is long and the morning seems to have forgotten its appointment, remember that the shepherd does not sleep, and that the sheep are not kept by their own vigilance but by his.',
  'I have known men who could recite the promise and yet could not rest in it, and I have known others, far less able to argue, who laid their whole weight upon it and were not ashamed.',
  'The husbandman is not idle while he waits, and neither is faith idle while it waits; there is a labour proper to expectation, and it is the labour of holding fast what has already been given rather than reaching after what has not.',
  'I have watched men in the hour of loss reach for every comfort but the one that was nearest, and I have thought that the promise is often refused not because it is doubted but because it is too plain to be believed by a mind in torment.',
  'Observe that the apostle does not say all things ARE good, which would be a falsehood any mourner could refute, but that they work TOGETHER for good, which is a claim about the end of the weaving and not about the colour of any single thread.',
  'There is a patience which is only exhaustion, and there is a patience which is confidence, and the two may look alike from the outside for a long while before the difference declares itself in the day of trial.',
  'Consider how the shepherd leads: not driving from behind as one who fears the flock will escape, but going before, so that the sheep follow a voice they have learned in quieter weather and can still recognise in the dark.',
  'It is the settled habit of God to keep his promises in ways that were not anticipated, and the disappointment of our anticipation is very often mistaken by us for the failure of the promise itself.',
  'I would not have you think that comfort is the absence of grief, for it is not; it is the presence of a purpose large enough to contain the grief without being overturned by it.',
  'And so we come back to where we began, to the text itself, and to the God who stands behind it, and who has never yet been found unfaithful by anyone who trusted him long enough to find out.',
  'A word now to those who keep accounts with God and find the ledger always against them: the promise was never offered to the solvent, and the whole of its comfort lies in its being addressed to people who could not have earned it.',
  'The still waters are not still because there is no current, but because the shepherd has chosen the place; and a soul restored is not a soul that has forgotten, but one that has been led somewhere it could bear to remember.',
  'I have heard it objected that such comfort is only a way of making misfortune tolerable, and I answer that a purpose which can hold misfortune is not a smaller thing than one which merely avoids it, but a very much larger one.',
  'Let no one say that patience is passive who has ever tried it for a single long night; it is the most strenuous of the virtues, and it is the one most often mistaken by onlookers for doing nothing at all.',
  'The called according to his purpose: mark the phrase, for the calling is his and the purpose is his, and the only thing in the sentence which is ours is the loving, and even that we did not begin.',
  'When the harvest comes it will not be said that the farmer made the rain, nor will the farmer say it; but neither will anyone pretend that his waiting was beside the point, for the waiting was the shape his faith took.',
  'And if you ask me how long, I have no answer but the one the text gives, which is not a length of time at all but a direction, and a promise about where the road ends rather than when.',
  'So let the shadows flee as they will, and in their own hour; we are not asked to hasten the morning, only to keep facing east, and that is a labour any of us can undertake tonight.',
  'Let us then go forward in the strength of these words, until the day break and the shadows flee away, and the whole purpose for which we were called is made plain to us at last.',
];
const B_SERMON = [
  'ON HUSBANDRY AND PATIENCE',
  'The farmer waits upon the early and the latter rain, and his patience is a parable to us of a longer waiting still, which the impatient heart knows nothing of.',
  'Behold, the husbandman waiteth for the precious fruit of the earth, and hath long patience for it, until he receive the early and latter rain.',
];

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
let queryVec: number[] = [];

describe.skipIf(!enabled)('the three searches', () => {
  beforeAll(async () => {
    await cleanup();
    docA = await index(USER_A, A_SERMON, 'The Good Shepherd');
    await index(USER_B, B_SERMON, 'On Husbandry');
    [queryVec] = await embedChunks(['comfort in affliction and the providence of God']);
  }, 300_000);
  afterAll(cleanup);

  // ── PRECONDITIONS ────────────────────────────────────────────────────────────────────────────
  // These exist because the red-proof found FOUR of five seeded bugs escaping this suite, and the
  // cause in three of them was a fixture too small to discriminate. A precondition that fails
  // loudly is the difference between "the test passed" and "the test ran".
  describe('the fixture can discriminate at all', () => {
    it('indexed several sections, so an ordering test is not comparing a list of one', async () => {
      const [rows] = await runAsUser(USER_A, (sql) => [
        sql`SELECT count(*)::int AS n FROM user_sections WHERE user_id = ${USER_A}`,
      ]);
      const n = (rows as { n: number }[])[0]!.n;
      // SEED: shorten A_SERMON back to one chunk -> RED here, instead of silently disarming the
      // brute-force ordering assertion below.
      // Two rows would catch a wrong ORDER BY only about half the time — the same flaky-red problem
      // the SKIP LOCKED proof hit. Five makes an accidental agreement vanishingly unlikely.
      expect(n, 'fixture produced too few sections for ordering to be observable').toBeGreaterThanOrEqual(5);
    }, 60_000);

    it('produced a CHAPTER-grain anchor as well as verse-grain ones', async () => {
      // Without a range wider than the query, overlap and containment agree and the range logic is
      // untested. SEED: drop the bare "Romans 8" citation from A_SERMON -> RED.
      const [rows] = await runAsUser(USER_A, (sql) => [
        sql`SELECT count(*)::int AS n FROM user_section_anchors
             WHERE user_id = ${USER_A} AND verse_id_end - verse_id_start > 10`,
      ]);
      expect((rows as { n: number }[])[0]!.n, 'no wide anchor — overlap vs containment is untestable').toBeGreaterThan(0);
    }, 60_000);
  });

  describe('semantic', () => {
    it('finds A\'s own writing', async () => {
      const hits = await semanticSearch(USER_A, queryVec!);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]!.title).toBe('The Good Shepherd');
      expect(hits.every((h) => h.score >= -1 && h.score <= 1)).toBe(true);
    }, 60_000);

    it('is EXACT brute force — equals a reference cosine computed here (SLICE_1_DATA_MODEL test 2)', async () => {
      // The absence of a vector index is a deliberate decision (§5, migration 100): a shared HNSW
      // starves once a user_id filter guts its neighbour list. This is that decision's canary — if
      // someone adds a global index, ranking stops being exact and this goes red.
      const [rows] = await runAsUser(USER_A, (sql) => [
        sql`SELECT e.section_id, e.embedding::text AS vec FROM user_section_embeddings e WHERE e.user_id = ${USER_A}`,
      ]);
      const parsed = (rows as { section_id: string; vec: string }[]).map((r) => ({
        id: r.section_id,
        v: r.vec.replace(/^\[|\]$/g, '').split(',').map(Number),
      }));
      const cos = (a: number[], b: number[]) => {
        let dot = 0; let na = 0; let nb = 0;
        for (let i = 0; i < a.length; i++) { dot += a[i]! * b[i]!; na += a[i]! ** 2; nb += b[i]! ** 2; }
        return dot / (Math.sqrt(na) * Math.sqrt(nb));
      };
      const reference = parsed
        .map((p) => ({ id: p.id, s: cos(queryVec!, p.v) }))
        .sort((x, y) => y.s - x.s)
        .map((x) => x.id);

      const hits = await semanticSearch(USER_A, queryVec!, { limit: MAX_LIMIT });
      expect(hits.map((h) => h.sectionId)).toEqual(reference);
    }, 60_000);

    it('scopes to one document when asked — same function, optional filter', async () => {
      const all = await semanticSearch(USER_A, queryVec!, { limit: MAX_LIMIT });
      const scoped = await semanticSearch(USER_A, queryVec!, { documentId: docA, limit: MAX_LIMIT });
      expect(scoped.length).toBeGreaterThan(0);
      expect(scoped.every((h) => h.documentId === docA)).toBe(true);
      expect(scoped.length).toBeLessThanOrEqual(all.length);
    }, 60_000);

    it('B never sees A (SLICE_1_DATA_MODEL test 1, through the real search)', async () => {
      // WHAT THIS PROVES, AND WHAT IT DOES NOT — established by red-proof. Deleting the explicit
      // `e.user_id = ${userId}` predicate leaves this GREEN, because RLS is already bound by
      // runAsUser and carries the isolation on its own. So this asserts the BOUNDARY HOLDS, which
      // is the invariant that matters; it does not separately prove the explicit predicate, and
      // nothing driven through runAsUser could. The predicate is defence in depth for the day
      // someone queries outside a bound transaction, and the two-account RLS proof
      // (scripts/redproof-user-corpus-rls.mjs) is where the policy itself is watched red.
      const hits = await semanticSearch(USER_B, queryVec!, { limit: MAX_LIMIT });
      expect(hits.every((h) => h.title !== 'The Good Shepherd')).toBe(true);
      expect(hits.some((h) => h.documentId === docA)).toBe(false);
    }, 60_000);
  });

  describe('keyword', () => {
    it('finds an exact line A wrote', async () => {
      const hits = await keywordSearch(USER_A, 'green pastures');
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]!.text).toContain('green pastures');
    }, 60_000);

    it('B never sees A', async () => {
      expect(await keywordSearch(USER_B, 'green pastures')).toEqual([]);
    }, 60_000);

    it('returns nothing for an empty query rather than everything', async () => {
      // HONEST LIMIT, found by red-proof: deleting the `if (!q) return []` guard leaves this test
      // GREEN. `websearch_to_tsquery('english','   ')` produces an EMPTY tsquery, and `tsv @@ ''`
      // matches no rows, so the database refuses the blank search whether or not we do.
      //
      // The guard is therefore belt-and-braces, not the thing keeping a blank search box from
      // returning the corpus — and no fixture can make this test discriminate, because the
      // behaviour is identical either way. Kept for the round trip it saves and because a future
      // change of tsquery function could make it load-bearing; the claim is downgraded to what it
      // actually proves.
      expect(await keywordSearch(USER_A, '   ')).toEqual([]);
      expect(await keywordSearch(USER_A, '')).toEqual([]);
    }, 60_000);

    it('does not throw on punctuation that would break to_tsquery', async () => {
      for (const q of ['"green pastures"', 'shepherd -farmer', 'a & b | c :*', "it's"]) {
        await expect(keywordSearch(USER_A, q)).resolves.toBeDefined();
      }
    }, 60_000);
  });

  describe('verse-anchor scan', () => {
    it('answers by OVERLAP, not containment — in BOTH directions', async () => {
      // Direction 1: a NARROW anchor (8:28) must answer a WIDE query (the chapter).
      const chapter = await verseAnchorScan(USER_A, { start: 45008001, end: 45008999 });
      expect(chapter.some((p) => p.verseStart === ROM_8_28)).toBe(true);

      // Direction 2: a WIDE anchor (the chapter, from the bare "Romans 8" citation) must answer a
      // NARROW query for one verse inside it. THIS is the direction containment gets wrong, and the
      // first version of this test missed it because every anchor was a single verse — so
      // containment and overlap agreed and the seed passed 15/15.
      //
      // SEED: swap the overlap predicate for containment -> RED here.
      const single = await verseAnchorScan(USER_A, { start: 45008015, end: 45008015 });
      expect(single.some((p) => p.verseEnd - p.verseStart > 10), 'a chapter-grain anchor did not answer a single-verse query').toBe(true);
    }, 60_000);

    it('reports the channel and match count, so "quoted at length" is separable from "mentioned"', async () => {
      const hits = await verseAnchorScan(USER_A, { start: 45008001, end: 45008999 });
      expect(new Set(hits.map((h) => h.channel)).size).toBeGreaterThan(0);
      for (const h of hits) {
        if (h.channel === 'explicit') expect(h.matchCount).toBeNull();
        if (h.channel === 'uncited') expect(h.matchCount).toBeGreaterThanOrEqual(1);
      }
    }, 60_000);

    it('a match-count floor never silently drops explicit citations', async () => {
      // match_count is NULL for explicit by design (migration 103). A naive `>= K` would exclude
      // every citation, which is the opposite of what a "strong matches only" filter should do.
      const floored = await verseAnchorScan(USER_A, { start: 45008001, end: 45008999 }, { minMatchCount: 99 });
      expect(floored.some((h) => h.channel === 'explicit')).toBe(true);
      expect(floored.some((h) => h.channel === 'uncited')).toBe(false);
    }, 60_000);

    it('B never sees A', async () => {
      expect(await verseAnchorScan(USER_B, { start: 45008001, end: 45008999 })).toEqual([]);
    }, 60_000);
  });

  describe('fusion and bounds', () => {
    it('fuses semantic and keyword by reciprocal rank', async () => {
      const hits = await searchMyWorks(USER_A, queryVec!, 'green pastures');
      expect(hits.length).toBeGreaterThan(0);
      expect(new Set(hits.map((h) => h.sectionId)).size).toBe(hits.length); // no duplicates
    }, 60_000);

    it('RRF ranks a result appearing in BOTH lists above one appearing in either alone', () => {
      const mk = (id: string) => ({
        documentId: 'd', sectionId: id, title: 't', heading: null, ordinal: 0, text: '', score: 0, createdAt: '',
      });
      // `both` is 2nd in each list; `solo` is 1st in one and absent from the other.
      const fused = fuseByRRF([[mk('solo'), mk('both')], [mk('x'), mk('both')]], 10);
      expect(fused[0]!.sectionId).toBe('both');
    });

    it('clamps limit and offset rather than passing them to Postgres', async () => {
      // `?offset=1e21` serialises to `1e+21` and Postgres 500s (22P02); a bigger one overflows
      // (22003). The 2026-08-02 fix validated integer-NESS but not MAGNITUDE.
      await expect(semanticSearch(USER_A, queryVec!, { limit: 10_000, offset: 1e21 })).resolves.toBeDefined();
      const big = await semanticSearch(USER_A, queryVec!, { limit: 10_000 });
      expect(big.length).toBeLessThanOrEqual(MAX_LIMIT);
      expect(MAX_OFFSET).toBe(100_000);
    }, 60_000);
  });
});
