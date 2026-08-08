#!/bin/bash
# ---------------------------------------------------------------------------
# test/deploy-sh-gates.sh — the tests deploy.sh never had.
#
# WHY THIS EXISTS. deploy.sh is the only gate in front of the operation MASTER calls "the
# irreversible one", it is 300 lines of bash, and every line of it ran for the first time DURING
# that operation. Its history is a list of defects found by deploying: a deploy that reported
# success while failing (pipefail, 2026-08-03), receipts written into the upload directory
# (2026-08-02), an account/scope assertion added only after an audit found the CLI would have
# created a project in someone else's org (2026-08-02), three lanes reverting each other
# (2026-08-04). Each fix was correct and each was unverified, because nothing could run this file
# without deploying.
#
# HOW. A throwaway git repo per case (with a real bare 'origin', so the ancestry gate is exercised
# rather than mocked), and a fake `npx` on PATH standing in for the three commands deploy.sh
# shells out to: the licensing gate, `next build`, and the Vercel CLI. Everything else — every
# gate, every branch, the trap, the receipt — is the real code under test.
#
# RED-PROOF. Run it against the previous deploy.sh and watch the new cases fail:
#     git show HEAD:deploy.sh > /tmp/old-deploy.sh
#     bash test/deploy-sh-gates.sh /tmp/old-deploy.sh
# A case that does not fail there is a case that is not testing this change.
#
# Usage: bash test/deploy-sh-gates.sh [path-to-deploy.sh]
# ---------------------------------------------------------------------------
set -uo pipefail

SUT="${1:-}"
[ -n "$SUT" ] || SUT="$(cd "$(dirname "$0")/.." && pwd)/deploy.sh"
[ -f "$SUT" ] || { echo "no script under test at: $SUT" >&2; exit 1; }

SANDBOX="$(mktemp -d "${TMPDIR:-/tmp}/deploy-gates.XXXXXX")"
trap 'rm -rf "$SANDBOX"' EXIT

PASS=0
FAIL=0
FAILED_LIST=""
CASE_N=0
CURRENT=""

# --- the fake npx -----------------------------------------------------------
FAKEBIN="$SANDBOX/bin"
mkdir -p "$FAKEBIN"
cat > "$FAKEBIN/npx" <<'FAKE'
#!/bin/bash
printf 'npx [cwd=%s] %s\n' "${PWD##*/}" "$*" >> "${FAKE_ARGV_LOG:-/dev/null}"
args=()
for a in "$@"; do
  case "$a" in --yes) ;; *) args+=("$a") ;; esac
done
cmd="${args[0]:-}"
case "$cmd" in
  tsx)
    exit "${FAKE_GATE_RC:-0}"
    ;;
  next)
    if [ "${FAKE_BUILD_DIRTIES:-0}" = "1" ]; then
      echo "another session was here" > "${FAKE_REPO:-/dev/null}/interloper.txt"
    fi
    exit "${FAKE_BUILD_RC:-0}"
    ;;
  vercel|vercel@*)
    sub="${args[1]:-}"
    case "$sub" in
      whoami)
        printf '%s\n' "${FAKE_WHOAMI_OUT-thomascfoley-7284}"
        exit "${FAKE_WHOAMI_RC:-0}"
        ;;
      project)
        printf '%s\n' "${FAKE_PROJECT_LS_OUT-  web}"
        exit "${FAKE_PROJECT_LS_RC:-0}"
        ;;
      env)
        if [ -n "${FAKE_ENV_LS_OUT+set}" ]; then
          printf '%s\n' "$FAKE_ENV_LS_OUT"
        else
          printf '%s\n' "  name                       value       environments   created"
          for n in APP_DATABASE_URL DATABASE_URL DEEPINFRA_API_KEY SITE_PASSWORD \
                   BETTER_AUTH_URL BETTER_AUTH_SECRET \
                   NEON_AUTH_BASE_URL NEON_AUTH_COOKIE_SECRET; do
            case " ${FAKE_ENV_DROP:-} " in *" $n "*) continue ;; esac
            printf '  %-26s Encrypted   Production     1d ago\n' "$n"
          done
        fi
        exit "${FAKE_ENV_LS_RC:-0}"
        ;;
      inspect)
        if [ "${FAKE_INSPECT_RC:-0}" != "0" ]; then
          echo "Error: deployment not found" >&2
          exit "${FAKE_INSPECT_RC}"
        fi
        target="${args[2]:-}"
        if [ "$target" = "ancientpaths.app" ]; then
          printf '    id\t%s\n' "${FAKE_ALIAS_ID:-dpl_SAMEid000}"
        else
          printf '    id\t%s\n' "${FAKE_DEPLOY_ID:-dpl_SAMEid000}"
        fi
        exit 0
        ;;
      *)
        printf '%s\n' "${FAKE_DEPLOY_OUT-Production: https://web-abc123-home-network-hardening.vercel.app [2m]}"
        exit "${FAKE_DEPLOY_RC:-0}"
        ;;
    esac
    ;;
  *) exit 0 ;;
