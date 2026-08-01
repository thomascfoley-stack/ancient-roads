# Migration 032 — applied to production 2026-08-02

Owner-authorised, applied with `MIGRATE_ALLOW_PROD=1` through `db/apply-migration.mjs` — the
repo's documented override, not a workaround. Endpoint `ep-odd-fog-atnykudm`, role `neondb_owner`.

## Before → after

| | before | after |
|---|---|---|
| `waitlist` rows | 4 | **4** (untouched) |
| `api_rate_limit` rows | 41 | **41** (untouched) |
| `api_rate_limit` RLS | false | **true**, `api_rate_limit_own_rows` (FOR ALL, permissive) |
| `waitlist` RLS | false | **false** — deliberately, see below |
| default privileges | `app_runtime=arwd` | **`app_runtime=ar`** — UPDATE and DELETE removed |
| `schema_migrations` | did not exist | **31 rows**, newest `032_…` |

`arwd` → `ar` is H15 closed. Every future table in `public` is now born SELECT+INSERT for the web
role instead of fully writable, so the protection is no longer "a human remembers a per-table
REVOKE" — which had already failed twice (migration 010 missed `section_anchors` and
`section_embeddings`, repaired four migrations later).

## Why the waitlist RLS is NOT here

It is migration `033`, and applying it now would have broken the public signup form **silently**.

The live bundle is `24677ba` (2026-07-19) and it runs `INSERT ... ON CONFLICT (email) DO NOTHING`.
`ON CONFLICT` is incompatible with an INSERT-only RLS policy: Postgres requires the proposed row
to be SELECT-visible to run the conflict arbiter, so it fails with *"new row violates row-level
security policy"* **even for a brand-new email with no conflict at all**. Measured on a throwaway
before anything touched production — and the waitlist route's fail-soft catch returns *"You're on
the list"* to the visitor while discarding the row, so the failure would not have been visible
from either side.

Neither `FOR SELECT USING (false)` nor `FOR ALL USING (false) WITH CHECK (true)` helps; `RETURNING`
fails the same way. The only way to keep `ON CONFLICT` is to grant `app_runtime` read access to the
whole email list, which is exactly what the policy exists to remove.

So the route now does a plain INSERT and catches SQLSTATE 23505, and `033` applies with that
deploy — not before it. The coupling is stated at the top of `033` itself, where an operator
reaching for it will see it.

For contrast: `api_rate_limit`'s policy uses `USING (true)`, which is why the limiter's own
`ON CONFLICT ... DO UPDATE ... RETURNING` keeps working under RLS. Verified after applying.

## Verification performed

Pre-state and post-state both read read-only inside a rolled-back transaction. On a throwaway
Postgres beforehand: 032 applied twice (idempotent), the OLD bundle's `ON CONFLICT` statement
still worked after it, and 033 then broke that statement exactly as documented.

`post-state.log` is the machine output, unedited.
