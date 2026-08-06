// The spike's Proof 1, re-run against the REAL app configuration instead of a throwaway harness.
//
// `better-auth-schema.test.ts` compares two descriptions of the schema and is entirely static: it
// would stay green against a database where migration 104 had never been applied, or where a column
// type was wrong in a way the DDL text does not reveal. This one drives Better Auth's own API
// against the Lane B branch and asserts a user can actually be created and signed in.
//
// It is the difference between "the migration says the right thing" and "auth works".
//
// NEVER PRODUCTION: `runtimeDbUrl()` throws if pointed at the prod endpoint, and this suite writes.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { announceSkip } from '../helpers/loud-skip';
import { runtimeDbUrl } from '../helpers/env';

const DB = runtimeDbUrl();
const SKIP = announceSkip(
  'better-auth-live',
  [{ name: 'APP_DATABASE_URL (Lane B branch, migration 104 applied)', present: Boolean(DB) }],
  'Better Auth can create and authenticate a user against the real schema',
);

// A fresh address per run: sign-up is idempotent-hostile by design (unique email), so a fixed
// fixture would pass once and then fail forever on the second run.
const STAMP = Date.now().toString(36);
const EMAIL = `betterauth-live-${STAMP}@example.invalid`;
const PASSWORD = 'correct-horse-battery-staple-9';

describe.skipIf(SKIP)('Better Auth against the real schema (migration 104)', () => {
  let auth: Awaited<typeof import('@/lib/auth/better-auth')> extends { getAuth: () => infer A }
    ? A
    : never;
  let sql: ReturnType<typeof import('@/lib/db').getDb>;

  beforeAll(async () => {
    // Better Auth refuses to construct without a secret. Supplying a throwaway one here keeps the
    // suite runnable on a machine with no auth env, and it is never a real credential.
    process.env.BETTER_AUTH_SECRET ??= 'test-only-secret-not-used-in-any-deployment';
    process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
    auth = (await import('@/lib/auth/better-auth')).getAuth();
    sql = (await import('@/lib/db')).getDb();
  });

  afterAll(async () => {
    // Leave the branch as found. CASCADE takes the account and session rows with the user.
    await sql`DELETE FROM auth_users WHERE email = ${EMAIL}`.catch(() => undefined);
  });

  it('signs a new user up, and stores a credential account rather than a bare user row', async () => {
    const res = await auth.api.signUpEmail({
      body: { email: EMAIL, password: PASSWORD, name: 'Live Proof' },
    });
    expect(res.user.email).toBe(EMAIL);

    const rows = (await sql`
      SELECT a."providerId", a.password IS NOT NULL AS has_hash, u."emailVerified"
        FROM auth_users u JOIN auth_accounts a ON a."userId" = u.id
       WHERE u.email = ${EMAIL}`) as {
      providerId: string; has_hash: boolean; emailVerified: boolean;
    }[];

    expect(rows).toHaveLength(1);
    expect(rows[0].providerId).toBe('credential');
    expect(rows[0].has_hash).toBe(true);
    // The g38m precondition, recorded rather than assumed: a fresh signup is UNVERIFIED. On the
    // Neon beta this is the state an attacker pre-registers into and a later Google login links
    // onto. There is no social provider here, so nothing can link to it -- which is the whole
    // reason this cutover closes the advisory. See docs/AUTH_CUTOVER_DESIGN.md §2.
    expect(rows[0].emailVerified).toBe(false);
  }, 30_000);

  it('signs that user in and issues a session bound to them', async () => {
    const res = await auth.api.signInEmail({ body: { email: EMAIL, password: PASSWORD } });
    expect(res.user.email).toBe(EMAIL);

    const sessions = (await sql`
      SELECT count(*)::int AS n
        FROM auth_sessions s JOIN auth_users u ON u.id = s."userId"
       WHERE u.email = ${EMAIL} AND s."expiresAt" > now()`) as { n: number }[];
    expect(sessions[0].n).toBeGreaterThan(0);
  }, 30_000);

  it('refuses the wrong password', async () => {
    // Without this, the two tests above would pass against an implementation that accepted
    // anything -- they only ever present correct credentials.
    await expect(
      auth.api.signInEmail({ body: { email: EMAIL, password: 'not-the-password-at-all' } }),
    ).rejects.toThrow();
  }, 30_000);
});
