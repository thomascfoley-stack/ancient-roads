// /search WEARS THE SERVABILITY BELT — the live-DB leg (2026-08-17 pre-deploy audit, domain
// lens #2, HIGH): the "Your studies" search group rendered snapshotted corpus quotes through
// ts_headline gated on nothing but `deleted_at IS NULL` — the exact bypass servability.ts
// exists to close, and the ONE render path of four (doc page / feed / export were covered by
// clipping-tombstone.test.ts) that had forgotten it.
//
// This suite drives the REAL searchStudies (the very function /search calls) against a real
// database, both key legs of the belt:
//   L1  Reader leg: stage the source out from under a section-keyed clipping → its search hit
//       becomes a tombstone (attribution kept) and the withdrawn quote's bytes appear NOWHERE
//       in the result — while the stored quote still sits in study_blocks (the belt, not a
//       purge, is what denies it — F2, asserted the same way clipping-tombstone asserts it).
//   L2  Ask leg: unserve the embedding row under a source_id-keyed clipping → same, and the
//       reader-leg hit is untouched (the two key universes stay independent).
// The fail-closed leg (resolveServability erroring) cannot be forced from here without mocks —
// searchStudies derives its keys from the DB — so it is pinned by clipping-tombstone.test.ts
// (S-3, a real cast error) plus search-personal-servability.test.ts (the failed-closed
// resolution tombstoning every keyed clipping).
//
// Red-proof (2026-08-17 session report): the mutation `state: 'clipping' as const` in
// searchStudies's decide step — the audit's defect, a render path that ignores the belt —
// turns L1/L2 red; reverted, suite green.
//
// Owner-seeded + dev-guarded exactly like clipping-tombstone.test.ts: synthetic served
// embedding row + published QA work, removed in afterAll, prefix-swept, source forced out of
// 'published' before deletion; license is an ALLOWED_LICENSES value so residue cannot fail it.

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStudy, insertClippingFromEmbedding, insertClippingFromSection } from '@/lib/studies';
import { searchStudies, type StudySearchHit } from '@/lib/search-personal';
import { ensureDbEnv, seedOwnerUrl } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';

const STAMP = Date.now();
const USER = `qa-searchbelt-${STAMP}`;
const SLUG = `qa-searchbelt-${STAMP}`;
// One shared token so ONE search returns BOTH studies; each quote carries its own marker so a
// leak is attributable to a leg.
const SHARED_TOKEN = `zzqasearchbelt${STAMP}`;
const READER_MARKER = `readerleg${STAMP}`;
const ASK_MARKER = `askleg${STAMP}`;
const SECTION_BODY = `QA search belt section ${SHARED_TOKEN} ${READER_MARKER} withdrawn after the save.`;
const EMBED_SOURCE_ID = `commentary:zzqasearchbelt${STAMP}:1:QA Belt`;
const EMBED_CONTENT = `QA search belt chunk ${SHARED_TOKEN} ${ASK_MARKER} unserved after the save.`;

ensureDbEnv();
const ownerConn = seedOwnerUrl();
const appConn = process.env.APP_DATABASE_URL;

let owner: pg.Client | undefined;
let readerStudyId = '';
let askStudyId = '';

const SKIP = announceSkip(
  '/search servability belt — searchStudies tombstones withdrawn quotes',
  [
    { name: 'APP_DATABASE_URL (app_runtime via requireDbInCi)', present: Boolean(appConn) },
    { name: 'DATABASE_URL (owner seed connection via seedOwnerUrl)', present: Boolean(ownerConn) },
  ],
  'the /search render path re-checks servability like its three siblings; a withdrawn quote never reaches a snippet',
);

const hitFor = (rows: StudySearchHit[], studyId: string): StudySearchHit => {
  const hit = rows.find((r) => r.studyId === studyId);
  expect(hit, `a hit for study ${studyId} must be on the page`).toBeDefined();
  return hit!;
};

