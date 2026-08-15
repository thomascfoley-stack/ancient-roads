// Study Docs P1 — the §4.1 hand-test harness (ownership · boundary · provenance), executed
// against the dev branch through the REAL data layer (web/src/lib/studies.ts → runAsUser →
// @neondatabase/serverless) under the LEAST-PRIVILEGE app_runtime role — so every grant the
// migration claims is exercised end-to-end (the 032/039/106 lesson), and RLS + belts both bind.
//
// Run from web/ (so the driver resolves) with the dev app-role URL:
//   cd web && DATABASE_URL=<app_runtime dev url> OWNER_URL=<owner dev url> \
//     npx tsx ../docs/evidence/study-docs-p1/handtest-harness.mts
//
// OWNER_URL is used ONLY for (a) truth-reads that must bypass RLS (proving tombstones exist
// rather than merely being invisible), (b) driving scripts/study-clipping-purge.mjs, and
// (c) the teardown — app_runtime holds no DELETE on these tables, BY DESIGN, so cleanup is an
// owner action exactly as it would be in ops. Test users carry the `qa-` prefix so
// scripts/check-test-residue.mjs can SEE a leaked row if teardown ever breaks.
//
// Output is committed as handtest-run.log beside this file. Exit 0 = every assertion held.

import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { getDb, runAsUser } from '../../../web/src/lib/db';
import {
  createStudy,
  getStudy,
  getStudyWithBlocks,
  insertClippingFromEmbedding,
  insertClippingFromSection,
  insertClippingsForWork,
  insertTextBlock,
  listBlocks,
  listStudies,
  moveBlock,
  softDeleteBlock,
  softDeleteStudy,
  updateStudy,
  updateTextBlock,
  countWorkUnits,
  WHOLE_WORK_BLOCK_CAP,
  type StudyBlock,
} from '../../../web/src/lib/studies';
import { resolveServability, blockRenderState } from '../../../web/src/lib/servability';
import { exportStudyMarkdown } from '../../../web/src/lib/study-export';

const A = 'qa-study-p1-a';
const B = 'qa-study-p1-b';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function note(msg: string): void {
  console.log(`NOTE  ${msg}`);
}

const owner = new pg.Client({ connectionString: process.env.OWNER_URL, ssl: { rejectUnauthorized: false } });
await owner.connect();

