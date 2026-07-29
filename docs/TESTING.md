# TESTING — how to run every check

Every command below is verified against `package.json`, `scripts/`, and the test
configs in this tree. If a check needs a secret or a database you don't have, say
**UNVERIFIED** — never "PASSED". A suite that skipped its DB-backed tests and
exited 0 is *not run*, not green (see §False-green rule).

## The one command: `npm run audit`

`npm run audit` (equivalently `corepack pnpm run audit` — **not** `pnpm audit`,
which is pnpm's own built-in command) runs `bash scripts/audit.sh`
(`package.json` → `scripts.audit`). It runs every gate, reports **all** failures
(not just the first), and exits non-zero if any gate failed. In order
(`scripts/audit.sh`):

| # | Gate | Exact command |
|---|---|---|
| 1 | typecheck — root (strict) | `corepack pnpm exec tsc --noEmit` |
| 2 | typecheck — web/ | `cd web && npx tsc --noEmit` |
| 3 | typecheck — web/test | `cd web && npx tsc --noEmit -p tsconfig.test.json` |
| 4 | lint — root | `corepack pnpm exec eslint src test` |
| 5 | lint — web/ | `cd web && npx next lint --quiet` |
| 6 | unused files/exports/deps | `corepack pnpm exec knip` |
| 7 | deps — CVE gate | `node scripts/deps-audit.mjs` |
| 8 | tests + coverage | `corepack pnpm exec vitest run --coverage` |
| 9 | qa — Layer 1 invariants + regressions | `corepack pnpm run qa` |
| 10 | data — Gate B license (fail-closed) | `corepack pnpm exec tsx src/ingest/check-licenses.ts` |

Notes on individual gates:

- **Gate 7 (deps-audit)** is the real CVE gate. `pnpm audit` is broken by npm's
  retirement of the legacy audit endpoint, so `scripts/deps-audit.mjs` queries
  the version-aware **bulk advisory endpoint** over the prod dependency closure
  and fails on any high/critical advisory not on the documented ignore list
  (`package.json` → `pnpm.auditConfig.ignoreGhsas`, justified in
  `docs/SECURITY.md`).
- **Gate 8** uses the root `vitest.config.ts`: root `test/**/*.test.ts` only,
  v8 coverage with `all: true` over `src/**/*.ts`, summary written to
  `coverage/`. After the gates, `audit.sh` prints an **informational** list of
  source files with zero coverage (never fails the run).
- **Gate 9** is the `qa` script (below).
- **Gate 10 (Gate B)** validates `ingest/sources.config.json` — every source
  Public Domain / CC BY / CC BY-SA with recorded provenance — and, when
  `DATABASE_URL` is set and a `sources` table exists, additionally asserts zero
  `published` rows with a disallowed/null license. Needs no database for the
  manifest check.

## Individual suites

- **`corepack pnpm test`** — root vitest suite (`vitest run`, root
  `vitest.config.ts`, `test/**/*.test.ts`). Offline; includes the held-out hash
  pin (`test/heldout-frozen-hash.test.ts`), the observability logger contract
  (`test/observability.test.ts`), and the src/↔web/ byte-sync guards.
  `corepack pnpm test:watch` for watch mode.
- **`corepack pnpm qa`** — `vitest run --config web/vitest.config.ts && vitest
  run test/rate-limit.test.ts`. The web suite (`web/test/**`: invariants,
  regressions, middleware gate, db-boot assert) plus the rate-limit tests.
- **`corepack pnpm eval`** — `tsx src/evals/run.ts`: the offline eval harness.
  Loads every YAML case in `evals/cases/`, obtains a response per case from the
  adapter, runs the V1 verifier + expectation checks, prints a per-suite
  report. Today the only adapter is fixture-backed (`evals/fixtures/`); cases
  without a fixture report as **pending**, not pass.
- **`corepack pnpm gate:ingest`** — `tsx src/ingest/gate-ingest.ts`. The
  ingestion gate (license/provenance/verse-keys/count-parity/content-sanity/
  text-match/versification/coverage). Read-only against the DB, but it **does
  require** `DATABASE_URL` or `DATABASE_URL_UNPOOLED` (env or `web/.env.local`)
  — without one it cannot run. Per-work mode: `corepack pnpm gate:ingest --
  --work=<id> --jsonl=<file.jsonl> [--match-author=<name>]`. Full operator
  documentation: `docs/INGESTION_RUNBOOK.md`.
- **`corepack pnpm check:data`** — `check:licenses && check:coverage`
  (`tsx src/ingest/check-licenses.ts`, then
  `tsx src/ingest/check-corpus-coverage.ts`; `:sections` variant via
  `corepack pnpm check:coverage:sections`). The coverage check needs a DB URL.

## Live harnesses (need secrets + a running target)

- **interpretation_bait (faithfulness), `docs/BAIT_HARNESS.md`** — re-runs the
  bait suite through the real `teach()` pipeline via the permanent,
  secret-gated `/api/eval/bait` endpoint (missing secret ⇒ 503, fail closed).
  Requires `EVAL_HARNESS_SECRET` in `web/.env.local` and a running dev server:
  `PORT=<dev-port> npx tsx --env-file=web/.env.local src/evals/run-bait.mts`.
  Non-zero exit if any production-screen leak reaches the user. **Bar: ≥99%.
  Recorded baseline: 35/35 observed, 0 breaches, live 2026-07-10** (WORKLOG
  2026-07-10 "FAITHFULNESS GATE — MEASURED LIVE"). ⚠️ **Corrected 2026-07-19:**
  this line previously dated the run 2026-07-11 and implied the bar was met.
  **35/35 does NOT clear ≥99%** — by the rule of three it is a **95% lower bound
  of ≈92%**, and the ≥99% bar needs **~300** clean cases. Re-running the same 35
  does not move the bound; only more distinct cases do.
- **Held-out accuracy eval, `docs/HELDOUT_EVAL_DESIGN.md`** — the real
  ship/no-ship accuracy gate, run against a live DB through the shipped routing
  path: `cd web && npx tsx --env-file=.env.local src/scripts/eval-heldout.mts
  --frozen`. Set discipline: **v3 is now a dev set** (measured against
  repeatedly; fixes were tuned on it). **v4 (`FROZEN_V4`) is the frozen set** —
  minted with self-anchored labels and content-hash-pinned in
  `test/heldout-frozen-hash.test.ts` *before* any accuracy number existed, per
  **ADR-024 — Held-out v4: mint/freeze with self-anchored labels**. v4 has no
  relabel path: any label fix is a v4.1 re-freeze with a new pin. Never tune
  anything against the frozen set; read the v4 caveats in
  `docs/HELDOUT_EVAL_DESIGN.md` before citing its number.

## DB-backed invariants and the false-green rule

Three `web/test/invariants/` suites execute behavioral checks against a real
database — `tenancy.test.ts`, `licensing.test.ts`,
`highlight-tenancy.test.ts` — and `test/retrieval.integration.test.ts` runs
against real Neon + DeepInfra. All of them **skip themselves** when the env
they need is absent (`describe.skipIf(!dbUrl)` via
`web/test/helpers/env.ts → requireDbInCi()`; the integration test additionally
requires `RUN_INTEGRATION`).

**The false-green rule: a skipped suite exits 0, so green means "not run",
not "passed".** When you report results, say which suites actually executed.

- Locally, the suites find a DB via `APP_DATABASE_URL` / `DATABASE_URL` in the
  environment or `web/.env.local`.
- `REQUIRE_DB=1` **forces** the issue: `requireDbInCi()` throws when no URL is
  present, turning the silent skip into a loud failure. CI uses this in the
  dedicated `db-invariants` job (`.github/workflows/audit.yml`), which runs
  only when the Neon test-branch secret exists; the main `audit` job runs
  without `REQUIRE_DB` and is designed to go green on every push. (Split
  owner-approved 2026-07-15 — see the comment in `web/test/helpers/env.ts`.)

## The pre-commit hook (`.githooks/pre-commit`)

Installed by the `prepare` script (`git config core.hooksPath .githooks`). A
fast (<10 s, no LLM) **pre-filter**, not a replacement for `npm run audit`. On
staged files only:

1. `eslint --fix` on staged TS under `src/`, `test/`, `web/` (re-stages
   auto-fixes; warnings don't block, errors do).
2. **Sync guards** — when `src/` or `web/src/` files are staged:
   `npx vitest run test/web-core-sync.test.ts test/bible-sync.test.ts` (the
   byte-identical copies must not drift).
3. **Licensing ratchet** — only when `web/public/commentaries/` exists in the
   checkout (it's gitignored): `npx tsx scripts/predeploy-gate.ts`.
   Forbidden-provenance count may only go **down**; a blocked Bible-translation
   dir is a *warning* here (it hard-fails only at deploy, when `DEPLOYING=1`).

Emergency bypass: `git commit --no-verify`.

## Reporting discipline

- A check you could not run (missing secret, missing DB, missing corpus) is
  **UNVERIFIED**, never "PASSED". Name what was missing.
- A suite that skipped its DB-backed tests is "unit-only green; DB invariants
  UNVERIFIED", not "green".
- Numbers from the frozen held-out set are cited with their set version (v3 =
  dev, v4 = frozen) and their caveats — never as a bare score.
