// S-1 — PROVENANCE IS STRUCTURAL: the server is the only writer of a clipping's quote/attribution.
//
// What this suite guarantees:
//   1. A POST or PATCH to /api/studies/[id]/blocks carrying `quote` or `attribution` is rejected
//      400 INVALID_REQUEST — whatever kind/op the body otherwise carries — and writes NOTHING
//      (the study stays empty afterwards, proven by reading it back).
//   2. The other direction is proven too: a legitimate clipping POST carries only a REFERENCE
//      (sectionId), and the stored row's quote/attribution are byte-identical to the corpus row —
//      snapshotted by the single INSERT…SELECT in lib/studies.ts, with the licensing gate in the
//      same statement. The 400s above are therefore not "the route is broken"; the write path works.
//   3. The TABLE backs the route: migration 110's five study_blocks CHECKs make the smuggled and
//      malformed shapes unrepresentable — probed here directly, as the owner role, each violation
//      expecting SQLSTATE 23514.
//
// Pins invariant S-1 (docs/STUDY_DOCS_DESIGN.md §8). Motivated by finding F3 (§3): a stored quote
// rendered later bypasses every live licensing predicate, so there must be NO code path on which
// client-supplied quote text reaches a table — the same hazard the ask-history audit filed as
// F-4/F-8 one surface over.
//
// Red-proof: docs/evidence/study-docs-p2/clipping-provenance.log — the route guard was deleted and
// case 1 watched RED (201 where 400 was asserted), then each CHECK was dropped inside a rolled-back
// transaction and its violating INSERT watched to SUCCEED (the probe asserts rejection, so it is
// RED against the dropped constraint). Both breaks reverted; suite then green.
//
// Owner-seeded + dev-guarded: the golden-path clipping needs a real published corpus row, which
// app_runtime may not INSERT (010). Everything seeded is torn down in afterAll — including on
// failure — with the published-boundary suite's belt-and-braces shape (a leaked PUBLISHED QA row
// failed the shared licensing Gate B on 2026-07-19; license below is an ALLOWED_LICENSES value so
// even residue cannot).

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ensureDbEnv, seedOwnerUrl } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';

const USER = `qa-clip-prov-${Date.now()}`;
const SLUG = `qa-clip-prov-${Date.now()}`;
const TOKEN = `zzqaclip${Date.now()}`;
const SECTION_BODY = `QA provenance section body ${TOKEN} — server-snapshotted, never client-sent.`;

// Session mocked at the requireUser seam — the studies-routes pattern.
const session: { user: { id: string; email: string } | null } = {
  user: { id: USER, email: 'qa@example.test' },
};
vi.mock('@/lib/session', () => ({
  requireUser: async () => {
    if (!session.user) throw new Error('Unauthorized');
    return session.user;
  },
  currentUser: async () => session.user,
}));

import { POST as createStudy } from '@/app/api/studies/route';
import { PATCH as patchBlocks, POST as postBlocks } from '@/app/api/studies/[id]/blocks/route';
// The raw-blocks GET was DELETED 2026-08-17 (zero consumers; returned stored quotes with no
// servability re-check — studies-api-no-get.test.ts pins the absence). The read-back below
// goes through the feed route, the shipped servability-checked read.
import { GET as feedGet } from '@/app/studies/[id]/feed/route';

ensureDbEnv();
const ownerConn = seedOwnerUrl();
const appConn = process.env.APP_DATABASE_URL;

let owner: pg.Client | undefined;
let studyId = '';
let sectionId = 0;

const SKIP = announceSkip(
  'S-1 — the server is the only writer of clipping quote/attribution',
  [
    { name: 'APP_DATABASE_URL (app_runtime via requireDbInCi)', present: Boolean(appConn) },
    { name: 'DATABASE_URL (owner seed connection via seedOwnerUrl)', present: Boolean(ownerConn) },
  ],
  'clipping provenance: route-level 400 on client-supplied quote/attribution, the server-side INSERT…SELECT as the only writer, and the table-level CHECKs',
);

