#!/bin/bash
set -e

echo "=== What Others Have Said — Deploy ==="
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

# Build
echo "Building..."
cd web
npx next build

# Deploy
echo ""
echo "Deploying to Vercel..."
npx vercel --prod

echo ""
echo "Done!"
