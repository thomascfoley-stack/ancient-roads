# Contributing to Ancient Paths

Thanks for taking a look. Bug reports, feature ideas, and pull requests are all welcome.

## The one rule that matters

Ancient Paths never interprets Scripture. It quotes and attributes what others have said, points to passages, and suggests prayer. That guarantee is enforced by the corpus license gate, the output contract, and the verifier, not by prompting. A change that weakens any of those will not be merged. Read [`CLAUDE.md`](./CLAUDE.md) and [`docs/PRINCIPLES.md`](./docs/PRINCIPLES.md) before touching `src/` or `web/src/`.

## Getting set up

```bash
git clone https://github.com/thomascfoley-stack/ancient-roads.git
cd ancient-roads
corepack pnpm install                      # wires .githooks via the prepare script
cp web/.env.local.example web/.env.local   # fill it in, see docs/ENVIRONMENT.md
cd web && corepack pnpm dev
```

## Before you open a PR

- Run `npm run audit` from the repo root. It is the gate: typecheck, lint, knip, deps audit, tests with coverage, QA invariants, and the corpus license check.
- DB- and eval-backed tests skip when their secrets are absent. A green run without them means "not run", so say so in the PR rather than reporting it as passed.
- Never commit real keys, connection strings, or `.env` files. The `*.example` env files are the only ones that belong in the repo.
- New corpus sources need a verified license (public domain or compatible) and provenance in `DATA_SOURCES.md`.
- Keep PRs focused. One fix or feature per PR.

## Reporting bugs

Open an issue with what you asked, what the app returned, and what you expected. If the app produced interpretation or unattributed text, that is a verifier bug and the highest-priority kind of report. Redact any keys before pasting logs.

## Security

If you find an auth, RLS, or data-exposure issue, please don't open a public issue. Open a private security advisory on GitHub instead.

## License

By contributing, you agree that your contributions are licensed under the MIT License in this repository. Corpus texts keep their own licenses as recorded in `DATA_SOURCES.md`.
