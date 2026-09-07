# Ancient Paths — a concordance, not a commentator

An LLM Bible-study web app that **never interprets Scripture**. It reports what
others have said — quoted and attributed — points to passages and reading, and
suggests prayer. No advice beyond that.

The guarantee is architectural, not trained: retrieval over a curated,
license-checked corpus → a constrained JSON output contract → a deterministic
verifier that rejects violations **before render** (fail-closed to raw
retrieval). See [`CLAUDE.md`](CLAUDE.md) §1 and
[`docs/PRINCIPLES.md`](docs/PRINCIPLES.md).

## Stack

- **TypeScript strict** everywhere (no `any`); pnpm via corepack (pinned in `package.json`)
- **`web/`** — Next.js 15 (React 19) on Vercel, deployed by hand via `./deploy.sh`
- **Neon Postgres + pgvector** (`db/schema.sql`, `db/migrations/`) — the app
  connects as the least-privilege `app_runtime` role; RLS is the data-isolation boundary
- **DeepInfra** for all models, pinned per ADR-005 in
  [`docs/DECISIONS.md`](docs/DECISIONS.md): compose `Qwen/Qwen3.5-35B-A3B`,
  embed `BAAI/bge-large-en-v1.5` (1024-dim)

## Repo layout

```
src/        offline pipeline: contract, verifier, teacher, retrieval, ingest, eval runner
web/        the Next.js app (App Router, API routes, middleware site gate)
db/         schema.sql + migrations + migration runners (owner-run)
ingest/     corpus source configuration (sources.config.json)
evals/      YAML eval cases + JSON fixtures for the offline harness
scripts/    audit.sh (the gate), pre-deploy licensing gate, prod diagnostics
test/       root vitest suites (verifier, contract, sync guards, retrieval, ...)
docs/       documents of record (pointers below)
supabase/   VESTIGIAL — Supabase-era leftovers; the project runs on Neon and no
            code or script references this directory
```

Not in git (`.gitignore`): the served corpus under `web/public/` (`bible/`,
`commentaries/`, `lexicon/`, `original/`, `concordance/`) — it reaches
production only through `./deploy.sh`'s working-tree upload — plus `data/` and
all `.env.local` files.

## Quickstart

```
corepack pnpm install     # install deps; the prepare script wires .githooks
cp web/.env.local.example web/.env.local   # then fill it in — see docs/ENVIRONMENT.md
npm run audit             # the gate: typecheck ×3, lint ×2, knip, deps-audit,
                          # tests+coverage, qa invariants, license gate (scripts/audit.sh)
cd web && corepack pnpm dev                # local dev server
```

Environment variables are documented in [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md).
**False-green warning:** DB- and eval-backed tests `skipIf` their secrets are
absent — a green run can mean "not run". If you couldn't run a check, report it
UNVERIFIED, not passed.

## Documents of record

- [`CLAUDE.md`](CLAUDE.md) — standing rules: the product guarantee, the two quality axes, the gate
- [`docs/STATE_OF_TRUTH.md`](docs/STATE_OF_TRUTH.md) — current VERIFIED system state (numbers, corpus, gates, open gaps)
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — ADRs
- [`docs/ENGINEERING.md`](docs/ENGINEERING.md) — the engineering handbook
- [`docs/BUILD_MODEL.md`](docs/BUILD_MODEL.md) — how work is built (loop, lanes)
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Vercel/production truth (real prod = the `web` project, CLI-deployed)
- [`docs/PORTABILITY.md`](docs/PORTABILITY.md) — running this repo outside Claude tooling
- [`ROADMAP.md`](ROADMAP.md) — status · [`WORKLOG.md`](WORKLOG.md) — history

Stale-but-present: `docs/DESIGN_BRIEF.md`, `docs/SCHEMA.md`, `docs/INFRA.md`,
and `docs/CORPUS.md` are Supabase-era. Where they disagree with
`STATE_OF_TRUTH.md` / `DECISIONS.md`, they are stale (see `docs/PORTABILITY.md` §5).

## Contributing

Bug reports, feature ideas, and PRs all welcome. See
[CONTRIBUTING.md](./CONTRIBUTING.md) for setup and the PR checklist.

## License

Code is MIT, see [LICENSE](./LICENSE). Corpus texts keep their own licenses
as recorded in [`DATA_SOURCES.md`](DATA_SOURCES.md).
