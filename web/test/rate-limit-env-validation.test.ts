// Red-proof for the env-validation guard on web/src/lib/rate-limit.ts (introduced cbd09b1,
// propagated to all 15 limits by 05c94006 / 10023675 / dcc7f1c8). `Number(process.env.X ?? d)`
// turned a typo ("ten", "1O", "10x") into NaN, and `count > NaN` is ALWAYS false — so a single
// bad env value silently disabled EVERY limit on its endpoint. The fix validates at module
// load and fails the boot with the offending name. This file pins the value-domain guard
// directly AND the wiring of all 15 vars, hermetically (no DB).

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The 15 env vars rate-limit.ts reads at load, paired with the integer default the boot also
// gets when the var is absent — so a table row proves "validated at load" rather than restating
// the shipped numbers. (RATE_LIMIT_ENVS₁ documents the mapping; the wiring matrix only needs
// the names.)
const RATE_LIMIT_ENVS: ReadonlyArray<readonly [envName: string, defaultValue: number]> = [
  ['ASK_LIMIT_PER_MIN', 10],
  ['ASK_LIMIT_PER_DAY', 100],
  ['ASK_LIMIT_GLOBAL_PER_DAY', 5_000],
  ['GATE_LIMIT_PER_MIN', 10],
  ['GATE_LIMIT_PER_HOUR', 60],
  ['AUTH_LIMIT_PER_MIN', 10],
  ['AUTH_LIMIT_PER_HOUR', 60],
  ['AUTH_EMAIL_LIMIT_PER_MIN', 5],
  ['AUTH_EMAIL_LIMIT_PER_HOUR', 30],
  ['CORPUS_SEARCH_LIMIT_PER_MIN', 30],
  ['CORPUS_SEARCH_LIMIT_PER_DAY', 500],
  ['CORPUS_UPLOAD_LIMIT_PER_MIN', 10],
  ['CORPUS_UPLOAD_LIMIT_PER_DAY', 100],
  ['HISTORY_SEARCH_LIMIT_PER_MIN', 30],
  ['HISTORY_SEARCH_LIMIT_PER_DAY', 500],
];
const RATE_LIMIT_ENV_NAMES = RATE_LIMIT_ENVS.map(([name]) => name);

// Snapshot every var at file entry and revert each mutation, so the per-file process.env never
// leaks. web/vitest.config.ts forces GATE_LIMIT_PER_HOUR='100000' (valid) for the DB-backed
// suites — leaving it as we found it keeps those suites deterministic.
const snapshot: Record<string, string | undefined> = {};
for (const name of RATE_LIMIT_ENV_NAMES) snapshot[name] = process.env[name];

function restoreEnv(): void {
  for (const name of RATE_LIMIT_ENV_NAMES) {
    if (snapshot[name] === undefined) delete process.env[name];
    else process.env[name] = snapshot[name];
  }
}

// Grabbed once at all-valid ambient env (defaults; GATE_LIMIT_PER_HOUR forced to 100000 by the
// web vitest config — both valid), so the module loads clean and the pure helper is held by
// this closure even after later resetModules() clears the registry.
type RateLimitModule = typeof import('../src/lib/rate-limit');
let mod: RateLimitModule;

beforeAll(async () => {
  mod = await import('../src/lib/rate-limit');
});
afterAll(() => {
  restoreEnv();
  vi.resetModules();
});

