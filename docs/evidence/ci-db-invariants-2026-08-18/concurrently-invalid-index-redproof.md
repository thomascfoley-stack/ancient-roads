# Red-proof: `CREATE INDEX CONCURRENTLY IF NOT EXISTS` over an invalid index

Executed 2026-08-18 on a throwaway PostgreSQL 17.10 instance, 400,000-row table. Each step
observed; nothing quoted from documentation.

```
-- 1. interrupt a build mid-flight (what a CI step timeout does)
   → idx_big_fts | indisvalid=f | indisready=f

-- 2. the migration re-runs, exactly as 108/109/113/115 write it
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_big_fts ON big USING GIN (to_tsvector('english', body));
   NOTICE:  relation "idx_big_fts" already exists, skipping
   CREATE INDEX
   exit=0

-- 3. the index is STILL invalid
   → idx_big_fts indisvalid=false

-- 4. the planner ignores it
   → Parallel Seq Scan on big
        Filter: (to_tsvector('english'::regconfig, body) @@ '''coven'''::tsquery)

-- 5. the migration's NEXT statement drops the working predecessor, and succeeds
DROP INDEX CONCURRENTLY IF EXISTS idx_big_fts_old;   → DROP INDEX
   → remaining: big_pkey valid=true | idx_big_fts valid=false
   → Parallel Seq Scan
```

**End state: working index dropped, replacement invalid, migration reported success.** With
`apply-pending.mjs` the ledger row lands too, so the artifact says "applied".

**Scope, per review:** the production runner `apply-migration-concurrent.mjs` already pre-cleans
invalid leftovers and asserts `indisvalid` before recording. The gap is `apply-pending.mjs`
(CI-only, refuses production). Applies to 108/109/113/115, which drop-and-rename; **not** to 044
or 114, which do neither.
