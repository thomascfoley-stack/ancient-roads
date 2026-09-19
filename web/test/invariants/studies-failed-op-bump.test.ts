// The `studies.updated_at` bump rides the change, not the absence of one (design §6.2:
// "the studies.updated_at bump rides in the same transaction").
//
// THE INVARIANT: a block op that returns 404/409 (block gone, already-tombstoned, wrong kind,
// not servable, anchor missing) does not bump its parent study's `updated_at`. `listStudies`
// orders AND cursor-paginates by `(updated_at, id)` (lib/studies.ts:281-289), so a spurious
// bump from a failed-op would reshuffle the recency list AND silently knock a study out of a
// paginating cursor window. The API contract a caller relies on — "if the call failed, your
// data is unchanged" — is broken at the study level when the bump fires on the no-op path.
//
// THE SHAPE THIS PINS BEFORE THE FIX: every block op built its `runAsUser` array as
// `[blockMutation, UPDATE studies SET updated_at = now() WHERE study exists]`. The bump was
// a FREE-STANDING trailing member, structurally unconditional — `db.ts:111-121` builds the
// array BEFORE the transaction runs, so the JS cannot read the block mutation's row count to
// gate the bump. A 0-row block mutation (no such block, already-tombstoned, wrong kind, not
// servable) left the data layer answering `false` / `{ok:false}` honestly AND the route
// answering 404/409 honestly, but the studies row had been bumped anyway inside the
// already-committed transaction. The bump gate had to move INTO the SQL of the sibling
// mutation; the JS layer has no rib against it.
//
// THE FIX (lib/studies.ts): every block op's bumped-study statement is now the `bump` leg of
// a data-modifying CTE that ALSO carries the block mutation, gated by
// `AND EXISTS (SELECT 1 FROM <sibling-CTE>)`. Same transaction (design §6.2 preserved); the
// bump fires iff the sibling block mutation matched. `insertTextBlock` is the one op that was
// always safe — its INSERT and bump already shared the same `WHERE EXISTS (studies …)` gate,
// so 0 inserts always implied 0 bump. It is untouched here, the control that proves the
// pattern is fixable in SQL. (See the long header comment in `lib/studies.ts`.)
//
// WHAT THIS SUITE ASSERTS: around each no-op call, the study's `updated_at::text` is read at
// full precision and asserted unchanged. `::text` is load-bearing (F-W1-1, measured
// 2026-08-13): the neon driver returns timestamptz as a JS Date (millisecond-truncated), so
// comparing `Date` values would lose the microseconds a buggy bump advances the row by and
// the test would pass on the unfixed code — exactly the gap that hid the bug. Reading via
// `runAsUser` casts at the DB, so the comparison is at Postgres microsecond precision. Each
// negative case is paired with a positive control that proves the legitimate op DID bump —
// a fix that silently disabled the bump entirely would fail the positive controls without
// catching the no-op gap.
//
// SCOPING NOTE (the bulk-append piece of the bug): `insertClippingsForWork` has the same
// underlying defect, but its no-op INSERT is reachable only by the source being retracted
// BETWEEN the unit-count pre-read (a PRIOR transaction) and the bulk INSERT transaction — a
// race the data layer has no deterministic table-rib against. The single-clip path
// `insertClippingFromSection` / `insertClippingFromEmbedding` exercises the identical gate
// (status='published' / served) deterministically via the bypass-no-such-SQL-key trick, so
// the clipping-engine fix is covered through those two, and the bulk-append race is noted
// in the test plan as a manual / timing-instrumented verification step.
//
// Teardown is owner-side (app_runtime holds no DELETE on the studies tables OR the corpus
// tables by design — migrations 010/110); the seeded `sources`/`sections`/`embeddings` rows
// for the clip tests are reaped here too, in dependency-safe order: quarantine the source
// FIRST so the license-stage check cannot fail the DELETE, then delete embeddings → studies
// (cascades blocks/revisions) → sections → sources, and prefix-sweep interrupted prior runs.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createStudy,
  insertClippingFromEmbedding,
  insertClippingFromSection,
  insertTextBlock,
  moveBlock,
  softDeleteBlock,
  trimBlock,
  updateTextBlock,
} from '@/lib/studies';
import { runAsUser } from '@/lib/db';
import { requireDbInCi, seedOwnerUrl } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';

