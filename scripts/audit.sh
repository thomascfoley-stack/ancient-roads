#!/usr/bin/env bash
# Repeatable quality gate. Runs every check, reports ALL failures (not just the
# first), and exits non-zero if any gate fails.
#   npm run audit   (or: corepack pnpm run audit — NOT `pnpm audit`, which is pnpm's own command)
set -uo pipefail
cd "$(dirname "$0")/.."

PNPM="corepack pnpm"
FAILED=()

gate() {
  local name="$1"; shift
  printf '\n\033[1m▶ %s\033[0m\n' "$name"
  if "$@"; then
    printf '\033[32m✓ %s\033[0m\n' "$name"
  else
    printf '\033[31m✗ %s\033[0m\n' "$name"
    FAILED+=("$name")
  fi
}

# FIRST gate: shell + root ingest env must be on the audit allow-list (fail-fast).
printf '\n\033[1m▶ env — audit allow-list (shell + ingest env)\033[0m\n'
if node scripts/assert-ingest-env-dev.mjs; then
  printf '\033[32m✓ env — audit allow-list (shell + ingest env)\033[0m\n'
else
  printf '\033[31m✗ env — audit allow-list (shell + ingest env)\033[0m\n'
  printf '\033[31mAUDIT REFUSED — point shell DATABASE_URL at dev/localhost or unset it\033[0m\n'
  exit 1
fi

gate "typecheck — tsc --noEmit (strict)"  $PNPM exec tsc --noEmit
# The cutover gate is TypeScript and was never compiled by CI: the root tsconfig includes
# only src/ and test/. See tsconfig.cutover.json for what this does and does not cover.
gate "typecheck — cutover gate (scripts/)" $PNPM exec tsc --noEmit -p tsconfig.cutover.json
gate "typecheck — web/ tsc --noEmit"      bash -c "cd web && npx tsc --noEmit"
gate "typecheck — web/test tsc --noEmit"  bash -c "cd web && npx tsc --noEmit -p tsconfig.test.json"
gate "lint — eslint src/ test/"           $PNPM exec eslint src test
gate "lint — web/ eslint"                    bash -c "cd web && npx eslint --quiet ."
gate "unused — knip (files/exports/deps)" $PNPM exec knip
# --expect-red is an EXPLICIT, REVIEWABLE enumeration (work-order v2 Stage 1.4): the observed
# un-ignored red set must match it exactly — an extra advisory OR a disappearance both fail
# this leg, so "the server got patched" and "the toggle got switched off" are build events,
# not silence. It is EMPTY as of 2026-08-23 (W-SEC1, swarm order 2026-08-22 §9): the bump to
# @neondatabase/auth@0.5.0-beta moved the in-tree better-auth to 1.6.23, and the two ids
# declared here since the 2026-08-11 owner ruling (docs/pm/RULINGS-2026-08-11.md §1) no longer
# fire — GHSA-g38m-r43w-p2q7 (OAuth auto-link account takeover, patched >=1.6.11) and
# GHSA-qq9h-g4jm-xgf3 (magic-link/email-OTP pre-account hijack, patched >=1.6.22, ADR-038) —
# so the gate runs with no declared exceptions. The mechanism stays armed: declare any future
# accepted-red id here, never silence it, and a disappearance from the declared set fails this
# leg exactly like an addition (observed firing 2026-08-23 before this line was updated).
# The six not-in-path better-auth advisories (provider-side plugins never enabled — grep
# `web/src` 2026-08-11) live in pnpm.auditConfig.ignoreGhsas with their adjudications in
# docs/SECURITY.md. Reality check 2026-08-23: production runs Neon Auth
# (@neondatabase/auth@0.5.0-beta → Neon's HOSTED better-auth server, whose version this repo
# still cannot observe); the only better-auth in the tree is 1.6.23, transitive.
gate "deps — advisory bulk-endpoint (prod, high+ CVEs)" node scripts/deps-audit.mjs
gate "tests + coverage — vitest"          $PNPM exec vitest run --coverage
gate "qa — Layer 1 invariants + regressions" $PNPM run qa
gate "hygiene — no test residue in dev (post-suite)" node scripts/check-test-residue.mjs
# deploy.sh is bash, so vitest never saw it: every line of the gate in front of the irreversible
# operation ran for the first time DURING that operation, and its whole history is defects found
# by deploying. This harness runs it against throwaway git repos and a stubbed CLI. It needs no
# network, no credentials and no Vercel account — see the file header for the red-proof procedure.
gate "deploy.sh — gate harness (bash)"    bash test/deploy-sh-gates.sh
gate "data — Gate B license (fail-closed)" $PNPM exec tsx src/ingest/check-licenses.ts

# Informational: source files the test suite never touches.
printf '\n\033[1m▶ coverage gaps (informational)\033[0m\n'
node -e '
  const fs = require("fs");
  const f = "coverage/coverage-summary.json";
  if (!fs.existsSync(f)) { console.log("(no coverage summary produced)"); process.exit(0); }
  const s = JSON.parse(fs.readFileSync(f, "utf8"));
  const zero = Object.entries(s)
    .filter(([k, v]) => k !== "total" && v.statements && v.statements.pct === 0)
    .map(([k]) => k.replace(process.cwd() + "/", ""));
  if (zero.length === 0) console.log("Every included source file has some coverage.");
  else { console.log("Files with ZERO coverage (" + zero.length + "):"); zero.forEach((z) => console.log("  " + z)); }
'

printf '\n════════════════════════════════════\n'
if [ ${#FAILED[@]} -eq 0 ]; then
  printf '\033[32mAUDIT PASSED — all gates green\033[0m\n'; exit 0
fi
printf '\033[31mAUDIT FAILED (%d): %s\033[0m\n' "${#FAILED[@]}" "${FAILED[*]}"; exit 1