describe.skipIf(SKIP)('/search servability belt — searchStudies tombstones withdrawn quotes', () => {
  beforeAll(async () => {
    owner = new pg.Client({ connectionString: ownerConn!, ssl: { rejectUnauthorized: false } });
    await owner.connect();
    const { rows } = await owner.query<{ id: string }>(
      `INSERT INTO sources (slug, title, author, source_type, tradition, era, license, provenance, status)
       VALUES ($1, 'QA Search Belt Work', 'QA Belt Author', 'commentary', 'qa', 'qa', 'Public Domain', '{}', 'published')
       RETURNING id`,
      [SLUG],
    );
    const sec = await owner.query<{ id: string }>(
      `INSERT INTO sections (source_id, ordinal, unit_ordinal, heading, body) VALUES ($1, 1, 1, 'QA belt heading', $2)
       RETURNING id`,
      [rows[0]!.id, SECTION_BODY],
    );
    // The ask-leg fixture: a synthetic SERVED corpus embedding row (sourceUrl absent →
    // provenance-clean under the belt). Deleted outright in afterAll.
    await owner.query(
      `INSERT INTO embeddings (user_id, source_type, source_id, chunk_index, content, served, metadata)
       VALUES (NULL, 'commentary', $1, 0, $2, true,
               '{"author":"QA Ask Author","sourceTitle":"QA Ask Work","work":"qa-searchbelt-ask"}'::jsonb)`,
      [EMBED_SOURCE_ID, EMBED_CONTENT],
    );

    // TWO studies, one clipping each, so one shared-token search returns one row per leg.
    const readerStudy = await createStudy(USER, 'Reader-leg study');
    readerStudyId = readerStudy.id;
    const fromSection = await insertClippingFromSection(USER, readerStudyId, {
      sectionId: Number(sec.rows[0]!.id),
    });
    expect(fromSection.ok, 'fixture: the section clipping must save while the work is published').toBe(true);

    const askStudy = await createStudy(USER, 'Ask-leg study');
    askStudyId = askStudy.id;
    const fromEmbedding = await insertClippingFromEmbedding(USER, askStudyId, { sourceId: EMBED_SOURCE_ID });
    expect(fromEmbedding.ok, 'fixture: the ask clipping must save while the row is served').toBe(true);
  }, 60_000);

  afterAll(async () => {
    if (!owner) return;
    const attempt = async (label: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (e) {
        console.error(`[teardown] ${label} failed: ${(e as Error).message}`);
      }
    };
    await attempt('quarantine seeded source', () =>
      owner!.query(`UPDATE sources SET status = 'quarantined' WHERE slug LIKE 'qa-searchbelt-%'`),
    );
    await attempt('synthetic embedding rows', () =>
      owner!.query(`DELETE FROM embeddings WHERE source_id LIKE 'commentary:zzqasearchbelt%'`),
    );
    await attempt('studies (cascades blocks/revisions)', () =>
      owner!.query(`DELETE FROM studies WHERE user_id LIKE 'qa-searchbelt-%'`),
    );
    await attempt('sections', () =>
      owner!.query(`DELETE FROM sections WHERE source_id IN (SELECT id FROM sources WHERE slug LIKE 'qa-searchbelt-%')`),
    );
    await attempt('sources', () => owner!.query(`DELETE FROM sources WHERE slug LIKE 'qa-searchbelt-%'`));
    await attempt('close', () => owner!.end());
  }, 60_000);

  it('BASELINE (precondition): while servable, both studies surface with real marked snippets', async () => {
    const { rows, total } = await searchStudies(USER, SHARED_TOKEN);
    expect(total).toBe(2);
    const reader = hitFor(rows, readerStudyId);
    const ask = hitFor(rows, askStudyId);
    expect(reader.state).toBe('snippet');
    expect(ask.state).toBe('snippet');
    // The headline really carries the quote and really marks the match — this is the leg that
    // proves the servable path still WORKS after the rewrite, not only that refusal refuses.
    expect(reader.state === 'snippet' && reader.snippet).toContain(`<mark>${SHARED_TOKEN}</mark>`);
    expect(reader.state === 'snippet' && reader.snippet).toContain(READER_MARKER);
    expect(ask.state === 'snippet' && ask.snippet).toContain(ASK_MARKER);
  }, 60_000);

  it('L1 reader leg: staging the work tombstones its search hit — the stored quote survives, its bytes render nowhere', async () => {
    await owner!.query(`UPDATE sources SET status = 'staged' WHERE slug = $1`, [SLUG]);
    try {
      // The belt, not a purge (F2): the quote is still IN study_blocks while search denies it.
      const stored = await owner!.query<{ quote: string }>(
        `SELECT quote FROM study_blocks WHERE study_id = $1 AND kind = 'clipping'`,
        [readerStudyId],
      );
      expect(stored.rows[0]!.quote, 'precondition: quote still stored — the render rule denies it').toBe(SECTION_BODY);

      const { rows } = await searchStudies(USER, SHARED_TOKEN);
      const reader = hitFor(rows, readerStudyId);
      expect(reader.state, 'staged source ⇒ tombstone hit').toBe('tombstone');
      expect(reader.state === 'tombstone' && reader.attribution?.author, 'attribution kept').toBe('QA Belt Author');
      // The whole result set — every field of every hit — is free of the withdrawn bytes.
      expect(JSON.stringify(rows), 'withdrawn quote bytes must not appear anywhere in the results').not.toContain(READER_MARKER);
      // The OTHER leg is untouched: the ask-keyed study still snippets.
      expect(hitFor(rows, askStudyId).state, 'the ask-leg hit must stay live').toBe('snippet');
    } finally {
      await owner!.query(`UPDATE sources SET status = 'published' WHERE slug = $1`, [SLUG]);
    }
  }, 60_000);

  it('L2 ask leg: unserving the embedding row tombstones its search hit; the reader leg stays live', async () => {
    await owner!.query(`UPDATE embeddings SET served = false WHERE source_id = $1`, [EMBED_SOURCE_ID]);
    try {
      const { rows } = await searchStudies(USER, SHARED_TOKEN);
      const ask = hitFor(rows, askStudyId);
      expect(ask.state, 'unserved row ⇒ tombstone hit').toBe('tombstone');
      expect(JSON.stringify(rows), 'unserved quote bytes must not appear anywhere in the results').not.toContain(ASK_MARKER);
      expect(hitFor(rows, readerStudyId).state, 'the reader-leg hit must stay live').toBe('snippet');
    } finally {
      await owner!.query(`UPDATE embeddings SET served = true WHERE source_id = $1`, [EMBED_SOURCE_ID]);
    }
  }, 60_000);
});
