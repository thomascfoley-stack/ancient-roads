#!/bin/bash
set -euo pipefail
# pipefail matters at exactly one line below: `vercel --prod | tee ...`. Without it, bash's $? for
# that pipeline is tee's exit code, not vercel's — so a failed deploy (vercel prints an error JSON
# to stdout and exits, or exits 0 with an error body; observed both) sails through `set -e`, the
# script reaches "Done!", and a receipt gets written that looks identical to a real one. Caught
# 2026-08-03: a corpus-copy path collision failed the deploy, EXIT=0 was echoed by the wrapper that
# ran this script, and the CI-facing task notification for that wrapper also reported success — an
# unearned green two layers deep. CI's own audit.yml already sets pipefail on its one piped step
# for the identical reason; this was the one place in this file that needed the same guard.
#
# WHAT PIPEFAIL ALSO DID, unnoticed for three days (found 2026-08-06). `set -e` aborts on a failed
# command substitution in a plain assignment, and pipefail made three previously-succeeding
# pipelines fail: the receipt's URL grep (no match -> grep exits 1 -> THE SCRIPT DIED AFTER THE
# UPLOAD, no receipt, no "Done!"), `vercel whoami`, and the corpus `find`. Each had a hand-written
# error path underneath it that could no longer be reached — the "STOP: not logged in" message, the
# `${DEPLOY_URL:-...}` fallback, the "Warning: only N Bible chapters" notice. The proof that the
# grep case is real and not theoretical: deploy-98124b2.txt and deploy-4275bf2.txt are committed
# receipts containing that fallback string, written back when the fallback still worked.
# Every one of those paths now uses `|| true` (or an explicit `if ! VAR=$(...)`) and is red-proofed
# by test/deploy-sh-gates.sh. The rule for this file: A COMMAND SUBSTITUTION WHOSE FAILURE YOU
# INTEND TO HANDLE MUST NOT BE A BARE ASSIGNMENT.
#
# `set -u` is on as of 2026-08-06: every expansion here is either always-set or written `${X:-}`.

# ---------------------------------------------------------------------------
# THE DECLARED TARGET. Everything this script asserts, it asserts against these.
# ---------------------------------------------------------------------------
EXPECT_PROJECT_ID="prj_Y9PVuNly5sSsf3NcvayS1vwE6FwR"
EXPECT_ORG_ID="team_TQ3BYCSyzQ3m0yatlkKmUzM0"
PROD_ALIAS="ancientpaths.app"

# PIN THE CLI. `npx vercel` resolves whatever npm publishes today: `vercel` is in neither
# package.json and there is no node_modules/.bin/vercel (measured 2026-08-06), and latest was
# 58.7.1 against the 50.38.2 sitting in the local npx cache — a major-version jump that would have
# happened silently, mid-deploy, on the next cache miss. This script PARSES CLI output in two
# places (the env-var table and the deployment URL), so a format change is a correctness problem,
# not just a compatibility one. 50.38.2 is pinned because it is the version whose interface was
# actually checked for what this script relies on: `inspect --format json`, `inspect <alias>`,
# `deploy --meta`. Bumping it is a deliberate act — re-run test/deploy-sh-gates.sh after.
VERCEL_CLI="vercel@50.38.2"

# ---------------------------------------------------------------------------
# ANCHOR AT THE REPO ROOT before anything reads a relative path. Run from a subdirectory, the old
# script's `find web/public/bible` silently counted 0 and `cd web` failed with a bare bash error.
# ---------------------------------------------------------------------------
if ! REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  echo "STOP: not inside a git repository — this script deploys a commit, so it needs one." >&2
  exit 1
fi
cd "$REPO_ROOT"

echo "=== What Others Have Said — Deploy ==="
echo ""

