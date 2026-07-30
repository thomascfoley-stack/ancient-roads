import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
   * `secret` — CI/db-invariants must FAIL when absent under REQUIRE_SECRETS=1.
   * `artifact` — gitignored or machine-local files CI cannot have; LOUD SKIP only,
   * never a failure (enforced instead at deploy via REQUIRE_CORPUS / predeploy-gate).
   */
  readonly kind?: 'secret' | 'artifact';
}

/** Sidecar manifest path — set by db-invariants workflow; read by ci-skip-ceiling.mjs. */
const MANIFEST_ENV = 'LOUD_SKIP_MANIFEST';

interface ArtifactSkipRecord {
  readonly check: string;
  readonly missing: readonly string[];
  readonly suiteFile: string;
}

function detectSuiteFile(): string {
  const stack = new Error().stack ?? '';
  for (const line of stack.split('\n')) {
    const m = line.match(/(\/test\/invariants\/[^:)]+)/);
    if (m) return m[1]!.replace(/^.*(\/test\/invariants\/)/, 'test/invariants/');
  }
  return 'unknown';
}

/** Record artifact-only skips for CI scripts — derived from announceSkip, not a hand-maintained list. */
function recordArtifactSkip(check: string, missing: readonly string[]): void {
  const manifestPath = process.env[MANIFEST_ENV];
  if (!manifestPath) return;
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  let manifest: { artifactSkips: ArtifactSkipRecord[] } = { artifactSkips: [] };
  if (existsSync(manifestPath)) {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { artifactSkips: ArtifactSkipRecord[] };
  }
  manifest.artifactSkips.push({ check, missing, suiteFile: detectSuiteFile() });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
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
  if (missingSecrets.length === 0 && missingArtifacts.length === 0) return false;

  const missingNames = [...missingSecrets, ...missingArtifacts].map((r) => r.name);
  const msg =
    `${check} DID NOT RUN — missing ${missingNames.join(' and ')}. ` +
    `It covers: ${covers}. A green suite without it is not evidence that any of those hold.`;

  // db-invariants: missing SECRETS fail closed; missing GITIGNORED ARTIFACTS loud-skip only.
  if (process.env.REQUIRE_SECRETS === '1' && missingSecrets.length > 0) {
    throw new Error(`REQUIRE_SECRETS: ${msg}`);
  }

  if (missingSecrets.length === 0 && missingArtifacts.length > 0) {
    recordArtifactSkip(check, missingArtifacts.map((r) => r.name));
  }

  if (process.env.GITHUB_ACTIONS === 'true') {
    // One line, no newlines — GitHub truncates an annotation at the first newline.
    console.warn(`::warning title=${check} NOT RUN::${msg}`);
  }
  console.warn(`\n⚠  NOT RUN — ${msg}\n`);
  return true;
}
