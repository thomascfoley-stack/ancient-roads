// S-2 / S-3 / S-10 — THE TOMBSTONE: a clipping whose source is no longer servable renders as
// attribution + "no longer available in the library" — no quote, no link.
//
// What this suite guarantees:
//   S-2  Both key legs re-checked against the LIVE corpus (design §2.4): stage the work out from
//        under a section-keyed clipping and it tombstones; unserve the embedding row under a
//        source_id-keyed clipping and it tombstones. The stored quote surviving in the DB while
//        the render denies it is the F2 belt working — asserted, not assumed.
//   S-3  Coverage of BOTH row shapes — section-less (ask path, source_id only) and source_id-less
//        (reader path, section_id only) — and FAIL-CLOSED: the lookup is made to throw (a
//        malformed BIGINT key forces a real cast error, no mocks) and every keyed clipping
//        tombstones, failedClosed=true.
//   S-10 The render rule is proven on a real surface: exportStudyMarkdown (lib/study-export.ts —
//        the one shipped render path P1 owns) emits attribution + TOMBSTONE_NOTICE for the
//        tombstone, never the quote bytes, never a link. The on-screen rule is the SAME
//        blockRenderState, asserted directly.
//
// Pins S-2/S-3/S-10 (docs/STUDY_DOCS_DESIGN.md §8). Motivated by finding F2 (§3) and the
// ask-history audit's F-4: the library is not static (2026-08-06: two works quarantined back
// out, 1,484 rows unserved) — without a render-time re-check that fails closed, a work
// withdrawn for licensing keeps serving its text to whoever saved it, forever.
//
// Red-proof: docs/evidence/study-docs-p2/clipping-tombstone.log — (a) blockRenderState mutated to
// ignore the resolution → S-2/S-3 cases watched RED; (b) the catch in resolveServability mutated
// to rethrow → the fail-closed case watched RED. Both reverted; suite then green.
//
// Owner-seeded + dev-guarded (a synthetic served embedding row and a published QA work; both
// removed in afterAll, prefix-swept, the source forced out of 'published' before deletion — the
// 2026-07-19 Gate B lesson; license is an ALLOWED_LICENSES value so even residue cannot fail it).

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createStudy,
  insertClippingFromEmbedding,
  insertClippingFromSection,
  listBlocks,
  type StudyBlock,
} from '@/lib/studies';
import {
  blockRenderState,
  isTombstone,
  resolveServability,
  TOMBSTONE_NOTICE,
  type ServabilityKeyed,
  type ServabilityResolution,
} from '@/lib/servability';
import { exportStudyMarkdown } from '@/lib/study-export';
import { ensureDbEnv, seedOwnerUrl } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';

const USER = `qa-tombstone-${Date.now()}`;
const SLUG = `qa-tombstone-${Date.now()}`;
const SECTION_TOKEN = `zzqatombsec${Date.now()}`;
const SECTION_BODY = `QA tombstone section body ${SECTION_TOKEN} — withdrawn after the save.`;
const EMBED_SOURCE_ID = `commentary:zzqatomb${Date.now()}:1:QA Tomb`;
const EMBED_CONTENT = `QA ask-surface chunk zzqatombemb${Date.now()} — unserved after the save.`;

ensureDbEnv();
const ownerConn = seedOwnerUrl();
const appConn = process.env.APP_DATABASE_URL;

let owner: pg.Client | undefined;
let studyId = '';
let sectionId = 0;

const SKIP = announceSkip(
  'S-2/S-3/S-10 — the servability re-check and the tombstone',
  [
    { name: 'APP_DATABASE_URL (app_runtime via requireDbInCi)', present: Boolean(appConn) },
    { name: 'DATABASE_URL (owner seed connection via seedOwnerUrl)', present: Boolean(ownerConn) },
  ],
  'the tombstone: fail-closed re-check on both key legs, attribution kept, quote and link dropped',
);

/** The doc-page read + re-check, exactly as a render path assembles them. */
async function readAndResolve(): Promise<{ blocks: StudyBlock[]; resolution: ServabilityResolution }> {
  const blocks = await listBlocks(USER, studyId);
  const resolution = await resolveServability(blocks);
  return { blocks, resolution };
}

const sectionBlockOf = (blocks: StudyBlock[]) => blocks.find((b) => b.section_id !== null)!;
const sourceBlockOf = (blocks: StudyBlock[]) => blocks.find((b) => b.source_id !== null)!;