# ---------------------------------------------------------------------------
# CLEAN-TREE GATE — you cannot deploy code that isn't committed.
#
# `vercel --prod` uploads the WORKING TREE, not a commit. With more than one
# agent/session editing this directory, whoever runs deploy.sh ships whatever
# happens to be sitting there — including another session's half-finished work.
# That happened on 2026-07-12: a session deployed a concurrent session's
# un-reviewed, in-flight changes to production without either of them intending it.
#
# Nothing reaches production that isn't in git. If you want it live, commit it.
#
# CHECKED TWICE, and the second time is the one that matters. This ran once, at the top, and then
# the script spent a full `next build` — minutes — before uploading. The concurrent-write window
# the gate exists to close was open for all of it. The second call, immediately before the upload,
# compares against this snapshot; `next build` writes only .next/ (gitignored, measured) and
# predeploy-gate.ts writes nothing at all (measured: no writeFileSync), so a difference means
# something else touched the tree.
# ---------------------------------------------------------------------------
tree_state() { git status --porcelain 2>/dev/null || true; }

DIRTY="$(tree_state)"
if [ -n "$DIRTY" ]; then
  echo "✗ DEPLOY BLOCKED — the working tree is dirty."
  echo ""
  echo "$DIRTY"
  echo ""
  echo "vercel --prod uploads the WORKING TREE, so these uncommitted/untracked files"
  echo "would ship to production un-reviewed — possibly another session's work-in-progress."
  echo ""
  echo "Commit (or stash) everything you intend to ship, then re-run. What's in prod"
  echo "must be reproducible from git."
  echo ""
  echo "If the only thing listed is a deploy receipt from your own previous run, commit it —"
  echo "that is this script's evidence output, and it is tracked on purpose."
  exit 1
fi

echo "✓ Working tree clean — deploying commit $(git rev-parse --short HEAD)"
echo ""

# ---------------------------------------------------------------------------
# ANCESTRY GATE — you may not deploy a tree that drops what is already shipped.
#
# THE DEFECT, three times in one day (2026-08-04). Two lanes share this Vercel
# project, and `vercel --prod` moves the ancientpaths.app alias on every run:
# LAST DEPLOY WINS, whole tree, no merge. So each lane's deploy silently
# reverted the other lane's shipped code and printed a green "Done!". It cost
# the reading-plans feature once, the verse previews once, and the A9 serving
# cutover once. Every one of those deploys passed every check in this file,
# because nothing here had an opinion about what was ALREADY LIVE.
#
# THE RULE: the commit you are deploying must CONTAIN origin/main. If it does
# not, origin/main holds work your tree lacks, and since the alias moves on
# every deploy, shipping this tree un-ships that work.
#
# WHY origin/main AND NOT A LOCAL RECEIPT. deploy.sh writes a receipt naming
# the deployed sha, but receipts land in the deploying WORKING TREE — and the
# other lane's tree is not this one. That is precisely why nobody noticed:
# each lane's receipts said its own deploy was the latest, and both were right
# about themselves. The shared remote is the only thing both lanes can see.
#
# This is a merge-first rule, not a merge-into-main rule: deploying a branch is
# still fine, as long as that branch has merged origin/main into it.
#
# WHAT THIS GATE DOES NOT COVER, stated plainly because the comment above states the invariant
# more strongly than the code enforces it: origin/main is a PROXY for "what is live". A lane that
# deploys from an unmerged branch is invisible to it — that branch's work would still be reverted,
# and this gate would still be green. Measured 2026-08-06: the six most recent receipts all name
# shas that are ancestors of main, so the proxy has held in practice. Closing it properly needs
# production to be asked what is live; the `--meta sha` stamp added at the deploy line below is
# the first half of that (it makes the answer EXIST from now on), and the reverse lookup is
# deliberately not built here because it cannot be tested until deployments carrying the stamp
# exist. Until then this gate is a floor, not the invariant.
#
# NOT a substitute for separate Vercel projects, which would remove the shared
# alias entirely. It is the cheap mechanical floor until that call is made.
# ---------------------------------------------------------------------------
echo "=== Pre-deploy gate: this tree contains everything already shipped ==="
if git remote get-url origin >/dev/null 2>&1 && git fetch origin --quiet 2>/dev/null; then
  if ! git rev-parse --verify --quiet origin/main >/dev/null 2>&1; then
    # Distinguished from "behind" on purpose: the old code fell into the BLOCKED branch and
    # printed "origin/main has  commit(s)" with an empty count, which reads as a bug in the gate.
    echo "" >&2
    echo "✗ DEPLOY BLOCKED — 'origin/main' does not resolve, so this tree cannot be compared" >&2
    echo "  against what is already shipped. Check the remote's branches; do not deploy blind." >&2
    exit 1
  fi
  if git merge-base --is-ancestor origin/main HEAD 2>/dev/null; then
    echo "  ✓ contains origin/main ($(git rev-parse --short origin/main))"
  else
    BEHIND="$(git rev-list --count HEAD..origin/main 2>/dev/null || echo '?')"
    echo ""
    echo "✗ DEPLOY BLOCKED — origin/main has $BEHIND commit(s) this tree does not have."
    echo ""
    # `-n 10`, NOT `| head -10`: head closes the pipe, git takes SIGPIPE, and this file's
    # `set -o pipefail` + `set -e` turn that into an exit 141 PART WAY THROUGH this message —
    # so the gate aborted before printing the fix instructions or its own exit code. Caught by
    # red-proofing the gate rather than by reading it.
    git log --oneline -n 10 HEAD..origin/main 2>/dev/null | sed 's/^/    /' || true
    echo ""
    echo "  Deploying moves the ancientpaths.app alias to THIS tree, so whatever those"
    echo "  commits put live would stop being live. That has already cost this project"
    echo "  three shipped features in one day."
    echo ""
    echo "  Merge first, then deploy:"
    echo "      git merge origin/main"
    echo ""
    echo "  Override ONLY if you intend to revert that work: DEPLOY_ALLOW_BEHIND=1"
    [ "${DEPLOY_ALLOW_BEHIND:-}" = "1" ] || exit 1
    echo "  ⚠ DEPLOY_ALLOW_BEHIND=1 set — proceeding, and reverting the commits above."
  fi
