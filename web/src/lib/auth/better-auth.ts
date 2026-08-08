// Better Auth, run directly. The SEC-1 remediation: see docs/AUTH_CUTOVER_DESIGN.md.
//
// ── WHY THIS REPLACES @neondatabase/auth ────────────────────────────────────────────────────────
// `createNeonAuth` returned a proxy to a better-auth server hosted by Neon, so the OAuth auto-link
// logic behind GHSA-g38m ran on their infrastructure at a version we could neither see nor set.
// Running Better Auth here makes the version and the config lever ours. That is the entire point;
// nothing else about the cutover matters if this file does not own the configuration.
//
// ── NO SOCIAL PROVIDERS, AND THAT IS THE FIX ────────────────────────────────────────────────────
// GHSA-g38m needs BOTH email/password AND social login present: the attacker pre-registers the
// victim's address unverified, and the victim's later Google login auto-links onto it. With no
// OAuth callback there is nothing to auto-link, so the class is closed STRUCTURALLY rather than by
// configuration -- a property that cannot regress when someone sets a flag wrong.
//
// **Adding a social provider here re-opens GHSA-g38m** unless `account.accountLinking` is
// configured to link only when the local account's email is already verified (the 1.6.11 fix,
// proven in the spike's Proof 4). Do not add one without doing that work and re-running that proof.
//
// ── LAZY CONSTRUCTION, FOR THE SAME REASON THE NEON CLIENT WAS LAZY ─────────────────────────────
// Building at module load would require APP_DATABASE_URL while `next build` collects page data for
// the auth route, which is exactly how the previous wiring broke the build. Deferred to first
// request, memoised thereafter.

import { Pool } from '@neondatabase/serverless';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { runtimeUrl } from '@/lib/db';
import { actionEmail, sendMail } from '@/lib/mail';
import { createAuthRateLimitStorage } from './rate-limit-storage';

let _pool: Pool | null = null;

function pool(): Pool {
  // One pool per lambda instance. `runtimeUrl()` is db.ts's, so Better Auth connects as the
  // least-privilege app_runtime role like everything else -- never as the BYPASSRLS owner.
  // Migration 104 grants that role DML on the four auth tables and deliberately leaves RLS off
  // them; the reasoning is in the migration, and it matters, because sign-in has to read a user
  // row before any session exists to scope it by.
  _pool ??= new Pool({ connectionString: runtimeUrl() });
  return _pool;
}

/**
 * The configuration, exported so the schema invariant derives the expected tables from the SAME
 * object the app runs on.
 *
 * `db/migrations/104_better_auth_schema.sql` hand-writes DDL for tables Better Auth generates from
 * these options. A second, hand-maintained description of a schema is this repo's most-punished
 * defect (MASTER.md watchlist, twelve instances), so
 * `web/test/invariants/better-auth-schema.test.ts` feeds this object to `getAuthTables()` and
 * compares the result against the migration. Upgrade Better Auth and gain a column, and that test
 * goes red instead of production failing on a missing column.
 */
export const authOptions = {
  appName: 'Ancient Paths',
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  basePath: '/api/auth',

  // Better Auth's defaults are `user` / `session` / `account` / `verification`. `user` is a
  // RESERVED WORD in Postgres: it would need quoting at every call site, and an unquoted
  // `SELECT ... FROM user` silently resolves to `current_user` rather than erroring. The prefix
  // also makes these four legible as auth infrastructure beside 21 user-scoped content tables.
  user: { modelName: 'auth_users' },
  session: { modelName: 'auth_sessions' },
  account: { modelName: 'auth_accounts' },
  verification: { modelName: 'auth_verifications' },

  // ── THE LIMITER IS THE DATABASE'S, NOT THIS PROCESS'S — audit A1-2 (HIGH) ────────────────────
  // Unset, Better Auth resolves storage to `"memory"`: a module-level Map, one per lambda, reset on
  // every cold start. Its own defaults (3 per 10s on sign-in/sign-up, 3 per 60s on forget-password)
  // therefore bounded ONE INSTANCE rather than one attacker — and accounts here are free and
  // unverified, so that was fleet-width signup, distributed credential stuffing, and unbounded
  // password-reset mail to any address an attacker chose.
  //
  // The mechanism already existed and was not being used here: `api_rate_limit` (migration 008)
  // backs /api/gate and /api/ask. No new table, no migration, no dependency.
  //
  // `customStorage`, NOT `secondaryStorage` — the latter would also relocate SESSION storage, which
  // is a much larger change than this finding. And it implements `consume`, so Better Auth takes
  // its atomic path instead of `legacyConsume`, whose own comment concedes it is "best-effort"
  // under concurrency. The attack is concurrent by definition.
  rateLimit: {
    enabled: true,
    customStorage: createAuthRateLimitStorage(),
  },

  emailAndPassword: {
    enabled: true,
    // 12, against Better Auth's default of 8. This is the only credential in the system and
    // there is no second factor.
    minPasswordLength: 12,
    // FALSE deliberately. Requiring verification to sign in means a mail outage locks every
    // account out, including the owner's, with no way back in. Verification mail is still sent
    // on signup (below); it is just not a gate on entry. Revisit when a second admin path
    // exists. The security argument that would normally justify the gate -- unverified accounts
    // being hijackable by OAuth auto-link -- does not apply here, because there is no OAuth.
    requireEmailVerification: false,
    // A reset means "I lost control of this password". Any session opened with the old one must
    // not survive it.
    revokeSessionsOnPasswordReset: true,

    // ── BOTH SENDS BELOW ARE FIRE-AND-FORGET, AND THAT IS BETTER AUTH'S CHOICE, NOT OURS ────────
    // 1.6.26 wraps `sendVerificationEmail` AND `sendResetPassword` in `runInBackgroundOrAwait`,
    // so a throw from either never reaches the caller. Measured, not assumed: removing a
    // defensive try/catch from the verification send changed nothing, because the rejection was
    // already isolated. The catch was deleted rather than kept as decoration.
    //
    // The consequence is worth stating plainly, because an earlier version of this comment got it
    // backwards: **a failed reset email is invisible to the reader.** They are told to check their
    // inbox either way. Nothing in the app can surface that, so RESEND_API_KEY is effectively
    // REQUIRED in production for password reset to exist at all -- `sendMail` throwing there is
    // what makes the failure visible in the server log rather than nowhere.
    sendResetPassword: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: 'Reset your Ancient Paths password',
        ...actionEmail(
          'Reset your password',
          'Use the link below to choose a new password. It can be used once, and expires in an hour.',
          'Choose a new password',
          url,
        ),
      });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: 'Confirm your email for Ancient Paths',
        ...actionEmail(
          'Confirm your email',
          'Confirm this address so we can reach you about your account.',
          'Confirm my email',
          url,
        ),
      });
    },
  },
} satisfies BetterAuthOptions;

function buildAuth() {
  // `database` is supplied here rather than in `authOptions` so that importing the options never
  // opens a connection pool: the schema invariant needs the shape, not a database.
  return betterAuth({ ...authOptions, database: pool() });
}

export type Auth = ReturnType<typeof buildAuth>;

let _auth: Auth | null = null;

export function getAuth(): Auth {
  _auth ??= buildAuth();
  return _auth;
}
