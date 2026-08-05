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
# --expect-red is EMPTY as of 2026-08-05. GHSA-qq9h-g4jm-xgf3 (ADR-038, magic-link/email-OTP
# pre-account hijacking) was the one declared acceptable red; it was rooted in the better-auth
# 1.4.18 pinned by @neondatabase/auth. The SEC-1 cutover removed that package and runs
# better-auth 1.6.26 directly, so the advisory no longer fires and deps-audit correctly failed
# on "declared id no longer observed". A disappearance is as much a gate failure as an addition,
# which is the point of declaring the set rather than thresholding it.
gate "deps — advisory bulk-endpoint (prod, high+ CVEs)" node scripts/deps-audit.mjs
gate "tests + coverage — vitest"          $PNPM exec vitest run --coverage
gate "qa — Layer 1 invariants + regressions" $PNPM run qa
gate "hygiene — no test residue in dev (post-suite)" node scripts/check-test-residue.mjs
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
