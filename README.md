# What others have said — theology study app

An LLM Bible study tool that **never interprets scripture**. It reports what
others have said, with resolvable citations, points to passages and reading,
and suggests prayer. No advice beyond that.

The guarantee is architectural, not trained: retrieval over a curated corpus,
a constrained JSON output contract, and a verifier that rejects violations
before render.

## Documents of record

The files in [docs/](docs/) are the source of truth. The claude.ai artifact is
a snapshot; redeploy it after editing these.

- [docs/DESIGN_BRIEF.md](docs/DESIGN_BRIEF.md) — product thesis, decisions of record, stack, roadmap
- [docs/SCHEMA.md](docs/SCHEMA.md) — Document 1: database schema
- [docs/OUTPUT_CONTRACT.md](docs/OUTPUT_CONTRACT.md) — Document 2: output contract and verifier spec
- [docs/CORPUS.md](docs/CORPUS.md) — Document 3: corpus acquisition and ingestion
- [docs/INFRA.md](docs/INFRA.md) — Document 4: fresh infrastructure checklist

## Repo layout

```
docs/                     design documents of record
supabase/migrations/      Postgres schema (Document 1, executable)
src/contract/             output contract JSON schema + TypeScript types
src/verifier/             Stage V1 deterministic verifier
src/evals/                eval harness runner + expectation checks
evals/cases/              YAML eval cases (interpretation_bait, refusal_shape, ...)
test/                     vitest suites
```

## Build order (from OUTPUT_CONTRACT.md §5)

1. ✅ Contract JSON schema + V1 checks (pure code)
2. ✅ Hand-written bait cases + harness runner (offline against fixtures)
3. ⬜ First teacher prompt against the contract; iterate until bait suite passes
4. ⬜ V2 classifier as a prompted small model

## Commands

```
pnpm install
pnpm test          # verifier + contract unit tests
pnpm eval          # run eval cases against fixture responses
pnpm typecheck
```
