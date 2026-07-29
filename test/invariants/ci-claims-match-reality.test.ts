// A test file must not CLAIM that CI enforces it unless CI actually runs it.
//
// WHY THIS EXISTS. The ship committee's top-ranked risk was not a data defect — it was that
// `annotations-polymorphic.test.ts` and `sections-unit-ordinal.test.ts` each stated in their own
// headers, dated 2026-07-19, that CI now ran them "for real". It did not: commit `f229a93` parked
// the `.github/workflows/audit.yml` edit because the push lacked the `workflow` token scope, so
// the documentation half of that change landed and the enforcement half did not. The failure mode
// is specific and bad: the next contributor reads the header, believes the annotation schema and
// the published-status boundary are gated, ships a PR that drops `AND s.status = 'published'` from
// a catalog query, and it merges green — a licensing exposure by this repo's own framing,
// delivered through a gate everyone believed was closed.
//
// A wrong comment is normally cheap. A wrong comment ABOUT WHAT THE GATE ENFORCES is not: it is
// the one class of comment people act on without re-deriving.
//
// WHY THIS SHAPE, AND NOT A RED BUILD. The obvious alternative — assert that CI covers every
// DB-backed invariant, and let it fail until someone fixes CI — reproduces a mistake this repo
// already made and wrote down: `audit.yml` says a perpetually-red push "is an ignored signal, not
// a live one", which is exactly why the `db-invariants` guard step short-circuits to green with a
// warning today. So this test does NOT assert that coverage is good. It asserts something that is
// true right now and stays cheap to keep true: **the code does not lie about coverage.** It is
// green today and goes red the moment someone re-introduces a false claim.
//
// The real coverage gap is a separate, owner-gated item (repo secret `APP_DATABASE_URL_TEST` +
// a workflow edit needing `workflow` scope) tracked in `docs/OWNER_ACTIONS.md` §1. Measured under
// CI conditions (no `web/.env.local`): 75 of 200 web tests skip.
//
// This suite runs in the ROOT vitest project, which `scripts/audit.sh` invokes on every CI push —
// so unlike the web DB invariants, it genuinely executes in CI.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../..');
const workflowPath = path.join(repoRoot, '.github/workflows/audit.yml');
const webTestDir = path.join(repoRoot, 'web/test/invariants');

/** Phrases that assert CI runs a suite for real. Deliberately narrow: this must catch the
 *  specific "CI enforces me" claim, not every mention of the word CI. */
const CLAIMS_CI_RUNS_IT = [
  /CI\s+DOES\s+hold\s+an\s+owner\s+URL/i,
  /so\s+this\s+suite\s+(now\s+)?runs\s+there\s+for\s+real/i,
  /CI(?:'s)?\s+db-invariants\s+job\s+now\s+(?:ALSO\s+)?holds\s+an\s+owner\s+URL/i,
  /now\s+runs\s+(?:there\s+)?for\s+real\s+instead\s+of\s+skipping/i,
];

/** How `db-invariants` selects its targets. The job used to enumerate 13 files; as of the
 *  2026-07-29 owner ruling it globs the whole directory, because an allowlist made every new
 *  invariant opt-in to CI and forgetting one was invisible (both checks written that day were
 *  missing from it). This parser handles BOTH shapes, and returns 'none' for anything else so
 *  the vacuity guard below can fire. */
function ciTargets(): { mode: 'glob' | 'explicit' | 'none'; files: string[] } {
  const yml = readFileSync(workflowPath, 'utf8');
  const runLine = yml.split('\n').find((l) => l.includes('vitest run') && l.includes('test/invariants/'));
  if (!runLine) return { mode: 'none', files: [] };
  const explicit = [...runLine.matchAll(/test\/invariants\/([\w.-]+\.test\.tsx?)/g)].map((m) => m[1]!);
  if (explicit.length > 0) return { mode: 'explicit', files: explicit };
  // A bare directory target — `vitest run test/invariants/` — runs EVERY file under it.
  if (/vitest run\s+test\/invariants\/?(\s|$)/.test(runLine)) {
    return { mode: 'glob', files: readdirSync(webTestDir).filter((f) => /\.test\.tsx?$/.test(f)) };
  }
  return { mode: 'none', files: [] };
}

/** The web invariant files `db-invariants` actually executes. */
function filesRunByCi(): string[] {
  return ciTargets().files;
}

describe('CI claims match CI reality', () => {
  it('the workflow and the web invariant dir both exist (otherwise this test is vacuous)', () => {
    expect(existsSync(workflowPath), `${workflowPath} missing`).toBe(true);
    expect(existsSync(webTestDir), `${webTestDir} missing`).toBe(true);
    expect(readdirSync(webTestDir).filter((f) => /\.test\.tsx?$/.test(f)).length).toBeGreaterThan(0);
  });

  it('no web invariant claims CI runs it unless the workflow actually names it', () => {
    const runByCi = new Set(filesRunByCi());
    const liars: string[] = [];

    for (const file of readdirSync(webTestDir).filter((f) => /\.test\.tsx?$/.test(f))) {
      const text = readFileSync(path.join(webTestDir, file), 'utf8');
      const claims = CLAIMS_CI_RUNS_IT.some((re) => re.test(text));
      if (claims && !runByCi.has(file)) liars.push(file);
    }

    expect(
      liars,
      `These files state that CI runs them for real, but .github/workflows/audit.yml does not run them.\n`
        + `Either fix the workflow (needs the 'workflow' token scope — docs/OWNER_ACTIONS.md §1) or correct the claim.\n`
        + `Files: ${liars.join(', ')}`,
    ).toEqual([]);
  });

  it('the db-invariants job selects its targets in a shape this test can actually read', () => {
    // The vacuity guard. If the workflow is rewritten into a shape ciTargets() does not
    // understand, `files` is empty and the check above starts passing for the wrong reason.
    // Fail loudly instead. (This test did its job on 2026-07-29: the allowlist→glob rewrite
    // turned it red, which is what forced the parser to be taught the new shape rather than
    // the check quietly becoming vacuous.)
    const { mode, files } = ciTargets();
    expect(
      mode,
      'could not parse the db-invariants target selection out of audit.yml — the check above would '
        + 'pass vacuously. Teach ciTargets() the new workflow shape.',
    ).not.toBe('none');
    expect(files.length, `mode=${mode} resolved to zero files`).toBeGreaterThan(0);
  });

  it('a directory glob really does cover EVERY web invariant (no file is opt-in to CI)', () => {
    const { mode, files } = ciTargets();
    if (mode !== 'glob') return; // explicit mode is covered by the liar check above
    const onDisk = readdirSync(webTestDir).filter((f) => /\.test\.tsx?$/.test(f)).sort();
    // The whole point of the glob ruling: coverage is a property of the directory, not of
    // anyone remembering to add a line. If these ever diverge, the glob is not a glob.
    expect(files.slice().sort(), 'the parsed glob target does not match the directory contents').toEqual(onDisk);
    expect(onDisk.length, 'no web invariants on disk — this check would be vacuous').toBeGreaterThan(0);
  });
});
