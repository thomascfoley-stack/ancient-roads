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
npx tsx scripts/predeploy-gate.ts

# Build
echo "Building..."
cd web
npx next build

# Deploy
echo ""
echo "Deploying to Vercel..."
# --archive=tgz: the static data dirs (concordance = 13,480 files, original,
# commentaries, lexicon) exceed Vercel's 15,000-file upload limit; archiving
# bundles them into one tarball. Added 2026-07-12 when the concordance shipped.
npx vercel --prod --archive=tgz

echo ""
echo "Done!"