else
  # A missing remote must not silently disable the gate; say so out loud.
  echo "  ⚠ NOT CHECKED: no reachable 'origin', so this deploy is unguarded against"
  echo "    reverting another lane's live work."
fi
echo ""

# Check prerequisites
if ! command -v npx >/dev/null 2>&1; then
  echo "Error: npx not found. Install Node.js first."
  exit 1
fi

# Verify static files exist. `|| true` on both: `find` exits non-zero when the directory does not
# exist, and under pipefail that killed the script HERE — before printing the very warning these
# lines exist to print. Missing corpus is predeploy-gate.ts's call to make, not this counter's.
BIBLE_COUNT=$(find web/public/bible -name "*.json" 2>/dev/null | wc -l | tr -d ' ' || true)
COMMENTARY_COUNT=$(find web/public/commentaries -name "*.json" 2>/dev/null | wc -l | tr -d ' ' || true)
BIBLE_COUNT="${BIBLE_COUNT:-0}"
COMMENTARY_COUNT="${COMMENTARY_COUNT:-0}"

if [ "$BIBLE_COUNT" -lt 1000 ]; then
  echo "Warning: Only $BIBLE_COUNT Bible chapter files found."
  echo "Run: npx tsx src/ingest/ingest-api.ts BSB eng_kjv eng_asv eng_ylt eng_dby eng_bbe eng_lsv ENGWEBP"
  echo ""
fi

if [ "$COMMENTARY_COUNT" -lt 1000 ]; then
  echo "Warning: Only $COMMENTARY_COUNT commentary files found."
  echo "Run: npx tsx src/ingest/merge-commentaries.ts"
  echo ""
fi

echo "Content: $BIBLE_COUNT Bible chapters, $COMMENTARY_COUNT commentary chapters"
echo ""

# ---------------------------------------------------------------------------
# PRE-DEPLOY GATE — the licensing ratchet.
#
# web/public/commentaries/ is gitignored and has no build step; `vercel --prod`
# uploads the local directory, so this content reaches production WITHOUT ever
# passing through git or CI. CI cannot see it. This is the only point in the
# pipeline where the artifact being shipped is visible — so the gate lives here.
#
# Hard-fails (set -e) if the corpus is missing or if forbidden-provenance
# content has INCREASED. The number may only go down.
# ---------------------------------------------------------------------------
DEPLOYING=1 npx tsx scripts/predeploy-gate.ts  # DEPLOYING=1 -> bible-translation licensing HARD-fails here (not on pre-commit)

