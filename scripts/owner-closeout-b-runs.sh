#!/bin/bash
# owner-closeout-b-runs.sh — the packet's prod-bound artifacts B1-B6, one sitting.
#
# ONE command, SIX gates: each step banners what it will do, runs its DRY-RUN first where the
# tool has one, then asks before writing. Enter = run · s = skip · q = quit (resumable: rerun
# this script and skip what's done). Every step calls the EXISTING proven tool with its
# documented flags — this file sequences, it does not reimplement.
#
# Credentials: read at runtime from ~/.neon_prod_url (owner) — never stored here.
# Evidence: every step tees to docs/evidence/owner-b-runs-<ts>/.
set -u
cd "$(dirname "$0")/.."
TS=$(date -u +%Y-%m-%dT%H-%M-%SZ)
EV="docs/evidence/owner-b-runs-$TS"; mkdir -p "$EV"
PROD_URL=$(tr -d '"\n' < ~/.neon_prod_url)
PROD_EP=$(printf '%s' "$PROD_URL" | grep -oE 'ep-[a-z0-9-]+' | head -1)
echo "target: $PROD_EP · evidence: $EV"
[ "$PROD_EP" = "ep-odd-fog-atnykudm" ] || { echo "STOP: ~/.neon_prod_url is not ep-odd-fog"; exit 1; }

step() { # name, then the command as remaining args
  local name=$1; shift
  echo; echo "════════ $name ════════"
  printf '  %s\n' "$*"
  read -r -p "  [Enter=run / s=skip / q=quit] " a </dev/tty
  case "$a" in s) echo "  SKIPPED"; return 1;; q) echo "  QUIT"; exit 0;; esac
  ( "$@" ) 2>&1 | tee "$EV/$(echo "$name" | tr ' /' '__').log"
  local rc=${PIPESTATUS[0]}
  echo "  -> exit $rc"
  [ $rc -ne 0 ] && read -r -p "  step FAILED — continue anyway? [y/N] " c </dev/tty && [ "$c" = "y" ] || true
  return 0
}

# ── B4: migration 128 on prod (seconds; rollback = DROP COLUMN) ─────────────────────────────
step "B4 migration 128 asserted_ownership_at" \
  env DATABASE_URL="$PROD_URL" MIGRATE_ALLOW_PROD=1 node db/apply-migration.mjs db/migrations/128_asserted_ownership_at.sql

# ── B1: migration 127 — drop idx_embeddings_vector (~8GB). Panel bundle is DEPLOYED. ────────
echo; echo "B1 precheck: the related-voices sweeps must plan onto served partial indexes."
env PGPASSWORD='' psql "$PROD_URL" -c "EXPLAIN (COSTS OFF) SELECT e.id FROM embeddings e WHERE (e.user_id IS NULL) AND e.served AND (e.source_type = ANY (ARRAY['commentary','father'])) ORDER BY e.embedding <=> (SELECT embedding FROM embeddings WHERE served LIMIT 1) LIMIT 24;" 2>&1 | tee "$EV/B1-precheck-explain.log" | grep -E "Index|Seq" | head -3
step "B1 migration 127 drop idx_embeddings_vector (CONCURRENTLY)" \
  env DATABASE_URL="$PROD_URL" MIGRATE_ALLOW_PROD=1 node db/apply-migration-concurrent.mjs db/migrations/127_drop_full_table_vector_index.sql
echo "  rollback (hours at size): CREATE INDEX CONCURRENTLY idx_embeddings_vector ON embeddings USING hnsw (embedding vector_cosine_ops);"

# ── B2: Thayer's prod replay (A3 ruled: delete stale). Dry-run then apply, both tools. ──────
step "B2a thayer re-chunk DRY-RUN"  env CUTOVER_DATABASE_URL="$PROD_URL" node scripts/rechunk-thayers-sections.mjs --env=prod
step "B2b thayer re-chunk APPLY"    env CUTOVER_DATABASE_URL="$PROD_URL" node scripts/rechunk-thayers-sections.mjs --env=prod --apply
step "B2c thayer stale-flat DRY-RUN" env CUTOVER_DATABASE_URL="$PROD_URL" node scripts/reconcile-thayers-stale-flat.mjs --env=prod
step "B2d thayer stale-flat APPLY"  env CUTOVER_DATABASE_URL="$PROD_URL" node scripts/reconcile-thayers-stale-flat.mjs --env=prod --apply

# ── B3: Eusebius Phase 4 — npnf201-ONLY copy (the conservative fork of the item file's step 1;
#        202/203 already serve on prod as fathers). SAFE STOP is before step B3c. ──────────
echo '["schaff-npnf201"]' > "$EV/npnf201-slug.json"
step "B3a corpus-copy npnf201 dev->prod" \
  env CUTOVER_DATABASE_URL="$PROD_URL" node scripts/corpus-copy.mjs --slugs="$EV/npnf201-slug.json" --evidence="$EV"
step "B3b backfill-history-embeddings APPLY (prod)" \
  env DATABASE_URL="$PROD_URL" node scripts/backfill-history-embeddings.mjs --apply
step "B3c serve-batched history_embeddings (POINT OF SERVING — safe stop is BEFORE this)" \
  env CUTOVER_DATABASE_URL="$PROD_URL" node scripts/serve-batched.mjs --slugs="$EV/npnf201-slug.json" --table=history_embeddings
step "B3d publish-flip --status-only npnf201 (shelf visibility)" \
  env PUBLISH_ALLOW=1 PUBLISH_EXPECT_HOST="$PROD_EP" CUTOVER_DATABASE_URL="$PROD_URL" node scripts/publish-flip.mjs --slugs="$EV/npnf201-slug.json" --status-only
step "B3e frozen-v1 history eval on prod + coverage census" \
  env DATABASE_URL="$PROD_URL" npx tsx web/src/scripts/history-eval-run.mts

# ── B6: register flips sermon/theology (~4h, resumable — DB is the checkpoint) ──────────────
step "B6a register-flip DRY-RUN (prod census)" \
  env NEON_BRANCH=prod CUTOVER_DATABASE_URL="$PROD_URL" node scripts/register-flip-batched.mjs
step "B6b register-flip APPLY (resumable; rerun this step to resume after any interrupt)" \
  env NEON_BRANCH=prod CUTOVER_DATABASE_URL="$PROD_URL" node scripts/register-flip-batched.mjs --apply

# ── B5: HELD, stated honestly ───────────────────────────────────────────────────────────────
echo; echo "════════ B5 anchor backfill — HELD, not runnable tonight ════════"
echo "  No tool exists: the packet row is '(pending; dev run first)' and dev has 0 user"
echo "  documents to rehearse on. Building a re-anchor tool and pointing it at real users'"
echo "  prod documents unrehearsed is the blast radius bylaw 6 exists for. It needs its own"
echo "  slice: build, seed dev docs, red-proof, then a run here."
echo
echo "Done. Evidence in $EV — commit it."
