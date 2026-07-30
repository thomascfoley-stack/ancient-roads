# §B-1 — postcss GHSA-r28c-9q8g-f849 diagnosis (STOP for owner)

**Clone:** `/Users/foley/Projects/ancient-roads-git`  
**Commit:** be3b30fdb48d841b20552dd4e3a9fdd97ac38f29  
**Date:** 2026-07-30

## Observed failure (independent audit @ `8a6aa63`)

```
AUDIT FAILED (1): deps — advisory bulk-endpoint (prod, high+ CVEs)
  GHSA-r28c-9q8g-f849 — postcss [high]
```

Committed `npm-run-audit.log` claimed `AUDIT PASSED` with observed set `{GHSA-qq9h-g4jm-xgf3}` only — **stale / environment mismatch**.

## 1. Reachability

**Production closure — yes.** Postcss is not dev-tooling-only in this repo:

```
theology-study-web>next>postcss@8.5.25
theology-study-web>@neondatabase/auth>…>next>postcss@8.5.25
(theology-study-web>@neondatabase/auth>…>better-auth>vitest>vite>postcss@8.5.25  — prod lock closure only)
```

Primary production path: **`web/` Next.js app → `next` → `postcss@8.5.25`**.  
Root dev vitest/vite also pulls postcss, but `deps-audit.mjs` scans **`pnpm list -r --prod`** only.

## 2. Clearing version

| Item | Value |
|------|-------|
| Advisory | GHSA-r28c-9q8g-f849 (high) — path traversal in source-map auto-load |
| Patched at | **≥ 8.5.18** |
| `pnpm.overrides` | `"postcss": "^8.5.22"` (package.json) |
| Resolved in this clone | **8.5.25** (sole version in prod closure) |

At **8.5.25**, npm bulk endpoint returns **no applicable findings** for the prod closure in this clone (`node scripts/deps-audit.mjs` → only `GHSA-qq9h-g4jm-xgf3`).

**Likely audit-clone delta:** lockfile resolved postcss **≤ 8.5.17** despite override caret, or stale `node_modules` before override took effect. Re-run `pnpm install` and verify `pnpm list -r --prod postcss` shows ≥ 8.5.18 before trusting audit green.

## 3. Owner options (do not implement in agent — ADR-037 / ADR-038)

**Option A — Fix the dependency (recommended if clone confirms vulnerable version):**

- Ensure lockfile resolves postcss ≥ 8.5.18 (bump override to `^8.5.25` if needed).
- Re-run `npm run audit`; regenerate committed `npm-run-audit.log` at PR head.

**Option B — Accept the red (owner ruling required):**

- Add GHSA-r28c-9q8g-f849 to `scripts/audit.sh --expect-red`, `docs/SECURITY.md`, and new ADR in `docs/DECISIONS.md` with owner quote — **same commit**, per ADR-037.
- Regenerate committed audit log.

**Not permitted:** adding to `--expect-red` or `ignoreGhsas` without owner ruling in the change that satisfies it.

## Local head at diagnosis time

```
node scripts/deps-audit.mjs --expect-red GHSA-qq9h-g4jm-xgf3
→ ✓ matches exactly (1 GHSA)

npm run audit @ f0ac714+ (pre-blocking-fixes)
→ AUDIT PASSED (postcss not in observed set at 8.5.25)
```

**Status: STOPPED-FOR-OWNER** on §B-1 until ruling.
