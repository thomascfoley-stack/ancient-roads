# CI wiring — the db-invariants job (OWNER ACTION REQUIRED)

## Why this is a patch file instead of a commit

The agent's GitHub token carries scopes `gist, read:org, repo` — **not `workflow`**. GitHub refuses
any push that creates or updates a file under `.github/workflows/`:

```
! [remote rejected] reader -> reader (refusing to allow an OAuth App to create or
  update workflow `.github/workflows/audit.yml` without `workflow` scope)
```

So the workflow change cannot be pushed by the agent at all. Everything else in the CI slice (the
endpoint-guard widening, the corrected comments) IS committed and pushed; only the workflow edit is
parked here.

## What you need to do — one of these two

**Option A (preferred): grant the token `workflow` scope**, then tell the agent, and it will push
the change and run the red→green proof itself.

**Option B: apply the patch yourself**

```bash
cd /Users/tfoley/ap-golive
git apply docs/ci/db-invariants-job.patch
git add .github/workflows/audit.yml
git commit -m "CI: wire db-invariants to the Neon ci branch (owner + app_runtime suites + residue gate)"
git push origin reader
```

## Then: how CI actually gets triggered

`audit.yml` triggers on `push: branches: [main]` and `pull_request`. **A push to `reader` does not
run it.** To exercise the job without touching `main`, open a pull request from `reader` (or from a
throwaway branch) — for a same-repository PR, GitHub runs the workflow from the PR head, so the new
job takes effect immediately. Do not merge it; closing the PR afterwards is enough.

## The acceptance criterion is NOT "the job is green"

It is: **a previously-dark suite must go RED in CI on a seeded bug, then green.** A green job proves
nothing on its own — a suite that silently skips also produces green, which is precisely the
verse-keys vacuous pass relocated into the pipeline where it is harder to see.

What has been proven so far, and what has not:

- **PROVEN (locally, against the `ci` branch, using the job's exact commands):** the previously-dark
  suites RUN rather than skip — 3 files / 27 tests, zero skips — and a seeded bug turns them RED,
  then green. See `docs/evidence/part3/ci-suites-red-green.txt`.
- **NOT PROVEN:** that this happens *inside GitHub Actions*. That requires the workflow change to be
  pushed, which requires one of the two options above. Until then the CI half of the acceptance
  criterion is **UNVERIFIED**, and is labelled that way rather than implied.

## What the job does once applied

Two secrets, two suite groups, one hygiene gate:

| group | secret | suites | why |
|---|---|---|---|
| app_runtime | `APP_DATABASE_URL_TEST` | licensing, tenancy, highlight-tenancy, annotation-exact-substring, annotation-rls-tenancy | RLS is the thing under test, so they must run as the **non-BYPASSRLS** role — running them as owner would silently prove nothing |
| owner | `DATABASE_URL_TEST` | work-reader, sections-unit-ordinal, annotations-polymorphic, annotation-tables, library-published-boundary, search-sections, register-wall-surfaces | they SEED and DELETE fixtures, which `app_runtime` cannot do by design |
| hygiene | `DATABASE_URL_TEST` | `scripts/check-test-residue.mjs` | runs LAST, so the suites above cannot leave the ci branch dirty |

Each secret has its own guard emitting its own `::warning::`, so a missing secret is a **visible
placeholder**, never a quiet pass.
