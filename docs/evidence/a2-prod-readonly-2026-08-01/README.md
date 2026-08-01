# A2 — the production read-only session, 2026-08-01

## What was authorised, by whom, when

The owner gave an explicit ⚑ go for **A2** on **2026-08-01**, per occasion,
scoped to a **read-only session against `ep-odd-fog`**. `docs/pm/MASTER.md:19`
(bylaw 7) and `AGENTS.md:52` require that go every time. The order is filed
verbatim at
[`docs/pm/orders/2026-08-01-a2-prod-readonly.md`](../../pm/orders/2026-08-01-a2-prod-readonly.md)
(`1e92bb8`).

**The go covered this session only.** It does not extend to A3, to a publish
flip, to a deploy, or to a retry on another day.

**One deviation was authorised mid-session, by the owner, in the session:** the
order's rail 1 says *one connection*, and this run used **three**. See
"Connections" below. Nothing else in the rails was relaxed, and no connection was
re-opened on the builder's own authority.

## What was NOT done

- **No writes of any kind.** No `INSERT`/`UPDATE`/`DELETE`, no DDL, no
  `GRANT`/`REVOKE`, no temp tables, no `ANALYZE`. Every connection ran inside
  `BEGIN; SET TRANSACTION READ ONLY` and ended in an unconditional `ROLLBACK`.
- **No `--cohort=published` run.** Production has **0** published sources, so
  that leg is vacuous by construction and is recorded **NOT RUN**, never PASS —
  `STATE_OF_TRUTH.md:141-142`.
- **No merge, no deploy, no `deploy.sh`, no `vercel`, no publish flip, no
  migration, no ingest, no `cutover.mjs`, no `repair-unit-ordinal.mjs`.**
- **No Neon branch created, deleted or promoted.** `br-late-recipe-atxl68sh`
  untouched.
- **No `.env.prod` created**, and none exists on this machine. No production
  connection string was written to disk. The credential travelled in env only.
- **No adjudication of the A2.3 table.** That is A3's call
  (`docs/pm/MASTER.md:37`).

## Connections

Three, all read-only, all `ROLLBACK`ed, all inside this one session:

| # | purpose | script | reached | exit |
|---|---|---|---|---|
| 1 | A2.1 census + A2.4 standing gaps | `census.mjs` | `ep-odd-fog-atnykudm` | 0 |
| 2 | A2.2 instrument, `--cohort=staged` | `scripts/unit-ordinal-instrument.mjs` | `ep-odd-fog-atnykudm` | 0 |
| 3 | A2.3 serving census | `serving-census.mjs` | `ep-odd-fog-atnykudm` | 0 |

Every one asserted `transaction_read_only=on` **and** `current_user=app_runtime`
**at the server** via `assertReadOnlySession()`
(`scripts/lib/neon-connection.mjs:75-83`), which throws otherwise — so a
completed run is the proof.

**Why more than one.** The instrument measures only A2.2. The two census legs had
no runner that could reach production under rail 3: `scripts/publish-flip-census.mts`
refuses production outright by design (`:52-55`) and
`scripts/prod-census.cjs` resolves its URL from `CUTOVER_DATABASE_URL` or
`.env.prod` (`:26-30`). Connections 1 and 3 therefore use the same sanctioned
credential path the instrument uses — `resolveInstrumentConnection()` +
`assertReadOnlySession()`, `NEON_API_KEY` only — and nothing else.

## Files

| file | what |
|---|---|
| `census.txt` | A2.1 + A2.4 tool output, with the exact command |
| `census.mjs` | the runner for connection 1 |
| `census-stderr.log` | connection 1 stderr |
| `instrument-staged.txt` | A2.2 rendered report, written by `--out` |
| `instrument-stdout.log` / `instrument-stderr.log` | A2.2 streams, captured outside the repo first |
| `serving-census.md` | **A2.3 — the table A3 adjudicates** |
| `serving-census.mjs` | the runner for connection 3 |
| `serving-census-stdout.log` / `serving-census-stderr.log` | A2.3 streams |
| `serving-predicates.json` | the serving predicates as extracted from `routing.ts`, not retyped |
| `standing-gaps.md` | **A2.4** |
| `ci-run-30685054393-jobs.json` | raw `gh run view --json jobs` |

All streams were checked for credential-shaped text before committing
(`postgres://`, `napi_`, `--api-key`, password). **Clean** — the only stderr
content on any run is a `pg` SSL-mode deprecation warning.

## Two artifacts the order asks for that do not exist, and why

1. **`instrument-staged.json`.** The Evidence section names it *and* the rendered
   text report. The ordered command omits `--json`, and
   `scripts/unit-ordinal-instrument.mjs:177` writes JSON **or** the rendered text
   to `--out`, never both, with no way to render text from saved JSON. Producing
   the `.json` would require a second instrument run, which rail 1 forbids and
   which the order's own note about `--json` explicitly rules out. Only
   `instrument-staged.txt` exists. Not an omission — the two requirements are
   mutually exclusive as written.
2. **A `--cohort=published` artifact.** NOT RUN, deliberately. See above.

## Headline result

**Nothing on production changed between 2026-07-30 10:09 and 2026-08-01 05:03.**
7 sources, all `staged`, 0 `published`, 72,863 sections — identical to the
hand-transcribed reading at `STATE_OF_TRUTH.md:126-139`, and now tool output.
`STATE_OF_TRUTH.md:144` is settled.

The A2.2 instrument **PASSED** over the `staged` cohort (7/7 works, rollup digest
`10cd5eb46c9e53cb4b7b980e38e4720f`), with no scan truncation.

The one thing A3 must look at: **`barnes-notes` has 1,300 sections and 0 rows
admitted by the serving filter.** See `serving-census.md`.