# ---------------------------------------------------------------------------
# TARGET ASSERTION — which Vercel project, and whose account.
#
# THE DEFECT (2026-08-02 deep audit, C1). This step was `npx vercel --prod` with no --scope, no
# project id, and no .vercel/project.json anywhere (gitignored three times over). Measured on the
# deploying machine at the time:
#
#     vercel whoami            -> thomas-5672
#     config.json currentTeam  -> team_r1x75frSIu8VcBB7nE8ozwUM        (the employer's scope)
#     production `web`         -> prj_Y9PVuNly5sSsf3NcvayS1vwE6FwR
#                                 under team_TQ3BYCSyzQ3m0yatlkKmUzM0,
#                                 created by a DIFFERENT Vercel user
#
# On a TTY, `vercel --prod` would have prompted "Set up and deploy?", defaulted the scope to the
# employer's team and the project name to the directory name `web` — which does not collide there,
# so it CREATES it — uploaded 558 MB of licensed corpus into a brand-new project in someone else's
# scope, left ancientpaths.app on 24677ba, and printed "Done!".
#
# So the target is now declared and asserted, not inherited from whatever the CLI was last
# pointed at. VERCEL_PROJECT_ID / VERCEL_ORG_ID are the documented non-interactive form and make
# `vercel` skip its setup prompt entirely.
#
# RUN BEFORE THE BUILD as of 2026-08-06. These four assertions are seconds of network and no
# state; `next build` is minutes. Failing the cheap check first is free, and it means a
# wrong-account run stops before it has done any work.
# ---------------------------------------------------------------------------
# EVERY Vercel call runs from web/, which is what `vercel --prod` uploads. The old script reached
# that directory by a bare `cd web` before its first CLI call and never came back; moving the
# assertions above the build would have silently run them from the repo root instead. The env vars
# are meant to make cwd irrelevant, but "meant to" is not a check — this keeps the cwd identical to
# the one every successful deploy in docs/evidence/deploys was made from.
vercel_cli() {
  ( cd "$REPO_ROOT/web" && VERCEL_PROJECT_ID="$EXPECT_PROJECT_ID" VERCEL_ORG_ID="$EXPECT_ORG_ID" \
      npx --yes "$VERCEL_CLI" "$@" )
}

# `if ! VAR=$(...)` — NOT a bare assignment. A bare assignment here died under set -e before its
# own error message could print, so "not logged in" surfaced as a naked `exit 1` (red-proofed).
if ! WHO_RAW="$(vercel_cli whoami 2>/dev/null)"; then
  echo "STOP: could not run 'vercel whoami' — not logged in, or the CLI could not run." >&2
  echo "      Run: npx $VERCEL_CLI login" >&2
  exit 1
fi
WHO="$(printf '%s' "$WHO_RAW" | tail -1 | tr -d '[:space:]' || true)"
if [ -z "$WHO" ]; then
  echo "STOP: 'vercel whoami' succeeded but named no user. Run: npx $VERCEL_CLI login" >&2
  exit 1
fi
echo "  vercel user   : $WHO"
echo "  vercel CLI    : $VERCEL_CLI (pinned)"
echo "  target project: $EXPECT_PROJECT_ID (org $EXPECT_ORG_ID)"

# Confirm the account can actually SEE the target before uploading half a gigabyte to it. A
# failure here is the wrong-account case, and it costs nothing; the same failure after the upload
# costs an interactive prompt that creates a project somewhere else.
if ! PROJECT_LS="$(vercel_cli project ls --scope "$EXPECT_ORG_ID" 2>&1)"; then
  echo "" >&2
  echo "STOP: this Vercel session cannot reach org $EXPECT_ORG_ID." >&2
  echo "      Logged in as: $WHO" >&2
  echo "      Production 'web' lives in home-network-hardening and was created by a different" >&2
  echo "      account. Log in as the owning account, then re-run:" >&2
  echo "        npx $VERCEL_CLI login" >&2
  exit 1
