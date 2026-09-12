// `verseDocScan` — the per-DOCUMENT collapse of the presence fast path.
//
// This is the fix for the "MULTIPLICATION HAZARD" the draft-check overlap leg used to hit: a plain
// `verseAnchorScan` returns one row per ANCHOR, so a LIMIT counts anchors and silently drops
// documents whose first anchor row sorts past the cap. `verseDocScan` collapses to one row per
// document INSIDE the SQL (DISTINCT ON) before any LIMIT, mirroring tradition-gap.ts's
// `GROUP BY (author, work)` before `LIMIT` — see draft-check.ts's hazard note.
//
// Rides the db-invariants job (needs APP_DATABASE_URL only; verseDocScan is anchor + index reads,
// never the embedder, never the bible index). Seeds documents + sections + anchors directly under
// RLS via createDocument + runAsUser — never the drain — so running it costs no provider call.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { announceSkip } from '../helpers/loud-skip';
import { runAsUser } from '../../src/lib/db';
import { createDocument, deleteDocument } from '../../src/lib/user-corpus/documents';
import { verseDocScan } from '../../src/lib/user-corpus/search';
import { runtimeDbUrl } from '../helpers/env';

const enabled = Boolean(runtimeDbUrl());
announceSkip(
  'verseDocScan (the overlap collapse)',
  [{ name: 'APP_DATABASE_URL', present: Boolean(runtimeDbUrl()) }],
  'the per-document collapse of the presence fast path against a real user corpus',
);

const RUN = `vds-${Date.now().toString(36)}`;
const USER = `${RUN}-user`;
const OTHER = `${RUN}-other`;
// A chapter-wide range so a low-verse doc and a high-verse doc both overlap it.
const RANGE = { start: 45008001, end: 45008999 };
const LOW = 45008001;
const HIGH = 45008999;

const created: string[] = [];

interface AnchorSeed { vs: number; ve: number; channel: 'explicit' | 'uncited'; match: number | null }

/** A document with the given anchor rows, one section per anchor so each gets its own row. */
async function seedDoc(user: string, title: string, anchors: AnchorSeed[]): Promise<string> {
  const doc = await createDocument(user, {
    title, filename: `${title}.txt`, byteSize: 1, checksum: `${user}-${title}`, mimeType: 'txt',
  });
  created.push(doc.id);
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i]!;
    const [rows] = await runAsUser(user, (sql) => [
      sql`INSERT INTO user_sections (document_id, user_id, ordinal, body)
          VALUES (${doc.id}, ${user}, ${i}, ${title}) RETURNING id`,
    ]);
    const sid = (rows as { id: string }[])[0]!.id;
    await runAsUser(user, (sql) => [
      sql`INSERT INTO user_section_anchors (section_id, user_id, verse_id_start, verse_id_end, channel, match_count, confidence)
          VALUES (${sid}, ${user}, ${a.vs}, ${a.ve}, ${a.channel}, ${a.match}, 1.0)`,
    ]);
  }
  return doc.id;
}

afterAll(async () => {
  await runAsUser(USER, (sql) => [sql`DELETE FROM user_documents WHERE user_id = ${USER}`]).catch(() => undefined);
  await runAsUser(OTHER, (sql) => [sql`DELETE FROM user_documents WHERE user_id = ${OTHER}`]).catch(() => undefined);
  for (const id of created) await deleteDocument(USER, id).catch(() => undefined);
  for (const id of created) await deleteDocument(OTHER, id).catch(() => undefined);
});

