// A DOCUMENT'S NAME IS THE USER'S, NOT THE FILE SYSTEM'S.
//
// Until this, a My Works title was `sourceFilename` minus its extension, written once at
// `upload-complete` and never writable again: no PATCH on any user-corpus route, no update
// function in `documents.ts` (only create / setBlobPathname / setDocStatus / setParseResult /
// requeueForRetry / deleteDocument). Someone who uploaded `sermon-draft-FINAL-v3.docx` lived with
// that name for the life of the document, and the only way to change it was delete and re-upload —
// which re-spends the paid embedding run on bytes the system already has.
//
// The suggested-metadata chip is the same gap seen from the other side. Migration 124 extracts
// what the manuscript head appears to say ("Romans 8", "1871-03-21") and the design deliberately
// left it display-only, because "a wrong suggestion is a chip, not a renamed document"
// (my-works.tsx). That reasoning is about not renaming AUTOMATICALLY. With a rename that the user
// drives, the chip becomes what it should always have been: a suggestion you can accept.
//
// What is pinned here:
//   1. THE TITLE RULE, as a pure function, because it decides what reaches the database. One line,
//      trimmed, no control characters, never empty, bounded — and it REFUSES rather than silently
//      truncating, since a title quietly cut to 200 characters is a lie about what you typed.
//   2. THE WRITE IS USER-SCOPED. Renaming is the first user-driven UPDATE on this table; a missing
//      `user_id` predicate would let one account rename another's document, and RLS alone is not
//      what this repo trusts (SLICE_1_DATA_MODEL test 1: "verify with two accounts, not by reading
//      policy"). The second-account leg is the point of this file.
//   3. THE RENAME TOUCHES NOTHING ELSE. Not status, not attempts, not the blob, not the sections.
//      A rename that re-queued the document would re-spend a paid embedding run.
//   4. THE ROUTE'S REFUSALS: no session, wrong content-type (the CSRF floor), an unusable title,
//      an id that is not yours.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

let currentUser: { id: string; email: string } | null = null;
// Spreads the REAL @/lib/auth-failure so this mock carries every export the route imports, not
// just the ones this file thought of — held by test/invariants/session-mock-surface.test.ts.
vi.mock('@/lib/session', async () => ({
  ...(await import('@/lib/auth-failure')),
  requireUser: async () => {
    if (!currentUser) throw new Error('Unauthorized');
    return currentUser;
  },
  getUser: async () => currentUser,
}));

const { TITLE_MAX, titleVerdict, renameDocument, createDocument, getDocument } = await import(
  '@/lib/user-corpus/documents'
);
const { PATCH } = await import('@/app/api/user-corpus/documents/[id]/route');
const { runtimeDbUrl } = await import('../helpers/env');
const { announceSkip } = await import('../helpers/loud-skip');

// ── 1. the title rule — pure, so it runs everywhere ──────────────────────────────────────────

describe('the title rule', () => {
  it('trims, and keeps the words', () => {
    expect(titleVerdict('  Romans 8 — no condemnation  ')).toEqual({
      ok: true,
      title: 'Romans 8 — no condemnation',
    });
  });

  it('is ONE line: a pasted newline or tab becomes a single space, never a stored break', () => {
    // A stored newline breaks the truncating row, the <title>, and every place the name is echoed
    // back — and it arrives for free from a paste out of a document.
    expect(titleVerdict('Romans 8\n\nno condemnation')).toEqual({
      ok: true,
      title: 'Romans 8 no condemnation',
    });
    expect(titleVerdict('a\tb')).toEqual({ ok: true, title: 'a b' });
  });

  it('refuses an empty title, and whitespace is empty', () => {
    for (const raw of ['', '   ', '\n\t ']) {
      expect(titleVerdict(raw), `"${raw}" was accepted`).toEqual({ ok: false, reason: 'empty' });
    }
  });

  it('refuses a non-string outright — the body is untrusted input', () => {
    for (const raw of [undefined, null, 42, {}, ['a']]) {
      expect(titleVerdict(raw)).toEqual({ ok: false, reason: 'empty' });
    }
  });

  it(`REFUSES past ${TITLE_MAX} rather than truncating — a silent cut is a lie about what you typed`, () => {
    expect(titleVerdict('a'.repeat(TITLE_MAX))).toEqual({ ok: true, title: 'a'.repeat(TITLE_MAX) });
    expect(titleVerdict('a'.repeat(TITLE_MAX + 1))).toEqual({ ok: false, reason: 'too_long' });
  });

  it('measures length AFTER normalising, so padding cannot push a good title over', () => {
    const padded = `  ${'a'.repeat(TITLE_MAX)}  `;
    expect(titleVerdict(padded)).toEqual({ ok: true, title: 'a'.repeat(TITLE_MAX) });
  });
});

// ── 2/3/4. the write and the route, against the real database ────────────────────────────────

const DB = runtimeDbUrl();
announceSkip(
  'the My Works rename',
  [{ name: 'APP_DATABASE_URL', present: Boolean(DB) }],
  'renameDocument and PATCH /api/user-corpus/documents/[id] against the real database',
);

const RUN = `rename-${Date.now().toString(36)}`;
const OWNER = { id: `${RUN}-owner`, email: 'owner@example.com' };
const OTHER = { id: `${RUN}-other`, email: 'other@example.com' };

