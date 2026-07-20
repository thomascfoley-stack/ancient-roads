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
// CI conditions (no `web/.env.local`): 69 of 177 web tests skip.
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

/** The web invariant files `db-invariants` actually executes, parsed from the workflow. */
function filesRunByCi(): string[] {
  const yml = readFileSync(workflowPath, 'utf8');
  // the job's run line enumerates its targets explicitly, e.g.
  //   run: corepack pnpm exec vitest run test/invariants/licensing.test.ts test/invariants/tenancy.test.ts
  const runLine = yml.split('\n').find((l) => l.includes('vitest run') && l.includes('test/invariants/'));
  if (!runLine) return [];
  return [...runLine.matchAll(/test\/invariants\/([\w.-]+\.test\.tsx?)/g)].map((m) => m[1]!);
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

  it('the db-invariants job still enumerates its targets explicitly (so the check above can see them)', () => {
    // If someone rewrites the job to a glob, filesRunByCi() silently returns [] and the test above
    // starts passing for the wrong reason. Fail loudly instead.
    const files = filesRunByCi();
    expect(
      files.length,
      'could not parse any test/invariants/*.test.ts targets out of audit.yml — the check above would '
        + 'pass vacuously. Update filesRunByCi() to match the new workflow shape.',
    ).toBeGreaterThan(0);
  });
});