describe.skipIf(!enabled)('verseDocScan — the per-document collapse', () => {
  // doc-A is the multiplication hazard fixture: many anchor rows at the LOW verse so a naive
  // per-row LIMIT fills on it before any higher-verse document's first row. Seeded in beforeAll
  // so every assertion shares the same fixture; its id is not read again (the assertions find it
  // by title).
  beforeAll(async () => {
    await seedDoc(USER, 'Sermon A (many anchors)', Array.from({ length: 50 }, () => ({
      vs: LOW, ve: LOW, channel: 'uncited' as const, match: 1,
    })));
  }, 60_000);

  // ── PRECONDITION: the fixture really can discriminate ────────────────────────────────────────
  it('the hazard fixture has more anchor rows than a naive LIMIT would let through', async () => {
    // SEED: shrink doc-A back to one anchor -> this PRECONDITION fails, instead of silently
    // disarming the hazard assertion below. Fifty exceeds both the old `{ limit: 50 }` raw-row
    // cap and the DEFAULT_LIMIT (20) `verseDocScan` uses when no limit is passed.
    const [rows] = await runAsUser(USER, (sql) => [
      sql`SELECT count(*)::int AS n FROM user_section_anchors WHERE user_id = ${USER} AND verse_id_start = ${LOW}`,
    ]);
    expect((rows as { n: number }[])[0]!.n, 'doc-A did not seed 50 anchor rows').toBeGreaterThanOrEqual(50);
  }, 60_000);

  it('the LIMIT counts DOCUMENTS, not anchor×section pairs', async () => {
    // The hazard (tradition-gap.ts's named one, here applied to the overlap leg): a plain join
    // returns one row per anchor, so a LIMIT on raw rows silently starts counting anchors. doc-A
    // carries 50 anchor rows at the LOW verse; doc-B carries ONE anchor at the HIGH verse. Under
    // the OLD shape — `verseAnchorScan({ limit: 50 })` ordered by `verse_id_start` then a post-hoc
    // JS collapse — doc-B's only row sorts to position 51 and is cut before the collapse ever sees
    // it, so "Sermon B" vanishes with no error. `verseDocScan` collapses to one row per document
    // BEFORE the LIMIT, so both documents surface.
    // SEED: regress verseDocScan to raw rows + post-hoc collapse -> RED (Sermon B is absent).
    await seedDoc(USER, 'Sermon B (one high-verse anchor)', [{ vs: HIGH, ve: HIGH, channel: 'uncited', match: 100 }]);

    const docs = await verseDocScan(USER, RANGE);
    const titles = docs.map((d) => d.title);
    expect(titles, 'Sermon B (the high-verse doc beyond the old row cap) must surface').toContain('Sermon B (one high-verse anchor)');
    expect(titles, 'Sermon A must also surface').toContain('Sermon A (many anchors)');
    // One row per document — no duplicate documentIds from the un-collapsed join.
    expect(new Set(docs.map((d) => d.documentId)).size, 'the collapse must emit one row per document').toBe(docs.length);
  }, 60_000);

  it('keeps the STRONGEST match per document, not the first by verse position', async () => {
    // The old query ordered by verse position then document UUID, never match strength, so the cut
    // fell on verse position. The collapse must keep the strongest match per document regardless of
    // which verse it sits on: here the weak match is on the LOW verse and the strong on the HIGH,
    // so a verse-position-biased collapse would keep the weak. COALESCE(match_count,0) DESC makes
    // the strong win.
    await seedDoc(USER, 'Sermon C (weak then strong)', [
      { vs: LOW, ve: LOW, channel: 'uncited', match: 1 },
      { vs: HIGH, ve: HIGH, channel: 'uncited', match: 10 },
    ]);
    const docs = await verseDocScan(USER, RANGE);
    const c = docs.find((d) => d.title === 'Sermon C (weak then strong)');
    expect(c, 'Sermon C must surface').toBeTruthy();
    expect(c!.matchCount, 'the strongest match (match_count=10), not the lowest-verse one, is kept').toBe(10);
  }, 60_000);

  it('treats an explicit citation (NULL match_count) like the byDoc pass did — as 0 for ranking', async () => {
    // A document with a weak uncited anchor (match_count=1) and an explicit citation (NULL) on the
    // same range: COALESCE(NULL,0)=0 < COALESCE(1,0)=1, so the uncited row wins — exactly as the old
    // `(h.matchCount ?? 0)` comparison did. Guards against a regression to NULLS-first ordering or a
    // naive `match_count DESC` that puts NULL first and discards the measurable match.
    await seedDoc(USER, 'Sermon D (cited and quoted)', [
      { vs: LOW, ve: LOW, channel: 'explicit', match: null },
      { vs: HIGH, ve: HIGH, channel: 'uncited', match: 1 },
    ]);
    const docs = await verseDocScan(USER, RANGE);
    const d = docs.find((x) => x.title === 'Sermon D (cited and quoted)');
    expect(d, 'Sermon D must surface').toBeTruthy();
    expect(d!.matchCount, 'the uncited match_count=1 beats the explicit NULL — as `?? 0` did').toBe(1);
  }, 60_000);

  it('a match-count floor keeps explicit citations (NULL match_count) and drops weak uncited ones', async () => {
    // The minMatchCount clause is inherited from verseAnchorScan verbatim: NULL match_count is kept
    // (an explicit citation must never be silently excluded), a low uncited count is cut. With only
    // the explicit row surviving the filter, the collapse returns that one — match_count NULL.
    await seedDoc(USER, 'Sermon E (floor target)', [
      { vs: LOW, ve: LOW, channel: 'explicit', match: null },
      { vs: HIGH, ve: HIGH, channel: 'uncited', match: 1 },
    ]);
    const docs = await verseDocScan(USER, RANGE, { minMatchCount: 99 });
    const e = docs.find((x) => x.title === 'Sermon E (floor target)');
    expect(e, 'the explicit citation must survive the floor').toBeTruthy();
    expect(e!.channel, 'the surviving row is the explicit citation').toBe('explicit');
    expect(e!.matchCount).toBeNull();
  }, 60_000);

  it('another user gets nothing — RLS binds the scan to the asking user', async () => {
    const docs = await verseDocScan(OTHER, RANGE);
    expect(docs, 'a different user never sees this user\'s overlapping documents').toEqual([]);
  }, 60_000);
});
