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
# rather than mocked), a fake `npx` on PATH standing in for the three commands deploy.sh shells
# out to (the licensing gate, `next build`, and the Vercel CLI), and a stateful fake `curl` on
# PATH for EVERY case, standing in for the Vercel project API so the rootDirectory flip/restore
# is exercised with no network. HOME points at a throwaway directory whose only credential file
# holds a dummy token, so deploy.sh's token read succeeds without touching the operator's real
# ~/.vercel credentials — and any curl call that escaped the fake would carry that dummy token,
# fail auth, and turn the flip-proof red. Everything else — every gate, every branch, the trap,
# the receipt — is the real code under test.
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
                   NEON_AUTH_BASE_URL NEON_AUTH_COOKIE_SECRET TEACHER_ALLOWLIST; do
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

# --- the fake curl ----------------------------------------------------------
# In $FAKEBIN alongside the fake npx, so it is first on PATH for EVERY case — not just the
# flip/restore one. It used to live in a separate dir that only reached PATH via EXTRA_PATH for
# one case, which let cases 11–18 run deploy.sh's flip/restore curl calls against the REAL
# Vercel API on any machine holding ~/.vercel credentials (observed: real PATCH attempts against
# the production project). Stateful — PATCHes mutate $FAKE_CURL_STATE, GETs read it back — so
# deploy.sh's flip-proof (FLIP_AFTER must read 'null') and the restore-proof inside
# restore_root_directory (after must read 'web') see the transitions the real API would show.
# Every invocation is appended to $FAKE_CURL_LOG; begin() seeds both per case.
cat > "$FAKEBIN/curl" <<'FAKE'
#!/bin/bash
log="${FAKE_CURL_LOG:-/dev/null}"
state="${FAKE_CURL_STATE:?FAKE_CURL_STATE must name the rootDirectory state file}"
method="GET"; data=""; url=""
while [ $# -gt 0 ]; do
  case "$1" in
    -X) method="$2"; shift 2 ;;
    -d) data="$2"; shift 2 ;;
    http*) url="$1"; shift ;;
    *) shift ;;
  esac
done
printf 'curl -X %s %s -d %s\n' "$method" "$url" "${data:-<none>}" >> "$log"
if [ "$method" = "PATCH" ]; then
  case "$data" in
    *'"rootDirectory": null'*)  printf 'null\n' > "$state" ;;
    *'"rootDirectory": "web"'*) printf 'web\n'  > "$state" ;;
  esac
fi
printf '{"rootDirectory": %s}\n' "$(cat "$state")"
FAKE
chmod +x "$FAKEBIN/curl"

# --- the fake HOME ------------------------------------------------------------
# deploy.sh reads its Vercel API token from $HOME/Library/Application Support/
# com.vercel.cli/auth.json and STOPs without it. Point HOME at a throwaway dir holding a DUMMY
# token: the harness needs no real credentials, the operator's real token is never read, and the
# dummy value doubles as the escape detector — a curl call that slipped past the fake would hit
# the real API with an invalid token, fail the flip-proof, and go red.
FAKEHOME="$SANDBOX/home"
mkdir -p "$FAKEHOME/Library/Application Support/com.vercel.cli"
printf '%s\n' '{"token":"deploy-gates-DUMMY-token-not-real"}' \
  > "$FAKEHOME/Library/Application Support/com.vercel.cli/auth.json"

# --- harness ----------------------------------------------------------------
reset_knobs() {
  unset FAKE_GATE_RC FAKE_BUILD_RC FAKE_BUILD_DIRTIES \
        FAKE_WHOAMI_RC FAKE_WHOAMI_OUT FAKE_PROJECT_LS_RC FAKE_PROJECT_LS_OUT \
        FAKE_ENV_LS_RC FAKE_ENV_LS_OUT FAKE_ENV_DROP \
        FAKE_DEPLOY_RC FAKE_DEPLOY_OUT FAKE_INSPECT_RC FAKE_DEPLOY_ID FAKE_ALIAS_ID \
        FAKE_CURL_LOG FAKE_CURL_STATE \
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
  # Every case gets the fake curl's state seeded to 'web' (the production value) and an empty
  # intercept log — the fake is on PATH for all cases now, so the knobs are per-case fixtures,
  # not opt-ins. reset_knobs clears them; re-arm here. Exported so run_deploy's env passes them
  # through to deploy.sh's curl invocations.
  export FAKE_CURL_LOG="$SANDBOX/curl-$CASE_N.log"
  : > "$FAKE_CURL_LOG"
  export FAKE_CURL_STATE="$SANDBOX/curl-state-$CASE_N"
  printf 'web\n' > "$FAKE_CURL_STATE"
}

