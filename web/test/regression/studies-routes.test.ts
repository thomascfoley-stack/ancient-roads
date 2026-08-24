// Studies routes end-to-end (handler → lib/studies → RLS + belts → dev DB), session mocked at
// the requireUser seam — the plans-routes pattern (task 1.3's acceptance: boundary validation,
// client-supplied quote/attribution → 400, DISTINCT error codes; the /api/chats blanket-401
// bare-catch is the defect this suite exists to keep out). The deep S-1…S-14 invariant suite is
// P2's (STUDY_DOCS_BUILD.md); this pins the ROUTE CONTRACT the P2 swarm codes against.

import { afterAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { requireDbInCi } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';
import { sweepQaResidue } from '../helpers/qa-residue';

const testUser = `qa-study-routes-${Date.now()}`;
// Mutable holder so individual cases can sign out (401 path) and sign back in.
const session: { user: { id: string; email: string } | null } = {
  user: { id: testUser, email: 'qa@example.test' },
};
vi.mock('@/lib/session', async () => ({
  // D43: routes answer auth failures through authFailureResponse, which tells an auth-SERVICE
  // outage (503) from an absent session (401). The real helper lives in lib/auth-failure, which
  // imports nothing but api-error, so it loads here without the Neon Auth SDK.
  ...(await vi.importActual<typeof import('@/lib/auth-failure')>('@/lib/auth-failure')),
  requireUser: async () => {
    if (!session.user) throw new Error('Unauthorized');
    return session.user;
  },
  currentUser: async () => session.user,
}));

import { GET as listStudies, POST as createStudy } from '@/app/api/studies/route';
import { DELETE as deleteStudy, PATCH as patchStudy } from '@/app/api/studies/[id]/route';
import {
  DELETE as deleteBlock,
  PATCH as patchBlocks,
  POST as postBlocks,
} from '@/app/api/studies/[id]/blocks/route';
// The API GETs were DELETED 2026-08-17 (zero consumers; returned stored quotes with no
// servability re-check — see studies-api-no-get.test.ts). The read contract this suite pins
// therefore lives on the feed route, which is the shipped paginated read.
import { GET as feedGet } from '@/app/studies/[id]/feed/route';

const dbUrl = requireDbInCi();
const SKIP = announceSkip(
  'Studies routes (handler → lib → dev DB, session mocked)',
  [{ name: 'a runtime DB URL (APP_DATABASE_URL)', present: Boolean(dbUrl) }],
  'the studies API contract: auth/validation/provenance error codes and the golden path',
);

const req = (method: string, body?: unknown, path = 'http://localhost/api/studies') =>
  new NextRequest(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { 'Content-Type': 'application/json' },
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const code = async (res: Response) => ((await res.json()) as { error?: { code?: string } }).error?.code;

const VALID_BUT_FOREIGN = '00000000-0000-4000-8000-000000000000';

describe.skipIf(SKIP)('Studies routes (handler → lib → dev DB, session mocked)', () => {
  // Prefix sweep via the owner connection (check-test-residue's rule: fix the teardown;
  // app_runtime holds no DELETE on studies — by design — so cleanup is an owner action).
  //
  // This was already a prefix sweep and was already correct SQL — `study_blocks` and
  // `study_block_revisions` both cascade from `studies`, verified against the live schema. What it
  // lacked was a VOICE: `if (!owner) return` made "no owner credentials" indistinguishable from
  // "swept", so on any tree without a `DATABASE_URL` in web/.env.local this cleanup silently did
  // nothing at all and the residue accrued run after run with no signal. Routed through the shared
  // helper so the skip announces itself and every reap is reported.
  afterAll(async () => {
    await sweepQaResidue(['qa-study-routes-'], ['studies']);
  });

  it('401 UNAUTHENTICATED when there is no session — and ONLY then', async () => {
    session.user = null;
    try {
      const res = await listStudies(req('GET'));
      expect(res.status).toBe(401);
      expect(await code(res)).toBe('UNAUTHENTICATED');
    } finally {
      session.user = { id: testUser, email: 'qa@example.test' };
    }
  });

  it('400 INVALID_REQUEST on a malformed study id (before any DB work)', async () => {
    // Was a GET case; the GET is deleted, and the id check runs before body parsing on PATCH,
    // so the same "no DB work" property is what this now proves.
    const res = await patchStudy(req('PATCH', { title: 'x' }, 'http://localhost/api/studies/nope'), ctx('nope'));
    expect(res.status).toBe(400);
    expect(await code(res)).toBe('INVALID_REQUEST');
  });

  it('404 NOT_FOUND (never 401) for a well-formed id the caller does not own', async () => {
    const patch = await patchStudy(req('PATCH', { title: 'x' }), ctx(VALID_BUT_FOREIGN));
    expect(patch.status).toBe(404);
    expect(await code(patch)).toBe('NOT_FOUND');
    const del = await deleteStudy(req('DELETE'), ctx(VALID_BUT_FOREIGN));
    expect(del.status).toBe(404);
  });

  it('golden path: create → rename/pin → text block → list in order → delete block → delete study', async () => {
    const created = await createStudy(req('POST', { title: 'Route hand-test' }));
    expect(created.status).toBe(201);
    const { study } = (await created.json()) as { study: { id: string } };

    const listed = await listStudies(req('GET'));
    expect(listed.status).toBe(200);
    expect(((await listed.json()) as { studies: { id: string }[] }).studies.some((s) => s.id === study.id)).toBe(true);

    const renamed = await patchStudy(req('PATCH', { title: 'Renamed', pinned: true }), ctx(study.id));
    expect(renamed.status).toBe(200);

    const b1 = await postBlocks(req('POST', { kind: 'text', body: 'First.' }), ctx(study.id));
    expect(b1.status).toBe(201);
    const block1 = ((await b1.json()) as { block: { id: string } }).block;
    const b2 = await postBlocks(req('POST', { kind: 'text', body: 'Second.' }), ctx(study.id));
    expect(b2.status).toBe(201);

    // Read back through the feed — the shipped paginated read (the raw-blocks GET is deleted).
    const page = await feedGet(req('GET', undefined, `http://localhost/studies/${study.id}/feed`), ctx(study.id));
    expect(page.status).toBe(200);
    const { blocks } = (await page.json()) as { blocks: { body: string | null }[] };
    expect(blocks.map((b) => b.body)).toEqual(['First.', 'Second.']);

    const edited = await patchBlocks(req('PATCH', { op: 'update_text', blockId: block1.id, body: 'First, edited.' }), ctx(study.id));
    expect(edited.status).toBe(200);

    const gone = await deleteBlock(
      req('DELETE', undefined, `http://localhost/api/studies/${study.id}/blocks?blockId=${block1.id}`),
      ctx(study.id),
    );
    expect(gone.status).toBe(200);

    const deleted = await deleteStudy(req('DELETE'), ctx(study.id));
    expect(deleted.status).toBe(200);
    // Deleted means gone on every surviving verb: PATCH 404s (updateStudy filters
    // deleted_at IS NULL), and the feed pages the tombstoned study as an empty list.
    expect((await patchStudy(req('PATCH', { title: 'x' }), ctx(study.id))).status).toBe(404);
    const afterDelete = await feedGet(req('GET', undefined, `http://localhost/studies/${study.id}/feed`), ctx(study.id));
    expect(afterDelete.status).toBe(200);
    expect(((await afterDelete.json()) as { blocks: unknown[] }).blocks).toEqual([]);
  });

  it('S-1: client-supplied quote or attribution is rejected 400 on POST, whatever else the body carries', async () => {
    for (const body of [
      { kind: 'clipping', sectionId: 1, quote: 'evil injected text' },
      { kind: 'clipping', sectionId: 1, attribution: { author: 'Fake' } },
      { kind: 'text', body: 'hi', quote: 'evil' },
      { quote: 'evil, no kind at all' },
    ]) {
      const res = await postBlocks(req('POST', body), ctx(VALID_BUT_FOREIGN));
      expect(res.status).toBe(400);
      expect(await code(res)).toBe('INVALID_REQUEST');
    }
  });

  it('S-1 on PATCH too: ops cannot smuggle server-written fields', async () => {
    const res = await patchBlocks(
      req('PATCH', { op: 'update_text', blockId: VALID_BUT_FOREIGN, body: 'x', quote: 'evil' }),
      ctx(VALID_BUT_FOREIGN),
    );
    expect(res.status).toBe(400);
    expect(await code(res)).toBe('INVALID_REQUEST');
  });

  it('400 on unknown kind/op, double keys, and missing anchors', async () => {
    expect((await postBlocks(req('POST', { kind: 'mystery' }), ctx(VALID_BUT_FOREIGN))).status).toBe(400);
    expect(
      (await postBlocks(req('POST', { kind: 'clipping', sectionId: 1, sourceId: 'commentary:x:1' }), ctx(VALID_BUT_FOREIGN))).status,
    ).toBe(400);
    expect((await postBlocks(req('POST', { kind: 'clipping' }), ctx(VALID_BUT_FOREIGN))).status).toBe(400);
    expect((await patchBlocks(req('PATCH', { op: 'move', blockId: VALID_BUT_FOREIGN }), ctx(VALID_BUT_FOREIGN))).status).toBe(400);
    expect((await patchBlocks(req('PATCH', { op: 'levitate', blockId: VALID_BUT_FOREIGN }), ctx(VALID_BUT_FOREIGN))).status).toBe(400);
  });

  it('licensing refusal is 409 NOT_SERVABLE, distinct from 404', async () => {
    const { getDb } = await import('@/lib/db');
    const staged = (await getDb()`
      SELECT s.id::text AS id FROM sections s JOIN sources src ON src.id = s.source_id
      WHERE src.status = 'staged' LIMIT 1`) as { id: string }[];
    if (staged.length === 0) {
      console.warn('⚠ NOT RUN (visibly): no staged section on this target — the 409 case cannot execute here.');
      return;
    }
    const created = await createStudy(req('POST', { title: 'Refusal case' }));
    const { study } = (await created.json()) as { study: { id: string } };
    const res = await postBlocks(req('POST', { kind: 'clipping', sectionId: Number(staged[0]!.id) }), ctx(study.id));
    expect(res.status).toBe(409);
    expect(await code(res)).toBe('NOT_SERVABLE');
  });
});
