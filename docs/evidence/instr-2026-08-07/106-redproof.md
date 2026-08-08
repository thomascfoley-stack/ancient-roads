# Migration 106 — red-proof, against a throwaway local Postgres

Postgres 14.19, `initdb` into a temp dir, destroyed after. Nothing here touched any Neon branch.
The point is that every check below was watched FAIL before it was watched pass.

## 1. Production's privilege state, reproduced from the migration history

Applied in order: `001:49-50` (grant full DML by default) → `032:49` (revoke UPDATE, DELETE from
the default) → the three tables created exactly as `039:27,42` and `042:24` create them, granting
nothing.

```
plan_day_readings: INSERT,SELECT
plan_days:         INSERT,SELECT
plans:             INSERT,SELECT
```

No UPDATE, no DELETE — **the production condition, derived rather than assumed.** This is the
empirical confirmation of the 032→039 causal chain; up to this point it was a reading of comments.

## 2. RED — three checks watched to fail

| # | Check | Result |
|---|---|---|
| 1 | `store.ts:294` verbatim (`setDayCompleted`) as `app_runtime` | `ERROR: permission denied for table plan_days` — **byte-identical to the production log line** |
| 2 | `store.ts:305` verbatim (`deletePlan`) as `app_runtime` | `ERROR: permission denied for table plans` — likewise |
| 3 | Migration 106's own `DO $$` verification block, run alone against the ungranted DB | `ERROR: 106 FAILED: app_runtime still lacks UPDATE on plan_days` |

Check 3 is the one that matters for trusting the migration: its self-verification **can** fail, so
a green run is evidence rather than decoration.

## 3. GREEN — after applying 106

```
NOTICE:  106 OK: plan_days UPDATE and plans DELETE granted to app_runtime
```

No `WARNING` fired, so nothing was over-granted. Resulting privileges:

```
plan_day_readings: INSERT,SELECT
plan_days:         INSERT,SELECT,UPDATE     <- +UPDATE
plans:             DELETE,INSERT,SELECT     <- +DELETE
```

The `store.ts:294` query now returns its row (`UPDATE 1`) and the write persists
(`completed_at IS NOT NULL` → `t`).

## 4. The cascade claim, asserted rather than assumed — with a control

The migration grants **no** DELETE on `plan_days` or `plan_day_readings`, on the grounds that
PostgreSQL runs referential actions with the referencing table's owner privileges. Tested:

| Step | Result |
|---|---|
| Child privileges before the test | `plan_days: INSERT,SELECT,UPDATE` · `plan_day_readings: INSERT,SELECT` — **no DELETE on either** |
| Rows before | `plan_days=1`, `plan_day_readings=1` |
| `DELETE FROM plans …` as `app_runtime` | `DELETE 1` |
| Rows after | `plan_days=0`, `plan_day_readings=0` — **both cascaded** |
| **Control:** direct `DELETE FROM plan_days` as `app_runtime` | `ERROR: permission denied for table plan_days` |

The control is the part that makes this a proof rather than a coincidence: if the cascade had
worked because DELETE had leaked onto the child, the direct delete would have succeeded too. It
did not.

## 5. What this does NOT prove

- **Nothing here was run against production.** The local database reproduces the privilege
  history; it does not reproduce prod's data, RLS session variables, or the Neon pooler. The
  production check is step 4 of the apply plan (mark a reading, hard-reload, delete the stranded
  plan).
- **RLS was not exercised.** The local tables carry no policies, so this proves the GRANT layer
  only. `039:54-59`'s policy is unchanged by this migration and still gates row visibility.
- Postgres 14 locally vs. Neon's server version. The privilege semantics used here are not
  version-sensitive, but the run is what it is.

---

# Production apply and verification — 2026-08-07

Applied by the owner at the terminal (the agent holds no production connection string):

```
✓ ledger: 106_plan_write_grants.sql (neondb_owner, sha256 7893d0d8ebc5…)
✓ applied db/migrations/106_plan_write_grants.sql
```

**A correction about what that output does and does not prove.** The apply instructions said to
watch for a `NOTICE: 106 OK` line and for `WARNING:` lines. **node-pg surfaces neither** — it emits
them as client events and `apply-migration.mjs` registers no listener. So their absence is not
evidence of anything, and the over-grant checks in the migration's `DO` block produced no
observable output on this run. That was a check that could not fail.

What IS load-bearing and did hold: `RAISE EXCEPTION` propagates as a real error and would have
aborted the run, and the file is a single multi-statement query, so an abort would have rolled the
grants back with it. `✓ applied` therefore proves the two `has_table_privilege` assertions passed.
The over-grant assertions remain unverified in production and belong in a CI test, as the
migration comment already says.

## Live verification against production

| Check | Result |
|---|---|
| Ten consecutive marks, days 1-10 | **10/10 → `200 {"ok":true}`** |
| Counter moved | `read_days` **0 → 10** of 15 |
| Survives a hard reload | **yes** — `10 of 15 days` after `location.reload()` |
| List figure matches detail figure | **yes** — both `10 of 15 days` |
| `UP NEXT` advanced correctly | **yes** — Romans 11, `FRI, AUG 21` |
| `Delete plan` through the UI | **succeeds** — `{"plans":[]}`, and `GET` the deleted id → `404 NOT_FOUND` |
| Stranded artifact cleared | **yes** — the test account is empty; production left as found |

**One check closes the diagnostic loop.** Before the migration, `POST` to an unknown plan UUID
returned **500**, because the UPDATE threw before it could match zero rows — which is how the 404
arm at `store.ts:300` was proven unreachable. After the migration the identical request returns
**`404 {"code":"NOT_FOUND","message":"No such plan day."}`**. The arm is now reachable, confirming
the exception had been masking it rather than the row-matching logic being wrong.

## Still open on `L2`

`L2`'s minimal change has two steps. **Step 1 (fix the endpoint) is done and verified above.
Step 2 (optimistic toggle with visible rollback) is NOT done**, and its exit check — "with the
endpoint forced to fail, the checkbox visibly rolls back and the toast still appears" — is
therefore unmarked. Deferred deliberately: it is a client change, production is 6 commits behind
`HEAD`, and any client edit made now cannot reach users without a gated deploy. With the write
succeeding, the failure path it improves is now rare rather than universal, so it belongs with the
next deploy rather than ahead of it.
