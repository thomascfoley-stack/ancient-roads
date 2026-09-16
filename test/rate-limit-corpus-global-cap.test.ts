// THE USER-CORPUS FAMILY HAS A FLEET-WIDE DAILY CEILING (2026-09-16, pre-launch review).
//
// WHY THIS EXISTS. `checkAskRateLimit` bounds the day's total spend with a global pool keyed on
// `__global__`; the four limiters guarding the paid user-corpus paths bounded only what one
// account could spend. With registration open that is not a bound on the bill at all — it is a
// bound per account, multiplied by however many accounts sign up. The retry route re-embeds a
// whole document and zeroes `attempts`, so nothing else caps it.
//
// RED-PROOF: delete the `corpusGlobalDayTripped` call from any one limiter and that limiter's
// case here fails. Watched red before this file was committed.

import { describe, expect, it } from 'vitest';
import {
  checkCorpusSearchRateLimit,
  checkCorpusUploadRateLimit,
  checkCorpusCompleteRateLimit,
  checkHistorySearchRateLimit,
} from '../web/src/lib/rate-limit';

type SqlArg = NonNullable<Parameters<typeof checkCorpusSearchRateLimit>[1]>;

const GLOBAL_BUCKET = 'corpus:global:day';

/** Every per-user bucket reads as 1 (well under its cap); the shared pool reads as `globalCount`. */
const sqlWithGlobal = (globalCount: number): SqlArg =>
  ({
    query: async (_text: string, params: unknown[]) => [
      { count: (params[1] as string) === GLOBAL_BUCKET ? globalCount : 1 },
    ],
  }) as unknown as SqlArg;

/** Records (key, bucket) pairs so the pool's KEY can be asserted, not just its existence. */
const spySql = (seen: Array<[string, string]>): SqlArg =>
  ({
    query: async (_text: string, params: unknown[]) => {
      seen.push([params[0] as string, params[1] as string]);
      return [{ count: 1 }];
    },
  }) as unknown as SqlArg;

const LIMITERS = [
  ['corpus search', checkCorpusSearchRateLimit],
  ['corpus upload', checkCorpusUploadRateLimit],
  ['corpus complete', checkCorpusCompleteRateLimit],
  ['history search', checkHistorySearchRateLimit],
] as const;

describe('the user-corpus limiters share one fleet-wide daily ceiling', () => {
  for (const [name, limiter] of LIMITERS) {
    it(`${name}: denies once the shared pool is over the ceiling, even though this user is not`, async () => {
      const r = await limiter('u1', sqlWithGlobal(99_999));
      expect(r.ok, `${name} allowed a request after the fleet-wide ceiling tripped`).toBe(false);
      expect(r.limited).toBe('global');
    });

    it(`${name}: allows while the shared pool is under the ceiling`, async () => {
      expect(await limiter('u1', sqlWithGlobal(1))).toEqual({ ok: true });
    });

    it(`${name}: bumps the pool on the __global__ key, not per-user`, async () => {
      const seen: Array<[string, string]> = [];
      await limiter('some-user-id', spySql(seen));
      const row = seen.find(([, bucket]) => bucket === GLOBAL_BUCKET);
      expect(row, `${name} never bumped ${GLOBAL_BUCKET}`).toBeDefined();
      expect(row![0], 'the shared pool must not be keyed per-user').toBe('__global__');
    });
  }

  it('all four charge the SAME pool — four ceilings would be four times the bill', async () => {
    const seen: Array<[string, string]> = [];
    for (const [, limiter] of LIMITERS) await limiter('u1', spySql(seen));
    const pools = new Set(seen.filter(([, b]) => b.includes('global')).map(([, b]) => b));
    expect(pools).toEqual(new Set([GLOBAL_BUCKET]));
  });

  it('a limiter fault on the pool still fails CLOSED — a paid path must deny, not wave through', async () => {
    const throwing = { query: async () => { throw new Error('db down'); } } as unknown as SqlArg;
    for (const [name, limiter] of LIMITERS) {
      const r = await limiter('u1', throwing);
      expect(r, `${name} did not fail closed`).toEqual({ ok: false, limited: 'unavailable', retryAfterSec: 30 });
    }
  });
});
