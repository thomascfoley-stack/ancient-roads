// H5a — the upload spend ceiling (2026-08-20 uploader deep dive).
//
// Until this limiter, /api/user-corpus/upload had NO rate limit while every accepted upload
// spends DeepInfra embedding money through the after() drain, and the retry route re-embeds the
// WHOLE document while zeroing `attempts` — so MAX_ATTEMPTS was never a spend ceiling either.
//
// Exercises the REAL checkCorpusUploadRateLimit with an injected `sql` handle, the way the root
// test/rate-limit.test.ts drives checkAskRateLimit: threshold logic and the FAIL-CLOSED path
// hermetically, no DB. Route wiring (429 short-circuit, no row created) is upload-quota.test.ts's
// job; presence-and-order in the route source is wallet.test.ts's.

import { describe, expect, it } from 'vitest';
import {
  CORPUS_UPLOAD_PER_DAY,
  CORPUS_UPLOAD_PER_MIN,
  checkCorpusUploadRateLimit,
} from '../../src/lib/rate-limit';

type SqlArg = NonNullable<Parameters<typeof checkCorpusUploadRateLimit>[1]>;

// Controlled `count` per bucket, so the min/day thresholds are driven independently.
const mockSql = (counts: { min: number; day: number }): SqlArg =>
  ({
    query: async (_text: string, params: unknown[]) => {
      const bucket = params[1] as string;
      return [{ count: bucket === 'corpus-upload:min' ? counts.min : counts.day }];
    },
  }) as unknown as SqlArg;

describe('H5a — checkCorpusUploadRateLimit', () => {
  it('exports the caps the order names: 10/min, 100/day', () => {
    expect(CORPUS_UPLOAD_PER_MIN).toBe(10);
    expect(CORPUS_UPLOAD_PER_DAY).toBe(100);
  });

  it('allows under both caps', async () => {
    expect(await checkCorpusUploadRateLimit('u1', mockSql({ min: 5, day: 20 }))).toEqual({ ok: true });
  });

  it('allows exactly at the per-minute cap, blocks the next', async () => {
    expect((await checkCorpusUploadRateLimit('u1', mockSql({ min: CORPUS_UPLOAD_PER_MIN, day: 20 }))).ok).toBe(true);
    const r = await checkCorpusUploadRateLimit('u1', mockSql({ min: CORPUS_UPLOAD_PER_MIN + 1, day: 20 }));
    expect(r).toEqual({ ok: false, limited: 'min', retryAfterSec: 60 });
  });

  it('blocks over the per-day cap', async () => {
    const r = await checkCorpusUploadRateLimit('u1', mockSql({ min: 3, day: CORPUS_UPLOAD_PER_DAY + 1 }));
    expect(r).toEqual({ ok: false, limited: 'day', retryAfterSec: 3600 });
  });

  it('a minute-limited burst never consumes the daily quota (the H4 ordering)', async () => {
    const buckets: string[] = [];
    const spy = {
      query: async (_t: string, params: unknown[]) => {
        buckets.push(params[1] as string);
        return [{ count: 99 }];
      },
    } as unknown as SqlArg;
    const r = await checkCorpusUploadRateLimit('u1', spy);
    expect(r.ok).toBe(false);
    // SEED: swap the two bumps -> the day bucket appears here and a refused double-click still
    // burns a daily slot.
    expect(buckets).toEqual(['corpus-upload:min']);
  });

  it('FAILS CLOSED when the limiter DB call throws — each accepted upload is a paid embedding run', async () => {
    const throwing = { query: async () => { throw new Error('db down'); } } as unknown as SqlArg;
    expect(await checkCorpusUploadRateLimit('u1', throwing)).toEqual({ ok: false, limited: 'unavailable', retryAfterSec: 30 });
  });

  it('a zero-row return is denied, not a TypeError swallowed into an allow', async () => {
    const empty = { query: async () => [] } as unknown as SqlArg;
    expect(await checkCorpusUploadRateLimit('u1', empty)).toEqual({ ok: false, limited: 'unavailable', retryAfterSec: 30 });
  });

  it('uses its OWN buckets — an upload must not spend the ask or search quota, or vice versa', async () => {
    const buckets: string[] = [];
    const spy = {
      query: async (_t: string, params: unknown[]) => {
        buckets.push(params[1] as string);
        return [{ count: 1 }];
      },
    } as unknown as SqlArg;
    expect((await checkCorpusUploadRateLimit('u1', spy)).ok).toBe(true);
    expect(buckets).toEqual(['corpus-upload:min', 'corpus-upload:day']);
  });
});