esac
FAKE
chmod +x "$FAKEBIN/npx"

# --- harness ----------------------------------------------------------------
reset_knobs() {
  unset FAKE_GATE_RC FAKE_BUILD_RC FAKE_BUILD_DIRTIES \
        FAKE_WHOAMI_RC FAKE_WHOAMI_OUT FAKE_PROJECT_LS_RC FAKE_PROJECT_LS_OUT \
        FAKE_ENV_LS_RC FAKE_ENV_LS_OUT FAKE_ENV_DROP \
        FAKE_DEPLOY_RC FAKE_DEPLOY_OUT FAKE_INSPECT_RC FAKE_DEPLOY_ID FAKE_ALIAS_ID \
        DEPLOY_ALLOW_BEHIND
}

begin() {
  CASE_N=$((CASE_N + 1))
  CURRENT="$1"
  reset_knobs
  REPO="$SANDBOX/repo-$CASE_N"
  ORIGIN="$SANDBOX/origin-$CASE_N.git"
  git init -q --bare "$ORIGIN"
  # PIN THE BARE REPO'S HEAD, exactly as $REPO's is pinned below.
  #
  # `git init --bare` takes its HEAD from `init.defaultBranch`, which is `main` on the machine this
  # harness was written on and `master` on the CI runner. With HEAD at an unborn `master`, the
  # `git clone` in "behind-origin-main-blocked" checks out nothing, its commit lands on `master`,
  # and `git push origin main` never reaches origin/main — so the tree under test was NOT behind,
  # the ancestry gate correctly did nothing, and the case reported the GATE as broken.
  #
  # The gate was fine. The harness was environment-dependent, and in the direction that matters:
  # on a `master`-default machine the single case protecting against one lane un-shipping
  # another's live work was VACUOUS. Reproduced locally with
  # `GIT_CONFIG_KEY_0=init.defaultBranch GIT_CONFIG_VALUE_0=master`, which turns all 57 green into
  # the exact 4 failures CI reported.
  git --git-dir="$ORIGIN" symbolic-ref HEAD refs/heads/main
  git init -q "$REPO"
  (
    cd "$REPO" || exit 1
    git symbolic-ref HEAD refs/heads/main
    git config user.email "test@example.com"
    git config user.name "gate test"
    mkdir -p web/public/bible web/public/commentaries scripts docs/evidence/deploys
    cp "$SUT" ./deploy.sh
    echo "// stub" > scripts/predeploy-gate.ts
    echo '{}' > web/package.json
    git add -A >/dev/null 2>&1
    git commit -qm "init"
    git remote add origin "$ORIGIN"
    git push -q origin main
  ) >/dev/null 2>&1
  ARGV_LOG="$SANDBOX/argv-$CASE_N.log"
  : > "$ARGV_LOG"
}

# run_deploy [subdir] — executes the real script with the fakes in front
run_deploy() {
  local from="${1:-$REPO}"
  OUT="$(cd "$from" && FAKE_REPO="$REPO" FAKE_ARGV_LOG="$ARGV_LOG" \
    PATH="$FAKEBIN:$PATH" bash "$REPO/deploy.sh" 2>&1)"
  RC=$?
}

ok()   { PASS=$((PASS + 1)); printf '  \033[32mPASS\033[0m %s — %s\n' "$CURRENT" "$1"; }
bad()  { FAIL=$((FAIL + 1)); FAILED_LIST="$FAILED_LIST\n    $CURRENT — $1"
         printf '  \033[31mFAIL\033[0m %s — %s\n' "$CURRENT" "$1"; }

