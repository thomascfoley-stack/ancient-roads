# ENVIRONMENT — the env-var reference

Every variable below was verified by grepping `process.env` across `web/src`,
`src/`, `scripts/`, `db/`, `deploy.sh`, and `.github/workflows/` (2026-07-19).
**Names only — never paste a value into git, chat, or logs.** Copy
[`web/.env.local.example`](../web/.env.local.example) to `web/.env.local` and
fill it in.

## Where env lives

| Place | Who reads it |
|---|---|
| `web/.env.local` (gitignored) | Next dev/build; web tests via `web/test/helpers/env.ts`; the offline root scripts (`src/`, `db/`, `scripts/`) via hand-rolled readers — this one file is the local switch |
| Vercel dashboard (project `web`, see `docs/DEPLOYMENT.md`) | production runtime |
| GitHub repo secrets | CI (`APP_DATABASE_URL_TEST`) |
| Command line | one-off script runs, e.g. `DATABASE_URL=... node db/migrate.mjs` |

Note: **no code path reads a root-level `.env.local`** — everything resolves
`web/.env.local` or the process environment. (`docs/PORTABILITY.md` §4 still
mentions a root `.env.local`; treat `web/.env.local` as the only local file.)

## ⚠ The false-green warning

Much of this repo executes **zero assertions and still exits green** when
secrets are absent:

- `web/test/invariants/{licensing,tenancy,highlight-tenancy}.test.ts` —
  `describe.skipIf(!dbUrl)`: no DB URL → the suites skip.
- `test/retrieval.integration.test.ts` — skips unless `RUN_INTEGRATION=1` plus
  `DEEPINFRA_API_KEY` plus a DB URL.
- The CI `db-invariants` job goes **green with a `::warning::` placeholder**
  until the `APP_DATABASE_URL_TEST` secret exists (`.github/workflows/audit.yml`).

Green without the secret means **not run**, not **passed**. If you couldn't run
a check, report it **UNVERIFIED**.

## Application runtime

| Variable | Purpose | Where set | Without it |
|---|---|---|---|
| `APP_DATABASE_URL` | Least-privilege `app_runtime` pooled Neon URL — the web runtime (`web/src/lib/db.ts`) | Vercel (prod) · `web/.env.local` | **Production hard-fails at boot** (refuses the BYPASSRLS owner fallback — RLS would be inert); dev falls back to `DATABASE_URL` with RLS inert |
| `DATABASE_URL` | Neon URL — owner for migrations/DDL (`db/migrate.mjs`), runtime fallback in dev, many offline scripts | Vercel · `web/.env.local` · command line | Web throws if neither URL set; `db/migrate.mjs` exits 1; ingest scripts refuse; DB tests skip (false-green) |
| `DATABASE_URL_UNPOOLED` | Direct (unpooled) owner URL for migrations + ingest (`db/apply-migration*.mjs`, `src/ingest/ingest-embeddings.ts`) | `web/.env.local` · Vercel | `ingest-embeddings` throws ("required"); apply-migration falls back to `DATABASE_URL` |
| `NEON_BRANCH` | Destructive-ingest guard: must be `dev` or `test`, read from the **same source** as `DATABASE_URL` (`src/ingest/ingest-historian.ts` etc.) | `web/.env.local` / env, alongside `DATABASE_URL` | Guarded scripts refuse to run (fail closed) |
| `NEON_AUTH_BASE_URL` | Neon Auth service URL (`web/src/lib/auth/server.ts`) | Vercel · `web/.env.local` | Auth client is built with an undefined base URL at first request — login/session broken |
| `NEON_AUTH_COOKIE_SECRET` | Signs the Neon Auth session cookie (same file) | Vercel · `web/.env.local` | Same — auth broken |
| `DEEPINFRA_API_KEY` | Embed + rerank + compose (`web/src/lib/teacher/deepinfra.ts`, `rerank.ts`); also offline eval/ingest scripts | Vercel · `web/.env.local` · command line | `/api/ask` throws `DEEPINFRA_API_KEY is not set`; eval/ingest scripts fail; integration tests skip |
| `SITE_PASSWORD` | Pre-launch site gate (`web/src/middleware.ts`, `web/src/app/api/gate/route.ts`) | Vercel (prod) · `web/.env.local` to rehearse | **Production fails CLOSED: 503 on every gated route.** Dev runs gate-free |
| `EVAL_HARNESS_SECRET` | Bearer token for the `/api/eval/bait` harness + `src/evals/run-bait.mts` (dev/test only; the route 404s in prod) | `web/.env.local` | Endpoint 503s (fail closed); the live bait harness can't run |
| `LICENSE_ACK` | Comma-separated ids of conditional-license works the owner acknowledges (e.g. `leb`); read by `web/src/lib/licensing.ts`, enforced by the predeploy gate | Vercel · `web/.env.local` | Conditional-license Bible translations block at the predeploy gate and are excluded by the picker guard |
| `NEXT_PUBLIC_SITE_URL` | `metadataBase` override (`web/src/app/layout.tsx`) | Vercel | Falls back to `https://ancientpaths.app` |
| `ASK_LIMIT_PER_MIN` / `ASK_LIMIT_PER_DAY` | Per-user `/api/ask` fixed-window limits (`web/src/lib/rate-limit.ts`) | Vercel | Defaults apply (10/min, 100/day). The limiter itself fails open if the DB is unreachable |
| `GATE_LIMIT_PER_MIN` / `GATE_LIMIT_PER_HOUR` | Per-IP brute-force throttle on the password gate (same file) | Vercel | Defaults apply (10/min, 60/hour) |
| `COMPOSIO_API_KEY` | Composio integrations client (`web/src/lib/composio.ts`) — ADR-011 backend, **not yet imported by any route** | `web/.env.local` / Vercel when used | Client constructs with an undefined key; currently dormant |