// One user per run; the prefix-sweep in afterAll reaps studies (CASCADE → blocks/revisions)
// for this run AND any interrupted prior run of this suite.
const USER = `qa-bump-${Date.now()}-${randomUUID().slice(0, 8)}`;
// The clip-op corpus fixtures: one published-and-provenance-clean source + section + one
// served author-attributed embedding (sibling pattern from clipping-tombstone.test.ts).
const SLUG = `qa-bump-src-${Date.now()}-${randomUUID().slice(0, 8)}`;
const SECTION_BODY = `qa-bump section body ${randomUUID().slice(0, 8)}`;
const EMBED_SOURCE_ID = `commentary:qa-bump-emb-${Date.now()}-${randomUUID().slice(0, 8)}`;
const EMBED_CONTENT = `qa-bump embedding content ${randomUUID().slice(0, 8)}`;
// A section-source id guaranteed to match nothing in the corpus (positive BIGINT unused
// under any seeded QA source). Reads back as a number for the BIGINT comparison in the SQL.
const NO_SUCH_SECTION_ID = Number.MAX_SAFE_INTEGER;
// An embeddings-source id guaranteed to match no row, in the route's `register:key` shape so
// the routing hints' index lookup path is exercised end-to-end (the loader resolves it to
// zero rows — fail closed).
const NO_SUCH_SOURCE_ID = `commentary:qa-bump-NO-SUCH-${randomUUID()}`;

const dbUrl = requireDbInCi();
const ownerUrl = seedOwnerUrl();
const SKIP = announceSkip(
  'studies failed-op bump invariant (404/409 block ops do not bump studies.updated_at)',
  [
    { name: 'a runtime DB URL (APP_DATABASE_URL)', present: Boolean(dbUrl) },
    { name: 'DATABASE_URL (owner — teardown deletes; app_runtime holds no DELETE by design)', present: Boolean(ownerUrl) },
  ],
  'no block op bumps studies.updated_at when the block mutation touched 0 rows (the 404/409 no-op path)',
);

/** Full-precision `studies.updated_at::text` as the owner-readable baseline — see F-W1-1. */
async function updatedAtOf(userId: string, studyId: string): Promise<string> {
  const [rows] = await runAsUser(userId, (sql) => [
    sql`SELECT updated_at::text AS updated_at FROM studies WHERE id = ${studyId}`,
  ]);
  const r = (rows as { updated_at: string }[])[0];
  if (!r) throw new Error(`updatedAtOf: study ${studyId} not visible to ${userId}`);
  return r.updated_at;
}

