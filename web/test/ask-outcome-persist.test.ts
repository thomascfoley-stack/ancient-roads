// ask-outcome persistence — the write path behind scheduleAskOutcome (migration 116,
// Phase-D substrate). Two properties, both red-provable:
//
//   1. FAIL-OPEN: a failing insert must never break an ask. recordAskOutcome swallows its
//      own error into one caught log line; scheduleAskOutcome's after() fallback cannot
//      throw either. SEED: make recordAskOutcome rethrow (drop the catch) and the
//      "insert failure" tests go red.
//   2. THE ROW LANDS with the right fields: verdict, attempts, retrieved REFERENCES (source
//      id + work slug + verse window + lane — never corpus text), lanes as requested,
//      latency and per-stage timings, and user_id bound through runAsUser for an authed ask
//      / a plain NULL insert for an anonymous one. SEED: drop `retrieved` from the INSERT
//      column list and the field assertions go red.
//
// The DB is mocked at @/lib/db (the neon tagged-template function), so values are asserted
// from the bind parameters — no live database, runs in CI.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { after } from 'next/server';
import { getDb, runAsUser } from '@/lib/db';
import {
  buildAskOutcomeRow,
  recordAskOutcome,
  scheduleAskOutcome,
  type AskOutcomeInput,
} from '@/lib/ask-outcomes';
import type { TeacherResult, TeachMeta } from '@/lib/teacher/teach';

type SqlMock = ReturnType<typeof vi.fn>;

const { sqlMock } = vi.hoisted(() => ({ sqlMock: vi.fn() }));

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(() => sqlMock),
  runAsUser: vi.fn(async (_userId: string, build: (sql: SqlMock) => Promise<unknown>[]) => {
    await Promise.all(build(sqlMock));
    return [];
  }),
}));

vi.mock('next/server', () => ({ after: vi.fn() }));

const RETRIEVAL = [
  {
    sourceId: 'gill-john-1-1',
    score: 0.9,
    content: 'CORPUS TEXT — must never be persisted',
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
  },
];

function composedInput(overrides: Partial<AskOutcomeInput> = {}): AskOutcomeInput {
  const result: TeacherResult = {
    kind: 'composed',
    response: { contract_version: '1.1', teacher: 'composed', blocks: [] } as never,
    retrieval: RETRIEVAL,
  };
  const meta: TeachMeta = {
    attempts: 1,
    voices: 1,
    traditions: 1,
    stageMs: { embed: 10, retrieve: 20, lanes: 5, compose: [100], verify: [30], total: 165 },
    coldStart: false,
    rejections: [],
  };
  return {
    userId: 'user-123',
    query: 'What does John 1:1 mean?',
    lanes: { sermons: false },
    result,
    meta,
    latencyMs: 170,
    ...overrides,
  };
}

/** Bind parameters of the first issued statement (tagged-template values). */
function firstInsertValues(): unknown[] {
  expect(sqlMock.mock.calls.length).toBeGreaterThan(0);
  return sqlMock.mock.calls[0]!.slice(1);
}

beforeEach(() => {
  sqlMock.mockReset().mockReturnValue(Promise.resolve([]));
  vi.mocked(runAsUser).mockClear();
  vi.mocked(getDb).mockClear();
  vi.mocked(after).mockReset();
});