## CI / deploy / script-only

| Variable | Purpose | Where set | Without it |
|---|---|---|---|
| `APP_DATABASE_URL_TEST` | Neon **test-branch** `app_runtime` URL for the `db-invariants` CI job (mapped onto `APP_DATABASE_URL` there) | GitHub repo secret | Job goes green with a `::warning::` and the licensing/tenancy invariants **do not run** — the canonical false-green |
| `REQUIRE_DB` | `=1` makes a missing DB URL a hard failure in the invariant suites (`web/test/helpers/env.ts`) | CI `db-invariants` job | Invariant suites skip instead of failing |
| `MIGRATE_ALLOW_PROD` | `=1` permits `db/apply-migration*.mjs` against a production URL | Command line (deliberate) | Prod applies refuse |
| `B2_ALLOW_PROD` | Same guard for `src/ingest/b2-remove-forbidden-provenance.ts` | Command line (deliberate) | Prod run refuses |
| `DEPLOYING` | `=1` set by `deploy.sh` for `scripts/predeploy-gate.ts` | `deploy.sh` | The Bible-translation licensing check **warns** (pre-commit) instead of hard-failing (deploy) |
| `RUN_INTEGRATION` | `=1` opts into `test/retrieval.integration.test.ts` (real Neon + DeepInfra) | Command line | Suite skips |

Platform-set, do not set yourself: `VERCEL_ENV`, `NODE_ENV`, `NEXT_RUNTIME`,
`PORT` (the bait runner's target port is a local knob, not config).
Script-local tuning knobs (all have defaults, grep before use): `K`, `HIT`,
`MODE`, `QUERIES`, `ONLY`, `COMPOSE_VOICES`, `NEW_VOICES`, `BAIT_JSON`,
`BIBLE_TR`, `NA_CACHE`, `NA_MAX`, `DEBUG`, `TZ` (tests).

## Rules

- Secrets are server-only: never in client bundles, prompts, logs, or git
  (`* .env.local` patterns are gitignored; the `.example` file is the exception).
- Never print a value — names only, in every doc and conversation.
