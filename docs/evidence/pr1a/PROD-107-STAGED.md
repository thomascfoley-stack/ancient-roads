# Staged for the owner: migration 107 → production

**Status: NOT APPLIED TO PRODUCTION. Awaiting the owner's explicit go, per bylaw 7.**

Everything below has been executed against **dev** (`ep-tiny-hat-atdgpisx`) and verified. Nothing
here has touched `ep-odd-fog`.

## What it does

Creates one table, `prayers`, with RLS on and grants stated explicitly. It creates no other object,
alters no existing table, and moves no data. Nothing in production reads or writes `prayers` until
the code that does is deployed, so applying it early is inert — the table simply sits empty.

## The command

```bash
node db/apply-pending.mjs
```

Run with the **production** connection in the environment, from a clean tree. It applies in numeric
order and stops on the first failure; 107 is the only pending file.

## Why this one has its own verification built in

Migration **106** exists because **039** assumed a grant it did not have — it cited a comment that
**032** had already invalidated when 032 narrowed `ALTER DEFAULT PRIVILEGES` to SELECT + INSERT. Two
features (`Mark as read`, `Delete plan`) shipped and never worked for a single user, and nothing
went red, because a migration that creates a table it cannot update still reports success.

So 107 does not assume. It ends in a `DO $$` block that raises if `app_runtime` lacks UPDATE or
DELETE on `prayers`, or if the table has no RLS policy. **A typo fails the migration instead of
being reported applied.** That block can fail: it was watched failing against a database without
the grant.

## What was proven on dev

| Check | Result |
|---|---|
| Applied | `✓ ledger: 107_prayers.sql (neondb_owner, sha256 1dd512ec8cb6…)` |
| Grants | `DELETE,INSERT,SELECT,UPDATE` |
| Policies | 1 |
| Columns | `id user_id body verse_id? created_at updated_at deleted_at?` |
| **RLS, two accounts, over `app_runtime`** | B cannot read, update, or delete A's prayer. A's text intact. A can edit and delete their own. |
| Carry-forward through the real data layer | 4 rows written and read back through RLS; re-run created 0; rows cleaned up |

The RLS check ran as **`app_runtime`**, not as the owner. Run as owner it would have passed
vacuously — `neondb_owner` bypasses RLS, so the policy would never have been consulted and the
check could not have failed.

## Rollback

```sql
DROP TABLE IF EXISTS prayers;
```

Exact and complete: 107 creates nothing else. Safe while no prayers exist; **destructive once
readers have written any**, which is the case the moment the feature is live.

## Sequencing

Migration first, deploy second. The reverse order serves a `/prayers` page whose every query hits a
missing table.
