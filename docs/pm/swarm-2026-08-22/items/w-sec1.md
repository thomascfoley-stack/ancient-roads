# W-SEC1 — SEC-1 code state (no launch decision)

**Status: FIXED → AUDIT-GREEN** (pending independent verification, Wave 7; merge per Wave 8)
**Branch:** `swarm/w-sec1-dependency-truth` (worktree `/tmp/swarm-sec1`, base `origin/main` = `9dce273`)
**Spend (A1):** $0 — no provider calls; npm registry reads + local toolchain only.

## Verdict: outcome (b) — exposure present, fixable by a bump within existing dependency policy

Baseline truth (measured 2026-08-23, evidence `docs/evidence/swarm-2026-08-22/w-sec1/baseline-red.md`):

- better-auth **did** still reach the tree transitively: `web > @neondatabase/auth@0.4.2-beta > better-auth@1.4.18` (`pnpm why better-auth -r`, lockfile).
- `scripts/deps-audit.mjs` was RED without `--expect-red` (exit 1): GHSA-g38m-r43w-p2q7 and GHSA-qq9h-g4jm-xgf3, both on `better-auth@1.4.18`.
- The 2026-08-11 ruling premise ("0.4.2-beta is the latest release that exists") expired: Neon shipped `@neondatabase/auth@0.5.0-beta` / `@neondatabase/auth-ui@0.3.0-beta`, depending on `better-auth@1.6.23` (≥ the 1.6.11 and 1.6.22 patch bars).
- Branch `fix/sec1-better-auth-1-6-25` (single commit `f52a159`, pnpm-overrides the subtree to 1.6.25 against auth 0.4.2-beta) is **MOOT** — the override approach SECURITY.md records as build-breaking, superseded by the upstream release.

## Change

- `web/package.json`: `@neondatabase/auth` `^0.4.2-beta` → `^0.5.0-beta`; `pnpm install` regenerated `pnpm-lock.yaml`. Lockfile now resolves `better-auth@1.6.23` only (zero `better-auth@1.4` entries).
- `scripts/audit.sh`: deps gate runs `node scripts/deps-audit.mjs` with **no `--expect-red`** (declared set empty); comment block rewritten to the 2026-08-23 reality.
- `package.json` `pnpm.auditConfig."//"`: rewritten to the 2026-08-23 reality. **`ignoreGhsas` untouched** (8 ids; not weakened, per the order).
- `docs/SECURITY.md` SEC-1: new dated layer at the top — in-tree exposure closed by version; hosted-server version still unobservable; launch ruling still owner's.
- `docs/DECISIONS.md` ADR-003: dated update pointer (the "unfixable via override" premise expired).

Cost of not fixing (§2.5): two HIGH account-takeover-class advisories stay live in the prod dependency closure and `--expect-red` stays non-empty, normalizing declared red.

## Red-first / red-proof

- Watched RED before the change: `node scripts/deps-audit.mjs` exit 1 with the 2 advisories (baseline-red.md).
- Red-proof of the gate change: post-bump, the OLD `--expect-red GHSA-g38m...,GHSA-qq9h...` line fails exit 1 — "declared id(s) no longer observed" — proving the exact-match mechanism catches disappearance (baseline-red.md). A dependency bump needs evidence, not a new test; no code-path behavior changed.

## Verification so far (fixer's own — NOT certification, §2.3)

- `pnpm why better-auth -r`: 1.6.23 everywhere; lockfile zero `better-auth@1.4`.
- `node scripts/deps-audit.mjs`: exit 0, "no un-ignored high/critical advisories across 512 prod packages (8 ignored per SECURITY.md)".
- `web` `tsc --noEmit`: clean (the `@neondatabase/auth/next` + `/next/server` import surfaces typecheck unchanged).
- `web` vitest `sec1-route-guard` + `sec1-upload-gate`: 20/20 pass.
- Full `npm run audit` in worktree: every leg green EXCEPT `test/publish-flip-toolchain.test.ts > thayers evidence gate` — pre-existing baseline red at `9dce273` (the test asserts `docs/evidence/thayers-source-verification.md` must not exist; it is committed at base). W-BASEFIX's item — noted, not fixed. Transcript: `docs/evidence/swarm-2026-08-22/w-sec1/after-green.md`.
- `npx next build` in `web/`: compiled successfully.
- First audit run also caught `test/invariants/upload-root-lockfile.test.ts` RED — the bump had stale-dated `web/package-lock.json`; regenerated per the test's own recipe (watched red → green, 6/6).

## Caveats for verifier / owner

- The bump does NOT change Neon's **hosted** better-auth server version — unobservable from this repo. The `Verify at Sign-up` console attestation (2026-08-08) still needs periodic re-attestation.
- `0.5.0-beta` pulls `@supabase/auth-js` transitively and pnpm reports unmet-peer warnings inside upstream's own subtree (`@better-auth/api-key@1.7.1` wants `better-auth@^1.7.1`, found 1.6.23) — upstream's packaging, not ours; build/tests unaffected.
- `web/test/invariants/neon-auth-live.test.ts` is NOT RUN (credentials withheld by design — it has never executed). Auth against a live Neon instance should be exercised on dev before any deploy.
- The public-launch decision (SEC-1 gate down) is the OWNER'S. This item changed code state only.