describe('parseRateLimitEnv — value domain (the NaN guard lives here)', () => {
  it('absent (undefined) takes the default', () => {
    expect(mod.parseRateLimitEnv(undefined, 99, 'X')).toBe(99);
  });
  it('null takes the default (null and undefined are the same "not set")', () => {
    expect(mod.parseRateLimitEnv(null, 99, 'X')).toBe(99);
  });
  it('a positive integer string is accepted and parsed', () => {
    expect(mod.parseRateLimitEnv('10', 99, 'X')).toBe(10);
  });
  it('whitespace around an integer is accepted (Number trims)', () => {
    expect(mod.parseRateLimitEnv(' 10 ', 99, 'X')).toBe(10);
  });
  it('a large integer is accepted (the global daily ceiling defaults to 5000)', () => {
    expect(mod.parseRateLimitEnv('5000', 99, 'X')).toBe(5000);
  });
  it('a non-numeric word ("ten") throws naming the var — the reported reproducer', () => {
    // SEED: revert the helper to `Number(raw ?? defaultValue)` -> Number("ten") is NaN, no
    // throw, and every `count > NaN` check downstream is silently false.
    expect(() => mod.parseRateLimitEnv('ten', 99, 'ASK_LIMIT_PER_MIN')).toThrow(
      'Invalid rate limit: ASK_LIMIT_PER_MIN="ten" must be a positive integer',
    );
  });
  it('a letter-O typo ("1O") throws — the reported reproducer', () => {
    expect(() => mod.parseRateLimitEnv('1O', 99, 'X')).toThrow('Invalid rate limit: X="1O"');
  });
  it('a trailing character ("10x") throws', () => {
    expect(() => mod.parseRateLimitEnv('10x', 99, 'X')).toThrow();
  });
  it('a decimal ("10.5") throws — limits are integers', () => {
    expect(() => mod.parseRateLimitEnv('10.5', 99, 'X')).toThrow();
  });
  it('zero throws — a 0 limit makes `count > 0` true for EVERY call, the inverse silent failure', () => {
    expect(() => mod.parseRateLimitEnv('0', 99, 'X')).toThrow();
  });
  it('a negative integer throws', () => {
    expect(() => mod.parseRateLimitEnv('-5', 99, 'X')).toThrow();
  });
  it('an empty string throws — never the operator\'s intent for a rate cap', () => {
    expect(() => mod.parseRateLimitEnv('', 99, 'X')).toThrow();
  });
  it('a whitespace-only string throws (Number("   ") is 0)', () => {
    expect(() => mod.parseRateLimitEnv('   ', 99, 'X')).toThrow();
  });
});

describe('module load — a bad rate-limit env var fails the boot, naming the offender', () => {
  beforeEach(() => {
    // Each case starts from a clean module registry; env is reverted in afterEach.
    vi.resetModules();
  });
  afterEach(() => {
    restoreEnv();
  });

  it.each(RATE_LIMIT_ENV_NAMES)('"%s"="ten" throws at load', async (name) => {
    process.env[name] = 'ten';
    // SEED: replace the helper call with `Number(process.env[name] ?? d)` -> Number("ten") is
    // NaN, no throw at load, and `count > NaN` disables the cap silently.
    await expect(import('../src/lib/rate-limit')).rejects.toThrow(
      `Invalid rate limit: ${name}="ten" must be a positive integer`,
    );
  });

  it.each(RATE_LIMIT_ENV_NAMES)('"%s"="1O" (letter-O typo) throws at load naming the var', async (name) => {
    process.env[name] = '1O';
    await expect(import('../src/lib/rate-limit')).rejects.toThrow(name);
  });
});

describe('module load — a VALID override flows through to the limiter (no false throw)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    restoreEnv();
  });

  it('ASK_LIMIT_PER_MIN=2 makes the 3rd minute request get 429 semantics', async () => {
    process.env.ASK_LIMIT_PER_MIN = '2';
    const fresh = await import('../src/lib/rate-limit');
    type SqlArg = NonNullable<Parameters<typeof fresh.checkAskRateLimit>[1]>;
    const sql = {
      query: async (_t: string, p: unknown[]) => [{ count: p[1] === 'ask:min' ? 3 : 1 }],
    } as unknown as SqlArg;
    // SEED: make parseRateLimitEnv ignore `raw` (return defaultValue always) -> LIMIT_PER_MIN
    // reverts to the default 10, count(3) > 10 is false -> { ok: true }, RED.
    const r = await fresh.checkAskRateLimit('u', sql);
    expect(r).toEqual({ ok: false, limited: 'min', retryAfterSec: 60 });
  });
});

describe('module load — defaults still boot when the env is unset (no regression)', () => {
  beforeEach(() => {
    for (const name of RATE_LIMIT_ENV_NAMES) delete process.env[name];
    vi.resetModules();
  });
  afterEach(() => {
    restoreEnv();
  });

  it('loads clean and exposes the ask limiter at the 10/min default', async () => {
    const fresh = await import('../src/lib/rate-limit');
    type SqlArg = NonNullable<Parameters<typeof fresh.checkAskRateLimit>[1]>;
    const sql = {
      query: async (_t: string, p: unknown[]) => [{ count: p[1] === 'ask:min' ? 11 : 1 }],
    } as unknown as SqlArg;
    // SEED: change the ASK_LIMIT_PER_MIN default to a non-integer like "ten" inside the helper
    // call's default arg -> the boot itself throws, and this import rejects -> RED.
    const r = await fresh.checkAskRateLimit('u', sql);
    expect(r).toEqual({ ok: false, limited: 'min', retryAfterSec: 60 });
  });
});