describe.skipIf(SKIP)('studies failed-op bump invariant (404/409 block ops do not bump studies.updated_at)', () => {
  let owner: import('pg').Client | undefined;
  let sectionId = 0;

  beforeAll(async () => {
    // Seed the clip-op corpus fixtures: one published source + one provenance-clean section +
    // one served author-attributed embedding (gates the same inserts the data layer uses, so a
    // legitimate insert goes through the SAME gate the no-op case replays and EXERCISES the
    // SQL gate — not a mock).
    const { default: pg } = await import('pg');
    owner = new pg.Client({ connectionString: ownerUrl!, ssl: { rejectUnauthorized: false } });
    await owner.connect();
    const src = await owner.query<{ id: string }>(
      `INSERT INTO sources (slug, title, author, source_type, tradition, era, license, provenance, status)
       VALUES ($1, 'QA Bump Work', 'QA Bump Author', 'commentary', 'qa', 'qa', 'Public Domain', '{}', 'published')
       RETURNING id`,
      [SLUG],
    );
    const sec = await owner.query<{ id: string }>(
      `INSERT INTO sections (source_id, ordinal, unit_ordinal, heading, body) VALUES ($1, 1, 1, 'QA bump heading', $2)
       RETURNING id`,
      [src.rows[0]!.id, SECTION_BODY],
    );
    sectionId = Number(sec.rows[0]!.id);
    await owner.query(
      `INSERT INTO embeddings (user_id, source_type, source_id, chunk_index, content, served, metadata)
       VALUES (NULL, 'commentary', $1, 0, $2, true,
               jsonb_build_object('author', 'QA Bump Embed Author',
                                   'sourceTitle', 'QA Bump Embed Work',
                                   'work', 'qa-bump-embed-work'))`,
      [EMBED_SOURCE_ID, EMBED_CONTENT],
    );
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
    // Quarantine FIRST so the license-stage gate cannot fail live DELETEs below.
    await attempt('quarantine seeded source', () =>
      owner!.query(`UPDATE sources SET status = 'quarantined' WHERE slug LIKE 'qa-bump-src-%'`),
    );
    await attempt('synthetic embedding rows', () =>
      owner!.query(`DELETE FROM embeddings WHERE source_id LIKE 'commentary:qa-bump-emb-%'`),
    );
    await attempt('studies (cascades blocks/revisions)', () =>
      owner!.query(`DELETE FROM studies WHERE user_id LIKE 'qa-bump-%'`),
    );
    await attempt('sections', () =>
      owner!.query(`DELETE FROM sections WHERE source_id IN (SELECT id FROM sources WHERE slug LIKE 'qa-bump-src-%')`),
    );
    await attempt('sources', () => owner!.query(`DELETE FROM sources WHERE slug LIKE 'qa-bump-src-%'`));
    await attempt('close', () => owner!.end());
  }, 60_000);

  // ── positive control: createStudy does NOT in itself bump beyond creation; the legit op
  //    below is the baseline. Each `it` owns its own study so test order does not leak state.

  it('softDeleteBlock: legitimate delete DOES bump; second delete (already-tombstoned, route 404) does NOT', async () => {
    const study = await createStudy(USER, 'bump softDel-second');
    const inserted = await insertTextBlock(USER, study.id, 'block to tombstone');
    if (!inserted.ok) throw new Error(`seed failed: ${inserted.reason}`);
    const t0 = await updatedAtOf(USER, study.id);

    // Positive control: the first delete is a real mutation, the bump must fire.
    expect(await softDeleteBlock(USER, study.id, inserted.block.id)).toBe(true);
    const t1 = await updatedAtOf(USER, study.id);
    expect(t1, 'positive control: a legitimate delete must bump updated_at').not.toBe(t0);

    // Negative case: the second delete is a no-op (the block is already tombstoned); the
    // bump gate (EXISTS over the just-tombstoned block) must keep it false here. On the
    // unfixed code the bump fires because the study row is still alive and the trailing
    // UPDATE studies is keyed only on the study row.
    expect(await softDeleteBlock(USER, study.id, inserted.block.id)).toBe(false);
    const t2 = await updatedAtOf(USER, study.id);
    expect(t2, 'a second soft-delete (route 404) must not bump the parent study').toBe(t1);
  }, 60_000);

  it('softDeleteBlock: deleting a never-existed block (route 404) does NOT bump', async () => {
    const study = await createStudy(USER, 'bump softDel-none');
    const t0 = await updatedAtOf(USER, study.id);

    expect(await softDeleteBlock(USER, study.id, randomUUID())).toBe(false);
    const t1 = await updatedAtOf(USER, study.id);
    expect(t1, 'deleting a non-existent block (route 404) must not bump the parent study').toBe(t0);
  }, 60_000);

  it('updateTextBlock: legitimate update DOES bump; updating an already-tombstoned block (route 404) does NOT', async () => {
    const study = await createStudy(USER, 'bump updateText-tomb');
    const inserted = await insertTextBlock(USER, study.id, 'block to tombstone then edit');
    if (!inserted.ok) throw new Error(`seed failed: ${inserted.reason}`);
    const t0 = await updatedAtOf(USER, study.id);

    // Positive control: edit a live text block.
    expect(await updateTextBlock(USER, study.id, inserted.block.id, 'edited body')).toBe(true);
    const t1 = await updatedAtOf(USER, study.id);
    expect(t1, 'positive control: a legitimate edit must bump updated_at').not.toBe(t0);

    // Tombstone the block, then attempt another edit — the block UPDATE's `deleted_at IS NULL`
    // gate fails, the bump gate fails, the study must NOT bump.
    expect(await softDeleteBlock(USER, study.id, inserted.block.id)).toBe(true);
    const t1b = await updatedAtOf(USER, study.id);
    expect(await updateTextBlock(USER, study.id, inserted.block.id, 'edited again')).toBe(false);
    const t2 = await updatedAtOf(USER, study.id);
    expect(t2, 'editing a tombstoned block (route 404) must not bump the parent study').toBe(t1b);
  }, 60_000);

  it('updateTextBlock: editing a never-existed block (route 404) does NOT bump', async () => {
    const study = await createStudy(USER, 'bump updateText-none');
    const t0 = await updatedAtOf(USER, study.id);

    expect(await updateTextBlock(USER, study.id, randomUUID(), 'no such block')).toBe(false);
    const t1 = await updatedAtOf(USER, study.id);
    expect(t1, 'editing a non-existent block (route 404) must not bump the parent study').toBe(t0);
  }, 60_000);

  it('moveBlock: legitimate move DOES bump; moving a never-existed block (route 404) does NOT', async () => {
    const study = await createStudy(USER, 'bump move-none');
    const inserted = await insertTextBlock(USER, study.id, 'anchor to move');
    if (!inserted.ok) throw new Error(`seed failed: ${inserted.reason}`);
    const t0 = await updatedAtOf(USER, study.id);

    // Positive control: a real move bumps.
    const moved = await moveBlock(USER, study.id, inserted.block.id, {});
    expect(moved.ok, 'positive control: a legitimate move must succeed').toBe(true);
    if (!moved.ok) throw new Error(`unexpected reason ${moved.reason}`);
    const t1 = await updatedAtOf(USER, study.id);
    expect(t1, 'positive control: a legitimate move must bump updated_at').not.toBe(t0);

    // Negative case: a non-existent block id yields 0 rows; bump does not fire.
    const noMove = await moveBlock(USER, study.id, randomUUID(), {});
    expect(noMove.ok).toBe(false);
    if (!noMove.ok) {
      // route.ts:298 maps study_not_found to 404 "No such block."; the other reasons are 4xx
      // for different pathologies (anchor, position conflict). Here the data layer defines
      // missing-block as `study_not_found` (a long-standing naming alias; the route re-maps
      // it honestly). The contract this test pins is "false ⇒ no bump", independent of label.
      expect(['study_not_found', 'anchor_not_found', 'position_conflict']).toContain(noMove.reason);
    }
    const t2 = await updatedAtOf(USER, study.id);
    expect(t2, 'moving a non-existent block (route 404) must not bump the parent study').toBe(t1);
  }, 60_000);

  it('trimBlock: legitimate trim DOES bump; trimming a never-existed block (route 404) does NOT', async () => {
    const study = await createStudy(USER, 'bump trim-none');
    // Positive control: a real clipping trim bumps. Build the clipping from the seeded
    // servable section so the trim is a real `kind='clipping' AND quote IS NOT NULL` mutation.
    const clip = await insertClippingFromSection(USER, study.id, { sectionId });
    expect(clip.ok, 'fixture: the seeded section must be servable for the positive-control clipping').toBe(true);
    if (!clip.ok) throw new Error(`fixture failed: ${clip.reason}`);
    const t0 = await updatedAtOf(USER, study.id);

    expect(await trimBlock(USER, study.id, clip.block.id, { start: 0, end: 5 })).toBe(true);
    const t1 = await updatedAtOf(USER, study.id);
    expect(t1, 'positive control: a legitimate trim must bump updated_at').not.toBe(t0);

    // Negative case: a non-existent block id yields 0 rows on every gate.
    expect(await trimBlock(USER, study.id, randomUUID(), { start: 0, end: 5 })).toBe(false);
    const t2 = await updatedAtOf(USER, study.id);
    expect(t2, 'trimming a non-existent block (route 404) must not bump the parent study').toBe(t1);
  }, 60_000);

  it('trimBlock: trimming a text block (kind mismatch, route 404) does NOT bump', async () => {
    const study = await createStudy(USER, 'bump trim-text');
    const inserted = await insertTextBlock(USER, study.id, 'a text block — has no quote to trim');
    if (!inserted.ok) throw new Error(`seed failed: ${inserted.reason}`);
    const t0 = await updatedAtOf(USER, study.id);

    // The text block fails the `kind = 'clipping' AND quote IS NOT NULL` gate; the combined
    // CTE's `trimmed` leg matches 0 rows, so the bump gate fails.
    expect(await trimBlock(USER, study.id, inserted.block.id, { start: 0, end: 5 })).toBe(false);
    const t1 = await updatedAtOf(USER, study.id);
    expect(t1, 'trimming a text-block (route 404) must not bump the parent study').toBe(t0);
  }, 60_000);

  it('insertClippingFromSection: legitimate insert DOES bump; an unservable section id (route 409/404) does NOT', async () => {
    const study = await createStudy(USER, 'bump clip-sec-none');
    const t0 = await updatedAtOf(USER, study.id);

    // Positive control: a real insert bumps.
    const clip = await insertClippingFromSection(USER, study.id, { sectionId });
    expect(clip.ok, 'positive control: the seeded section must clip').toBe(true);
    if (!clip.ok) throw new Error(`fixture failed: ${clip.reason}`);
    const t1 = await updatedAtOf(USER, study.id);
    expect(t1, 'positive control: a legitimate clipping insert must bump updated_at').not.toBe(t0);

    // Negative case: the section id matches nothing in the corpus — the INSERT…SELECT is 0
    // rows, so the bump's `EXISTS (SELECT 1 FROM ins)` gate fails. The probe distinguishes
    // 404 SOURCE_NOT_FOUND from 409 NOT_SERVABLE afterwards; the contract pinned here is
    // "ok:false (route 404/409) AND unchanged updated_at" regardless of which 4xx.
    const noClip = await insertClippingFromSection(USER, study.id, { sectionId: NO_SUCH_SECTION_ID });
    expect(noClip.ok, 'a no-such section must fail the insert (route 404 SOURCE_NOT_FOUND)').toBe(false);
    if (!noClip.ok) expect(noClip.reason).toBe('source_not_found');
    const t2 = await updatedAtOf(USER, study.id);
    expect(t2, 'inserting a non-existent section id (route 404) must not bump the parent study').toBe(t1);
  }, 60_000);

  it('insertClippingFromEmbedding: legitimate insert DOES bump; an unknown source id (route 404) does NOT', async () => {
    const study = await createStudy(USER, 'bump clip-emb-none');
    const t0 = await updatedAtOf(USER, study.id);

    // Positive control: a real embedding clip bumps.
    const clip = await insertClippingFromEmbedding(USER, study.id, { sourceId: EMBED_SOURCE_ID });
    expect(clip.ok, 'positive control: the seeded embedding must clip').toBe(true);
    if (!clip.ok) throw new Error(`fixture failed: ${clip.reason}`);
    const t1 = await updatedAtOf(USER, study.id);
    expect(t1, 'positive control: a legitimate embedding insert must bump updated_at').not.toBe(t0);

    // Negative case: source id matches no embedding row; INSERT 0 rows; bump gate fails.
    const noClip = await insertClippingFromEmbedding(USER, study.id, { sourceId: NO_SUCH_SOURCE_ID });
    expect(noClip.ok, 'a no-such source id must fail the insert (route 404 SOURCE_NOT_FOUND)').toBe(false);
    if (!noClip.ok) expect(noClip.reason).toBe('source_not_found');
    const t2 = await updatedAtOf(USER, study.id);
    expect(t2, 'inserting a non-existent source id (route 404) must not bump the parent study').toBe(t1);
  }, 60_000);
});