describe.skipIf(SKIP)('S-2/S-3/S-10 — the servability re-check and the tombstone', () => {
  beforeAll(async () => {
    owner = new pg.Client({ connectionString: ownerConn!, ssl: { rejectUnauthorized: false } });
    await owner.connect();
    const { rows } = await owner.query<{ id: string }>(
      `INSERT INTO sources (slug, title, author, source_type, tradition, era, license, provenance, status)
       VALUES ($1, 'QA Tombstone Work', 'QA Tomb Author', 'commentary', 'qa', 'qa', 'Public Domain', '{}', 'published')
       RETURNING id`,
      [SLUG],
    );
    const sec = await owner.query<{ id: string }>(
      `INSERT INTO sections (source_id, ordinal, unit_ordinal, heading, body) VALUES ($1, 1, 1, 'QA tomb heading', $2)
       RETURNING id`,
      [rows[0]!.id, SECTION_BODY],
    );
    sectionId = Number(sec.rows[0]!.id);
    // The ask-leg fixture: a synthetic SERVED corpus embedding row (sourceUrl absent →
    // provenance-clean under the belt). Deleted outright in afterAll.
    await owner.query(
      `INSERT INTO embeddings (user_id, source_type, source_id, chunk_index, content, served, metadata)
       VALUES (NULL, 'commentary', $1, 0, $2, true,
               '{"author":"QA Ask Author","sourceTitle":"QA Ask Work","work":"qa-tombstone-ask"}'::jsonb)`,
      [EMBED_SOURCE_ID, EMBED_CONTENT],
    );

    const study = await createStudy(USER, 'Tombstone QA');
    studyId = study.id;
    const fromSection = await insertClippingFromSection(USER, studyId, { sectionId });
    expect(fromSection.ok, 'fixture: the section clipping must save while the work is published').toBe(true);
    const fromEmbedding = await insertClippingFromEmbedding(USER, studyId, { sourceId: EMBED_SOURCE_ID });
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
      owner!.query(`UPDATE sources SET status = 'quarantined' WHERE slug LIKE 'qa-tombstone-%'`),
    );
    await attempt('synthetic embedding rows', () =>
      owner!.query(`DELETE FROM embeddings WHERE source_id LIKE 'commentary:zzqatomb%'`),
    );
    await attempt('studies (cascades blocks/revisions)', () =>
      owner!.query(`DELETE FROM studies WHERE user_id LIKE 'qa-tombstone-%'`),
    );
    await attempt('sections', () =>
      owner!.query(`DELETE FROM sections WHERE source_id IN (SELECT id FROM sources WHERE slug LIKE 'qa-tombstone-%')`),
    );
    await attempt('sources', () => owner!.query(`DELETE FROM sources WHERE slug LIKE 'qa-tombstone-%'`));
    await attempt('close', () => owner!.end());
  }, 60_000);

  it('BASELINE (precondition): while servable, BOTH clippings resolve and render as clippings', async () => {
    const { blocks, resolution } = await readAndResolve();
    expect(blocks).toHaveLength(2);
    expect(resolution.failedClosed).toBe(false);
    expect(resolution.servableSectionIds.has(String(sectionId))).toBe(true);
    expect(resolution.servableSourceIds.has(EMBED_SOURCE_ID)).toBe(true);
    expect(blockRenderState(sectionBlockOf(blocks), resolution)).toBe('clipping');
    expect(blockRenderState(sourceBlockOf(blocks), resolution)).toBe('clipping');
  }, 60_000);

  it('S-2 reader leg: staging the work tombstones the section-keyed clipping — attribution kept, quote not rendered', async () => {
    await owner!.query(`UPDATE sources SET status = 'staged' WHERE slug = $1`, [SLUG]);
    try {
      const { blocks, resolution } = await readAndResolve();
      const tomb = sectionBlockOf(blocks);
      const live = sourceBlockOf(blocks);

      // The belt (F2): the stored quote SURVIVES in the DB — the render rule, not a purge, is
      // what denies it here. A purge-only design would have nothing to assert at this line.
      expect(tomb.quote, 'precondition: the quote is still stored (belt, not purge)').toBe(SECTION_BODY);
      expect(isTombstone(tomb), 'no purge ran — this is not the data-state tombstone').toBe(false);
      expect(blockRenderState(tomb, resolution), 'staged source ⇒ tombstone render').toBe('tombstone');

      // S-3, shape coverage: the OTHER leg (source_id-only, ask shape) is untouched by this leg.
      expect(blockRenderState(live, resolution), 'the ask-leg clipping must stay live').toBe('clipping');

      // S-10 on a real render surface: the export shows attribution + notice, never the bytes,
      // never a link.
      const md = exportStudyMarkdown({ title: 'Tombstone QA' }, blocks, resolution);
      expect(md).toContain('QA Tomb Author');
      expect(md).toContain(TOMBSTONE_NOTICE);
      expect(md, 'the withdrawn text must not render').not.toContain(SECTION_TOKEN);
      const tombLine = md.split('\n').find((l) => l.includes(TOMBSTONE_NOTICE))!;
      expect(tombLine, 'a tombstone offers NO link').not.toMatch(/]\(|\/work\//);
      expect(md, 'the live clipping still renders its bytes').toContain(EMBED_CONTENT);
    } finally {
      await owner!.query(`UPDATE sources SET status = 'published' WHERE slug = $1`, [SLUG]);
    }
  }, 60_000);

  it('S-2 ask leg: unserving the embedding row tombstones the source_id-keyed clipping', async () => {
    await owner!.query(`UPDATE embeddings SET served = false WHERE source_id = $1`, [EMBED_SOURCE_ID]);
    try {
      const { blocks, resolution } = await readAndResolve();
      expect(blockRenderState(sourceBlockOf(blocks), resolution), 'unserved row ⇒ tombstone render').toBe('tombstone');
      // and the reader-leg clipping (section_id-only) is untouched by this leg
      expect(blockRenderState(sectionBlockOf(blocks), resolution), 'the section clipping must stay live').toBe('clipping');
    } finally {
      await owner!.query(`UPDATE embeddings SET served = true WHERE source_id = $1`, [EMBED_SOURCE_ID]);
    }
  }, 60_000);

  it('S-3: the re-check FAILS CLOSED — make the lookup throw, every keyed clipping tombstones', async () => {
    const { blocks } = await readAndResolve();
    // A malformed BIGINT key forces a real cast error inside the section leg — no mocks.
    const poisoned: ServabilityKeyed[] = [
      ...blocks,
      { kind: 'clipping', section_id: 'not-a-bigint', source_id: null, quote: 'q', attribution: { author: 'QA' } },
    ];
    const resolution = await resolveServability(poisoned); // logs the error by design
    expect(resolution.failedClosed, 'a lookup error must be flagged, not silently empty').toBe(true);
    expect(resolution.servableSectionIds.size).toBe(0);
    expect(resolution.servableSourceIds.size).toBe(0);
    // Fail closed means EVERY keyed clipping tombstones — including the ones that are in fact
    // servable right now. No unlicensed text renders because the check path broke.
    expect(blockRenderState(sectionBlockOf(blocks), resolution)).toBe('tombstone');
    expect(blockRenderState(sourceBlockOf(blocks), resolution)).toBe('tombstone');
  }, 60_000);

  it('S-3: the two key universes are independent — each leg alone decides its own rows', async () => {
    const sectionOnly: ServabilityKeyed = {
      kind: 'clipping', section_id: '42', source_id: null, quote: 'q', attribution: { author: 'QA' },
    };
    const sourceOnly: ServabilityKeyed = {
      kind: 'clipping', section_id: null, source_id: 'commentary:x:1:Y', quote: 'q', attribution: { author: 'QA' },
    };
    const res: ServabilityResolution = {
      servableSectionIds: new Set(['42']),
      servableSourceIds: new Set(),
      failedClosed: false,
    };
    expect(blockRenderState(sectionOnly, res), 'section leg confirms ⇒ live').toBe('clipping');
    expect(blockRenderState(sourceOnly, res), 'source leg silent ⇒ tombstone (positive-form)').toBe('tombstone');
    expect(blockRenderState(sourceOnly, { ...res, servableSourceIds: new Set(['commentary:x:1:Y']) })).toBe('clipping');
    expect(blockRenderState(sectionOnly, { ...res, servableSectionIds: new Set() })).toBe('tombstone');
  });

  it('the DATA-STATE tombstone (Flow D purge shape) outranks a servable key — quote purged, attribution kept', async () => {
    const purged: ServabilityKeyed = {
      kind: 'clipping', section_id: String(sectionId), source_id: null, quote: null,
      attribution: { author: 'QA Tomb Author', work_title: 'QA Tombstone Work' },
    };
    expect(isTombstone(purged)).toBe(true);
    // Even with the section currently servable, a purged row does not re-render the quote it no
    // longer holds — the data state is tombstone (review S-K; re-hydration is an ops job, §6.5).
    const { resolution } = await readAndResolve();
    expect(resolution.servableSectionIds.has(String(sectionId)), 'precondition: section servable').toBe(true);
    expect(blockRenderState(purged, resolution)).toBe('tombstone');
    const md = exportStudyMarkdown({ title: 'Tombstone QA' }, [purged as never], resolution);
    expect(md).toContain('QA Tomb Author');
    expect(md).toContain(TOMBSTONE_NOTICE);
    expect(md.split('\n').find((l) => l.includes(TOMBSTONE_NOTICE))!, 'a tombstone offers NO link').not.toMatch(/]\(|\/work\//);
  }, 60_000);
});
