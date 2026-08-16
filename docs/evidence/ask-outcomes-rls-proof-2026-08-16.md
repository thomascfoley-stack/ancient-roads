# `ask_outcomes` RLS proof — 2026-08-16

Executed because the 2026-08-16 audit's **Layer 1 tenancy invariant (two-account, executed)**
announced **NOT RUN** (no `APP_DATABASE_URL`), while migration 116 had already shipped
`ask_outcomes` to production claiming "RLS from birth". That left the isolation property
asserted from the migration text and never demonstrated.

Run as the real least-privilege `app_runtime` role on **dev** (`ep-tiny-hat`), because
`neondb_owner` on prod **cannot** `SET ROLE app_runtime` (`permission denied to set role`) and
owner bypasses RLS anyway (`relforcerowsecurity = f`). The policy text was confirmed
**byte-identical on dev and prod** before running:

```
ask_outcomes_insert  cmd=a (INSERT)
WITH CHECK ((user_id IS NULL) OR (user_id = current_setting('app.current_user_id'::text, true)))
```

Every case ran inside `BEGIN … ROLLBACK`. **Neither database was modified** — both re-read at
0 rows afterwards.

| # | case | expected | observed |
|---|---|---|---|
| 1 | `user_id` = `app.current_user_id` | INSERT | `INSERT 0 1` |
| 2 | `user_id` NULL, binding set | INSERT | `INSERT 0 1` |
| 3 | `user_id` = a DIFFERENT user | REFUSED | `ERROR: new row violates row-level security policy` |
| 4 | binding never set, `user_id` non-null | REFUSED | `ERROR: new row violates row-level security policy` |
| 5 | binding never set, `user_id` NULL | INSERT | `INSERT 0 1` |

Cases 3 and 4 are the red-proofs: the policy is not merely present, it **fires**.

## What this closes, and what it does not

**Closed:** the policy is correct; `app_runtime` may write its own rows and anonymous rows; a
cross-user write is refused; grants on prod are right (`app_runtime` INSERT + SELECT, RLS
enabled, no SELECT policy so the log is append-only BY GRANT).

**NOT closed — needs one real gated, signed-in ask:**

1. whether Next's `after()` actually fires in the deployed Vercel runtime;
2. whether Neon Auth's user-id **format** binds to `app.current_user_id` in the live app
   (MASTER.md C5 records this as UNPROVEN).

## The useful consequence: this failure mode is OBSERVABLE, not silent

C5 warns that an RLS misbinding is silent because "matches nothing" reads as "no data". For
**writes** that is not so, and case 4 is the proof. If `app.current_user_id` fails to bind, a
non-null `user_id` INSERT is **REFUSED** — it is not quietly stored as NULL. `recordAskOutcome`
catches that and emits `[ask_outcomes] persist failed: …` plus a `logEvent('error', …)`.

So a live misbinding produces a **log line**, not silence. If a signed-in ask leaves
`ask_outcomes` empty AND no such line appears in the Vercel runtime logs, the cause is upstream
of the database — `after()` never ran, or the request never arrived.

## Why the table was empty when first checked

Not a defect. **No `/api/ask` or `/api/ask/stream` request reached production at all** — the
12-hour path breakdown on the live deployment (`dpl_F7FCWNmESsfA43SF7hckvJKczuTu`) is `/` 29,
`/gate` 28, robots/sitemap, and WordPress bot probes; nothing else. Status codes over 6h:
16×200, 6×307, 3×304 — **zero 4xx, zero 5xx**, and no `[ask_outcomes]` line anywhere.

`web/src/middleware.ts` gates everything except `gate|api/gate|_next/|favicon|manifest|icons`,
so `/api/ask` needs the site password, and `/api/ask/route.ts:25` additionally calls
`requireUser()`. Measured live: `GET /ask` → `307 → /gate?next=%2Fask`.

Persistence is therefore **untested, not broken**.
