import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

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
  /**
   * `secret` — a credential CI is SUPPOSED to hold. Absent ⇒ db-invariants must FAIL
   * under REQUIRE_SECRETS=1, because a silent skip would be unearned green.
   * `artifact` — gitignored or machine-local files CI cannot have; LOUD SKIP only,
   * never a failure (enforced instead at deploy via REQUIRE_CORPUS / predeploy-gate).
   * `provider` — a third-party service the check depends on is UNAVAILABLE (429/5xx),
   * as distinct from present-and-wrong. LOUD SKIP, never a failure and never a pass.
   * `withheld` — a credential CI is DELIBERATELY not given, by a recorded decision.
   * LOUD SKIP, never a failure. This is NOT a softening of the `secret` rule: it is the
   * distinction that rule always implied. Failing forever on a credential nobody intends
   * to supply produces a permanently red job, which teaches readers that red means
   * "probably fine" — the exact harm REQUIRE_SECRETS exists to prevent. Every use must
   * name the decision that withheld it, so the classification is reviewable and can be
   * reversed if the decision changes.
   */
  readonly kind?: 'secret' | 'artifact' | 'provider' | 'withheld';
}

/** Sidecar manifest path — set by db-invariants workflow; read by ci-skip-ceiling.mjs. */
const MANIFEST_ENV = 'LOUD_SKIP_MANIFEST';

interface ArtifactSkipRecord {
  readonly check: string;
  readonly missing: readonly string[];
  readonly suiteFile: string;
  /**
   * WHY this suite is exempt from the db-invariants skip ceiling. Recorded rather than inferred:
   * `ci-skip-ceiling.mjs` used to classify by ELIMINATION — anything absent from this manifest was
   * "secret-caused" — so the counter could not tell a gitignored asset from a withheld credential
   * from a suite that simply never announced itself. It now prints the kind it was told.
   */
  readonly kind: 'artifact' | 'provider' | 'withheld';
}

function detectSuiteFile(): string {
  // Any /test/ path EXCEPT the helpers' own frames (this file is test/helpers/loud-skip.ts and
  // always tops the stack). The old regex matched test/invariants/ ONLY, so every suite outside
  // that directory recorded suiteFile 'unknown' — a record the ceiling could never match, which
  // silently reclassified honestly-declared skips as secret-caused (run 32560311067: three of
  // four declared skips uncounted; verse-keys, the one invariants file, was the sole survivor).
  const stack = new Error().stack ?? '';
  for (const line of stack.split('\n')) {
    const m = line.match(/(\/test\/(?!helpers\/)[^:)]+?\.test\.[a-z]+)/);
    if (m) return m[1]!.replace(/^.*\/(test\/)/, '$1');
  }
  return 'unknown';
}

/** Record artifact-only skips for CI scripts — derived from announceSkip, not a hand-maintained list.
 *
 * APPEND-ONLY NDJSON (2026-08-22): the old read-modify-write of one JSON object LOST RECORDS
 * under vitest's parallel workers — a classic unlocked read/write race; run 32560311067 kept
 * only the last writer's record and the ceiling counted three honestly-declared skips as
 * secret-caused. One appendFileSync line per record is atomic at these sizes; the reader
 * (scripts/ci-skip-ceiling.mjs) parses lines. */
function recordArtifactSkip(check: string, missing: readonly string[], kind: ArtifactSkipRecord['kind']): void {
  const manifestPath = process.env[MANIFEST_ENV];
  if (!manifestPath) return;
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  const record: ArtifactSkipRecord = { check, missing, suiteFile: detectSuiteFile(), kind };
  appendFileSync(manifestPath, `${JSON.stringify(record)}\n`);
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
  const missingSecrets = requirements.filter((r) => !r.present && (r.kind ?? 'secret') === 'secret');
  const missingArtifacts = requirements.filter((r) => !r.present && r.kind === 'artifact');
  const unavailableProviders = requirements.filter((r) => !r.present && r.kind === 'provider');
  const withheld = requirements.filter((r) => !r.present && r.kind === 'withheld');
  if (missingSecrets.length === 0 && missingArtifacts.length === 0
    && unavailableProviders.length === 0 && withheld.length === 0) return false;

  const missingNames = [...missingSecrets, ...missingArtifacts, ...unavailableProviders, ...withheld].map((r) => r.name);
  const msg =
    `${check} DID NOT RUN — missing ${missingNames.join(' and ')}. ` +
    `It covers: ${covers}. A green suite without it is not evidence that any of those hold.`;

  // db-invariants: missing SECRETS fail closed; missing GITIGNORED ARTIFACTS loud-skip only.
  if (process.env.REQUIRE_SECRETS === '1' && missingSecrets.length > 0) {
    throw new Error(`REQUIRE_SECRETS: ${msg}`);
  }

  if (missingSecrets.length === 0 && missingArtifacts.length > 0) {
    recordArtifactSkip(check, missingArtifacts.map((r) => r.name), 'artifact');
  }
  if (missingSecrets.length === 0 && unavailableProviders.length > 0) {
    recordArtifactSkip(check, unavailableProviders.map((r) => r.name), 'provider');
  }
  // WITHHELD is recorded too (owner ruling, 2026-08-22). It was the one declared kind that never
  // reached the manifest, so a suite doing the RIGHT thing — declaring a credential CI is
  // deliberately not given, by a recorded decision (b24bfe3) — landed in the ceiling's residual
  // bucket and was counted as an unexplained secret skip. With the ceiling at 0 that single suite
  // held the gate red on its own, forever, no matter what else was fixed. This is that ruling
  // reaching the counter; it does NOT move the bar, and a missing SECRET still throws above.
  if (missingSecrets.length === 0 && withheld.length > 0) {
    recordArtifactSkip(check, withheld.map((r) => r.name), 'withheld');
  }

  if (process.env.GITHUB_ACTIONS === 'true') {
    // One line, no newlines — GitHub truncates an annotation at the first newline.
    console.warn(`::warning title=${check} NOT RUN::${msg}`);
  }
  console.warn(`\n⚠  NOT RUN — ${msg}\n`);
  return true;
}
