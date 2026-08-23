# W-SEC1 baseline RED + dependency truth, 2026-08-23

Base: origin/main = 9dce273ef09dffb03bc547cead0431f48fb71ffe
Worktree: /tmp/swarm-sec1, branch swarm/w-sec1-dependency-truth

## `pnpm why better-auth -r` (trimmed)
```
Legend: production dependency, optional only, dev only

theology-study-web@0.1.0 /private/tmp/swarm-sec1/web (PRIVATE)

dependencies:
@neondatabase/auth 0.4.2-beta
├─┬ @neondatabase/auth-ui 0.2.1-beta
│ ├─┬ @better-auth/passkey 1.4.18
│ │ └── better-auth 1.4.18 peer
│ ├─┬ @daveyplate/better-auth-ui 3.3.9
│ │ ├─┬ @better-auth/passkey 1.4.18 peer
│ │ │ └── better-auth 1.4.18 peer
│ │ ├─┬ @daveyplate/better-auth-tanstack 1.3.6 peer
│ │ │ └── better-auth 1.4.18 peer
│ │ └── better-auth 1.4.18 peer
│ └── better-auth 1.4.18
└── better-auth 1.4.18
```

## `node scripts/deps-audit.mjs` (no --expect-red) — BASELINE RED
```
deps-audit scanned package versions (findings):
  scanned better-auth: 1.4.18

[31m✗ deps-audit: 2 un-ignored high/critical advisory(ies):[0m
  [high] better-auth — GHSA-g38m-r43w-p2q7 — Better Auth has an account takeover issue via OAuth auto-link to unverified pre-registered email (<1.6.11)
  [high] better-auth — GHSA-qq9h-g4jm-xgf3 — Better Auth: Account takeover via pre-account hijacking on magic-link and email-OTP sign-in (>=1.1.3 <1.6.22)

Fix the dependency, or (if lawful + accepted) add the GHSA id to package.json → pnpm.auditConfig.ignoreGhsas with a note in docs/SECURITY.md, or declare it in scripts/audit.sh --expect-red.
exit=1 (measured: node scripts/deps-audit.mjs > file 2>&1; echo $?)
```

## Registry facts 2026-08-23 (npm view)
```
@neondatabase/auth latest: 0.5.0-beta
@neondatabase/auth@0.5.0-beta deps:
{
  "@better-fetch/fetch": "1.3.1",
  "@supabase/auth-js": "2.79.0",
  "better-auth": "1.6.23",
  "jose": "6.2.5",
  "zod": "4.3.6",
  "@neondatabase/auth-ui": "0.3.0-beta"
}
@neondatabase/auth-ui latest: 0.3.0-beta
@neondatabase/auth-ui@0.3.0-beta pins better-auth: 1.6.23
```

Patched bars: GHSA-g38m <1.6.11 vulnerable; GHSA-qq9h >=1.1.3 <1.6.22 vulnerable. 1.6.23 clears both.

Branch fix/sec1-better-auth-1-6-25: single commit f52a159 forcing the better-auth subtree to 1.6.25 via pnpm overrides against auth 0.4.2-beta — the approach docs/SECURITY.md:290-294 records as build-breaking. MOOT: superseded by the upstream 0.5.0-beta bump.

## Post-bump state (web/package.json @neondatabase/auth ^0.4.2-beta -> ^0.5.0-beta, pnpm install)

### `pnpm why better-auth -r`
```

theology-study-web@0.1.0 /private/tmp/swarm-sec1/web (PRIVATE)

dependencies:
@neondatabase/auth 0.5.0-beta
├─┬ @neondatabase/auth-ui 0.3.0-beta
│ ├─┬ @better-auth/passkey 1.6.23
│ │ └── better-auth 1.6.23 peer
│ ├─┬ @daveyplate/better-auth-ui 3.4.0
│ │ ├─┬ @better-auth/api-key 1.7.1
│ │ │ └── better-auth 1.6.23 peer
│ │ ├─┬ @better-auth/passkey 1.6.23 peer
│ │ │ └── better-auth 1.6.23 peer
│ │ ├─┬ @daveyplate/better-auth-tanstack 1.3.6 peer
│ │ │ └── better-auth 1.6.23 peer
│ │ └── better-auth 1.6.23 peer
│ └── better-auth 1.6.23
└── better-auth 1.6.23
```

### `node scripts/deps-audit.mjs` (no --expect-red) — GREEN
```
(Use `node --trace-deprecation ...` to show where the warning was created)
deps-audit scanned package versions (findings):
```
(post-bump green re-run below in after-green.md with true exit code)

### RED-PROOF of the gate change: old `--expect-red GHSA-g38m...,GHSA-qq9h...` line, run post-bump
```
deps-audit scanned package versions (expect-red / ignore carriers):
  scanned better-auth: 1.6.23

[31m✗ deps-audit: declared --expect-red id(s) no longer observed (set changed):[0m
  GHSA-g38m-r43w-p2q7
  GHSA-qq9h-g4jm-xgf3

Update --expect-red in scripts/audit.sh and docs/SECURITY.md together, with owner approval.
TRUE_EXIT=1
```
A disappearance from the declared set fails the leg exactly like an addition — the mechanism that made the 2026-08-11 declaration honest is what caught its own obsolescence.
