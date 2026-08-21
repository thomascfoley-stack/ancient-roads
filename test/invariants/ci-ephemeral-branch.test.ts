// The db-invariants job runs against an EPHEMERAL Neon branch. This locks the four properties
// that make that safe, because each one fails SILENTLY if it is broken.
//
// WHY THIS EXISTS. Before 2026-08-21 the job topped up ONE long-lived branch, and audit.yml's own
// comments are the record of what that cost: `main` red for 12 consecutive runs across 3 days, a
// FORGET list that deleted 044's ledger row on every run (so a run that finally completed 044 had
// its record erased before the next started), a 35-minute wedge, and 044 applied by hand out of
// band. Cutting a copy-on-write branch per run removes the shared state those failures lived in.
//
// The four properties, and why each needs a test rather than a comment:
//
//   1. EPH_BRANCH is exported to GITHUB_ENV BEFORE the create command runs. If it is exported
//      after, a creation that half-succeeds leaks a branch the cleanup step cannot name — and
//      Neon caps branches per project, so the leak eventually fails an unrelated run.
//   2. The delete step is `if: always()`. Without it, every red run leaks a branch.
//   3. No step re-introduces a step-level `env:` for the four values the create step writes to
//      GITHUB_ENV. This is the sharpest one: `${{ secrets.X }}` renders as an EMPTY STRING when
//      the secret is unset, so a well-meaning step-level `APP_DATABASE_URL: ${{ secrets.… }}`
//      SHADOWS the ephemeral URL with '' — and the suites then skip or point at the parent.
//      audit.yml has warned about exactly this shadowing in prose since 2026-07; prose did not
//      stop the literals from being there.
//   4. The create step refuses the production endpoint before exporting anything. The endpoint id
//      is minted at runtime, so it can no longer be a reviewable literal in the file; this is the
//      check that replaces reading it.
//
// Root vitest project — `scripts/audit.sh` runs this on every CI push, so it genuinely executes.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const repoRoot = path.resolve(__dirname, '../..');
const workflowPath = path.join(repoRoot, '.github/workflows/audit.yml');

interface Step { name?: string; if?: string; env?: Record<string, unknown>; run?: string; uses?: string }
interface Workflow { jobs: Record<string, { steps: Step[] }> }

/** Values the ephemeral-branch step writes to GITHUB_ENV. A step-level `env:` for any of these
 *  shadows the real value — with '' when the referenced secret is unset. */
const GITHUB_ENV_OWNED = ['DATABASE_URL', 'APP_DATABASE_URL', 'SEED_TEST_ENDPOINT', 'MIGRATE_TARGET_ENDPOINT'] as const;

export interface Violation { code: string; detail: string }

/** Pure, so the red-proof below can drive THIS function against a seeded-broken workflow rather
 *  than against a copy of its logic. */
export function checkEphemeralBranch(wf: Workflow): Violation[] {
  const out: Violation[] = [];
  const job = wf.jobs?.['db-invariants'];
  if (!job) return [{ code: 'no-job', detail: 'db-invariants job is missing' }];
  const steps = job.steps ?? [];

  const create = steps.find((s) => /create ephemeral neon branch/i.test(s.name ?? ''));
  const del = steps.find((s) => /delete ephemeral neon branch/i.test(s.name ?? ''));

  if (!create) out.push({ code: 'no-create', detail: 'no step creates an ephemeral Neon branch' });
  if (!del) out.push({ code: 'no-delete', detail: 'no step deletes the ephemeral Neon branch' });

  if (create) {
    const run = create.run ?? '';
    const exportAt = run.indexOf('EPH_BRANCH=');
    const createAt = run.indexOf('branches create');
    if (exportAt === -1) {
      out.push({ code: 'no-eph-export', detail: 'create step never exports EPH_BRANCH' });
    } else if (createAt !== -1 && exportAt > createAt) {
      out.push({
        code: 'eph-export-too-late',
        detail: 'EPH_BRANCH is exported AFTER `branches create`; a half-created branch would leak unnamed',
      });
    }
    if (!/PROD_ENDPOINT_PREFIX/.test(JSON.stringify(create.env ?? {})) || !/exit 1/.test(run)) {
      out.push({ code: 'no-prod-refusal', detail: 'create step does not refuse the production endpoint before exporting' });
    }
    if (!/parent/i.test(run)) out.push({ code: 'no-parent', detail: 'create step does not name a parent branch' });
  }

  if (del && del.if !== 'always()') {
    out.push({ code: 'delete-not-always', detail: `delete step guard is ${JSON.stringify(del.if)}, not always()` });
  }

  for (const step of steps) {
    for (const key of GITHUB_ENV_OWNED) {
      if (step.env && Object.prototype.hasOwnProperty.call(step.env, key)) {
        out.push({
          code: 'shadowed-env',
          detail: `step ${JSON.stringify(step.name ?? step.uses ?? '?')} sets ${key} as a step-level env, shadowing the ephemeral value`,
        });
      }
    }
  }
  return out;
}

const workflow = parse(readFileSync(workflowPath, 'utf8')) as Workflow;

describe('db-invariants runs against an ephemeral Neon branch', () => {
  it('holds all four properties', () => {
    expect(checkEphemeralBranch(workflow)).toEqual([]);
  });

  // Red-proof: seed each defect into a DEEP COPY and prove the same function reports it. A check
  // nobody has watched fail is not a check (docs/THE_LOOP.md rule 4).
  const clone = (): Workflow => JSON.parse(JSON.stringify(workflow)) as Workflow;
  const steps = (wf: Workflow) => wf.jobs['db-invariants']!.steps;
  const codesFor = (wf: Workflow) => checkEphemeralBranch(wf).map((v) => v.code);

  it('goes red when the delete step is not always()', () => {
    const wf = clone();
    const del = steps(wf).find((s) => /delete ephemeral/i.test(s.name ?? ''))!;
    del.if = "success()";
    expect(codesFor(wf)).toContain('delete-not-always');
  });

  it('goes red when a step shadows an ephemeral value with a step-level env', () => {
    const wf = clone();
    const vitestStep = steps(wf).find((s) => /DB-backed invariants/i.test(s.name ?? ''))!;
    vitestStep.env = { ...(vitestStep.env ?? {}), APP_DATABASE_URL: '${{ secrets.APP_DATABASE_URL_TEST }}' };
    expect(codesFor(wf)).toContain('shadowed-env');
  });

  it('goes red when EPH_BRANCH is exported after the branch is created', () => {
    const wf = clone();
    const create = steps(wf).find((s) => /create ephemeral/i.test(s.name ?? ''))!;
    create.run = 'npx neonctl branches create --name x\necho "EPH_BRANCH=x" >> "$GITHUB_ENV"\nexit 1\n';
    expect(codesFor(wf)).toContain('eph-export-too-late');
  });

  it('goes red when the cleanup step is removed entirely', () => {
    const wf = clone();
    wf.jobs['db-invariants']!.steps = steps(wf).filter((s) => !/delete ephemeral/i.test(s.name ?? ''));
    expect(codesFor(wf)).toContain('no-delete');
  });

  it('goes red when the production refusal is dropped from the create step', () => {
    const wf = clone();
    const create = steps(wf).find((s) => /create ephemeral/i.test(s.name ?? ''))!;
    delete (create.env ?? {})['PROD_ENDPOINT_PREFIX'];
    expect(codesFor(wf)).toContain('no-prod-refusal');
  });
});
