// Sermon → commentary matching telemetry (owner directive 2026-08-24).
//
// The directive draws a line straight through this feature, and both halves are pinned here:
//   "if they match sermon content to commentaries i should see those successes and failures and
//    errors"  →  every outcome is logged: hit, empty, pending, error.
//   "if someone types a sermon out i shouldn't see that"  →  and NONE of those log lines may
//    contain the document's title or text.
//
// The `empty` case is the one worth having a test for: a sermon that paraphrases rather than
// quoting anchors nothing and returns zero voices with nothing having gone wrong, so it is
// invisible in an error rate and would otherwise look identical to a success.
//
// Seeds that turn these red:
//   * drop the logEvent call from either route → the matching outcome tests go red.
//   * log `doc.title` or the result text in the event → the privacy test goes red.
//   * remove the try/catch → the error test goes red (the throw escapes instead of being logged).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocStatus } from '@/lib/user-corpus/types';

const { guardUser, getDocument, traditionGap, relatedVoices } = vi.hoisted(() => ({
  guardUser: vi.fn(),
  getDocument: vi.fn(),
  traditionGap: vi.fn(),
  relatedVoices: vi.fn(),
}));

vi.mock('@/lib/user-corpus/route-guard', () => ({ guardUser }));
vi.mock('@/lib/user-corpus/documents', () => ({ getDocument }));
vi.mock('@/lib/user-corpus/tradition-gap', () => ({
  traditionGap,
  corpusPredicate: (s: string) => s,
}));
vi.mock('@/lib/user-corpus/related-voices', () => ({ relatedVoices }));
vi.mock('@/lib/teacher/routing', () => ({ LEGAL_CORPUS_FILTER: '(served)' }));

// The private things a log line must never contain.
const SERMON_TITLE = 'My Easter sermon on grace';
const SERMON_TEXT = 'Brothers and sisters, consider what the Lord has done';

const ctx = { params: Promise.resolve({ id: 'doc-uuid-1' }) };
const req = {} as never;

let logged: string[] = [];

beforeEach(() => {
  logged = [];
  vi.spyOn(console, 'log').mockImplementation((line: string) => void logged.push(String(line)));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  guardUser.mockResolvedValue({ denied: null, user: { id: 'user-1' } });
  getDocument.mockResolvedValue({ id: 'doc-uuid-1', status: 'ready', title: SERMON_TITLE });
  traditionGap.mockReset();
  relatedVoices.mockReset();
});

/** The one match_outcome line this call emitted, parsed. */
function event(): Record<string, unknown> {
  const line = logged.find((l) => l.includes('"evt":"match_outcome"'));
  expect(line, `no match_outcome logged; saw: ${JSON.stringify(logged)}`).toBeDefined();
  return JSON.parse(line!) as Record<string, unknown>;
}

describe('anchor match (documents/[id]/voices) — successes, failures, errors', () => {
  it('logs a HIT with the voice count', async () => {
    traditionGap.mockResolvedValue({
      voices: [{ author: 'Calvin' }, { author: 'Gill' }], authorCount: 2, rangesConsidered: 5,
    });
    const { GET } = await import('@/app/api/user-corpus/documents/[id]/voices/route');
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const e = event();
    expect(e.kind).toBe('anchor');
    expect(e.outcome).toBe('hit');
    expect(e.voices).toBe(2);
    expect(e.rangesConsidered).toBe(5);
    expect(e.documentId).toBe('doc-uuid-1');
  });

  it('logs EMPTY — the paraphrasing-sermon case that is not an error', async () => {
    traditionGap.mockResolvedValue({ voices: [], authorCount: 0, rangesConsidered: 0 });
    const { GET } = await import('@/app/api/user-corpus/documents/[id]/voices/route');
    await GET(req, ctx);
    expect(event().outcome).toBe('empty');
  });

  it('logs ERROR and answers 500 rather than throwing', async () => {
    traditionGap.mockRejectedValue(new Error('relation "user_document_anchors" does not exist'));
    const { GET } = await import('@/app/api/user-corpus/documents/[id]/voices/route');
    const res = await GET(req, ctx);
    expect(res.status).toBe(500);
    const e = event();
    expect(e.outcome).toBe('error');
    expect(String(e.message)).toContain('user_document_anchors');
  });

  it('logs PENDING while the document is still indexing', async () => {
    getDocument.mockResolvedValue({ id: 'doc-uuid-1', status: 'processing', title: SERMON_TITLE });
    const { GET } = await import('@/app/api/user-corpus/documents/[id]/voices/route');
    await GET(req, ctx);
    expect(event().outcome).toBe('pending');
  });
});