try {
  // ── fixtures, read from the corpus as app_runtime (SELECT is granted) ───────────────────────
  const sql = getDb();
  const [cleanSection] = (await sql`
    SELECT s.id::text AS id, s.body FROM sections s JOIN sources src ON src.id = s.source_id
    WHERE src.status = 'published' AND s.source_url IS NULL LIMIT 1`) as { id: string; body: string }[];
  const [stagedSection] = (await sql`
    SELECT s.id::text AS id FROM sections s JOIN sources src ON src.id = s.source_id
    WHERE src.status = 'staged' LIMIT 1`) as { id: string }[];
  const [forbiddenSection] = (await sql`
    SELECT s.id::text AS id FROM sections s JOIN sources src ON src.id = s.source_id
    WHERE src.status = 'published' AND lower(s.source_url) LIKE '%biblehub.com%' LIMIT 1`) as { id: string }[];
  const [servedEmb] = (await sql`
    SELECT e.source_id FROM embeddings e
    WHERE e.user_id IS NULL AND e.served AND e.metadata->>'author' IS NOT NULL
      AND (e.metadata->>'sourceUrl' IS NULL OR lower(e.metadata->>'sourceUrl') NOT LIKE '%biblehub%')
    LIMIT 1`) as { source_id: string }[];
  const [unservedEmb] = (await sql`
    SELECT e.source_id FROM embeddings e
    WHERE e.user_id IS NULL AND NOT e.served LIMIT 1`) as { source_id: string }[];
  const [smallWork] = (await sql`
    SELECT src.slug, count(DISTINCT COALESCE(s.unit_ordinal, -s.ordinal))::int AS units
    FROM sections s JOIN sources src ON src.id = s.source_id
    WHERE src.status = 'published' AND s.source_url IS NULL
    GROUP BY src.slug HAVING count(DISTINCT COALESCE(s.unit_ordinal, -s.ordinal)) BETWEEN 2 AND 20
    ORDER BY units LIMIT 1`) as { slug: string; units: number }[];
  const [hugeWork] = (await sql`
    SELECT src.slug FROM sections s JOIN sources src ON src.id = s.source_id
    WHERE src.status = 'published'
    GROUP BY src.slug HAVING count(DISTINCT COALESCE(s.unit_ordinal, -s.ordinal)) > ${WHOLE_WORK_BLOCK_CAP}
    LIMIT 1`) as { slug: string }[];
  note(`fixtures: cleanSection=${cleanSection?.id} staged=${stagedSection?.id ?? 'none'} forbidden=${forbiddenSection?.id ?? 'none'} servedEmb=${servedEmb?.source_id} unservedEmb=${unservedEmb?.source_id ?? 'none'} smallWork=${smallWork?.slug}(${smallWork?.units}) hugeWork=${hugeWork?.slug ?? 'none'}`);
  if (!cleanSection || !servedEmb) throw new Error('dev corpus lacks basic fixtures; cannot hand-test');

  // ── studies: create / ownership / boundary ──────────────────────────────────────────────────
  const sA = await createStudy(A, 'Rahab (hand-test A)');
  const sB = await createStudy(B, 'Perseverance (hand-test B)');
  check('createStudy returns the row', sA.id.length === 36 && sA.title.includes('Rahab'));

  check('H1: B cannot read A’s study', (await getStudy(B, sA.id)) === null);
  check('H1: A reads A’s study', (await getStudy(A, sA.id))?.id === sA.id);
  const aList = await listStudies(A);
  check('H1: A’s list holds A’s study only', aList.some((s) => s.id === sA.id) && !aList.some((s) => s.id === sB.id));

  check('H2: B cannot rename A’s study', (await updateStudy(B, sA.id, { title: 'stolen' })) === null);
  check('H2: B cannot delete A’s study', (await softDeleteStudy(B, sA.id)) === false);
  const pinned = await updateStudy(A, sA.id, { pinned: true });
  check('pin sets pinned_at', pinned?.pinned_at !== null);
  const unpinned = await updateStudy(A, sA.id, { pinned: false });
  check('unpin clears pinned_at', unpinned?.pinned_at === null);

  // ── text blocks: order, move, revisions ─────────────────────────────────────────────────────
  const t1 = await insertTextBlock(A, sA.id, 'First thoughts.');
  const t3 = await insertTextBlock(A, sA.id, 'Third thoughts.');
  if (!t1.ok || !t3.ok) throw new Error('text insert failed');
  const t2 = await insertTextBlock(A, sA.id, 'Second thoughts.', { afterBlockId: t1.block.id });
  if (!t2.ok) throw new Error('insert-after failed');
  let blocks = await listBlocks(A, sA.id);
  check(
    'blocks read in (position, id) order: First, Second, Third',
    blocks.map((b) => b.body).join('|') === 'First thoughts.|Second thoughts.|Third thoughts.',
    blocks.map((b) => `${b.position}:${b.body}`).join(' '),
  );

  const beforeFirst = await insertTextBlock(A, sA.id, 'Zeroth thoughts.', { beforeBlockId: t1.block.id });
  check('insert-before lands first', beforeFirst.ok && (await listBlocks(A, sA.id))[0]!.body === 'Zeroth thoughts.');

  const moved = await moveBlock(A, sA.id, t3.block.id, { beforeBlockId: t1.block.id });
  blocks = await listBlocks(A, sA.id);
  check(
    'move re-orders: Zeroth, Third, First, Second',
    moved.ok && blocks.map((b) => b.body).join('|') === 'Zeroth thoughts.|Third thoughts.|First thoughts.|Second thoughts.',
  );

  check('update_text returns true for the owner', await updateTextBlock(A, sA.id, t1.block.id, 'First thoughts, revised.'));
  check('update_text again (second revision)', await updateTextBlock(A, sA.id, t1.block.id, 'First thoughts, re-revised.'));
  const [revRows] = await runAsUser(A, (q) => [
    q`SELECT body FROM study_block_revisions WHERE block_id = ${t1.block.id} AND user_id = ${A} ORDER BY replaced_at`,
  ]);
  const revs = revRows as { body: string }[];
  check(
    'revisions hold BOTH outgoing bodies, in order',
    revs.length === 2 && revs[0]!.body === 'First thoughts.' && revs[1]!.body === 'First thoughts, revised.',
    JSON.stringify(revs.map((r) => r.body)),
  );

  // ── boundary: B against A’s blocks (S-8 shape) ──────────────────────────────────────────────
  check('H2: B cannot insert a block into A’s study', !(await insertTextBlock(B, sA.id, 'intruder')).ok);
  check('H2: B cannot edit A’s block', (await updateTextBlock(B, sA.id, t1.block.id, 'defaced')) === false);
  check('H2: B cannot move A’s block', !(await moveBlock(B, sA.id, t1.block.id, { afterBlockId: t2.block.id })).ok);
  check('H2: B cannot delete A’s block', (await softDeleteBlock(B, sA.id, t1.block.id)) === false);
  const [afterIntrusion] = await runAsUser(A, (q) => [
    q`SELECT body FROM study_blocks WHERE id = ${t1.block.id} AND user_id = ${A}`,
  ]);
  check('A’s block text is untouched after B’s attempts', (afterIntrusion as { body: string }[])[0]!.body === 'First thoughts, re-revised.');

  // ── clippings: provenance and servability, section leg ──────────────────────────────────────
  const clip = await insertClippingFromSection(A, sA.id, { sectionId: Number(cleanSection.id), reference: 'Joshua 2' });
  check('clipping snapshots the EXACT section body server-side', clip.ok && clip.block.quote === cleanSection.body);
  check(
    'clipping attribution is server-written (author + work_title present)',
    clip.ok && typeof clip.block.attribution?.author === 'string' && typeof clip.block.attribution?.work_title === 'string',
    clip.ok ? JSON.stringify(clip.block.attribution) : JSON.stringify(clip),
  );
  const bogusSection = await insertClippingFromSection(A, sA.id, { sectionId: 999_999_999 });
  check('nonexistent section → source_not_found', !bogusSection.ok && bogusSection.reason === 'source_not_found');
  if (stagedSection) {
    const refused = await insertClippingFromSection(A, sA.id, { sectionId: Number(stagedSection.id) });
    check('STAGED work’s section → not_servable (licensing gate in the write)', !refused.ok && refused.reason === 'not_servable');
  } else note('no staged section on dev; staged-refusal case NOT RUN');
  if (forbiddenSection) {
    const refused = await insertClippingFromSection(A, sA.id, { sectionId: Number(forbiddenSection.id) });
    check('forbidden-provenance section → not_servable (belt beyond status)', !refused.ok && refused.reason === 'not_servable');
  } else note('no published biblehub-provenance section on dev; provenance-refusal case NOT RUN');
  const foreignStudyClip = await insertClippingFromSection(B, sA.id, { sectionId: Number(cleanSection.id) });
  check('H2: B cannot clip into A’s study', !foreignStudyClip.ok && foreignStudyClip.reason === 'study_not_found');

  // ── clippings: ask leg (embeddings) ─────────────────────────────────────────────────────────
  const askClip = await insertClippingFromEmbedding(A, sA.id, { sourceId: servedEmb.source_id, reference: 'from ask' });
  const [expectedChunk] = (await sql`
    SELECT e.content FROM embeddings e
    WHERE e.source_type = split_part(${servedEmb.source_id}, ':', 1) AND e.source_id = ${servedEmb.source_id}
      AND e.user_id IS NULL AND e.served
    ORDER BY e.chunk_index LIMIT 1`) as { content: string }[];
  check('ask clipping snapshots the lowest served chunk’s exact bytes', askClip.ok && askClip.block.quote === expectedChunk!.content);
  check('ask clipping carries source_id, no section_id', askClip.ok && askClip.block.source_id === servedEmb.source_id && askClip.block.section_id === null);
  if (unservedEmb) {
    const refused = await insertClippingFromEmbedding(A, sA.id, { sourceId: unservedEmb.source_id });
    check('UNSERVED embedding → not_servable', !refused.ok && refused.reason === 'not_servable');
  } else note('no unserved corpus embedding on dev; unserved-refusal case NOT RUN');
  const bogusEmb = await insertClippingFromEmbedding(A, sA.id, { sourceId: 'commentary:xxx:1:1-1:Nobody' });
  check('nonexistent embedding → source_not_found', !bogusEmb.ok && bogusEmb.reason === 'source_not_found');

  // ── whole-work append, capped ───────────────────────────────────────────────────────────────
  if (smallWork) {
    const { count } = await countWorkUnits(A, smallWork.slug);
    check('countWorkUnits matches the fixture census', count === smallWork.units, `${count} vs ${smallWork.units}`);
    const bulk = await insertClippingsForWork(A, sA.id, smallWork.slug);
    check('whole-work append inserts one block per reading unit', bulk.ok && bulk.inserted === smallWork.units, JSON.stringify(bulk));
    const all = await listBlocks(A, sA.id, { limit: 200 });
    const workBlocks = all.filter((b) => b.work_slug === smallWork.slug);
    check('every whole-work block is an attributed clipping with a quote', workBlocks.length === smallWork.units && workBlocks.every((b) => b.kind === 'clipping' && b.quote !== null && b.attribution !== null));
  } else note('no small published work on dev; whole-work happy case NOT RUN');
  if (hugeWork) {
    const refused = await insertClippingsForWork(A, sA.id, hugeWork.slug);
    check(`whole-work over ${WHOLE_WORK_BLOCK_CAP} units → work_too_large`, !refused.ok && refused.reason === 'work_too_large');
  } else note('no >cap work on dev; too-large refusal NOT RUN');
  const bogusWork = await insertClippingsForWork(A, sA.id, 'no-such-work-slug');
  check('nonexistent work → work_not_found', !bogusWork.ok && bogusWork.reason === 'work_not_found');

  // ── servability + export over what we actually wrote ───────────────────────────────────────
  const withBlocks = await getStudyWithBlocks(A, sA.id, { limit: 200 });
  const res = await resolveServability(withBlocks!.blocks);
  check('servability: the clean section leg resolves', res.servableSectionIds.has(cleanSection.id));
  check('servability: the served source leg resolves', res.servableSourceIds.has(servedEmb.source_id));
  check('servability: did not fail closed on a healthy read', res.failedClosed === false);
  const fake: StudyBlock = { ...(clip.ok ? clip.block : ({} as StudyBlock)), section_id: '999999999', source_id: null };
  check('belt: a clipping whose key does not resolve renders as tombstone', blockRenderState(fake, res) === 'tombstone');
  const md = exportStudyMarkdown(withBlocks!.study, withBlocks!.blocks, res);
  // The quote exports BLOCKQUOTED, every line '> '-prefixed — so the assertable property is the
  // first LINE of the body behind '> ', not a raw multi-line substring. (First run of this
  // harness asserted the raw slice and went red on a body starting "CHAPTER I.\n\n…" — the
  // module was right, the check was naive. Kept as a note per the look-at-the-data rule.)
  const firstLine = cleanSection.body.split('\n')[0]!.trim();
  check(
    'export contains the study title and the snapshotted quote (blockquoted)',
    md.includes('# Rahab (hand-test A)') && md.includes(`> ${firstLine}`),
  );

  // ── Flow D: purge (dry-run, then execute) and rehydrate, via the ops script ────────────────
  const clipBlockId = clip.ok ? clip.block.id : '';
  const runPurge = (args: string[]) =>
    execFileSync('node', ['scripts/study-clipping-purge.mjs', ...args], {
      cwd: '../',
      env: { ...process.env, DATABASE_URL: process.env.OWNER_URL },
      encoding: 'utf-8',
    });
  const dry = runPurge(['--section-ids', cleanSection.id]);
  console.log(dry.trim().split('\n').map((l) => `  purge│ ${l}`).join('\n'));
  const afterDry = await owner.query('SELECT quote, cleared_at FROM study_blocks WHERE id = $1', [clipBlockId]);
  check('purge DRY-RUN rolled back (quote still present)', afterDry.rows[0].quote !== null && afterDry.rows[0].cleared_at === null);

  const exec = runPurge(['--section-ids', cleanSection.id, '--execute']);
  console.log(exec.trim().split('\n').map((l) => `  purge│ ${l}`).join('\n'));
  const afterExec = await owner.query('SELECT quote, cleared_at, attribution FROM study_blocks WHERE id = $1', [clipBlockId]);
  check(
    'purge EXECUTE tombstones the data state (quote NULL, cleared_at set, attribution kept)',
    afterExec.rows[0].quote === null && afterExec.rows[0].cleared_at !== null && afterExec.rows[0].attribution !== null,
  );
  const resAfterPurge = await resolveServability((await getStudyWithBlocks(A, sA.id, { limit: 200 }))!.blocks);
  const purgedBlock = (await listBlocks(A, sA.id, { limit: 200 })).find((b) => b.id === clipBlockId)!;
  check('purged block renders as tombstone (data state)', blockRenderState(purgedBlock, resAfterPurge) === 'tombstone');

  const rehydrate = runPurge(['--mode', 'rehydrate', '--section-ids', cleanSection.id, '--execute']);
  console.log(rehydrate.trim().split('\n').map((l) => `  purge│ ${l}`).join('\n'));
  const afterRehydrate = await owner.query('SELECT quote, cleared_at FROM study_blocks WHERE id = $1', [clipBlockId]);
  check(
    'rehydrate restores the quote from the live corpus and clears cleared_at',
    afterRehydrate.rows[0].quote === cleanSection.body && afterRehydrate.rows[0].cleared_at === null,
  );

  // ── soft-delete cascade ─────────────────────────────────────────────────────────────────────
  check('softDeleteStudy returns true for the owner', await softDeleteStudy(A, sA.id));
  check('deleted study is gone from the owner’s reads', (await getStudy(A, sA.id)) === null);
  const orphans = await owner.query(
    'SELECT count(*)::int AS live FROM study_blocks WHERE study_id = $1 AND deleted_at IS NULL',
    [sA.id],
  );
  check('EVERY block was tombstoned in the same transaction (owner truth-read)', orphans.rows[0].live === 0);
} finally {
  // ── teardown: owner removes the qa- rows entirely; revisions/blocks cascade on the FK ───────
  const del = await owner.query("DELETE FROM studies WHERE user_id LIKE 'qa-study-p1-%' RETURNING id");
  const residue = await owner.query(
    `SELECT (SELECT count(*)::int FROM studies WHERE user_id LIKE 'qa-study-p1-%')
          + (SELECT count(*)::int FROM study_blocks WHERE user_id LIKE 'qa-study-p1-%')
          + (SELECT count(*)::int FROM study_block_revisions WHERE user_id LIKE 'qa-study-p1-%') AS n`,
  );
  console.log(`\nteardown: ${del.rowCount} stud(ies) hard-deleted (blocks/revisions cascade); residue rows: ${residue.rows[0].n}`);
  if (residue.rows[0].n !== 0) {
    failures++;
    console.log('FAIL  teardown left residue — check-test-residue will catch it, fix the teardown');
  }
  await owner.end();
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