fi
# ORG REACHABLE IS NOT PROJECT PRESENT. The old check stopped at the line above, while the comment
# block over it claimed to assert "which Vercel project" — so a deleted, renamed or
# wrong-id project passed the assertion and was discovered by the upload.
# Word-boundary, not a substring: `grep -q web` is also satisfied by a project called `webhooks`,
# which would have made this assertion pass on an org that does not contain the target at all.
# Deliberately NOT column-anchored — the exact table layout of `project ls` is not pinned down
# here, and a wrong guess about column position would block every deploy.
if ! printf '%s' "$PROJECT_LS" | grep -qE '(^|[^a-zA-Z0-9_-])web([^a-zA-Z0-9_-]|$)'; then
  echo "" >&2
  echo "STOP: org $EXPECT_ORG_ID is reachable but its project list does not mention 'web'." >&2
  echo "      Target: $EXPECT_PROJECT_ID. Do not deploy into an unrecognised project list." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# ENVIRONMENT ASSERTION — every variable production needs, present before we ship.
#
# Nothing checked this (2026-08-02 deep audit, M17). Each of these fails at RUNTIME, not build
# time, so a deploy missing one succeeds, prints "Done!", and then 503s or throws on every
# request: no APP_DATABASE_URL -> every DB path throws by design (db.ts:20-25); no SITE_PASSWORD
# -> site-wide 503 from middleware, indistinguishable from an outage and notified to nobody; no
# DEEPINFRA_API_KEY -> /api/ask throws; no BETTER_AUTH_*/NEON_AUTH_* -> login broken.
#
# NAMES ONLY. `vercel env ls` never prints values and neither does this.
#
# THREE OUTCOMES, not two (2026-08-06). This parsed column 1 of a CLI table inside a bare
# assignment: if `vercel env ls` failed, set -e killed the script with no message at all, and if
# the table format ever changed, every variable would read as missing and the STOP would blame
# the project for the parser's problem. Now a failed command and an unparseable table each say so
# in their own words, and neither is reported as "missing variables".
#
# BOTH AUTH SYSTEMS, WHILE BOTH RUN (2026-08-08, ADR-107/108/109, AUTH_V2_IMPLEMENTATION.md §9).
# This list checked only NEON_AUTH_* — stale in both directions per pre-deploy audit finding 15:
# production has run on BETTER_AUTH_URL/BETTER_AUTH_SECRET since the 2026-08-05 cutover (checked
# nowhere here), and the Neon Auth cutover now under way still leaves better-auth.ts in the tree
# until step 10. Added the Better Auth pair; drop it once step 10 removes the package. Removed
# NEON_AUTH_JWKS_URL — it is not a real config field on the installed
# `@neondatabase/auth@0.4.2-beta` SDK (checked its types directly: `NeonAuthConfig` is
# `{baseUrl, cookies, logger, logLevel}`), and no code anywhere in this repo reads it; `jwks` is
# just a method the SDK derives from `baseUrl`, not a separate env var.
# ---------------------------------------------------------------------------
echo ""
echo "Checking production environment..."
if ! ENV_RAW="$(vercel_cli env ls production 2>/dev/null)"; then
  echo "" >&2
  echo "STOP: could not read production environment variables ('vercel env ls' failed)." >&2
  echo "      This is NOT 'the variables are missing' — it is 'the check could not run'." >&2
  exit 1
fi
ENV_NAMES="$(printf '%s' "$ENV_RAW" | awk '{print $1}' | grep -E '^[A-Z][A-Z0-9_]*$' || true)"
if [ -z "$ENV_NAMES" ]; then
  echo "" >&2
  echo "STOP: 'vercel env ls' returned no parseable variable names." >&2
  echo "      The CLI's table format has probably changed (pinned: $VERCEL_CLI)." >&2
  echo "      Refusing to report every variable as missing on the strength of a broken parser." >&2
  exit 1
