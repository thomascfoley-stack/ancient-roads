# Owner terminal — publish the 14 clean acquisitions (19 slugs), 2026-09-07

Everything below is staged on DEV and verified (sections + embeddings per the handoff at
`docs/pm/orders/2026-09-07-clean-acquisitions.md`). Each command asks you to type one word.
Estimated time: ~15 minutes plus serve time.

**Why Kimi/Claude can't do this for you:** `corpus-copy.mjs` and `publish-flip.mjs` check
that stdin is a real terminal — "a piped answer is not consent." The only way around it is
emulating a TTY, which is deceiving the gate, not satisfying it. If you ever want agents to
be able to publish, the honest change is to edit the gate yourself — not have an agent
sneak around it.

Run from `~/Projects/ap-ingest` (or any worktree on this branch).

## Step 1 — copy dev → prod (two runs)

```sh
COPY_ALLOW=1 COPY_EXPECT_HOST=ep-odd-fog-atnykudm \
CORPUS_COPY_SOURCE_URL=$(cat ~/.neon_dev_owner_url) \
CORPUS_COPY_DEST_URL=$(cat ~/.neon_prod_url) \
  node scripts/corpus-copy.mjs --slugs=docs/evidence/corpus-copy/clean14-register-2026-09-07.json
# gate asks: Type 'copy'

COPY_ALLOW=1 COPY_EXPECT_HOST=ep-odd-fog-atnykudm \
CORPUS_COPY_SOURCE_URL=$(cat ~/.neon_dev_owner_url) \
CORPUS_COPY_DEST_URL=$(cat ~/.neon_prod_url) \
  node scripts/corpus-copy.mjs --slugs=docs/evidence/corpus-copy/clean14-historians-2026-09-07.json
# gate asks: Type 'copy'
```

Success: `✓ copied N work(s), all counts match. They are STAGED.` — anything about a count
mismatch means STOP and report.

## Step 2 — publish flips (status-only), two runs

```sh
PUBLISH_ALLOW=1 PUBLISH_EXPECT_HOST=ep-odd-fog-atnykudm \
CUTOVER_DATABASE_URL=$(cat ~/.neon_prod_url) \
  node scripts/publish-flip.mjs --slugs=docs/evidence/corpus-copy/clean14-register-2026-09-07.json --status-only
# gate asks: Type 'publish'

PUBLISH_ALLOW=1 PUBLISH_EXPECT_HOST=ep-odd-fog-atnykudm \
CUTOVER_DATABASE_URL=$(cat ~/.neon_prod_url) \
  node scripts/publish-flip.mjs --slugs=docs/evidence/corpus-copy/clean14-historians-2026-09-07.json --status-only
# gate asks: Type 'publish'
```

## Step 3 — serve (two runs, resumable if interrupted)

```sh
CUTOVER_DATABASE_URL=$(cat ~/.neon_prod_url) \
  node scripts/serve-batched.mjs --slugs=docs/evidence/corpus-copy/clean14-register-2026-09-07.json
# gate asks: Type 'serve'

CUTOVER_DATABASE_URL=$(cat ~/.neon_prod_url) \
  node scripts/serve-batched.mjs --slugs=docs/evidence/corpus-copy/clean14-historians-2026-09-07.json
# gate asks: Type 'serve'
```

## Step 4 — historians only: make them /ask-retrievable (the foxe-martyrs pattern)

The 11 historian slugs write `section_embeddings` only; the history lane reads
`history_embeddings`. After the flip:

```sh
DATABASE_URL=$(cat ~/.neon_prod_url) node scripts/backfill-history-embeddings.mjs --apply
# dry-run census first (no --apply) if you want to see the plan
CUTOVER_DATABASE_URL=$(cat ~/.neon_prod_url) \
  node scripts/serve-batched.mjs --slugs=docs/evidence/corpus-copy/clean14-historians-2026-09-07.json --table=history_embeddings
# gate asks: Type 'serve'
```

## Rollback

Every flip prints its own snapshot path and exact `--reverse` command. Keep those lines.

## What is NOT in this batch

- **The 314** — still HELD per the structural validation's NOT EARNED verdict
  (`docs/evidence/corpus-copy/structural-validation-2026-09-07.md`). Do not run the 314
  runbook's flips until the property question is settled by reading.
- **brenton-septuagint** — needs your LXX-versification design decision first.
- **openhymnal is declared multi-author by design** (Stage 3's positive control) — that is
  expected, not a hold.
