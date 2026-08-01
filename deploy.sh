#!/bin/bash
set -e

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
mkdir -p docs/evidence/deploys
{
  echo "deployed_at_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "sha:             $DEPLOY_SHA"
  echo "project:         $EXPECT_PROJECT_ID"
  echo "org:             $EXPECT_ORG_ID"
  echo "vercel_user:     $WHO"
  echo "url:             ${DEPLOY_URL:-'(not parsed — see /tmp/vercel-deploy.log)'}"
} > "docs/evidence/deploys/deploy-${DEPLOY_SHA:0:7}.txt"
echo ""
echo "Recorded: docs/evidence/deploys/deploy-${DEPLOY_SHA:0:7}.txt"

echo ""
echo "Done!"