fi
MISSING=""
# BETTER_AUTH_URL / BETTER_AUTH_SECRET REMOVED 2026-08-11, on this list's OWN instruction above:
# "drop it once step 10 removes the package." The package is gone — `better-auth` no longer appears
# in package.json or web/package.json (0 occurrences), `lib/auth/better-auth.ts` was deleted, and
# NOTHING in web/src or src reads BETTER_AUTH_* (0 matches). Production itself is the fourth
# witness: it has never had these two set, has NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET, and
# is serving. A gate demanding variables that no code reads and production does not have is not
# protecting a runtime failure — it is inventing one, and it blocked a hotfix for a live auth
# outage. `neon-auth.ts` throws on either NEON_AUTH_* being absent, so that pair still fails closed.
# TEACHER_ALLOWLIST added 2026-08-21 (ADR-116 ruling 3). It is required for the OPPOSITE reason
# to the rest of this list: the others fail at runtime when absent, this one fails SILENTLY and
# SAFELY — `isTeacherAllowed` admits nobody with it unset, so an unset var ships a teacher that
# is dead for the owner too, with no error anywhere to notice. That is the right default and the
# wrong thing to discover in production. Listing it here makes the absence loud at deploy time
# rather than at first use. (If the teacher is ever meant to be OFF deliberately, set it to an
# empty-but-present value and this check still passes — the check is "declared", not "non-empty".)
for v in APP_DATABASE_URL DATABASE_URL DEEPINFRA_API_KEY SITE_PASSWORD \
         NEON_AUTH_BASE_URL NEON_AUTH_COOKIE_SECRET TEACHER_ALLOWLIST; do
  printf '%s\n' "$ENV_NAMES" | grep -qx "$v" || MISSING="$MISSING $v"
done
if [ -n "$MISSING" ]; then
  echo "" >&2
  echo "STOP: production is missing required environment variable(s):$MISSING" >&2
  echo "      Each of these fails at RUNTIME, so the deploy would report success and then break." >&2
  echo "      Set them: npx $VERCEL_CLI env add <NAME> production" >&2
  exit 1
fi
echo "  all required production env vars present"

# Build
echo ""
echo "Building..."
(cd web && npx next build)

# THE SECOND CLEAN-TREE CHECK. See the gate at the top: everything above this line took minutes,
# and the upload below ships whatever is on disk NOW, not what was checked then.
NOW="$(tree_state)"
if [ "$NOW" != "$DIRTY" ]; then
  echo "" >&2
  echo "✗ DEPLOY BLOCKED — the working tree changed during the build." >&2
  echo "" >&2
  printf '%s\n' "$NOW" >&2
  echo "" >&2
  echo "  The tree was clean when this run started. Something wrote to it since — most likely" >&2
  echo "  a concurrent session (AGENTS.md: one agent per working tree). Uploading now would" >&2
  echo "  ship those files. Find out what wrote them before re-running." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# THE RECEIPT — written by an EXIT trap, not by reaching the last line.
#
# The old receipt block ran only if every step after the upload succeeded, and one of those steps
# was a `grep` that exits 1 when it finds nothing. So the single most important artifact of the
# irreversible operation was contingent on a regex matching. It is now armed the moment the upload
# starts and fires on ANY exit path, carrying whatever is known at that point — including
# "unverified", which is the honest answer when the checks below could not run.
#
# Filename carries a timestamp as well as the sha: `deploy-<sha7>.txt` was overwritten when the
# same commit was deployed twice, erasing the record of the earlier attempt.
# ---------------------------------------------------------------------------
DEPLOY_SHA="$(git rev-parse HEAD)"
DEPLOY_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
EVIDENCE_DIR="$REPO_ROOT/docs/evidence/deploys"
RECEIPT="$EVIDENCE_DIR/deploy-${DEPLOY_SHA:0:7}-${STAMP}.txt"
UPLOAD_STARTED=0
DEPLOY_URL=""
DEPLOY_ID=""
LIVE_ID=""
VERIFY_STATE="not reached"
mkdir -p "$EVIDENCE_DIR"

write_receipt() {
  [ "$UPLOAD_STARTED" = "1" ] || return 0
  {
    echo "deployed_at_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "sha:             $DEPLOY_SHA"
    echo "branch:          $DEPLOY_BRANCH"
    echo "project:         $EXPECT_PROJECT_ID"
    echo "org:             $EXPECT_ORG_ID"
    echo "vercel_user:     $WHO"
    echo "vercel_cli:      $VERCEL_CLI"
    echo "url:             ${DEPLOY_URL:-(not parsed - see $DEPLOY_LOG)}"
    echo "deployment_id:   ${DEPLOY_ID:-(not resolved)}"
    echo "alias:           $PROD_ALIAS"
    echo "alias_serves:    ${LIVE_ID:-(not resolved)}"
    echo "state:           $VERIFY_STATE"
  } > "$RECEIPT" 2>/dev/null || true
}
trap 'rc=$?; write_receipt; exit $rc' EXIT

