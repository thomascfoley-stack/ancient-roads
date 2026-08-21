// Studies SURFACE routes end-to-end (handler → lib/studies + lib/servability → dev DB), session
// mocked at the requireUser seam — the studies-routes pattern, extended to the two routes wave 2
// added beside the doc page (W3's workarounds for the P1 gaps F-W3-2 / F-W3-3):
//
//   GET /studies/[id]/feed   — paginated blocks, each row carrying the server-computed
//                              renderState (the servability re-check the bare blocks route lacks)
//   GET /studies/[id]/export — the study as a download (.docx, or the print view for PDF);
//                              a render path, so the same fail-closed re-check runs before
//                              serialization. Markdown was removed 2026-08-21 (owner ruling;
//                              the 2026-08-12 ruling already said "Word or PDF").
//
// What this pins, beyond the P1 route contract (studies-routes.test.ts):
//   - renderState is present per block on every feed page, text AND clipping rows;
//   - a tombstoned clipping carries NO quote (data-state: the Flow D purge shape, quote NULL)
//     and the belt case (source staged out from under a stored quote) flips renderState to
//     'tombstone' on the feed — the re-check runs per page, not just on the doc's first page;
//   - export is a real download (content-type, attachment filename) whose tombstones render
//     attribution + the shared notice with NO quote bytes and NO link (S-10 on the wire);
//   - accurate codes: 401 only when signed out, 400 on malformed input, 404 for a foreign
//     study, 422 EXPORT_TOO_LARGE past EXPORT_MAX_BLOCKS (a truncated export is a lie about
//     the document, so the ceiling is an error, not a shortened file).
//
// Owner-seeded + dev-guarded (a published QA work, staged/restored inside the belt cases;
// purge shape applied directly to the block row, exactly what scripts/study-clipping-purge.mjs
// issues). Teardown quarantines the source before deleting it (the 2026-07-19 Gate B lesson).
// Red-proofs: docs/evidence/study-docs-p2/w6.log.

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ensureDbEnv, requireDbInCi, seedOwnerUrl } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';
import { BLOCKS_PAGE_MAX, EXPORT_MAX_BLOCKS } from '@/lib/studies';
import { TOMBSTONE_NOTICE } from '@/lib/servability';

const testUser = `qa-study-surface-${Date.now()}`;
const SLUG = `qa-surface-${Date.now()}`;
const SECTION_TOKEN = `zzqasurface${Date.now()}`;
const SECTION_BODY = `QA surface section body ${SECTION_TOKEN} — staged and purged under the route.`;

// Mutable holder so individual cases can sign out (401 path) and sign back in.
const session: { user: { id: string; email: string } | null } = {
  user: { id: testUser, email: 'qa@example.test' },
};
vi.mock('@/lib/session', () => ({
  requireUser: async () => {
    if (!session.user) throw new Error('Unauthorized');
    return session.user;
  },
  currentUser: async () => session.user,
}));

import { GET as feedGet } from '@/app/studies/[id]/feed/route';
import { GET as exportGet } from '@/app/studies/[id]/export/route';
import { POST as createStudy } from '@/app/api/studies/route';
import { POST as postBlocks } from '@/app/api/studies/[id]/blocks/route';

ensureDbEnv();
const dbUrl = requireDbInCi();
const ownerConn = seedOwnerUrl();

const SKIP = announceSkip(
  'Studies surface routes (feed + export, handler → lib → dev DB, session mocked)',
  [
    { name: 'a runtime DB URL (APP_DATABASE_URL)', present: Boolean(dbUrl) },
    { name: 'an owner seed URL (DATABASE_URL via seedOwnerUrl)', present: Boolean(ownerConn) },
  ],
  'the feed/export contract: per-block renderState, tombstone payload shape, download headers, accurate codes',
);

const VALID_BUT_FOREIGN = '00000000-0000-4000-8000-000000000000';