# run_deploy [subdir] — executes the real script with the fakes in front. $FAKEBIN leads PATH,
# so `npx` AND `curl` both resolve to the fakes for every case; HOME is the throwaway with the
# dummy token (see the fake HOME block above).
run_deploy() {
  local from="${1:-$REPO}"
  OUT="$(cd "$from" && HOME="$FAKEHOME" FAKE_REPO="$REPO" FAKE_ARGV_LOG="$ARGV_LOG" \
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
# 7b. TEACHER_ALLOWLIST is required too (ADR-116 ruling 3), and this is its red-proof.
#     It matters MORE than the others for the reason it is easy to forget: unset does not
#     crash anything. `isTeacherAllowed` admits nobody with it absent, so the deploy would
#     succeed and the teacher would simply be dead — for the owner as well — with no error
#     to notice. Without this case, deleting the variable from deploy.sh's list would leave
#     every gate green. SEED: remove TEACHER_ALLOWLIST from that list and this goes red.
# --------------------------------------------------------------------------
begin "missing-teacher-allowlist-named"
export FAKE_ENV_DROP="TEACHER_ALLOWLIST"
run_deploy
assert_rc 1
assert_out "missing required environment variable(s): TEACHER_ALLOWLIST"

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
# NETWORK ISOLATION PROOF, pinned on the happiest path: deploy.sh issues 6 curl calls in a full
# run (flip: GET, PATCH, GET; the EXIT-trap restore: GET, PATCH, GET) and every one must land in
# the fake's intercept log. A real call would carry the dummy token (HOME is the fake), fail the
# real API's auth, and turn the flip-proof above red — but the line count makes the interception
# direct evidence rather than inference.
CURL_CALLS="$(wc -l < "$FAKE_CURL_LOG" | tr -d ' ')"
if [ "$CURL_CALLS" = "6" ]; then
  ok "all 6 curl calls intercepted by the fake (flip GET/PATCH/GET + restore GET/PATCH/GET)"
else
  bad "expected 6 intercepted curl calls, found $CURL_CALLS: $(tr '\n' '|' < "$FAKE_CURL_LOG")"
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

# --------------------------------------------------------------------------
# 19. H-1 STRUCTURAL — the EFFECTIVE EXIT trap keeps BOTH the restore and the
#     receipt. bash `trap` REPLACES rather than chains: the old
#     `trap restore_root_directory EXIT` clobbered the receipt trap armed
#     earlier, so any failure after the upload started wrote no receipt.
#     Part 1 executes every trap-setting line of the SUT in order, in a
#     subshell, and asks bash what actually survives on EXIT. Part 2 is the
#     generalized static property: no `trap ... EXIT` line after the
#     receipt-arming trap may omit write_receipt.
# --------------------------------------------------------------------------
begin "exit-trap-keeps-restore-and-receipt"
EFFECTIVE_TRAP="$(
  # Stub the two functions so the armed trap fires harmlessly when this subshell exits.
  write_receipt() { :; }
  restore_root_directory() { :; }
  while IFS= read -r t; do eval "$t"; done \
    < <(grep -E '^[[:space:]]*trap[[:space:]].*EXIT' "$SUT")
  trap -p EXIT
)"
case "$EFFECTIVE_TRAP" in
  *write_receipt*) ok "effective EXIT trap names write_receipt" ;;
  *) bad "effective EXIT trap drops the receipt: ${EFFECTIVE_TRAP:-<empty>}" ;;
esac
case "$EFFECTIVE_TRAP" in
  *restore_root_directory*) ok "effective EXIT trap names restore_root_directory" ;;
  *) bad "effective EXIT trap drops the rootDirectory restore: ${EFFECTIVE_TRAP:-<empty>}" ;;
esac
ARM_LINE="$(awk '/^[[:space:]]*trap[[:space:]].*EXIT/ && /write_receipt/ { print NR; exit }' "$SUT")"
if [ -z "$ARM_LINE" ]; then
  bad "no EXIT trap anywhere arms write_receipt"
else
  DROPS="$(awk -v arm="$ARM_LINE" \
    'NR > arm && /^[[:space:]]*trap[[:space:]].*EXIT/ && !/write_receipt/ \
     { printf "  line %d: %s\n", NR, $0 }' "$SUT")"
  if [ -z "$DROPS" ]; then
    ok "no EXIT trap after the receipt trap (line $ARM_LINE) omits write_receipt"
  else
    bad "EXIT trap(s) after the receipt trap drop the receipt:$DROPS"
  fi
fi

# --------------------------------------------------------------------------
# 20. H-1/H-2 BEHAVIOURAL — the upload fails, and the EXIT trap must BOTH
#     restore rootDirectory to 'web' AND write the receipt. The stateful fake
#     curl (on PATH for every case since the network-isolation fix) logs every
#     call and answers from its state file, so the run needs no network. The
#     fake npx's deploy prints an upload progress line and exits 1, so the
#     failure lands AFTER UPLOAD_STARTED=1. A PATCH carrying "web" can only
#     come from restore_root_directory, which deploy.sh calls only from the
#     EXIT trap — so that call appearing in the log after the flip-to-null
#     proves the trap fired across the failure.
# --------------------------------------------------------------------------
begin "failed-upload-restores-rootdir-and-writes-receipt"
export FAKE_DEPLOY_OUT="> Uploading web [====================] 14.2MB/14.2MB"
export FAKE_DEPLOY_RC=1
run_deploy
if [ "$RC" != "0" ]; then ok "exit $RC (non-zero)"; else bad "failed upload exited 0"; fi
assert_not_out "Done —"
assert_argv "--prod"
assert_receipt "outcome unknown"
FLIP_LINE="$(grep -n 'PATCH .*"rootDirectory": null' "$FAKE_CURL_LOG" | head -1 | cut -d: -f1)"
RESTORE_LINE="$(grep -n 'PATCH .*"rootDirectory": "web"' "$FAKE_CURL_LOG" | head -1 | cut -d: -f1)"
if [ -n "$FLIP_LINE" ] && [ -n "$RESTORE_LINE" ] && [ "$RESTORE_LINE" -gt "$FLIP_LINE" ]; then
  ok 'restore call ({"rootDirectory": "web"}) followed the flip across the failed upload'
else
  bad "curl log lacks flip-to-null then restore-to-web: $(tr '\n' '|' < "$FAKE_CURL_LOG")"
fi
if [ "$(cat "$FAKE_CURL_STATE")" = "web" ]; then
  ok "rootDirectory ends at 'web'"
else
  bad "rootDirectory left as: $(cat "$FAKE_CURL_STATE")"
fi

reset_knobs
echo ""
echo "=== $PASS passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then
  printf 'failed:%b\n' "$FAILED_LIST"
  exit 1
fi
echo "all deploy.sh gates hold"
