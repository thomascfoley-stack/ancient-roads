// A mail outage must cost a confirmation link, never account creation.
//
// `emailVerification.sendOnSignUp` is true and `sendMail` THROWS in production when
// RESEND_API_KEY is unset, so if that throw propagated out of sign-up, an unconfigured or down
// mail provider would not degrade the product, it would make registration impossible. The first
// anyone would know is a launch where nobody can create an account.
//
// WHAT THIS ACTUALLY PROVES, STATED HONESTLY. The property holds because Better Auth 1.6.26 wraps
// `sendVerificationEmail` in `runInBackgroundOrAwait`, NOT because of anything in our config. It
// was written to cover a defensive try/catch in better-auth.ts, and the red-proof exposed that:
// deleting the catch left this green, because the rejection was already isolated upstream. The
// catch was deleted; this test was kept and relabelled.
//
// So read it as a REGRESSION CHECK ON A DEPENDENCY'S BEHAVIOUR, which is exactly the kind of thing
// that changes under you on a minor version bump. It goes red if a future Better Auth awaits the
// send inline, or if someone sets `requireEmailVerification: true` without wiring a mailer first.
// Both would make sign-up fail in production and neither is visible in a diff of our own code.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { announceSkip } from '../helpers/loud-skip';
import { runtimeDbUrl } from '../helpers/env';

const sent: string[] = [];
vi.mock('@/lib/mail', async (orig) => {
  const actual = await orig<typeof import('@/lib/mail')>();
  return {
    ...actual,
    sendMail: async (m: { to: string }) => {
      sent.push(m.to);
      throw new Error('simulated provider outage (RESEND_API_KEY unset)');
    },
  };
});

const DB = runtimeDbUrl();
const SKIP = announceSkip(
  'signup-survives-mail-outage',
  [{ name: 'APP_DATABASE_URL (Lane B branch, migration 104 applied)', present: Boolean(DB) }],
  'sign-up completes even when the mail provider is down',
);

const EMAIL = `mail-outage-${Date.now().toString(36)}@example.invalid`;

describe.skipIf(SKIP)('sign-up when the mailer is down', () => {
  let auth: Awaited<typeof import('@/lib/auth/better-auth')> extends { getAuth: () => infer A }
    ? A
    : never;
  let sql: ReturnType<typeof import('@/lib/db').getDb>;

  beforeAll(async () => {
    process.env.BETTER_AUTH_SECRET ??= 'test-only-secret-not-used-in-any-deployment';
    process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
    auth = (await import('@/lib/auth/better-auth')).getAuth();
    sql = (await import('@/lib/db')).getDb();
  });

  afterAll(async () => {
    await sql`DELETE FROM auth_users WHERE email = ${EMAIL}`.catch(() => undefined);
  });

  it('creates the account anyway, and the send really was attempted', async () => {
    const res = await auth.api.signUpEmail({
      body: { email: EMAIL, password: 'a-long-enough-password-1', name: 'Outage Proof' },
    });
    expect(res.user.email).toBe(EMAIL);

    // Non-vacuity: without this the test would pass just as happily against a build where
    // sendOnSignUp was false and no mail was ever attempted, proving nothing about the catch.
    expect(sent, 'no send was attempted, so the catch was never exercised').toContain(EMAIL);

    const rows = (await sql`
      SELECT count(*)::int AS n FROM auth_users WHERE email = ${EMAIL}`) as { n: number }[];
    expect(rows[0].n).toBe(1);
  }, 30_000);

  it('leaves the account signable-in despite the unsent verification', async () => {
    const res = await auth.api.signInEmail({
      body: { email: EMAIL, password: 'a-long-enough-password-1' },
    });
    expect(res.user.email).toBe(EMAIL);
  }, 30_000);
});
