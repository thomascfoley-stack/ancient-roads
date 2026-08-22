// Neon equivalent of better-auth-live.test.ts (ADR-107/108/109,
// docs/AUTH_V2_IMPLEMENTATION.md §8) — drives Neon Auth's own hosted API instead of a throwaway
// harness. It is the difference between "the SDK config typechecks" and "auth works".
//
// NOT RUN without NEON_AUTH_BASE_URL / NEON_AUTH_COOKIE_SECRET. Those are Vercel-production-only
// as of this cutover (docs/AUTH_V2_IMPLEMENTATION.md §0) — nobody has run this locally yet. It
// exists so the moment those vars are available to a session (CI, or a future local .env.local),
// this proves the swap rather than trusting the type-level shape checked in neon-auth-config.test.ts.
//
// ── data} vs THROW ────────────────────────────────────────────────────────────────────────────
// Better Auth's server `.api.*` methods THREW on bad input (the old suite used
// `.rejects.toThrow()`). Neon's server methods behave like its CLIENT — they return
// `{ data, error }` and never throw for an auth-level failure (per createNeonAuth's own JSDoc
// examples: `const { error } = await auth.signIn.email(...)`). Getting this wrong would make
// "refuses the wrong password" pass for the wrong reason (an unhandled rejection vitest treats as
// a throw) rather than the real one (`error` populated, `data` null).
//
// Neon's schema/table names in our own DB are undocumented (checked 2026-08-08), so unlike
// better-auth-live.test.ts this cannot also assert on raw rows -- only on what the API returns.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { announceSkip } from '../helpers/loud-skip';

const BASE_URL = process.env.NEON_AUTH_BASE_URL;
const SECRET = process.env.NEON_AUTH_COOKIE_SECRET;
// `withheld`, not `secret` — CI is DELIBERATELY not given these, and the decision is
// recorded (docs/pm/orders/2026-08-21-ci-db-invariants-unblock.md, Part 2 WITHDRAWN).
// Reason: the suite below signs up a REAL user against whatever Neon Auth instance these
// point at, and has no delete path — so production credentials in CI would accumulate
// undeletable accounts on every run, and a separate instance is more machinery than this
// check is worth (it has never executed once; auth is proven in production and by daily
// use). Classed `secret`, it failed forever and made db-invariants permanently red, which
// is what teaches readers to ignore red. It now reports NOT RUN, loudly, which is the
// truth. If a non-production instance is ever provisioned, change this back to `secret`.
const SKIP = announceSkip(
  // MUST match the describe title below: ci-skip-ceiling.mjs cross-checks the manifest record's
  // check name against the suite's vitest titles (the anti-hand-edit guard), and the short name
  // 'neon-auth-live' matched neither direction — so the one suite declaring `withheld` correctly
  // was still counted secret-caused (run 32561448762, the last unaccounted suite). Every other
  // declared suite already uses its describe title as its check name.
  'Neon Auth against the real hosted service',
  [
    { name: 'NEON_AUTH_BASE_URL', present: Boolean(BASE_URL), kind: 'withheld' },
    { name: 'NEON_AUTH_COOKIE_SECRET', present: Boolean(SECRET), kind: 'withheld' },
  ],
  'Neon Auth can create and authenticate a user against the real hosted service',
);

const STAMP = Date.now().toString(36);
const EMAIL = `neonauth-live-${STAMP}@example.invalid`;
const PASSWORD = 'correct-horse-battery-staple-9';

describe.skipIf(SKIP)('Neon Auth against the real hosted service', () => {
  let auth: ReturnType<typeof import('@/lib/auth/neon-auth').getAuth>;

  beforeAll(async () => {
    auth = (await import('@/lib/auth/neon-auth')).getAuth();
  });

  // No afterAll delete: Neon's server client here has no admin/delete-by-email call that doesn't
  // require the caller's own session, which this suite does not persist across tests. EMAIL is
  // timestamp-unique so re-running never collides; this must never point at production (§0 — the
  // vars only exist in Vercel production today, so running this at all means someone deliberately
  // supplied dev-branch equivalents).

  it('signs a new user up, unverified', async () => {
    const { data, error } = await auth.signUp.email({ email: EMAIL, password: PASSWORD, name: 'Live Proof' });
    expect(error, error ? JSON.stringify(error) : undefined).toBeFalsy();
    expect(data?.user.email).toBe(EMAIL);
    // The g38m precondition, recorded rather than assumed (docs/AUTH_CUTOVER_V2_NEON.md, ADR-109):
    // a fresh signup is unverified. Google OAuth is live on this project with no verified-email-
    // before-link control we could find (ADR-109) -- this is the state an attacker pre-registers
    // into and a later Google login auto-links onto.
    expect(data?.user.emailVerified).toBe(false);
  }, 30_000);

  it('signs that user in', async () => {
    const { data, error } = await auth.signIn.email({ email: EMAIL, password: PASSWORD });
    expect(error, error ? JSON.stringify(error) : undefined).toBeFalsy();
    expect(data?.user.email).toBe(EMAIL);
  }, 30_000);

  it('refuses the wrong password without throwing', async () => {
    // Without this, the two tests above would pass against an implementation that accepted
    // anything -- they only ever present correct credentials.
    const { data, error } = await auth.signIn.email({ email: EMAIL, password: 'not-the-password-at-all' });
    expect(error).toBeTruthy();
    expect(data).toBeFalsy();
  }, 30_000);
});