assert_rc() {
  if [ "$RC" = "$1" ]; then ok "exit $1"; else bad "expected exit $1, got $RC"; fi
}
assert_out() {
  case "$OUT" in *"$1"*) ok "says: $1" ;; *) bad "output lacks: $1" ;; esac
}
assert_not_out() {
  case "$OUT" in *"$1"*) bad "output should not contain: $1" ;; *) ok "silent on: $1" ;; esac
}
receipt_path() { ls "$REPO"/docs/evidence/deploys/*.txt 2>/dev/null | head -1; }
assert_receipt() {
  local r; r="$(receipt_path)"
  if [ -z "$r" ]; then bad "no receipt written (expected one containing: $1)"; return; fi
  if grep -q -- "$1" "$r"; then ok "receipt records: $1"; else
    bad "receipt lacks: $1 (has: $(tr '\n' '|' < "$r"))"; fi
}
assert_no_receipt() {
  local r; r="$(receipt_path)"
  if [ -z "$r" ]; then ok "no receipt (correct — nothing was uploaded)"; else
    bad "a receipt was written for a deploy that never uploaded: $r"; fi
}
assert_argv() {
  if grep -q -- "$1" "$ARGV_LOG"; then ok "CLI received: $1"; else
    bad "CLI never received: $1"; fi
}

echo ""
echo "=== deploy.sh gate tests — script under test: $SUT ==="
echo ""

# --------------------------------------------------------------------------
# 1. Clean-tree gate
# --------------------------------------------------------------------------
begin "dirty-tree-blocked"
echo "uncommitted" > "$REPO/stray.txt"
run_deploy
assert_rc 1
assert_out "working tree is dirty"
assert_no_receipt

# --------------------------------------------------------------------------
# 2. Ancestry gate — behind origin/main
# --------------------------------------------------------------------------
begin "behind-origin-main-blocked"
(
  cd "$SANDBOX" && git clone -q "$ORIGIN" clone-$CASE_N &&
  cd clone-$CASE_N && git config user.email t@e.com && git config user.name t &&
  echo "other lane" > lane.txt && git add -A && git commit -qm "other lane's shipped work" &&
  git push -q origin main
) >/dev/null 2>&1
run_deploy
assert_rc 1
assert_out "DEPLOY BLOCKED"
assert_out "other lane's shipped work"
assert_no_receipt

# --------------------------------------------------------------------------
# 3. Ancestry gate — origin/main missing must not read as "behind by  commits"
# --------------------------------------------------------------------------
begin "origin-main-unresolvable-named-honestly"
(cd "$ORIGIN" && git branch -m main trunk) >/dev/null 2>&1
(cd "$REPO" && git update-ref -d refs/remotes/origin/main) >/dev/null 2>&1
run_deploy
assert_rc 1
assert_out "does not resolve"
assert_not_out "has  commit(s)"

# --------------------------------------------------------------------------
# 4. whoami failure must SAY so (was: bare exit under set -e)
# --------------------------------------------------------------------------
begin "whoami-failure-prints-its-stop"
export FAKE_WHOAMI_RC=1
run_deploy
assert_rc 1
assert_out "vercel whoami"
assert_no_receipt

# --------------------------------------------------------------------------
# 5. env-ls failure is NOT "variables missing"
# --------------------------------------------------------------------------
begin "env-ls-failure-distinct-from-missing"
export FAKE_ENV_LS_RC=1
run_deploy
assert_rc 1
assert_out "could not read production environment"
assert_not_out "missing required environment variable"

# --------------------------------------------------------------------------
# 6. Unparseable table is a parser fault, not seven missing variables
# --------------------------------------------------------------------------
begin "env-table-unparseable-refuses-to-blame-the-project"
export FAKE_ENV_LS_OUT="no variables found for this project"
run_deploy
assert_rc 1
assert_out "no parseable variable names"
assert_not_out "missing required environment variable"

# --------------------------------------------------------------------------
# 7. A genuinely missing variable is still named
# --------------------------------------------------------------------------
begin "missing-env-var-named"
export FAKE_ENV_DROP="SITE_PASSWORD"
run_deploy
assert_rc 1
assert_out "missing required environment variable(s): SITE_PASSWORD"

# --------------------------------------------------------------------------
# 8. Org reachable but project absent
# --------------------------------------------------------------------------
begin "project-absent-from-org-blocked"
export FAKE_PROJECT_LS_OUT="  some-other-project"
run_deploy
assert_rc 1
assert_out "does not mention 'web'"
assert_no_receipt

# 8b. A substring match would call this a hit. It is a different project.
begin "project-named-webhooks-is-not-the-target"
export FAKE_PROJECT_LS_OUT="  webhooks
  web-legacy"
run_deploy
assert_rc 1
assert_out "does not mention 'web'"

# --------------------------------------------------------------------------
# 9. Licensing gate failure stops the deploy
# --------------------------------------------------------------------------
begin "licensing-gate-failure-stops-deploy"
export FAKE_GATE_RC=1
run_deploy
assert_rc 1
assert_no_receipt

# --------------------------------------------------------------------------
# 10. The build dirtying the tree is caught BEFORE the upload
# --------------------------------------------------------------------------
begin "tree-changed-during-build-blocked"
export FAKE_BUILD_DIRTIES=1
run_deploy
assert_rc 1
assert_out "changed during the build"
assert_no_receipt

# --------------------------------------------------------------------------
# 11. No URL in the log: the receipt is STILL written (the regression pipefail introduced)
# --------------------------------------------------------------------------
begin "no-url-in-log-still-writes-a-receipt"
export FAKE_DEPLOY_OUT="Inspect: https://vercel.com/team/web/abc"
run_deploy
assert_rc 2
assert_receipt "state:           unverified"
assert_out "UNVERIFIED"

# --------------------------------------------------------------------------
# 12. mktemp actually randomised the log path
# --------------------------------------------------------------------------
begin "deploy-log-path-is-unique"
export FAKE_DEPLOY_OUT="no url here"
run_deploy
assert_not_out "XXXXXX"

# --------------------------------------------------------------------------
# 13. A failed upload fails, and its receipt says the outcome is unknown
# --------------------------------------------------------------------------
begin "failed-upload-receipt-is-labelled"
export FAKE_DEPLOY_RC=1
run_deploy
if [ "$RC" != "0" ]; then ok "exit $RC (non-zero)"; else bad "failed upload exited 0"; fi
assert_receipt "outcome unknown"
assert_not_out "Done —"

# --------------------------------------------------------------------------
# 14. Alias serving a different deployment = THE DEPLOY DID NOT TAKE
# --------------------------------------------------------------------------
begin "alias-mismatch-is-a-failure"
export FAKE_DEPLOY_ID="dpl_MINE111"
export FAKE_ALIAS_ID="dpl_OTHER22"
run_deploy
assert_rc 3
assert_out "THE DEPLOY DID NOT TAKE"
assert_receipt "state:           mismatch"
assert_not_out "Done —"

# --------------------------------------------------------------------------
# 15. Verification unavailable is UNVERIFIED — not success, not failure
# --------------------------------------------------------------------------
begin "inspect-unavailable-is-unverified"
export FAKE_INSPECT_RC=1
run_deploy
assert_rc 2
assert_out "does NOT mean the deploy failed"
assert_receipt "state:           unverified"
assert_not_out "Done —"

# --------------------------------------------------------------------------
# 16. Happy path — and it must be provable, not assumed
# --------------------------------------------------------------------------
begin "happy-path-verified-live"
export FAKE_DEPLOY_ID="dpl_SAME999"
export FAKE_ALIAS_ID="dpl_SAME999"
run_deploy
assert_rc 0
assert_out "is served by dpl_SAME999"
assert_out "Done —"
assert_receipt "state:           live"
assert_receipt "dpl_SAME999"
SHA="$(cd "$REPO" && git rev-parse HEAD)"
assert_argv "--meta sha=$SHA"
assert_argv "vercel@"
# Every Vercel call runs from web/ — the directory that gets uploaded, and the cwd every
# successful deploy on record was made from. The assertions used to reach it via a bare `cd web`;
# moving them above the build would have quietly run them from the repo root.
if grep -q "vercel@" "$ARGV_LOG" && ! grep "vercel@" "$ARGV_LOG" | grep -qv "cwd=web"; then
  ok "every vercel call ran from web/"
else
  bad "a vercel call ran outside web/: $(grep 'vercel@' "$ARGV_LOG" | grep -v 'cwd=web' | head -1)"
fi

# --------------------------------------------------------------------------
# 17. Runs correctly from a subdirectory (root anchoring)
# --------------------------------------------------------------------------
begin "runs-from-a-subdirectory"
export FAKE_DEPLOY_ID="dpl_SAME999"
export FAKE_ALIAS_ID="dpl_SAME999"
run_deploy "$REPO/web"
assert_rc 0
assert_receipt "state:           live"

# --------------------------------------------------------------------------
# 18. Receipt filename carries the timestamp, so a redeploy cannot overwrite one
# --------------------------------------------------------------------------
begin "receipt-filename-is-not-just-the-sha"
export FAKE_DEPLOY_ID="dpl_SAME999"
export FAKE_ALIAS_ID="dpl_SAME999"
run_deploy
R="$(receipt_path)"
case "$(basename "${R:-none}")" in
  deploy-*-*Z.txt) ok "receipt name is timestamped: $(basename "$R")" ;;
  *) bad "receipt name is not timestamped: $(basename "${R:-<none>}")" ;;
esac

reset_knobs
echo ""
echo "=== $PASS passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then
  printf 'failed:%b\n' "$FAILED_LIST"
  exit 1
fi
echo "all deploy.sh gates hold"
