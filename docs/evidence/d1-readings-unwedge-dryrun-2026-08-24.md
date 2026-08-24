# D1 remediation — dry run evidence, 2026-08-24

Script: `scripts/d1-readings-unwedge.mts`. Target below is the **dev** branch (`ep-tiny-hat`).
**Production has not been touched** — no prod credential was available to this session.

## 1. It refuses to run blind

`user_documents` has row security ENABLED and FORCED, and `user_documents_policy` is
`user_id = current_setting('app.current_user_id', true)`. As `app_runtime` with no user context
every query sees **zero** rows — so an unguarded script would print "0 wedged", exit 0, and fix
nothing. Measured: 3 seeded rows, 0 visible without context.

```
REFUSING TO RUN. user_documents has row security enabled and FORCED and this connection is
"app_runtime", which it applies to. Every query would see zero rows and this script would report
"0 wedged" having fixed nothing.
Re-run with the OWNER connection:  D1_DB_URL=$DATABASE_URL_UNPOOLED npx tsx scripts/d1-readings-unwedge.mts
```

## 2. Dry run, owner connection

```
target: ep-tiny-hat-atdgpisx.c-9.us-east-1.aws.neon.tech
mode:   DRY RUN (no writes)

pending rows:            11
of those, WEDGED:        9
left alone (live/partial): 2

DRY RUN — nothing written. Re-run with --apply to clear these.
```

**Eight of those nine were real dev documents**, not fixtures — one was seeded by this test. The
wedge is present in a live database, not hypothetical.

## 3. Apply, and the survivors

Fixture: three rows — the drain's exact write shape aged past the stale window; a LIVE claim with
a fresh `updated_at`; and a run that has PROGRESSED (progress 40, step 'searching').

```
mode:   APPLY (will write)
of those, WEDGED:        9
CLEARED 9 row(s) to readings_status = NULL.
remaining wedged: 0 (expected 0)
```

After:

```
  in progress      status=pending progress=40   <- untouched
  live claim       status=pending progress=0    <- untouched
  wedged by drain  status=NULL    progress=0    <- cleared
```

The predicate discriminates: a live claim and a progressed run both survive.

## 4. Running it on production

```bash
D1_DB_URL='<prod OWNER connection string>' npx tsx scripts/d1-readings-unwedge.mts
```

Read the dry-run output first. `--apply` only after the counts look right. Expect the same shape:
a `pending` total, a `WEDGED` subset, and a `left alone` remainder that must be non-zero only if
searches are genuinely running at that moment.

**This needs the owner (unpooled) role.** The pooled `app_runtime` string will be refused, by
design.
