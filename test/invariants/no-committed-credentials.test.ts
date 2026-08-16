import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * INVARIANT: no file tracked in the current tree contains an unredacted DB connection string.
 *
 * Why this exists as a TEST and not only as a pre-commit hook (O-1, 2026-08-16). The hook
 * (`.githooks/pre-commit` step 4) is a pre-FILTER: it inspects staged content, it is bypassed by
 * `git commit --no-verify`, and it only exists on a machine where package.json's `prepare` script
 * has run. None of that is enforcement. This test runs inside `npm run audit` (scripts/audit.sh:59
 * globs test/**\/*.test.ts) and in CI, so a credential that reaches the tree by ANY route goes red
 * afterwards rather than silently.
 *
 * Scope is the TREE, deliberately, not history. The 2026-08-16 leak is in git history permanently;
 * rotation makes it inert, `git filter-repo` is a much larger operation, and a history-scanning
 * check would be permanently and uninformatively red. What this can honestly assert is that a
 * fresh checkout hands nobody a live credential.
 *
 * The two legs are deliberately different in KIND, which is the whole lesson of the incident.
 * `bf2fbb0` redacted six evidence logs by PATTERN (`neondb_owner:npg_`) and a second live
 * credential in Neon's older 43-character password format survived on the same line for two days,
 * because no `npg_`-keyed search can see a non-`npg_` secret. So:
 *
 *   A. format-keyed, repo-wide      — catches Neon's current `npg_` secret anywhere.
 *   B. format-AGNOSTIC, evidence/   — catches ANY password shape in the one directory that has no
 *                                     legitimate reason to hold a real connection string.
 *
 * TWO-STAGE MATCHING, and the reason is a defect this file already committed once. v1 passed
 * `NEON_CONN.source` straight to `git grep -E`. A JS regex source is not a POSIX ERE: the escaped
 * slashes in `:\/\/` match nothing there, so `git grep` returned 0 lines and leg B was VACUOUSLY
 * GREEN — it stayed green against a seeded 43-character credential, the precise defect it exists
 * to catch. Caught by red-proofing it, not by reading it. So: `git grep -F` (a fixed string, no
 * dialect to disagree about) narrows to candidate files, and the precise regex runs in JS, in the
 * engine it was written for. The third test below now fails if that ever silently stops matching.
 *
 * LIMIT, stated rather than hidden: a non-`npg_` credential leaked OUTSIDE docs/evidence/ is caught
 * by neither leg. Closing that needs an entropy heuristic, which false-positives on this repo's own
 * fixtures (test/invariants/dev-only-target.test.ts uses `pw` and `SUPERSECRETPW` against real
 * ep-*.neon.tech hosts). A check that cries wolf on the fixtures gets deleted, and then there is no
 * check at all.
 */

const REDACTION_PLACEHOLDER = 'REDACTED-ROTATE-THIS';

/**
 * A password shorter than this is not a credential, it is a fixture. The floor is anchored OUTSIDE
 * this repo's current contents on purpose — 12 is the conventional minimum for a generated secret
 * (and the minimum `docs/SECURITY.md` records the app trying to enforce on user passwords), not a
 * number picked to make today's tree pass. Both Neon formats clear it by a wide margin: `npg_`+12
 * is 16, the older format is 43.
 *
 * It earns its keep immediately: `docs/evidence/hygiene-2026-07-29/loud-skip-app-url.log` records
 * a test command `postgres://u:p@ep-tiny-bonus-at3izo3y.neon.tech/neondb` — a real endpoint with a
 * ONE-character password. Without a floor, leg B is red on a fixture forever, and a check that is
 * always red gets deleted just as fast as one that is always green.
 *
 * LIMIT: a real credential shorter than 12 characters passes. Neon issues none.
 */
const MIN_CREDENTIAL_LENGTH = 12;

function passwordOf(connectionString: string): string {
  const afterScheme = connectionString.slice(connectionString.indexOf('://') + 3);
  return afterScheme.slice(afterScheme.indexOf(':') + 1, afterScheme.indexOf('@'));
}

// Neon's current secret format is `npg_` + 12; {10,} leaves margin without matching the bare
// literal `npg_` that this repo's own docs use when NAMING the pattern.
const NPG_SECRET = /npg_[A-Za-z0-9]{10,}/g;

// A connection string pointing at a real Neon endpoint. The password class is `[^@\s"']+` — no
// assumption whatsoever about what a credential looks like. That is leg B's entire point.
const NEON_CONN = /postgres(?:ql)?:\/\/[A-Za-z0-9_]+:[^@\s"']+@[^/\s"']*neon\.tech/g;

/** Tracked files containing `needle` as a literal. Fixed-string, so no regex dialect is involved. */
function candidateFiles(needle: string, pathspec?: string): string[] {
  const args = ['grep', '-I', '-l', '-F', needle];
  if (pathspec !== undefined) args.push('--', pathspec);
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  } catch (err) {
    // git grep exits 1 with no output when nothing matches. Any other status is a real failure and
    // must not be swallowed into a green — that would be the check certifying its own outage.
    const status = (err as { status?: number }).status;
    if (status === 1) return [];
    throw err;
  }
}

/** Every match of `re` across the given files, paired with the file it came from. */
function matchesIn(files: string[], re: RegExp): { file: string; match: string }[] {
  return files.flatMap((file) =>
    (readFileSync(file, 'utf8').match(re) ?? []).map((match) => ({ file, match })),
  );
}

const maskPassword = (s: string): string => s.replace(/:[^@]+@/, ':<REDACTED-BY-THIS-TEST>@');

describe('no committed credentials (O-1)', () => {
  it('leg A — no tracked file carries a Neon npg_ secret', () => {
    const offenders = matchesIn(candidateFiles('npg_'), NPG_SECRET);
    expect(offenders.map((o) => o.file)).toEqual([]);
  });

  it('leg B — no evidence log carries an unredacted Neon connection string', () => {
    const unredacted = matchesIn(candidateFiles('postgres', 'docs/evidence/*'), NEON_CONN)
      .filter(({ match }) => !match.includes(`:${REDACTION_PLACEHOLDER}@`))
      .filter(({ match }) => passwordOf(match).length >= MIN_CREDENTIAL_LENGTH);
    expect(
      unredacted.map(({ file, match }) => `${file}: ${maskPassword(match)}`),
      `docs/evidence/ must never hold a real connection string; use ${REDACTION_PLACEHOLDER}`,
    ).toEqual([]);
  });

  it('leg B is not vacuous — NEON_CONN still matches the redacted strings known to be there', () => {
    // v1 of this file was green because its pattern matched NOTHING. Leg B can only be trusted
    // while it demonstrably matches the connection strings the tree is known to contain — the six
    // logs bf2fbb0 redacted. If a refactor, an escaping change or a directory move breaks the
    // regex again, this goes red instead of leg B going quietly green. (THE_LOOP §6.)
    const all = matchesIn(candidateFiles('postgres', 'docs/evidence/*'), NEON_CONN);
    expect(all.length).toBeGreaterThan(0);
    expect(all.some(({ match }) => match.includes(`:${REDACTION_PLACEHOLDER}@`))).toBe(true);
  });
});
