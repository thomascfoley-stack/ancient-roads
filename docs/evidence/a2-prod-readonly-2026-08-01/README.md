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
order's rail 1 says *one connection*, and this run used **three**. The go was
given interactively: the builder stopped after connection 2, put the choice to
the owner as a two-option question ("Authorise the third" — run the A2.3 serving
census read-only under the same rails, recorded as a rail-1 deviation — vs
"Record A2.3 NOT RUN"), and the owner selected **"Authorise the third."** No
separate order document exists for that go; this README, committed to the repo,
is its record (bylaw 1). See "Connections" below. Nothing else in the rails was
relaxed, and no connection was re-opened on the builder's own authority.

## What was NOT done

- **No writes of any kind.** No `INSERT`/`UPDATE`/`DELETE`, no DDL, no
  `GRANT`/`REVOKE`, no temp tables, no `ANALYZE`. Every connection ran inside
  `BEGIN; SET TRANSACTION READ ONLY` and ended in an unconditional `ROLLBACK`.
- **No `--cohort=published` run.** Production has **0** published sources, so
  that leg is vacuous by construction and is recorded **NOT RUN**, never PASS —
  `STATE_OF_TRUTH.md` §2d sequencing note (at `:161-165` as of `61215e2`).
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

Connection 2's exact command (the order's "state the exact commands" instruction;
connections 1 and 3 carry theirs in `census.txt` and `serving-census.md`):

```
mkdir -p /tmp/a2 && NEON_API_KEY="$(cat ~/.neon_api_key)" node scripts/unit-ordinal-instrument.mjs \
  --read-only --target=ep-odd-fog --cohort=staged \
  --out=docs/evidence/a2-prod-readonly-2026-08-01/instrument-staged.txt \
  > /tmp/a2/instrument-stdout.log 2> /tmp/a2/instrument-stderr.log
# EXIT=0
```

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
| `ci-run-<id>-jobs.json` | raw `gh run view --json jobs`, one per CI run reported by this evidence set (30685054393 at `1e92bb8`, 30685484219 at `61215e2`, and the run at the citation-fix commit) |

All streams were checked for credential-shaped text before committing
(`postgres://`, `napi_`, `--api-key`, password). **Clean** — the only stderr
content on any run is a `pg` SSL-mode deprecation warning.

## Two artifacts the order asks for that do not exist, and why

1. **`instrument-staged.json`.** The Evidence section names it *and* the rendered
   text report, but the ordered A2.2 command omits `--json`, the order forbids
   "improving" that command, and rail 1 forbids the second run that `--json`
   would be. The builder followed the ordered command; only
   `instrument-staged.txt` exists. **One correction to the reasoning, found on
   post-session verification:** the order's premise that "there is no way to
   render text from a saved JSON" is **wrong** — `renderReportText()`
   (`scripts/lib/unit-ordinal-instrument.mjs:428-447`) is an exported pure
   function over exactly the fields `--json` serializes, so a single
   `--json --out` run plus a credential-free offline render call would have
   produced **both** artifacts from one connection. The compliance choice stands
   (the ordered command was followed as ordered); the impossibility claim this
   README originally repeated from the order does not, and is corrected here.
2. **A `--cohort=published` artifact.** NOT RUN, deliberately. See above.

## The seat check and preconditions, for the record

The order's STEP −1 answers (they "go in the record"): **(1)** the builder did
not write `2026-08-01-stop-verdict-a1-closure.md` (`fc7fdae`); **(2)** of the 24
commits in `ac19935..29d6f98`, the builder wrote **zero** — noting that 21 carry
`Model: claude-opus-5`, which is also the builder's model, so the trailer alone
cannot distinguish the builder from those authors; the distinguishing fact is
session history; **(3)** the builder is not the session that produced
`fix/post-a1-corrections-2026-08-01`. STEP 0: `main` @ `29d6f98`; PR #48
`MERGED` (2026-08-01T02:19:30Z); `.env.prod` and `web/.env.local` both absent;
node `v24.5.0`; `pnpm install` exit 0; `git ls-remote` shows
`fix/post-a1-corrections-2026-08-01` **on origin** at `f8bfcbf` — the order's
stranded-branch premise is wrong. Work ran in a fresh scratch clone;
`~/Projects/ancient-roads-git` was never read or written.

## A note on line-number citations

The prose files in this directory cite the **current** tree. The two runner
scripts (`census.mjs`, `serving-census.mjs`) and the tool output (`census.txt`)
are **as-run artifacts** and are not edited after the fact: line references
inside them to `docs/STATE_OF_TRUTH.md` were written against the parent commit
(`1e92bb8`) and were shifted by the same session's own doc edits in `61215e2` —
the grants item moved `:300-304` → `:334-338`, the owner-asserted user-data note
`:92-94` → `:98-100`, the 71,884 ratchet row `:111` → `:117`. The referenced
content is unchanged at its new location. The filed order carries the same
pre-edit anchors, correct at filing time, and stays verbatim.

## Headline result

**Nothing on production changed between 2026-07-30 10:09 and 2026-08-01 05:03.**
7 sources, all `staged`, 0 `published`, 72,863 sections — identical to the
2026-07-30 hand-transcribed reading (kept as history in `STATE_OF_TRUTH.md` §2d,
`:172-178`), and now tool output. The question that section carried ("whether
status changed after 2026-07-30 10:09") is settled: it did not. The census
prints a per-status breakdown listing every status present; `published` appears
in no row, which is how "0 published" is established — 7 of 7 sources are
`staged`.

The A2.2 instrument **PASSED** over the `staged` cohort (7/7 works, rollup digest
`10cd5eb46c9e53cb4b7b980e38e4720f`), with no scan truncation.

The one thing A3 must look at: **`barnes-notes` has 1,300 sections and 0 rows
admitted by the serving filter.** See `serving-census.md`.