# Deploy
echo ""
echo "Deploying to Vercel..."
# --archive=tgz: the upload is 4,115 files / 558.6 MB honouring web/.vercelignore. Both previously
# stated reasons for this flag were wrong (deploy.sh said "concordance = 13,480 files" — that is
# 295 files holding 13,480 Strong's entries; DEPLOY_PREFLIGHT said bible/ at 22,590 exceeds the
# 15,000-file limit — 21,402 of those are excluded from the upload). The real justification is
# SIZE, not count. Corrected 2026-08-02 (deep audit, M15).
#
# --meta: stamps the commit onto the deployment itself. Nothing reads it yet — see the ancestry
# gate's "what this does not cover". It is written now so that the answer exists later; a lookup
# built today would have no stamped deployments to read.
#
# mktemp, not /tmp/vercel-deploy.log: a fixed shared path in a two-lane repo means concurrent
# deploys clobber one file, and the URL below is parsed out of it — a receipt could name the other
# lane's deployment. (It is also a pre-existing-symlink write target on a shared machine.)
#
# THE X's GO LAST. Written first as `vercel-deploy.XXXXXX.log`, BSD mktemp (this is macOS) ignored
# the trailing suffix and created a file named LITERALLY `vercel-deploy.XXXXXX.log` — the fixed
# shared path this line exists to remove, wearing the disguise of a fix. Measured, not assumed;
# test/deploy-sh-gates.sh asserts the resulting path contains no 'XXXXXX'.
# ---------------------------------------------------------------------------
# rootDirectory FLIP — CLI production deploys need `rootDirectory` empty, but the Vercel
# project keeps it at 'web' for GitHub builds. The manual flip (recorded in WORKLOG as
# undocumented and unruled) is now automated here: read the CLI's auth token, call the Vercel
# API to set rootDirectory to null, deploy, then restore to 'web' via a trap so it fires
# even if the deploy dies.
# ---------------------------------------------------------------------------
if [ -z "${VERCEL_TOKEN:-}" ]; then
  VERCEL_TOKEN="$(python3 -c "import json; print(json.load(open('$HOME/Library/Application Support/com.vercel.cli/auth.json'))['token'])" 2>/dev/null || true)"
fi
if [ -z "$VERCEL_TOKEN" ]; then
  echo "STOP: could not read Vercel auth token from ~/Library/Application Support/com.vercel.cli/auth.json" >&2
  exit 1
fi

# Assert the rootDirectory is what we expect. A failed flip or restore is not silent —
# the GET-before/after pattern makes both loud. The flip must end at null; the restore
# must end at 'web'.
get_root_directory() {
  curl -s "https://api.vercel.com/v9/projects/$EXPECT_PROJECT_ID" \
    -H "Authorization: Bearer $VERCEL_TOKEN" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('rootDirectory') or 'null')" 2>/dev/null || echo 'unknown'
}

restore_root_directory() {
  local before after
  before="$(get_root_directory)"
  curl -s -X PATCH "https://api.vercel.com/v9/projects/$EXPECT_PROJECT_ID" \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"rootDirectory": "web"}' > /dev/null 2>&1 || true
  after="$(get_root_directory)"
  if [ "$after" != "web" ]; then
    echo "⚠ rootDirectory restore FAILED (before=$before, after=$after) — project left misconfigured." >&2
  fi
}

# Flip to null for the CLI deploy, and prove it took.
FLIP_BEFORE="$(get_root_directory)"
curl -s -X PATCH "https://api.vercel.com/v9/projects/$EXPECT_PROJECT_ID" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rootDirectory": null}' > /dev/null 2>&1 || true
FLIP_AFTER="$(get_root_directory)"
if [ "$FLIP_AFTER" != "null" ]; then
  echo "STOP: rootDirectory flip FAILED (before=$FLIP_BEFORE, after=$FLIP_AFTER) — cannot deploy safely." >&2
  exit 1
fi

# Restore on exit, success or failure. ONE trap does both restore and receipt — bash trap
# replaces, not chains, so the old `trap restore_root_directory EXIT` clobbered the receipt
# trap and any failure after upload produced no receipt (H-1).
trap 'rc=$?; restore_root_directory; write_receipt; exit $rc' EXIT