describe('semantic match (documents/[id]/related) — successes, failures, errors', () => {
  it('logs a HIT with comparability', async () => {
    relatedVoices.mockResolvedValue({ voices: [{ author: 'Spurgeon' }], comparable: true });
    const { GET } = await import('@/app/api/user-corpus/documents/[id]/related/route');
    await GET(req, ctx);
    const e = event();
    expect(e.kind).toBe('semantic');
    expect(e.outcome).toBe('hit');
    expect(e.comparable).toBe(true);
  });

  it('logs EMPTY when nothing is near in meaning', async () => {
    relatedVoices.mockResolvedValue({ voices: [], comparable: true });
    const { GET } = await import('@/app/api/user-corpus/documents/[id]/related/route');
    await GET(req, ctx);
    expect(event().outcome).toBe('empty');
  });

  it('logs ERROR and answers 500 rather than throwing', async () => {
    relatedVoices.mockRejectedValue(new Error('vector index unavailable'));
    const { GET } = await import('@/app/api/user-corpus/documents/[id]/related/route');
    const res = await GET(req, ctx);
    expect(res.status).toBe(500);
    expect(event().outcome).toBe('error');
  });
});

// The "still indexing" short-circuit must distinguish the four claim statuses (queued/parsing/
// chunking/embedding — genuinely in flight) from terminal/stopped states. `failed` and `empty`
// are NOT in flight: `empty` is a permanent verdict (the retry endpoint refuses it with 409 —
// retrying cannot change the result) and `failed` is stopped — the drain has given up on the row
// and it will not reach `ready` again until a manual retry. Reporting either as `pending: true`
// lies about a finished failure and swallows the actionable `parseError` reason.
//
// Seeds that turn these red:
//   * widen the gate back to `status !== 'ready'` → the failed/empty tests see `pending: true` and
//     `outcome: 'pending'`, and the in-flight test still passes (a strict subset, so it cannot
//     catch the widening on its own — the terminal tests are what pin the distinction).
//   * drop the terminal branch → failed/empty fall through to `relatedVoices`, which the test
//     asserts was never called.
describe('semantic match (documents/[id]/related) — pending vs terminal document states', () => {
  it.each(['queued', 'parsing', 'chunking', 'embedding'] as DocStatus[])(
    'logs PENDING and short-circuits before relatedVoices for an in-flight (%s) document',
    async (status) => {
      getDocument.mockResolvedValue({ id: 'doc-uuid-1', status, title: SERMON_TITLE });
      const { GET } = await import('@/app/api/user-corpus/documents/[id]/related/route');
      const res = await GET(req, ctx);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ voices: [], comparable: false, pending: true });
      const e = event();
      expect(e.kind).toBe('semantic');
      expect(e.outcome).toBe('pending');
      expect(e.voices).toBe(0);
      expect(relatedVoices).not.toHaveBeenCalled();
    },
  );

  it('logs the document verdict — not pending — for a FAILED document, and surfaces the reason', async () => {
    const parseError = 'Gave up after 3 attempts. The last error was: embedder returned 0 vectors for 4 chunks';
    getDocument.mockResolvedValue({ id: 'doc-uuid-1', status: 'failed', parseError, title: SERMON_TITLE });
    const { GET } = await import('@/app/api/user-corpus/documents/[id]/related/route');
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      voices: [], comparable: false, pending: false, failed: 'failed', reason: parseError,
    });
    const e = event();
    expect(e.kind).toBe('semantic');
    expect(e.outcome).toBe('failed');
    expect(e.voices).toBe(0);
    expect(relatedVoices).not.toHaveBeenCalled();
    // A terminal verdict is still a logged operation; the document's title/text are still not.
    const all = logged.join('\n');
    expect(all).not.toContain(SERMON_TITLE);
    expect(all).not.toContain(SERMON_TEXT);
  });

  it('logs EMPTY-as-verdict for an EMPTY document (permanent, not "still indexing")', async () => {
    const parseError = 'The document produced no indexable text.';
    getDocument.mockResolvedValue({ id: 'doc-uuid-1', status: 'empty', parseError, title: SERMON_TITLE });
    const { GET } = await import('@/app/api/user-corpus/documents/[id]/related/route');
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      voices: [], comparable: false, pending: false, failed: 'empty', reason: parseError,
    });
    const e = event();
    expect(e.kind).toBe('semantic');
    expect(e.outcome).toBe('empty');
    expect(e.voices).toBe(0);
    expect(relatedVoices).not.toHaveBeenCalled();
  });

  it('surfaces a null parseError honestly for a terminal document', async () => {
    getDocument.mockResolvedValue({ id: 'doc-uuid-1', status: 'failed', parseError: null, title: SERMON_TITLE });
    const { GET } = await import('@/app/api/user-corpus/documents/[id]/related/route');
    const res = await GET(req, ctx);
    expect(await res.json()).toEqual({
      voices: [], comparable: false, pending: false, failed: 'failed', reason: null,
    });
    expect(event().outcome).toBe('failed');
  });
});

