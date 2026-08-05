#!/bin/bash
set -e
set -o pipefail
# pipefail matters at exactly one line below: `vercel --prod | tee ...`. Without it, bash's $? for
# that pipeline is tee's exit code, not vercel's — so a failed deploy (vercel prints an error JSON
# to stdout and exits, or exits 0 with an error body; observed both) sails through `set -e`, the
# script reaches "Done!", and a receipt gets written that looks identical to a real one. Caught
# 2026-08-03: a corpus-copy path collision failed the deploy, EXIT=0 was echoed by the wrapper that
# ran this script, and the CI-facing task notification for that wrapper also reported success — an
# unearned green two layers deep. CI's own audit.yml already sets pipefail on its one piped step
# for the identical reason; this was the one place in this file that needed the same guard.

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
# ---------------------------------------------------------------------------
DIRTY=$(git status --porcelain 2>/dev/null)
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
# NOT a substitute for separate Vercel projects, which would remove the shared
# alias entirely. It is the cheap mechanical floor until that call is made.
# ---------------------------------------------------------------------------
echo "=== Pre-deploy gate: this tree contains everything already shipped ==="
if git remote get-url origin >/dev/null 2>&1 && git fetch origin --quiet 2>/dev/null; then
  if git merge-base --is-ancestor origin/main HEAD 2>/dev/null; then
    echo "  ✓ contains origin/main ($(git rev-parse --short origin/main))"
  else
    BEHIND="$(git rev-list --count HEAD..origin/main 2>/dev/null)"
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
if ! command -v npx &> /dev/null; then
  echo "Error: npx not found. Install Node.js first."
  exit 1
fi

# Verify static files exist
BIBLE_COUNT=$(find web/public/bible -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
COMMENTARY_COUNT=$(find web/public/commentaries -name "*.json" 2>/dev/null | wc -l | tr -d ' ')

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

# Build
echo "Building..."
cd web
npx next build

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
# ---------------------------------------------------------------------------
EXPECT_PROJECT_ID="prj_Y9PVuNly5sSsf3NcvayS1vwE6FwR"
EXPECT_ORG_ID="team_TQ3BYCSyzQ3m0yatlkKmUzM0"

WHO="$(npx vercel whoami 2>/dev/null | tail -1 | tr -d '[:space:]')"
if [ -z "$WHO" ]; then
  echo "STOP: not logged in to Vercel. Run: npx vercel login" >&2
  exit 1
fi
echo "  vercel user   : $WHO"
echo "  target project: $EXPECT_PROJECT_ID (org $EXPECT_ORG_ID)"

# Confirm the account can actually SEE the target before uploading half a gigabyte to it. A
# failure here is the wrong-account case, and it costs nothing; the same failure after the upload
# costs an interactive prompt that creates a project somewhere else.
if ! npx vercel project ls --scope "$EXPECT_ORG_ID" >/dev/null 2>&1; then
  echo "" >&2
  echo "STOP: this Vercel session cannot reach org $EXPECT_ORG_ID." >&2
  echo "      Logged in as: $WHO" >&2
  echo "      Production 'web' lives in home-network-hardening and was created by a different" >&2
  echo "      account. Log in as the owning account, then re-run:" >&2
  echo "        npx vercel login" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# ENVIRONMENT ASSERTION — every variable production needs, present before we ship.
#
# Nothing checked this (2026-08-02 deep audit, M17). Each of these fails at RUNTIME, not build
# time, so a deploy missing one succeeds, prints "Done!", and then 503s or throws on every
# request: no APP_DATABASE_URL -> every DB path throws by design (db.ts:20-25); no SITE_PASSWORD
# -> site-wide 503 from middleware, indistinguishable from an outage and notified to nobody; no
# DEEPINFRA_API_KEY -> /api/ask throws; no NEON_AUTH_* -> login broken.
#
# NAMES ONLY. `vercel env ls` never prints values and neither does this.
# ---------------------------------------------------------------------------
echo ""
echo "Checking production environment..."
ENV_NAMES="$(VERCEL_PROJECT_ID="$EXPECT_PROJECT_ID" VERCEL_ORG_ID="$EXPECT_ORG_ID" \
  npx vercel env ls production 2>/dev/null | awk '{print $1}')"
MISSING=""
for v in APP_DATABASE_URL DATABASE_URL DEEPINFRA_API_KEY SITE_PASSWORD \
         NEON_AUTH_BASE_URL NEON_AUTH_COOKIE_SECRET NEON_AUTH_JWKS_URL; do
  echo "$ENV_NAMES" | grep -qx "$v" || MISSING="$MISSING $v"
done
if [ -n "$MISSING" ]; then
  echo "" >&2
  echo "STOP: production is missing required environment variable(s):$MISSING" >&2
  echo "      Each of these fails at RUNTIME, so the deploy would report success and then break." >&2
  echo "      Set them: npx vercel env add <NAME> production" >&2
  exit 1
fi
echo "  all required production env vars present"

# Deploy
echo ""
echo "Deploying to Vercel..."
# --archive=tgz: the upload is 4,115 files / 558.6 MB honouring web/.vercelignore. Both previously
# stated reasons for this flag were wrong (deploy.sh said "concordance = 13,480 files" — that is
# 295 files holding 13,480 Strong's entries; DEPLOY_PREFLIGHT said bible/ at 22,590 exceeds the
# 15,000-file limit — 21,402 of those are excluded from the upload). The real justification is
# SIZE, not count. Corrected 2026-08-02 (deep audit, M15).
VERCEL_PROJECT_ID="$EXPECT_PROJECT_ID" VERCEL_ORG_ID="$EXPECT_ORG_ID" \
  npx vercel --prod --archive=tgz --yes | tee /tmp/vercel-deploy.log

# RECORD IT. This step ended with `echo "Done!"` and nothing else — no deployment id, no url, no
# sha — for the gate the programme calls "the irreversible one". The next incident then starts
# from the question this repo has already answered wrong twice: what is actually live?
DEPLOY_URL="$(grep -oE 'https://[a-z0-9-]+\.vercel\.app' /tmp/vercel-deploy.log | tail -1)"
DEPLOY_SHA="$(git rev-parse HEAD)"
# ANCHOR THE PATH AT THE REPO ROOT. This was a bare relative `docs/evidence/deploys`, written
# AFTER `cd web` on line 75 — so every receipt since the first deploy landed in
# `web/docs/evidence/deploys/`, inside the directory `vercel --prod` uploads. Two consequences,
# both found 2026-08-02: MASTER's A6 row points readers at `evidence/deploys/` from the repo
# root, where there was nothing; and each deploy shipped every previous deploy's receipt into
# the deployment payload. Not served (it is outside web/public) and not sensitive, but not
# intended either, and the upload grew with every release.
EVIDENCE_DIR="$(git rev-parse --show-toplevel)/docs/evidence/deploys"
mkdir -p "$EVIDENCE_DIR"
{
  echo "deployed_at_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "sha:             $DEPLOY_SHA"
  echo "project:         $EXPECT_PROJECT_ID"
  echo "org:             $EXPECT_ORG_ID"
  echo "vercel_user:     $WHO"
  echo "url:             ${DEPLOY_URL:-'(not parsed — see /tmp/vercel-deploy.log)'}"
} > "$EVIDENCE_DIR/deploy-${DEPLOY_SHA:0:7}.txt"
echo ""
echo "Recorded: docs/evidence/deploys/deploy-${DEPLOY_SHA:0:7}.txt"

echo ""
echo "Done!"
