// The two /api/user-corpus/documents/[id]/* routes the D35 envelope sweep (e4542c97) missed:
// `voices` and `related`. Both awaited a DB-backed function (`traditionGap` / `relatedVoices`) and
// returned JSON with no try around it, so a Neon hiccup — connection pool exhaustion, a query
// timeout on a corpus-wide vector sweep (`related-voices.ts` documents one at 84s) — escaped the
// handler as Next's raw HTML 500 instead of the stable `{ error: { code, message } }` envelope
// (lib/api-error.ts, docs/API_ERRORS.md). The `getDocument` lookup on the same path had the same
// hole. The sibling `search` route is the fixed precedent.
//
// Fully mocked, the same pattern as db-fault-returns-envelope.test.ts: these routes' stores are
// stubbed to throw, because a source grep cannot tell you what a route RETURNS when the DB is down.

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const guardUser = vi.fn();
const getDocument = vi.fn();
const traditionGap = vi.fn();
const relatedVoices = vi.fn();

vi.mock('@/lib/user-corpus/route-guard', () => ({
  guardUser: (...a: unknown[]) => guardUser(...a),
}));
vi.mock('@/lib/user-corpus/documents', () => ({
  getDocument: (...a: unknown[]) => getDocument(...a),
}));
vi.mock('@/lib/user-corpus/tradition-gap', () => ({
  // Pass-through brand: the route stamps `corpusPredicate(LEGAL_CORPUS_FILTER)` at module load.
  // The real tripwire (and the `LEGAL_CORPUS_FILTER` wiring) is exercised by
  // tradition-gap-wiring.test.ts against the route source; here it only needs to not throw.
  corpusPredicate: (s: string) => s,
  traditionGap: (...a: unknown[]) => traditionGap(...a),
}));
vi.mock('@/lib/user-corpus/related-voices', () => ({
  relatedVoices: (...a: unknown[]) => relatedVoices(...a),
}));

const DB_FAULT = new Error('remaining connection slots are reserved');
const params = <T,>(v: T) => ({ params: Promise.resolve(v) });
const READY = { id: 'd1', status: 'ready' as const };

/** The contract: a 500 JSON body carrying error.code === 'INTERNAL', and NO leaked internal. */
async function expectEnvelope(res: Response) {
  expect(res.status).toBe(500);
  expect(res.headers.get('content-type') ?? '').toMatch(/application\/json/);
  const text = await res.text();
  const body = JSON.parse(text) as { error?: { code?: string; message?: string } };
  expect(body.error?.code).toBe('INTERNAL');
  expect(body.error?.message).toBe('Something went wrong on our end. Please try again.');
  // The envelope must NEVER carry the fault: no DB message, no connection string, no stack. A raw
  // 500 from Next would be HTML; a leaked exception would echo "remaining connection slots".
  expect(text).not.toContain('remaining connection slots');
  expect(text).not.toContain('reserved');
}

beforeEach(() => {
  vi.clearAllMocks();
  guardUser.mockResolvedValue({ denied: null, user: { id: 'u1', email: 'u@example.com' } });
  getDocument.mockResolvedValue(READY);
});

describe('voices/route — a DB fault returns the envelope, never a raw 500', () => {
  const call = (id = 'd1') =>
    import('@/app/api/user-corpus/documents/[id]/voices/route').then(
      ({ GET }) => GET(new NextRequest(`http://t/api/user-corpus/documents/${id}/voices`), params({ id })),
    );

  it('a traditionGap failure returns the envelope, not a raw exception', async () => {
    traditionGap.mockRejectedValue(DB_FAULT);
    await expectEnvelope(await call());
  });

  it('a getDocument failure returns the envelope, not a raw exception', async () => {
    getDocument.mockRejectedValue(DB_FAULT);
    await expectEnvelope(await call());
  });

  it('a ready document returns 200 with the join result and pending:false', async () => {
    traditionGap.mockResolvedValue({ voices: [], authorCount: 2, rangesConsidered: 3 });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ authorCount: 2, rangesConsidered: 3, pending: false });
  });

  it('a not-yet-ready document returns 200 pending:true and never reaches traditionGap', async () => {
    getDocument.mockResolvedValue({ id: 'd1', status: 'processing' });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ voices: [], authorCount: 0, rangesConsidered: 0, pending: true });
    expect(traditionGap).not.toHaveBeenCalled();
  });

  it('a missing document returns 404', async () => {
    getDocument.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(404);
  });
});

describe('related/route — a DB fault returns the envelope, never a raw 500', () => {
  const call = (id = 'd1') =>
    import('@/app/api/user-corpus/documents/[id]/related/route').then(
      ({ GET }) => GET(new NextRequest(`http://t/api/user-corpus/documents/${id}/related`), params({ id })),
    );

  it('a relatedVoices failure returns the envelope, not a raw exception', async () => {
    relatedVoices.mockRejectedValue(DB_FAULT);
    await expectEnvelope(await call());
  });

  it('a getDocument failure returns the envelope, not a raw exception', async () => {
    getDocument.mockRejectedValue(DB_FAULT);
    await expectEnvelope(await call());
  });

  it('a ready document returns 200 with the sweep result and pending:false', async () => {
    relatedVoices.mockResolvedValue({ voices: [], comparable: true });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ voices: [], comparable: true, pending: false });
  });

  it('a not-yet-ready document returns 200 pending:true and never reaches relatedVoices', async () => {
    getDocument.mockResolvedValue({ id: 'd1', status: 'processing' });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ voices: [], comparable: false, pending: true });
    expect(relatedVoices).not.toHaveBeenCalled();
  });

  it('a missing document returns 404', async () => {
    getDocument.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(404);
  });
});
