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

gate "typecheck — tsc --noEmit (strict)"  $PNPM exec tsc --noEmit
gate "typecheck — web/ tsc --noEmit"      bash -c "cd web && npx tsc --noEmit"
gate "lint — eslint src/ test/"           $PNPM exec eslint src test
gate "lint — web/ next lint"              bash -c "cd web && npx next lint --quiet"
gate "unused — knip (files/exports/deps)" $PNPM exec knip
gate "deps — pnpm audit (prod, high+ CVEs)" $PNPM audit --prod --audit-level=high
gate "tests + coverage — vitest"          $PNPM exec vitest run --coverage

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