const req = (method: string, body?: unknown, path = 'http://localhost/api/studies') =>
  new NextRequest(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { 'Content-Type': 'application/json' },
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const code = async (res: Response) => ((await res.json()) as { error?: { code?: string } }).error?.code;

describe.skipIf(SKIP)('S-1 — the server is the only writer of clipping quote/attribution', () => {
  beforeAll(async () => {
    owner = new pg.Client({ connectionString: ownerConn!, ssl: { rejectUnauthorized: false } });
    await owner.connect();
    const { rows } = await owner.query<{ id: string }>(
      `INSERT INTO sources (slug, title, author, source_type, tradition, era, license, provenance, status)
       VALUES ($1, 'QA Provenance Work', 'QA Author', 'commentary', 'qa', 'qa', 'Public Domain', '{}', 'published')
       RETURNING id`,
      [SLUG],
    );
    const sec = await owner.query<{ id: string }>(
      `INSERT INTO sections (source_id, ordinal, unit_ordinal, heading, body) VALUES ($1, 1, 1, 'QA heading', $2)
       RETURNING id`,
      [rows[0]!.id, SECTION_BODY],
    );
    sectionId = Number(sec.rows[0]!.id);

    const created = await createStudy(req('POST', { title: 'Provenance QA' }));
    expect(created.status, 'fixture: the study must be creatable').toBe(201);
    studyId = ((await created.json()) as { study: { id: string } }).study.id;
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
    // Force OUT of 'published' before deletion, sweep by PREFIX so interrupted earlier runs are
    // reaped too (the 2026-07-19 Gate B lesson). Studies hard-delete cascades to blocks/revisions.
    await attempt('quarantine seeded source', () =>
      owner!.query(`UPDATE sources SET status = 'quarantined' WHERE slug LIKE 'qa-clip-prov-%'`),
    );
    await attempt('studies (cascades blocks/revisions)', () =>
      owner!.query(`DELETE FROM studies WHERE user_id LIKE 'qa-clip-prov-%'`),
    );
    await attempt('sections', () =>
      owner!.query(`DELETE FROM sections WHERE source_id IN (SELECT id FROM sources WHERE slug LIKE 'qa-clip-prov-%')`),
    );
    await attempt('sources', () => owner!.query(`DELETE FROM sources WHERE slug LIKE 'qa-clip-prov-%'`));
    await attempt('close', () => owner!.end());
  }, 60_000);

  it('S-1: client-supplied quote or attribution is 400 INVALID_REQUEST on POST — and NOTHING is written', async () => {
    for (const body of [
      { kind: 'clipping', sectionId, quote: 'client-smuggled quote' },
      { kind: 'clipping', sourceId: 'commentary:qa:1:Smuggler', attribution: { author: 'Fake' } },
      { kind: 'text', body: 'my own words', quote: 'smuggled onto a text block' },
      { kind: 'clipping_work', slug: SLUG, attribution: { author: 'Fake' } },
      { quote: 'no kind at all' },
      { attribution: { author: 'no kind at all' } },
    ]) {
      const res = await postBlocks(
        req('POST', body, `http://localhost/api/studies/${studyId}/blocks`),
        ctx(studyId),
      );
      expect(res.status, `body keys ${JSON.stringify(Object.keys(body))} must be refused`).toBe(400);
      expect(await code(res)).toBe('INVALID_REQUEST');
    }
    // Rejected means rejected: the study is still empty. (This case runs before the golden path
    // below, same file-order dependence as the published-boundary suite.) Read back through the
    // feed — with zero blocks, resolveServability short-circuits, so this adds no corpus query.
    const page = await feedGet(
      req('GET', undefined, `http://localhost/studies/${studyId}/feed`),
      ctx(studyId),
    );
    expect(page.status).toBe(200);
    const { blocks } = (await page.json()) as { blocks: unknown[] };
    expect(blocks, 'a request refused for smuggled fields must write NOTHING').toEqual([]);
  }, 60_000);

  it('S-1 on PATCH too: no op may smuggle server-written fields', async () => {
    const res = await patchBlocks(
      req('PATCH', { op: 'update_text', blockId: '00000000-0000-4000-8000-000000000000', body: 'x', quote: 'evil' }),
      ctx(studyId),
    );
    expect(res.status).toBe(400);
    expect(await code(res)).toBe('INVALID_REQUEST');
  });

  it('the server INSERT…SELECT is the ONLY writer: the stored row snapshots the corpus byte-exactly', async () => {
    const res = await postBlocks(
      req('POST', { kind: 'clipping', sectionId }, `http://localhost/api/studies/${studyId}/blocks`),
      ctx(studyId),
    );
    expect(res.status, 'the legitimate reference-only write must succeed').toBe(201);
    const { block } = (await res.json()) as {
      block: {
        quote: string | null;
        attribution: { author?: string; work_title?: string; reference?: string } | null;
        section_id: string | null;
        source_id: string | null;
        kind: string;
      };
    };
    expect(block.kind).toBe('clipping');
    expect(block.quote, 'the quote is the corpus bytes, not anything the client sent').toBe(SECTION_BODY);
    expect(block.attribution).toMatchObject({
      author: 'QA Author',
      work_title: 'QA Provenance Work',
      reference: 'QA heading',
    });
    expect(block.section_id).toBe(String(sectionId));
    expect(block.source_id).toBeNull();
  }, 60_000);

  it('the TABLE refuses the smuggled/malformed shapes too — migration 110 CHECKs, probed as owner (23514)', async () => {
    const violations: { label: string; sql: string }[] = [
      {
        label: 'CHECK 1: a text block with no body',
        sql: `INSERT INTO study_blocks (study_id, user_id, position, kind, body)
              VALUES ($1, $2, 'V', 'text', NULL)`,
      },
      {
        label: 'CHECK 3: a text block carrying smuggled clipping fields',
        sql: `INSERT INTO study_blocks (study_id, user_id, position, kind, body, quote, attribution, source_id)
              VALUES ($1, $2, 'V', 'text', 'fine', 'smuggled quote', '{"author":"Fake"}'::jsonb, 'commentary:qa:1:X')`,
      },
      {
        label: 'CHECK 2: a clipping that is nothing (no quote, no cleared_at)',
        sql: `INSERT INTO study_blocks (study_id, user_id, position, kind, source_id, attribution)
              VALUES ($1, $2, 'V', 'clipping', 'commentary:qa:1:X', '{"author":"QA"}'::jsonb)`,
      },
      {
        label: 'CHECK 4: a clipping with no resolvable key (neither source_id nor section_id)',
        sql: `INSERT INTO study_blocks (study_id, user_id, position, kind, quote, attribution)
              VALUES ($1, $2, 'V', 'clipping', 'q', '{"author":"QA"}'::jsonb)`,
      },
      {
        label: 'CHECK 5: a clipping without attribution',
        sql: `INSERT INTO study_blocks (study_id, user_id, position, kind, source_id, quote)
              VALUES ($1, $2, 'V', 'clipping', 'commentary:qa:1:X', 'q')`,
      },
    ];
    for (const v of violations) {
      await owner!.query('BEGIN');
      let err: { code?: string } | null = null;
      try {
        await owner!.query(v.sql, [studyId, USER]);
      } catch (e) {
        err = e as { code?: string };
      } finally {
        await owner!.query('ROLLBACK');
      }
      expect(err?.code, `${v.label} — must be refused by a CHECK`).toBe('23514');
    }
    // Control: a well-formed row IS admitted (then rolled back) — so the 23514s above are the
    // CHECKs firing, not some unrelated failure (missing FK, RLS, bad position).
    await owner!.query('BEGIN');
    let controlErr: { code?: string } | null = null;
    try {
      await owner!.query(
        `INSERT INTO study_blocks (study_id, user_id, position, kind, source_id, quote, attribution)
         VALUES ($1, $2, 'a', 'clipping', 'commentary:qa:1:X', 'q', '{"author":"QA"}'::jsonb)`,
        [studyId, USER],
      );
    } catch (e) {
      controlErr = e as { code?: string };
    } finally {
      await owner!.query('ROLLBACK');
    }
    expect(controlErr, `control row must be admitted (got ${controlErr?.code ?? 'none'})`).toBeNull();
  }, 60_000);
});
