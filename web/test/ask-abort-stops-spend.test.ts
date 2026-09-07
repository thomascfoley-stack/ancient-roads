// Stop on /ask must stop SPENDING, not just stop waiting.
//
// The defect: POST /api/ask/stream never read `req.signal`, so pressing Stop only tore down the
// client's reader. The server kept embedding, kept composing (up to MAX_RETRIES+1 paid calls),
// and then wrote the finished answer into the thread. Press Stop, press "Ask again", and the
// question is answered and stored TWICE — two model bills and two assistant rows for one reader
// who asked once.
//
// Two properties, both red-provable:
//
//   1. NO SPEND AFTER ABORT (teach level). An already-aborted signal must stop teach() before
//      the embedder is called at all; a signal aborted mid-flight must stop it before the NEXT
//      compose attempt. SEED: drop the `signal.throwIfAborted()` guards from teach() and both
//      tests go red (embedQuery/compose get called anyway).
//
//   2. AN ABORTED ASK PERSISTS NO ANSWER (route level). The question row is written BEFORE
//      teach() by design (ASK_HISTORY_DESIGN I-2 — a question that crashes the pipeline is the
//      one the reader wants back), but the ANSWER row must not be written for a run the reader
//      stopped, and the ask_outcome must not be scheduled either. SEED: stop passing
//      `req.signal` into teach() and the route test goes red — the mocked teach() then models
//      the real defect (no signal means the server cannot know, so it finishes and persists).
//
// Everything below the route is mocked, so this runs in CI with no database and no DeepInfra.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { teach, type TeachRun } from '@/lib/teacher/teach';
import { POST } from '@/app/api/ask/stream/route';
import { appendAnswer, createThreadWithQuestion } from '@/lib/research';
import { scheduleAskOutcome } from '@/lib/ask-outcomes';

// ── teach()'s collaborators ────────────────────────────────────────────────────────────────
const embedQuery = vi.fn();
const compose = vi.fn();

vi.mock('@/lib/teacher/deepinfra', () => ({
  embedQuery: (...args: unknown[]) => embedQuery(...args),
  compose: (...args: unknown[]) => compose(...args),
  composeModel: 'test-model',
}));

const CHUNK = {
  sourceId: 'gill-john-1-1',
  score: 0.9,
  content: 'In the beginning was the Word.',
  metadata: {
    author: 'John Gill',
    year: null,
    tradition: 'Reformed',
    sourceTitle: 'Exposition of John',
    sourceUrl: null,
    verseId: 43001001,
    verseEnd: 43001001,
    model: 'bge',
    work: 'gill-exposition-john',
  },
};

vi.mock('@/lib/teacher/retrieve', () => ({
  retrieveCommentary: vi.fn(async () => [CHUNK]),
  retrieveSongVerse: vi.fn(async () => []),
  retrieveSermonLane: vi.fn(async () => []),
  retrieveTheologyLane: vi.fn(async () => []),
  retrieveHistorianLane: vi.fn(async () => []),
}));

vi.mock('@/lib/teacher/user-voices', () => ({
  retrieveUserVoices: vi.fn(async () => []),
  formatUserLibrarySources: vi.fn(() => ''),
}));

vi.mock('@/lib/teacher/section-locate', () => ({
  attachSectionOrdinals: vi.fn(async () => undefined),
}));

vi.mock('@/lib/teacher/routing', () => ({ hasPassageCoverage: vi.fn(() => true) }));

vi.mock('../src/bible/pericopes', () => ({
  resolveIntent: vi.fn(() => ({ inject: [], floor: [] })),
}));

// ── the route's collaborators ──────────────────────────────────────────────────────────────
// Spreads the REAL @/lib/auth-failure so this mock carries every export the route imports, not
// just the ones this file thought of — held by test/invariants/session-mock-surface.test.ts.
vi.mock('@/lib/session', async () => ({
  ...(await import('@/lib/auth-failure')),
  requireUser: vi.fn(async () => ({ id: 'user-1', email: 'owner@example.com' })),
  currentUser: vi.fn(async () => ({ id: 'user-1', email: 'owner@example.com' })),
}));

