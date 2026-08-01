# ORDER — A2: the production read-only session

You are the builder for gate A2. This is the first production connection anyone
has made in this project under the current process, and the first one this PM has
authorised.

## The authorisation

The owner gave an explicit ⚑ go for A2 on 2026-08-01, per occasion, scoped to a
read-only session against `ep-odd-fog`. `docs/pm/MASTER.md:19` (bylaw 7) and
`AGENTS.md:52` require that go every time. It does not extend to any other
operation, to a second session, or to a retry on a different day. If you finish
and something remains unmeasured, you record it NOT RUN and stop — you do not
re-open the connection on your own authority.

## STEP −1 — the seat check, before anything else

Answer each in one line:

1. Did you write `docs/pm/orders/2026-08-01-stop-verdict-a1-closure.md`
   (`fc7fdae`)? If yes, that is fine here — this is a builder seat, not a
   verifier seat. Say so.
2. Run `git log --format='%h %(trailers:key=Model,valueonly) %s' ac19935..29d6f98`.
   Say how many of those commits you wrote.
3. Are you the session that produced `fix/post-a1-corrections-2026-08-01`?
   Say yes or no.

None of these disqualifies you. They go in the record so whoever audits A2 knows
whose eyes have already been on what.

## STEP 0 — preconditions. Stop on any failure; do not improvise around one.

```
[ -n "${NEON_API_KEY:-}" ] && echo "NEON_API_KEY: set" || echo "NEON_API_KEY: NOT SET"
git rev-parse HEAD                                    # expect main @ 29d6f98 or later
gh pr view 48 --json state,mergedAt                   # expect MERGED
ls -la .env.prod web/.env.local 2>&1                  # report presence/absence; do NOT create either
node -e "console.log(process.version)"
pnpm install                                          # REQUIRED: node_modules is gitignored; `pg` will not resolve without it
```

Do not substitute a shell expansion that can print the value. `${NEON_API_KEY:-NO}`
expands to the key itself whenever it is set — that form would put your production
credential in the transcript on the first command of the session, against
`CLAUDE.md:52` and `:73`. Use the test above, or `[ -n "$NEON_API_KEY" ]`, and
nothing else.

* If `NEON_API_KEY` is unset: STOP. Print exactly what the owner must export and
  end the session. Do not look for it in files, do not read `gh secret`, do not
  construct a connection string by any other route.
* If `.env.prod` exists: STOP and report it before connecting. It is a production
  connection string on disk, which `AGENTS.md:11` forbids absolutely. That is an
  owner decision, not yours.
* Known and accepted, record it, do not fix it:
  `scripts/lib/neon-connection.mjs:38-45` shells out to `npx --yes neonctl`, which
  fetches a package from the registry mid-run on the credential path.
  `scripts/lib/excerpt-sample-policy.mjs:5-11` names that exact hazard as the
  reason `npx tsx` was removed from this same path. Note it in your report as a
  finding; this is not the run to change it.
* Work in a fresh scratch clone, not `~/Projects/ancient-roads-git` — that tree
  holds the only local copy of the corpus and `AGENTS.md:48-50` is one agent per
  working tree. You may read it; do not run anything in it.

Then branch from `main` and file this order verbatim from the `# ORDER` heading
down to `docs/pm/orders/2026-08-01-a2-prod-readonly.md`. Subject:
`File the A2 production read-only order`. `Model:` trailer. Push. Bylaw 1
(`docs/pm/MASTER.md:10`).

## Read first

`CLAUDE.md` → `AGENTS.md` → `docs/pm/MASTER.md` → `docs/THE_LOOP.md` →
`docs/BUILD_MODEL.md`, then `docs/STATE_OF_TRUTH.md` §2b/§2d/§2e,
`docs/CUTOVER_DESIGN.md`, and
`docs/pm/orders/2026-08-01-stop-verdict-a1-closure.md`. Do not characterise a
document you have not opened.

Note before you start: `docs/pm/MASTER.md` is known stale and its corrections are
sitting unmerged on `fix/post-a1-corrections-2026-08-01`. Read it as the board,
not as state.

And check this first, it takes five seconds:
`git ls-remote --heads origin fix/post-a1-corrections-2026-08-01`. That branch
does not appear in the remote refs of the PM's clone. If it is not on origin, six
commits of corrections exist only on one laptop — say so loudly at the top of
your report before doing anything else. Do not push it yourself; it is not yours.

## RAILS — production. These are absolute.

1. Read-only. One session. One connection. `scripts/lib/neon-connection.mjs:75`
   `assertReadOnlySession()` asserts the read-only transaction and the connected
   role at the server; the instrument `ROLLBACK`s always
   (`scripts/unit-ordinal-instrument.mjs:8`). Do not defeat, bypass, or
   "temporarily" relax either.