describe('recordAskOutcome — the row lands with the right fields', () => {
  it('authed ask: insert goes through runAsUser with user_id bound', async () => {
    await recordAskOutcome(composedInput());
    expect(runAsUser).toHaveBeenCalledWith('user-123', expect.any(Function));
    expect(getDb).not.toHaveBeenCalled();
    const [userId, query, lanes, retrieved, attempts, verdict, failures, latencyMs, stageMs] =
      firstInsertValues();
    expect(userId).toBe('user-123');
    expect(query).toBe('What does John 1:1 mean?');
    expect(JSON.parse(lanes as string)).toEqual({ sermons: false });
    expect(attempts).toBe(1);
    expect(verdict).toBe('composed');
    expect(JSON.parse(failures as string)).toEqual([]);
    expect(latencyMs).toBe(170);
    expect(JSON.parse(stageMs as string)).toEqual({
      embed: 10, retrieve: 20, lanes: 5, compose: [100], verify: [30], total: 165,
    });
  });

  it('retrieved rows are REFERENCES: source id, work slug, verse window, lane — never text', async () => {
    await recordAskOutcome(composedInput());
    const retrieved = JSON.parse(firstInsertValues()[3] as string);
    expect(retrieved).toEqual([
      {
        source: 'gill-john-1-1',
        work: 'gill-exposition-john',
        verse: 43001001,
        verse_end: 43001001,
        lane: 'commentary',
      },
    ]);
    expect(JSON.stringify(retrieved)).not.toContain('CORPUS TEXT');
  });

  it('lane payloads land with their lane labels alongside the commentary refs', async () => {
    const input = composedInput();
    input.result = {
      ...(input.result as Extract<TeacherResult, { kind: 'composed' }>),
      sermons: [{ ...RETRIEVAL[0]!, sourceId: 'bunyan-sermon-1', lane: 'sermon' }],
    };
    await recordAskOutcome(input);
    const retrieved = JSON.parse(firstInsertValues()[3] as string);
    expect(retrieved.map((r: { lane: string }) => r.lane)).toEqual(['commentary', 'sermon']);
  });

  it('fallback verdict persists the rejected attempts as failure codes', async () => {
    const meta: TeachMeta = {
      attempts: 3,
      firstCheck: 'quote_verbatim',
      voices: 1,
      traditions: 1,
      rejections: [
        { attempt: 0, violations: [{ check: 'quote_verbatim', message: 'no match' }] },
        { attempt: 1, violations: [{ check: 'passages_grounded', message: 'off passage' }] },
      ],
    };
    const result: TeacherResult = { kind: 'fallback', retrieval: RETRIEVAL, violations: [] };
    await recordAskOutcome(composedInput({ result, meta }));
    const values = firstInsertValues();
    expect(values[4]).toBe(3);
    expect(values[5]).toBe('fallback');
    const codes = JSON.parse(values[6] as string).map((r: { violations: { check: string }[] }) =>
      r.violations.map((v) => v.check),
    );
    expect(codes).toEqual([['quote_verbatim'], ['passages_grounded']]);
  });

  it('empty verdict: zero attempts, no refs, the reason is the failure record', async () => {
    const result: TeacherResult = { kind: 'empty', reason: 'No relevant sources found for this question.' };
    const meta: TeachMeta = { attempts: 0, voices: 0, traditions: 0, rejections: [] };
    await recordAskOutcome(composedInput({ result, meta }));
    const values = firstInsertValues();
    expect(values[5]).toBe('empty');
    expect(values[4]).toBe(0);
    expect(JSON.parse(values[3] as string)).toEqual([]);
    expect(JSON.parse(values[6] as string)).toEqual([
      { check: 'empty', message: 'No relevant sources found for this question.' },
    ]);
    expect(values[8]).toBeNull(); // no stageMs on this meta → SQL NULL, not 'null'::jsonb
  });

  it('anonymous ask: plain insert with NULL user_id, runAsUser untouched', async () => {
    await recordAskOutcome(composedInput({ userId: null }));
    expect(runAsUser).not.toHaveBeenCalled();
    expect(getDb).toHaveBeenCalled();
    expect(firstInsertValues()[0]).toBeNull();
  });
});

describe('recordAskOutcome — fail-open: a logging failure never breaks an ask', () => {
  it('a rejecting insert resolves, and logs exactly the caught failure', async () => {
    sqlMock.mockReturnValue(Promise.reject(new Error('relation "ask_outcomes" does not exist')));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // The ask completed; this is the write after it. It must RESOLVE, not throw.
    await expect(recordAskOutcome(composedInput())).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledWith(
      '[ask_outcomes] persist failed:',
      expect.stringContaining('ask_outcomes'),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"evt":"error"'));
    errSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('buildAskOutcomeRow is total over the three result kinds (no throw path)', () => {
    for (const result of [
      composedInput().result,
      { kind: 'fallback', retrieval: [], violations: [] },
      { kind: 'empty', reason: 'x' },
    ] as TeacherResult[]) {
      expect(() => buildAskOutcomeRow(composedInput({ result }))).not.toThrow();
    }
  });
});

describe('scheduleAskOutcome — off the request path', () => {
  it('schedules the write via after(), which runs it to completion', async () => {
    vi.mocked(after).mockImplementation((fn) => void (fn as () => Promise<void>)());
    scheduleAskOutcome(composedInput());
    expect(after).toHaveBeenCalledOnce();
    await new Promise((r) => setImmediate(r)); // let the scheduled write settle
    expect(runAsUser).toHaveBeenCalledWith('user-123', expect.any(Function));
  });

  it('after() outside a request scope (the upload-route lesson) falls back to fire-and-forget', async () => {
    vi.mocked(after).mockImplementation(() => {
      throw new Error('`after` was called outside a request scope');
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => scheduleAskOutcome(composedInput())).not.toThrow();
    await new Promise((r) => setImmediate(r));
    expect(runAsUser).toHaveBeenCalledWith('user-123', expect.any(Function));
    expect(errSpy).not.toHaveBeenCalled(); // the fallback write SUCCEEDED — nothing to log
    errSpy.mockRestore();
  });
});