function patch(id: string, body: unknown, contentType: string | null = 'application/json'): Request {
  return new Request(`http://localhost/api/user-corpus/documents/${id}`, {
    method: 'PATCH',
    headers: contentType ? { 'content-type': contentType } : {},
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe.skipIf(!DB)('renaming a document', () => {
  let docId = '';
  let otherId = '';

  beforeAll(async () => {
    currentUser = OWNER;
    const mine = await createDocument(OWNER.id, {
      title: 'sermon-draft-FINAL-v3',
      filename: 'sermon-draft-FINAL-v3.docx',
      byteSize: 1234,
      checksum: `${RUN}-owner-sum`,
      mimeType: 'docx',
    });
    docId = mine.id;
    const theirs = await createDocument(OTHER.id, {
      title: 'not yours',
      filename: 'not-yours.docx',
      byteSize: 99,
      checksum: `${RUN}-other-sum`,
      mimeType: 'docx',
    });
    otherId = theirs.id;
  });

  afterAll(async () => {
    const { deleteDocument } = await import('@/lib/user-corpus/documents');
    if (docId) await deleteDocument(OWNER.id, docId).catch(() => {});
    if (otherId) await deleteDocument(OTHER.id, otherId).catch(() => {});
    currentUser = null;
  });

  it('renames, and the new name is what comes back on the next read', async () => {
    const updated = await renameDocument(OWNER.id, docId, 'Romans 8 — no condemnation');
    expect(updated?.title).toBe('Romans 8 — no condemnation');
    expect((await getDocument(OWNER.id, docId))?.title).toBe('Romans 8 — no condemnation');
  });

  it('touches NOTHING else — a rename must not re-queue a document and re-spend its embedding', async () => {
    const before = await getDocument(OWNER.id, docId);
    const after = await renameDocument(OWNER.id, docId, 'A different name');
    expect(after).not.toBeNull();
    for (const field of ['status', 'attempts', 'blobUrl', 'checksum', 'byteSize', 'createdAt', 'docType'] as const) {
      expect(after![field], `the rename changed ${field}`).toEqual(before![field]);
    }
    // updated_at is the one thing it SHOULD move.
    expect(Date.parse(after!.updatedAt)).toBeGreaterThanOrEqual(Date.parse(before!.updatedAt));
  });

  it('CANNOT rename another account’s document, and does not report that one exists', async () => {
    const before = await getDocument(OTHER.id, otherId);
    expect(await renameDocument(OWNER.id, otherId, 'stolen')).toBeNull();
    expect((await getDocument(OTHER.id, otherId))?.title, 'the other account’s title changed').toBe(before!.title);
  });

  it('returns null for an id that does not exist at all', async () => {
    expect(await renameDocument(OWNER.id, '00000000-0000-4000-8000-000000000000', 'x')).toBeNull();
  });

  describe('PATCH /api/user-corpus/documents/[id]', () => {
    it('renames through the route and returns the updated document', async () => {
      currentUser = OWNER;
      const res = await PATCH(patch(docId, { title: 'The Good Shepherd' }) as never, ctx(docId));
      expect(res.status).toBe(200);
      expect(((await res.json()) as { document: { title: string } }).document.title).toBe('The Good Shepherd');
    });

    it('401s with no session, and writes nothing', async () => {
      currentUser = null;
      const res = await PATCH(patch(docId, { title: 'by a stranger' }) as never, ctx(docId));
      expect(res.status).toBe(401);
      currentUser = OWNER;
      expect((await getDocument(OWNER.id, docId))?.title).toBe('The Good Shepherd');
    });

    it('refuses a body that is not application/json — the CSRF floor', async () => {
      currentUser = OWNER;
      const res = await PATCH(patch(docId, { title: 'x' }, 'text/plain') as never, ctx(docId));
      expect(res.status).toBe(400);
      expect((await getDocument(OWNER.id, docId))?.title).toBe('The Good Shepherd');
    });

    it('refuses an unusable title, and says which way it was unusable', async () => {
      currentUser = OWNER;
      const empty = await PATCH(patch(docId, { title: '   ' }) as never, ctx(docId));
      expect(empty.status).toBe(400);
      expect(JSON.stringify(await empty.json())).toMatch(/name|title/i);

      const long = await PATCH(patch(docId, { title: 'a'.repeat(TITLE_MAX + 1) }) as never, ctx(docId));
      expect(long.status).toBe(400);
      expect(JSON.stringify(await long.json())).toMatch(new RegExp(String(TITLE_MAX)));

      expect((await getDocument(OWNER.id, docId))?.title).toBe('The Good Shepherd');
    });

    it('refuses a body that is not JSON at all, rather than throwing', async () => {
      currentUser = OWNER;
      const res = await PATCH(patch(docId, 'not json') as never, ctx(docId));
      expect(res.status).toBe(400);
    });

    it('404s on another account’s id — the same answer as an id that does not exist', async () => {
      currentUser = OWNER;
      const theirs = await PATCH(patch(otherId, { title: 'stolen' }) as never, ctx(otherId));
      const nobody = await PATCH(
        patch('00000000-0000-4000-8000-000000000000', { title: 'x' }) as never,
        ctx('00000000-0000-4000-8000-000000000000'),
      );
      expect(theirs.status).toBe(404);
      expect(nobody.status).toBe(404);
      // Indistinguishable: telling the two apart confirms an id exists to someone who cannot read it.
      expect(await theirs.json()).toEqual(await nobody.json());
    });
  });
});