vi.mock('@/lib/teacher-access', () => ({ isTeacherAllowed: vi.fn(() => true) }));
vi.mock('@/lib/rate-limit', () => ({ checkAskRateLimit: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/lib/ask-outcome-log', () => ({ logAskOutcome: vi.fn() }));
vi.mock('@/lib/ask-outcomes', () => ({ scheduleAskOutcome: vi.fn() }));
vi.mock('@/lib/observability', () => ({ logEvent: vi.fn() }));

vi.mock('@/lib/research', () => ({
  createThreadWithQuestion: vi.fn(async () => ({ threadId: 'thread-1', qid: 'q-1' })),
  appendQuestion: vi.fn(async () => 'q-1'),
  appendAnswer: vi.fn(async () => undefined),
  isThreadId: vi.fn(() => false),
}));

// The route imports teach() directly; the route-level property is about what the ROUTE does
// with an abort, so teach itself is mocked there. The teach-level property above exercises the
// real teach().
vi.mock('@/lib/teacher/teach', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/teacher/teach')>();
  return { ...actual, teach: vi.fn(actual.teach) };
});

const teachMock = vi.mocked(teach);

const COMPOSED_RUN: TeachRun = {
  result: {
    kind: 'fallback',
    retrieval: [CHUNK],
    violations: [],
  } as unknown as TeachRun['result'],
  meta: { attempts: 1, voices: 1, traditions: 1 },
};

function askRequest(signal: AbortSignal): NextRequest {
  return new NextRequest('http://localhost/api/ask/stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'What does John 1:1 mean?' }),
    signal,
  });
}

async function drain(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!body) return;
  const reader = body.getReader();
  try {
    for (;;) {
      const { done } = await reader.read();
      if (done) return;
    }
  } catch {
    // A cancelled stream throws on read; the assertions are about the writes, not the bytes.
    return;
  }
}

describe('Stop on /ask stops spending', () => {
  beforeEach(() => {
    process.env.DEEPINFRA_API_KEY = 'test-key';
    vi.clearAllMocks();
    embedQuery.mockResolvedValue(new Array(1024).fill(0.1));
    compose.mockResolvedValue('not json — forces a retry so a second attempt is observable');
    teachMock.mockReset();
  });

  it('P1a: an already-aborted signal stops teach() before the embedder is ever called', async () => {
    const { teach: realTeach } = await vi.importActual<typeof import('@/lib/teacher/teach')>(
      '@/lib/teacher/teach',
    );
    const signal = AbortSignal.abort();

    await expect(realTeach('What does John 1:1 mean?', { signal })).rejects.toThrow();
    expect(embedQuery, 'no embedding is paid for a run the reader already stopped').not.toHaveBeenCalled();
    expect(compose, 'no composition is paid either').not.toHaveBeenCalled();
  });

  it('P1b: aborting mid-flight stops the NEXT compose attempt (retries are the expensive part)', async () => {
    const { teach: realTeach } = await vi.importActual<typeof import('@/lib/teacher/teach')>(
      '@/lib/teacher/teach',
    );
    const controller = new AbortController();
    // Abort the moment the first paid compose call lands. Without the guard the loop runs the
    // full MAX_RETRIES budget (3 attempts) because every attempt fails to parse.
    compose.mockImplementation(async () => {
      controller.abort();
      return 'not json';
    });

    await expect(
      realTeach('What does John 1:1 mean?', { signal: controller.signal }),
    ).rejects.toThrow();
    expect(compose, 'exactly one compose was in flight when Stop was pressed').toHaveBeenCalledTimes(1);
  });

  it('P2: the route hands teach() the request signal', async () => {
    teachMock.mockResolvedValue(COMPOSED_RUN);
    const controller = new AbortController();
    const res = await POST(askRequest(controller.signal));
    await drain(res.body);

    expect(teachMock).toHaveBeenCalledTimes(1);
    const opts = teachMock.mock.calls[0]![1] as { signal?: AbortSignal } | undefined;
    expect(opts?.signal, 'teach() must receive an AbortSignal from the request').toBeInstanceOf(
      AbortSignal,
    );
  });

  it('P2b: an aborted ask writes no answer row and schedules no ask_outcome', async () => {
    const controller = new AbortController();
    // Models the pipeline HONESTLY on both sides of the fix: given a signal, teach() stops when
    // it aborts; given none — the defect — it cannot know, so it finishes and the route persists.
    teachMock.mockImplementation(async (_q, opts) => {
      const signal = (opts as { signal?: AbortSignal } | undefined)?.signal;
      if (!signal) return COMPOSED_RUN;
      await new Promise<void>((resolve) => {
        if (signal.aborted) return resolve();
        signal.addEventListener('abort', () => resolve(), { once: true });
      });
      throw new DOMException('The ask was stopped.', 'AbortError');
    });

    const res = await POST(askRequest(controller.signal));
    controller.abort();
    await drain(res.body);

    expect(createThreadWithQuestion, 'the question row is written before teach(), by design').toHaveBeenCalledTimes(1);
    expect(appendAnswer, 'a stopped ask must not store an answer').not.toHaveBeenCalled();
    expect(scheduleAskOutcome, 'a stopped ask must not bill an outcome row').not.toHaveBeenCalled();
  });
});
