// The boot-time role assert is a CANARY, not the enforcement (per-request RLS in runAsUser is).
// A boot check that throws on a transient Neon hiccup ("other side closed" at serverless
// cold-start) 500s EVERY function. This locks the resilient behavior: retry + serve-on-
// unreachable, but STILL hard-fail on the real security condition (a BYPASSRLS role).
// Scar: the 2026-07-16 deploy 500'd every server function because this check threw on a
// cold-start connection failure.
import { afterEach, describe, expect, it } from 'vitest';
import { assertAppRuntimeRole } from '@/lib/db';
import type { NeonQueryFunction } from '@neondatabase/serverless';

type Sql = NeonQueryFunction<false, false>;

const savedVercel = process.env.VERCEL_ENV;
afterEach(() => {
  if (savedVercel === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = savedVercel;
});
const asProd = () => {
  process.env.VERCEL_ENV = 'production';
};

// A tagged-template stub shaped like the neon() query function.
const throwsConnError = (() => {
  throw new Error('fetch failed: other side closed');
}) as unknown as Sql;
const returns = (rows: unknown[]): Sql => (() => Promise.resolve(rows)) as unknown as Sql;

describe('assertAppRuntimeRole — a boot canary, not a single point of total failure', () => {
  it('does NOT brick the app when the DB is unreachable (retries, then serves)', async () => {
    asProd();
    await expect(assertAppRuntimeRole(throwsConnError)).resolves.toBeUndefined();
  });

  it('HARD-FAILS when the runtime role can bypass RLS (the real security condition)', async () => {
    asProd();
    const bypass = returns([{ rolname: 'neondb_owner', rolbypassrls: true }]);
    await expect(assertAppRuntimeRole(bypass)).rejects.toThrow(/BYPASSRLS/);
  });

  it('passes silently for the least-privilege app_runtime role', async () => {
    asProd();
    const good = returns([{ rolname: 'app_runtime', rolbypassrls: false }]);
    await expect(assertAppRuntimeRole(good)).resolves.toBeUndefined();
  });

  it('is a no-op outside production (dev is not gated on this)', async () => {
    delete process.env.VERCEL_ENV; // NODE_ENV is 'test' under vitest
    await expect(assertAppRuntimeRole(throwsConnError)).resolves.toBeUndefined();
  });
});