DEPLOY_LOG="$(mktemp "${TMPDIR:-/tmp}/vercel-deploy.XXXXXX")"
UPLOAD_STARTED=1
VERIFY_STATE="upload started, outcome unknown"
vercel_cli --prod --archive=tgz --yes \
  --meta "sha=$DEPLOY_SHA" --meta "branch=$DEPLOY_BRANCH" | tee "$DEPLOY_LOG"

VERIFY_STATE="uploaded, unverified"
DEPLOY_URL="$(grep -oE 'https://[a-z0-9-]+\.vercel\.app' "$DEPLOY_LOG" | tail -1 || true)"

# ---------------------------------------------------------------------------
# POST-DEPLOY VERIFICATION — is this build actually the one being served?
#
# The header of this file records that vercel has been observed to EXIT 0 WITH AN ERROR BODY.
# `pipefail` catches only the non-zero case; nothing here ever checked the other one, so the
# documented failure wrote a clean-looking receipt and printed "Done!". Two committed receipts
# (deploy-98124b2.txt, deploy-4275bf2.txt) are for deploys MASTER records as FAILED and are
# indistinguishable in shape from the successes.
#
# THE CHECK IS AN IDENTITY COMPARISON, deliberately: resolve the deployment id of what we just
# pushed, resolve the deployment id the production alias is serving, and require them to be equal.
# It parses no status word and depends on no field name — both sides are extracted by the same
# regex, so a CLI format change makes both sides EMPTY and the result "unverified", never a false
# "live". This is the evidence WORKLOG 2026-08-04 used by hand and called "evidence that can
# distinguish the cases"; it is now automatic.
#
# THREE STATES, and the difference between two of them is this repo's own watchlist entry about
# reporting a NOT RUN as a negative result:
#   live       — the alias serves this deployment. Exit 0.
#   mismatch   — the alias serves something else. Exit 3. THE DEPLOY DID NOT TAKE.
#   unverified — the check could not run. Exit 2. Says nothing about whether the deploy worked.
# ---------------------------------------------------------------------------
inspect_id() {  # $1 = deployment url or alias; prints a dpl_ id or nothing
  local out
  out="$(vercel_cli inspect "$1" 2>&1 || true)"
  printf '%s' "$out" | grep -oE 'dpl_[A-Za-z0-9]+' | head -1 || true
}

echo ""
echo "Verifying the deployment is the one being served..."
if [ -z "$DEPLOY_URL" ]; then
  echo "  ⚠ could not parse a deployment URL from the CLI output"
else
  DEPLOY_ID="$(inspect_id "$DEPLOY_URL")"
  LIVE_ID="$(inspect_id "$PROD_ALIAS")"
fi

if [ -n "$DEPLOY_ID" ] && [ -n "$LIVE_ID" ] && [ "$DEPLOY_ID" = "$LIVE_ID" ]; then
  VERIFY_STATE="live"
  echo "  ✓ $PROD_ALIAS is served by $DEPLOY_ID (this deploy)"
elif [ -n "$DEPLOY_ID" ] && [ -n "$LIVE_ID" ]; then
  VERIFY_STATE="mismatch"
  echo "" >&2
  echo "✗ THE DEPLOY DID NOT TAKE — $PROD_ALIAS is NOT serving this build." >&2
  echo "    this deploy : $DEPLOY_ID  ($DEPLOY_URL)" >&2
  echo "    alias serves: $LIVE_ID" >&2
  echo "  Production is unchanged, or another deploy won the race. Receipt: $RECEIPT" >&2
  exit 3
else
  VERIFY_STATE="unverified"
  echo "" >&2
  echo "⚠ UNVERIFIED — the upload completed and this check could NOT run." >&2
  echo "    deployment id: ${DEPLOY_ID:-<unresolved>}   alias id: ${LIVE_ID:-<unresolved>}" >&2
  echo "  This does NOT mean the deploy failed, and does NOT mean it worked. Nobody knows yet." >&2
  echo "  Check by hand:  npx $VERCEL_CLI inspect $PROD_ALIAS" >&2
  echo "  Log: $DEPLOY_LOG   Receipt: $RECEIPT" >&2
  exit 2
fi

write_receipt
echo ""
echo "Recorded: ${RECEIPT#"$REPO_ROOT"/}"
echo ""
echo "Done — $PROD_ALIAS is serving $DEPLOY_SHA."
