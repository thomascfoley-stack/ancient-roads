// The SEC-1 gate for user uploads - UPLOADER_DESIGN §4, acceptance check A7.
//
// §4: "Multi-user upload CANNOT ship while the auth layer carries the GHSA-g38m account-takeover
// class... An attacker who takes an account takes the sermons." Uploaded works are unpublished
// intellectual property, so this feature raises the value of every account and inherits the
// launch blocker. §4 also requires the gate be "enforced in CI, not prose".
//
// ── WHY THE CEILING IS A COMMITTED CONSTANT AND NOT AN ENV VAR ───────────────────────────────────
// CI cannot see Vercel's environment. A gate that read only `process.env` would be a check with no
// access to the thing it claims to check - green forever, whatever production does. That is the
// repo's "unearned green" (THE_LOOP §6): a check that could not have failed.
//
// So the ceiling lives in the repo where a test can read it, and the environment can only narrow
// it, never raise it. Multi-user upload requires BOTH `MULTI_USER_UPLOADS` here AND the env switch.
// Setting USER_CORPUS_MULTI_USER=true in Vercel while this constant is false does nothing - which
// is the property that makes the CI assertion protect production rather than merely intent.
//
// ── FLIPPING IT ─────────────────────────────────────────────────────────────────────────────────
// `MULTI_USER_UPLOADS = true` goes RED in CI while any advisory that docs/SECURITY.md adjudicates
// as in-path is still in `pnpm.auditConfig.ignoreGhsas`. Closing SEC-1 means the Better Auth direct
// cutover lands and those ids leave the ignore list; then, and only then, does this flip green.

/**
 * The committed ceiling on multi-user upload.
 *
 * TRUE as of 2026-08-08, on a premise that CHANGED since this comment was first written. The
 * 2026-08-05 version said "the Better Auth cutover is live on production, @neondatabase/auth is
 * gone" — ADR-107/108 then reversed exactly that: Neon Auth is the auth system and
 * `@neondatabase/auth` is a dependency again. What still holds is the part this flag actually
 * rests on: no advisory that docs/SECURITY.md adjudicates as in-path sits in
 * `pnpm.auditConfig.ignoreGhsas` (GHSA-g38m is not in it), so UPLOADER_DESIGN §4's condition 1 is
 * met. The mechanism survived the cutover; the stated reason did not, which is why it is corrected
 * here rather than left to read as though it had been re-checked.
 *
 * GHSA-g38m itself is now closed by CONFIGURATION, not structure — `Verify at Sign-up` ON in the
 * Neon console, per the ruling at the top of docs/SECURITY.md. Nothing in this repo can observe
 * that toggle.
 *
 * This is still gated: `web/test/invariants/sec1-upload-gate.test.ts` (A7) turns RED the moment any
 * advisory SECURITY.md adjudicates as in-path reappears in the ignore list while this is true. So
 * the flag cannot survive a regression in the thing that justified it.
 */
export const MULTI_USER_UPLOADS = true;

/** The env switch beneath the ceiling. Both must be set for multi-user upload. */
export const MULTI_USER_ENV = 'USER_CORPUS_MULTI_USER';

/** Comma-separated user ids permitted during the §4 owner-only beta. */
export const OWNER_IDS_ENV = 'USER_CORPUS_OWNER_IDS';

type Env = Record<string, string | undefined>;

export function multiUserUploadsEnabled(env: Env = process.env): boolean {
  return MULTI_USER_UPLOADS && env[MULTI_USER_ENV] === 'true';
}

export function ownerIds(env: Env = process.env): string[] {
  return (env[OWNER_IDS_ENV] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * `null` when this user may use the feature; otherwise the message to return as a 403.
 *
 * ── THE OWNER-ONLY BETA, ENFORCED RATHER THAN DESCRIBED ─────────────────────────────────────────
 * §4's carve-out permits a single-account beta before the cutover, on four conditions. Condition 2
 * is "the upload endpoints hard-allowlist the owner's user id (env var), so no second account can
 * reach them even if one exists". That condition was prose and nothing else until this function:
 * every user-corpus route called `requireUser()` and then served ANY authenticated caller.
 *
 * ── FAILS CLOSED IN PRODUCTION ──────────────────────────────────────────────────────────────────
 * An unset or empty allowlist in production denies everyone. One missing env var must never open
 * the feature to every account - the same posture, and for the same reason, as the SITE_PASSWORD
 * wall in `web/src/middleware.ts` after the 2026-07-09 public-prod incident.
 *
 * Outside production the gate stands down, also following that middleware: local development runs
 * one developer against a dev branch, and a gate that made `pnpm dev` unusable would be turned off
 * rather than obeyed.
 */
export function uploadDenial(userId: string, env: Env = process.env): string | null {
  if (multiUserUploadsEnabled(env)) return null;
  if (env.NODE_ENV !== 'production') return null;

  // The §4 owner-only beta. Still reachable by UNSETTING USER_CORPUS_MULTI_USER, which is why this
  // path survives the flag going true: it is the way back to a single account without a deploy.
  const owners = ownerIds(env);
  if (owners.length === 0) return 'Uploads are not enabled on this deployment.';
  return owners.includes(userId) ? null : 'Uploads are not enabled for this account.';
}