2. No writes of any kind. No `INSERT`/`UPDATE`/`DELETE`, no DDL, no
   `GRANT`/`REVOKE`, no `SET` that persists, no temp tables, no `ANALYZE`.
3. Credential: `NEON_API_KEY` only. Never print it, never write it to a file,
   never pass it in `argv` (`neon-connection.mjs:34` — "API key travels in env
   only"). Never write a production connection string to disk. No `.env.prod`.
   No `DATABASE_URL` fallback — the code already refuses one; do not add one.
4. Never print a connection string or any credential, scrubbed or otherwise, into
   a log you commit. `scrubCredentialText()` exists at `neon-connection.mjs:13`;
   use it, and still do not paste URLs.
5. No deploy, no `deploy.sh`, no `vercel` anything, no publish flip, no migration,
   no ingest, no `cutover.mjs`, no `repair-unit-ordinal.mjs`. No Neon branch
   created, deleted or promoted; `br-late-recipe-atxl68sh` is protected
   (`docs/PROTECTED_BRANCHES.json`).
6. No merge. The owner merges.
7. Bounded reads. The instrument bounds its provenance scan deliberately
   (`scripts/unit-ordinal-instrument.mjs:42-47`, `SECTION_SCAN_LIMIT = 200_000`).
   On truncation it does not warn — it throws and aborts the run (`:152-154`). Do
   not raise the bound to get past it. A truncated scan is a STOP, you report it,
   and you do not re-open the connection.
8. No body text in any committed excerpt. Clean-provenance works only,
   `unit_ordinal` + `ordinal` + heading — the policy already implemented in
   `scripts/lib/excerpt-sample-policy.mjs`. Do not widen it.
9. `Model:` trailer on every commit. Report both CI jobs by name and commit the
   raw `gh run view <run-id> --json jobs` into your evidence directory.
10. Abort conditions — stop, commit what you have, and report. Do not push
    through:
    * the target guard refuses, or the endpoint you reach is not the production
      endpoint you asked for;
    * `assertReadOnlySession` fails;
    * any statement errors in a way you do not fully understand;
    * the census disagrees with `docs/STATE_OF_TRUTH.md` §2d in a way that implies
      someone wrote to production since 2026-07-30;
    * anything at all tempts you toward a write.

## What to measure

Everything below is one session, one log. State the exact commands you ran in the
evidence file.

### A2.1 — the status census. This is the headline.

`docs/STATE_OF_TRUTH.md:144` says outright: "What the repo does not know without a
fresh read: whether status changed after 2026-07-30 10:09." Settle it.

For every row in `sources`: `slug`, `source_type`, `status`, section count. Then
the totals. The last recorded reading was 7 sources, all `staged`, 0 `published`,
72,863 sections (`docs/STATE_OF_TRUTH.md:126-139`), and that reading was
hand-transcribed, not instrument output — the same section says so. Yours should
be tool output.

If anything has changed since 2026-07-30, that is the most important line in your
report.

### A2.2 — the instrument, over the cohort that is about to be published

```
mkdir -p /tmp/a2 && node scripts/unit-ordinal-instrument.mjs \
  --read-only --target=ep-odd-fog --cohort=staged \
  --out=docs/evidence/a2-prod-readonly-2026-08-01/instrument-staged.txt \
  > /tmp/a2/instrument-stdout.log 2> /tmp/a2/instrument-stderr.log
echo "EXIT=$?"
```

Three things about that command, all verified in the source — do not "improve" it:

* No `--json`. `scripts/unit-ordinal-instrument.mjs:177` writes JSON or the
  rendered text report to `--out`, never both, and there is no way to render text
  from a saved JSON. One connection means one artifact, and the rendered report is
  the one a human can audit. If you want the JSON instead, that is a different run
  and rail 1 forbids it.
* Tee stdout and stderr to `/tmp` first. Every abort path throws (`:106` positive
  control returned 0, `:152-154` scan truncated, `:156` no manifest-eligible
  works, and `assertReadOnlySession` failure at `neon-connection.mjs:78,82`), and
  the `--out` write at `:174-178` sits after the `try/finally`, so an aborted run
  writes no evidence file at all. Capture the streams outside the repo, then
  commit them, so a STOP still leaves a record.
* `NEON_API_KEY` is already exported; do not re-state it on the command line. It
  travels in env only (`neon-connection.mjs:34`, `:48`).

Then commit `/tmp/a2/instrument-stdout.log` and `instrument-stderr.log` into the
evidence directory — after checking them for anything credential-shaped.
`scrubCredentialText()` at `neon-connection.mjs:13` exists for this.

`--cohort` is required and has no default, by design —
`scripts/unit-ordinal-instrument.mjs:10-16` explains why, and it is worth reading
before you run it: wiring it permanently to `published` on a database where
nothing is published "is not a probe that finds problems — it is a probe that
cannot find anything, whose positive control then fails for a reason unrelated to
the data under review."

Run `node scripts/unit-ordinal-instrument.mjs` with no arguments first and use the
cohort names its usage line prints — they are derived from migration 023's CHECK
constraint, not typed.

### A2.3 — the serving census

Which of the sources on production would actually be served? Cross the census
against the serving filter — `LEGAL_CORPUS_FILTER` and `SERVED_PROSE_WORKS` in
`web/src/lib/teacher/routing.ts`. Produce, per source: published? admitted by the
filter? section count?

This is the input A3 needs. `docs/pm/MASTER.md:37`: "a published-but-not-admitted
work is a STOP." Give A3 the table it has to adjudicate; do not adjudicate it
yourself.

### A2.4 — the standing gaps, re-measured while you are in there

Cheap, read-only, and each closes a live UNVERIFIED:

* `app_runtime`'s grants on `embeddings` — `docs/STATE_OF_TRUTH.md:300-304`
  records it still holds `INSERT/UPDATE/DELETE` on the servable corpus, with the
  fix deferred as an owner action. Confirm or refute. Do not `REVOKE`.
* The G1 user-data inventory: `waitlist` and `channels` row counts, and the
  annotation counts. `docs/STATE_OF_TRUTH.md:92-94` marks "prod user data is
  empty" as owner-asserted, not measured — no deletion receipt was ever committed.
  Measure it.
* Forbidden-provenance row count, against the 71,884 ratchet
  (`docs/STATE_OF_TRUTH.md:111`).

## What you must NOT report as a pass

The published-cohort leg is vacuous and must be labelled so.
`docs/STATE_OF_TRUTH.md:141-142`: "Stage 2.2 `unit_ordinal` prod measurement
requires `published > 0`. Ordering verification on production is downstream of
publish flip, not parallel to instrument hardening." If you run
`--cohort=published` against 0 published rows, the result is NOT RUN, never PASS.
An empty result set that reads like a clean result is the exact failure this
instrument's cohort argument was added to prevent.

Same discipline everywhere: `NOT RUN` is never `PASS`; `PARTIAL` is never `DONE`;
a truncated scan is not a complete one.

## Evidence

Everything under `docs/evidence/a2-prod-readonly-2026-08-01/`:

* `README.md` — what was authorised, by whom, when, and what was not.
* `census.txt` — A2.1, tool output, with the exact command.
* `instrument-staged.json` and its rendered text report — A2.2.
* `serving-census.md` — A2.3, the table A3 adjudicates.
* `standing-gaps.md` — A2.4.
* `ci-run-<id>-jobs.json` — raw.

Then update `docs/STATE_OF_TRUTH.md` §2d with the fresh reading, replacing the
2026-07-30 hand-transcribed one and keeping the old as history. And append a
`WORKLOG.md` entry, newest on top, with a NOT DONE / UNVERIFIED section —
`AGENTS.md:25-26` requires it and no session has done it since 2026-07-30, which
the A1 verdict flagged at `:581-586`.

## REPORT

DONE / PARTIAL / NOT DONE / BLOCKED per item, with actual output for every
measurement.

```
HEAD:        <sha>
CI:          audit=<conclusion>  db-invariants=<conclusion>   (from `gh run view`, not memory)
CONNECTION:  target=<endpoint asked for>  reached=<host in the report header>
             read-only + role assertion = PASSED-BY-COMPLETION
               (neon-connection.mjs:75-83 asserts `SHOW transaction_read_only` = on and
                `SELECT current_user` = app_runtime AT THE SERVER, and throws otherwise —
                so a completed run is the proof. NOTE the limit: the report's `role` field
                (unit-ordinal-instrument.mjs:92) is the locally-requested constant, NOT the
                server-observed current_user, which is discarded at :97. Do not quote it as
                if the server said it.)
             rollback = unconditional `finally` at unit-ordinal-instrument.mjs:167-170
CENSUS:      sources=<n>  staged=<n>  published=<n>  sections=<n>   (vs 7/7/0/72,863 on 2026-07-30)
NOT RUN:     <every leg that did not execute, and why>
EVIDENCE:    <paths committed this run>
MODEL:       <model that produced this>
DIRTY:       <git status --porcelain, verbatim>
```

Then three questions, in your own words:

1. What did you change that I did not ask for?
2. What did you find that is not in this order and that the owner would want to know?
3. Where were you tempted to assert a property rather than prove it?

Then STOP. The connection closes with the session. Do not proceed to A3, do not
publish, do not deploy, do not open a second connection.
