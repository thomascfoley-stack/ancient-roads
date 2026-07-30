// A skipped invariant must READ as "NOT RUN", never as coverage.
//
// The hazard, in the repo's own words (audit.yml, the db-invariants guard):
// "THIS JOB BEING GREEN DOES NOT MEAN THOSE INVARIANTS PASSED — it means they never ran."
// That warning exists at the WORKFLOW level for one job and one secret. It does not exist
// for the main `audit` job, which runs the same suites without REQUIRE_DB and skips every
// DB-backed invariant in silence, and it did not exist at all for DEEPINFRA_API_KEY.
//
// So the announcement belongs with the CHECK, not with the job: a suite that cannot run says
// so itself, wherever it is invoked from — locally, in either CI job, or from `npm run audit`.
// `::warning title=…::` on stdout is GitHub Actions' annotation format, so in CI this surfaces
// on the run summary next to the green tick; locally it is a plain banner.
//
// Vitest reports these as SKIPPED, never PASSED — the annotation makes the skip impossible to
// mistake for a pass when someone is reading a wall of green.

/** Requirements a suite needs before it can prove anything. */
export interface SkipRequirement {
  /** Env var / resource name, e.g. 'DEEPINFRA_API_KEY'. */
  readonly name: string;
  /** True when the requirement is satisfied. */
  readonly present: boolean;
}

/**
 * Announce, loudly, that a suite will not run — and why, and what stops being covered.
 * Returns true when the suite must be skipped, for use as `describe.skipIf(...)`.
 */
export function announceSkip(
  check: string,
  requirements: readonly SkipRequirement[],
  covers: string,
): boolean {
  const missing = requirements.filter((r) => !r.present).map((r) => r.name);
  if (missing.length === 0) return false;

  const msg =
    `${check} DID NOT RUN — missing ${missing.join(' and ')}. ` +
    `It covers: ${covers}. A green suite without it is not evidence that any of those hold.`;

  // db-invariants with secrets configured must FAIL, not skip green (work-order v2 Stage 1.2).
  if (process.env.REQUIRE_SECRETS === '1') {
    throw new Error(`REQUIRE_SECRETS: ${msg}`);
  }

  if (process.env.GITHUB_ACTIONS === 'true') {
    // One line, no newlines — GitHub truncates an annotation at the first newline.
    console.warn(`::warning title=${check} NOT RUN::${msg}`);
  }
  console.warn(`\n⚠  NOT RUN — ${msg}\n`);
  return true;
}