describe('draft check ("have I preached this before?") — the pasted sermon must not leak', () => {
  it('logs the outcome and counts, and never a character of the pasted draft', async () => {
    const draftCheck = vi.fn().mockResolvedValue({
      detection: { translation: 'kjv', confidence: 0.9, totalHits: 12 },
      ranges: [{ start: 1, end: 2 }],
      overlaps: [],
      gaps: { voices: [{ author: 'Calvin' }], authorCount: 1, rangesConsidered: 1 },
    });
    vi.doMock('@/lib/user-corpus/draft-check', () => ({ draftCheck, DRAFT_MAX_CHARS: 120_000 }));
    vi.doMock('@/lib/rate-limit', () => ({ checkCorpusSearchRateLimit: vi.fn().mockResolvedValue({ ok: true }) }));
    vi.doMock('@/lib/csrf-floor', () => ({ requireJsonContentType: () => null }));
    vi.doMock('@/lib/api-error', () => ({ apiError: () => new Response('{}', { status: 500 }) }));
    vi.resetModules();

    const { POST } = await import('@/app/api/user-corpus/draft-check/route');
    const request = {
      json: async () => ({ text: SERMON_TEXT }),
    } as unknown as Parameters<typeof POST>[0];
    await POST(request);

    const all = logged.join('\n');
    expect(all, 'the pasted draft must never reach a log line').not.toContain(SERMON_TEXT);
    const e = event();
    expect(e.kind).toBe('draft');
    expect(e.outcome).toBe('hit');
    expect(e.voices).toBe(1);
    // The LENGTH of the draft is operational; its characters are not.
    expect(e.chars).toBe(SERMON_TEXT.length);
    vi.doUnmock('@/lib/user-corpus/draft-check');
  });
});

describe('the sermon itself stays private — the other half of the directive', () => {
  it('no log line carries the document title or its text, on any outcome', async () => {
    const cases: (() => void)[] = [
      () => traditionGap.mockResolvedValue({
        voices: [{ author: 'Calvin', quote: SERMON_TEXT }], authorCount: 1, rangesConsidered: 2,
      }),
      () => traditionGap.mockResolvedValue({ voices: [], authorCount: 0, rangesConsidered: 0 }),
      () => traditionGap.mockRejectedValue(new Error('boom')),
    ];
    const { GET } = await import('@/app/api/user-corpus/documents/[id]/voices/route');
    for (const setup of cases) {
      logged = [];
      setup();
      await GET(req, ctx);
      const all = logged.join('\n');
      expect(all, 'the document TITLE must never reach a log line').not.toContain(SERMON_TITLE);
      expect(all, 'the document TEXT must never reach a log line').not.toContain(SERMON_TEXT);
      // …while the operational facts still are there. Otherwise this passes by logging nothing.
      expect(all).toContain('"evt":"match_outcome"');
      expect(all).toContain('doc-uuid-1');
    }
  });
});