const req = (method: string, body?: unknown, path = 'http://localhost/api/studies') =>
  new NextRequest(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { 'Content-Type': 'application/json' },
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const code = async (res: Response) => ((await res.json()) as { error?: { code?: string } }).error?.code;
const feedReq = (id: string, query = '') => req('GET', undefined, `http://localhost/studies/${id}/feed${query}`);
// Format is REQUIRED since the 2026-08-21 markdown removal — the old `md` default was a relic of
// the route's origin as the serializer workaround. Tests that exercise ownership/licensing use
// 'pdf' (the print view: text/html, so content is assertable without unzipping a .docx).
const exportReq = (id: string, format?: string) =>
  req('GET', undefined, `http://localhost/studies/${id}/export${format ? `?format=${format}` : ''}`);

interface FeedBlock {
  id: string;
  position: string;
  kind: 'text' | 'clipping';
  body: string | null;
  work_slug: string | null;
  ordinal: number | null;
  quote: string | null;
  attribution: { author?: string; work_title?: string; reference?: string } | null;
  renderState: 'text' | 'clipping' | 'tombstone';
}

async function feed(id: string, query = ''): Promise<{ blocks: FeedBlock[]; nextAfterPosition: string | null }> {
  const res = await feedGet(feedReq(id, query), ctx(id));
  expect(res.status).toBe(200);
  return (await res.json()) as { blocks: FeedBlock[]; nextAfterPosition: string | null };
}

/** Create a study through the route handler and return its id. */
async function newStudy(title: string): Promise<string> {
  const res = await createStudy(req('POST', { title }));
  expect(res.status).toBe(201);
  return ((await res.json()) as { study: { id: string } }).study.id;
}

let owner: pg.Client | undefined;
let sectionId = 0;

describe.skipIf(SKIP)('Studies surface routes (feed + export, handler → lib → dev DB, session mocked)', () => {
  beforeAll(async () => {
    owner = new pg.Client({ connectionString: ownerConn!, ssl: { rejectUnauthorized: false } });
    await owner.connect();
    const { rows } = await owner.query<{ id: string }>(
      `INSERT INTO sources (slug, title, author, source_type, tradition, era, license, provenance, status)
       VALUES ($1, 'QA Surface Work', 'QA Surface Author', 'commentary', 'qa', 'qa', 'Public Domain', '{}', 'published')
       RETURNING id`,
      [SLUG],
    );
    const sec = await owner.query<{ id: string }>(
      `INSERT INTO sections (source_id, ordinal, unit_ordinal, heading, body) VALUES ($1, 1, 1, 'QA surface heading', $2)
       RETURNING id`,
      [rows[0]!.id, SECTION_BODY],
    );
    sectionId = Number(sec.rows[0]!.id);
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
      owner!.query(`UPDATE sources SET status = 'quarantined' WHERE slug LIKE 'qa-surface-%'`),
    );
    await attempt('studies (cascades blocks/revisions)', () =>
      owner!.query(`DELETE FROM studies WHERE user_id LIKE 'qa-study-surface-%'`),
    );
    await attempt('sections', () =>
      owner!.query(`DELETE FROM sections WHERE source_id IN (SELECT id FROM sources WHERE slug LIKE 'qa-surface-%')`),
    );
    await attempt('sources', () => owner!.query(`DELETE FROM sources WHERE slug LIKE 'qa-surface-%'`));
    await attempt('close', () => owner!.end());
  }, 60_000);

  it('401 UNAUTHENTICATED on both surface routes when there is no session — and ONLY then', async () => {
    session.user = null;
    try {
      const f = await feedGet(feedReq(VALID_BUT_FOREIGN), ctx(VALID_BUT_FOREIGN));
      expect(f.status).toBe(401);
      expect(await code(f)).toBe('UNAUTHENTICATED');
      const x = await exportGet(exportReq(VALID_BUT_FOREIGN, 'pdf'), ctx(VALID_BUT_FOREIGN));
      expect(x.status).toBe(401);
      expect(await code(x)).toBe('UNAUTHENTICATED');
    } finally {
      session.user = { id: testUser, email: 'qa@example.test' };
    }
  });

  it('400 INVALID_REQUEST on a malformed study id, a bad limit, and a bad cursor', async () => {
    expect((await feedGet(feedReq('nope'), ctx('nope'))).status).toBe(400);
    expect((await exportGet(exportReq('nope'), ctx('nope'))).status).toBe(400);
    expect((await feedGet(feedReq(VALID_BUT_FOREIGN, '?limit=0'), ctx(VALID_BUT_FOREIGN))).status).toBe(400);
    expect(
      (await feedGet(feedReq(VALID_BUT_FOREIGN, `?limit=${BLOCKS_PAGE_MAX + 1}`), ctx(VALID_BUT_FOREIGN))).status,
    ).toBe(400);
    expect((await feedGet(feedReq(VALID_BUT_FOREIGN, '?afterPosition=not!base62'), ctx(VALID_BUT_FOREIGN))).status).toBe(400);
  });

  it('feed: paginates with renderState present on EVERY block, in document order', async () => {
    const id = await newStudy('Feed pagination');
    for (const body of ['One.', 'Two.', 'Three.']) {
      expect((await postBlocks(req('POST', { kind: 'text', body }), ctx(id))).status).toBe(201);
    }

    const page1 = await feed(id, '?limit=2');
    expect(page1.blocks).toHaveLength(2);
    expect(page1.blocks.map((b) => b.body)).toEqual(['One.', 'Two.']);
    expect(page1.nextAfterPosition).not.toBeNull();
    for (const b of page1.blocks) expect(b.renderState, 'every row carries the server decision').toBe('text');

    // The cursor contract: nextAfterPosition is null exactly when the page came back SHORT of
    // the requested limit — so the follow-up request carries the same limit.
    const page2 = await feed(id, `?limit=2&afterPosition=${encodeURIComponent(page1.nextAfterPosition!)}`);
    expect(page2.blocks.map((b) => b.body)).toEqual(['Three.']);
    expect(page2.nextAfterPosition).toBeNull();
    for (const b of page2.blocks) expect(b.renderState).toBe('text');
  });

  it('feed: a foreign or missing study pages as an empty list (the P1 blocks route’s rule)', async () => {
    const res = await feedGet(feedReq(VALID_BUT_FOREIGN), ctx(VALID_BUT_FOREIGN));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { blocks: unknown[]; nextAfterPosition: string | null };
    expect(body.blocks).toEqual([]);
    expect(body.nextAfterPosition).toBeNull();
  });

  it('feed: live clipping renders with its quote; staging the source tombstones it (the belt, per page)', async () => {
    const id = await newStudy('Feed belt');
    expect((await postBlocks(req('POST', { kind: 'clipping', sectionId }), ctx(id))).status).toBe(201);

    const live = await feed(id);
    const clip = live.blocks.find((b) => b.kind === 'clipping')!;
    expect(clip.renderState).toBe('clipping');
    expect(clip.quote).toBe(SECTION_BODY);
    expect(clip.attribution?.author).toBe('QA Surface Author');

    await owner!.query(`UPDATE sources SET status = 'staged' WHERE slug = $1`, [SLUG]);
    try {
      const tomb = (await feed(id)).blocks.find((b) => b.kind === 'clipping')!;
      expect(tomb.renderState, 'the re-check runs on the feed, not just the doc first page').toBe('tombstone');
      expect(tomb.attribution?.author, 'a tombstone keeps attribution').toBe('QA Surface Author');
    } finally {
      await owner!.query(`UPDATE sources SET status = 'published' WHERE slug = $1`, [SLUG]);
    }
  });

  it('feed: a tombstoned clipping (Flow D purge shape) carries NO quote and NO link field', async () => {
    const id = await newStudy('Feed purge shape');
    expect((await postBlocks(req('POST', { kind: 'clipping', sectionId }), ctx(id))).status).toBe(201);

    // The purge job's own statement (scripts/study-clipping-purge.mjs): quote NULL, attribution kept.
    await owner!.query(
      `UPDATE study_blocks SET quote = NULL, cleared_at = now()
       WHERE study_id = $1 AND kind = 'clipping' AND quote IS NOT NULL`,
      [id],
    );
    try {
      const tomb = (await feed(id)).blocks.find((b) => b.kind === 'clipping')!;
      expect(tomb.renderState).toBe('tombstone');
      expect(tomb.quote, 'a tombstoned clipping carries no quote bytes').toBeNull();
      expect(tomb.attribution?.author, 'attribution survives the purge').toBe('QA Surface Author');
      // No link: the payload carries no URL field at all — the client builds links only in the
      // 'clipping' branch, off work_slug, and renderState 'tombstone' forbids that branch (S-10).
      expect(Object.keys(tomb)).not.toContain('url');
      expect(Object.keys(tomb)).not.toContain('href');
    } finally {
      // Residue with a NULL quote would re-tombstone other cases' clips of the same section only
      // if they shared the study — they do not; the study itself is swept in afterAll.
    }
  });

  it('export: the print view — title, text verbatim, live clipping quoted + attributed', async () => {
    const id = await newStudy('Route Surface Export');
    expect((await postBlocks(req('POST', { kind: 'text', body: 'My own words.' }), ctx(id))).status).toBe(201);
    expect((await postBlocks(req('POST', { kind: 'clipping', sectionId }), ctx(id))).status).toBe(201);

    const res = await exportGet(exportReq(id, 'pdf'), ctx(id));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');

    const html = await res.text();
    expect(html).toContain('<h1>Route Surface Export</h1>');
    expect(html).toContain('My own words.');
    expect(html).toContain(SECTION_TOKEN);
    expect(html).toContain('QA Surface Author');
  });

  it('export: a .docx download — content type and filename', async () => {
    const id = await newStudy('Route Surface Docx');
    expect((await postBlocks(req('POST', { kind: 'text', body: 'My own words.' }), ctx(id))).status).toBe(201);

    const res = await exportGet(exportReq(id, 'docx'), ctx(id));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('officedocument.wordprocessingml');
    const disposition = res.headers.get('content-disposition') ?? '';
    expect(disposition).toContain('attachment');
    expect(disposition).toContain('route-surface-docx.docx');
  });

  it('export: markdown is REFUSED, and so is a missing format (owner 2026-08-21)', async () => {
    const id = await newStudy('Route Surface No Md');
    expect((await exportGet(exportReq(id, 'md'), ctx(id))).status).toBe(400);
    expect((await exportGet(exportReq(id), ctx(id))).status).toBe(400);
  });

  it('export: a tombstone renders attribution + the notice — no quote bytes, no link (S-10 on the wire)', async () => {
    const id = await newStudy('Export Tombstone');
    expect((await postBlocks(req('POST', { kind: 'clipping', sectionId }), ctx(id))).status).toBe(201);

    await owner!.query(`UPDATE sources SET status = 'staged' WHERE slug = $1`, [SLUG]);
    try {
      const res = await exportGet(exportReq(id, 'pdf'), ctx(id));
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('QA Surface Author');
      expect(html).toContain(TOMBSTONE_NOTICE);
      expect(html, 'the withdrawn text must not be in the file').not.toContain(SECTION_TOKEN);
      const tombLine = html.split('\n').find((l) => l.includes(TOMBSTONE_NOTICE))!;
      expect(tombLine, 'a tombstone offers NO link').not.toMatch(/<a |href=|\/work\//);
    } finally {
      await owner!.query(`UPDATE sources SET status = 'published' WHERE slug = $1`, [SLUG]);
    }
  });

  it('export: 404 NOT_FOUND (never 401, never an empty file) for a study the caller does not own', async () => {
    const res = await exportGet(exportReq(VALID_BUT_FOREIGN, 'pdf'), ctx(VALID_BUT_FOREIGN));
    expect(res.status).toBe(404);
    expect(await code(res)).toBe('NOT_FOUND');
  });

  it('export: 422 EXPORT_TOO_LARGE past EXPORT_MAX_BLOCKS — never a silently truncated file', async () => {
    const id = await newStudy('Export Ceiling');
    // Seed the blocks directly (owner): EXPORT_MAX_BLOCKS + 1 live text rows in one statement.
    // Position keys only need uniqueness inside the study — 'z<g>' is base-62 and distinct.
    await owner!.query(
      `INSERT INTO study_blocks (study_id, user_id, position, kind, body)
       SELECT $1, $2, 'z' || g, 'text', 'x' FROM generate_series(1, $3) g`,
      [id, testUser, EXPORT_MAX_BLOCKS + 1],
    );
    const res = await exportGet(exportReq(id, 'pdf'), ctx(id));
    expect(res.status).toBe(422);
    expect(await code(res)).toBe('EXPORT_TOO_LARGE');
  }, 60_000);
});
