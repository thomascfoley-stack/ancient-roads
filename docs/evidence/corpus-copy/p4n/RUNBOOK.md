# P4.n catch-up runbook — 669 works, dev → prod, in four gated batches

> ## STOP — the source below is EMPTY. Corrected 2026-08-15, measured.
>
> Every command in this runbook reads `~/.neon_dev_owner_url` (`ep-tiny-hat`). **The
> 2026-08-10 branch reset — `dev` (`br-cool-flower`) reset from `production`, "dev now
> mirrors prod exactly" (WORKLOG 2026-08-10 afternoon) — destroyed the payload this
> runbook copies.** Measured 2026-08-15 against live dev:
>
> - backlog slugs present on `ep-tiny-hat`: **3 of 669**
> - dev `sources`: 126 published · 10 staged · 2 quarantined (the derivation read 831)
>
> Run step 1 unchanged and it copies nothing, after an owner-gated terminal session.
> **The "all four registers DRY-RUN CLEAN 2026-08-08" line below is void** — it was
> measured against a database that no longer holds the works.
>
> **The corpus survives, intact and connectable**, on the pre-reset dev's child branch
> `lane-b-uploader` (`br-fancy-block` / `ep-snowy-bird-atmdsv3g`, credential already at
> `~/.neon_lane_b_url` / `~/.neon_lane_b_owner_url`). Measured there 2026-08-15:
> **669/669 works · 46,645 sections · 551,851 flat embeddings**, all `served=false`,
> 109 exegetical works 100% verse-keyed, **0 works acquired in CCEL author-page mode**
> (so the `ryle-expository` contamination class does not reach this batch).
> `corpus-copy.mjs`'s only source-side guard is "SRC is not production", so lane-b is an
> accepted source. The fix is one variable:
>
> ```bash
> export CORPUS_COPY_SOURCE_URL=$(cat ~/.neon_lane_b_owner_url)   # NOT ~/.neon_dev_owner_url
> ```
>
> `dev-pre-reset-20260810` (`br-divine-cell`, 30.88 GB) also survives but has **no compute
> endpoint** — using it means creating one, which is a Neon write and an owner call.
>
> **The four dry-runs HAVE been re-executed against lane-b — 4/4 clean, 2026-08-15**
> ([evidence](dry-run-against-lane-b-2026-08-15.md)); no destination was contacted. Still
> exclude the three slugs re-ingested onto the post-reset dev by the 2026-08-12 Song work,
> which lane-b holds in their pre-fix form: `gill-song`, `jamieson-jfb`,
> `adeney-expositorsonglament`.
>
> **And re-derive the backlog before copying.** The 669 was computed by subtracting a
> 2026-08-08 prod read, and prod has moved since (the 2026-08-11 withdrawals, the
> 2026-08-13/14 corpus-backlog copies). `scripts/derive-p4n-backlog.mts` takes `DEV_URL` /
> `PROD_URL` — point `DEV_URL` at lane-b. The prod read is owner-gated (bylaw 7) and was
> NOT taken on 2026-08-15, so the 669 stands unverified against today's production.
>
> Two further cautions, measured, before the flips:
> - all 669 carry `metadata.register='prose'` — so **both legs** of
>   `EXEGETICAL_FTS_EXCLUSION` are inert for this batch. Harmless only while nothing
>   populates `commentary_entries` (today: 371,406 rows, `work` NULL on every one, and the
>   table is not in `corpus-copy`'s `COPIED_TABLES`). Fix that and this together, or it
>   fails open.
> - the 109 commentary+father works are a **retrieval change** — the held-out eval fires
>   (a pre-registered vN, not a re-run of frozen v4). theology + sermon are separate pools
>   and can go first.

Derived 2026-08-08, read-only against live dev (ep-tiny-hat) and prod (ep-odd-fog):
dev `staged`+`published` (831) − already-on-prod (132) − ineligible (30, each with a
recorded reason) = **669 works**: theology 464 · sermon 96 · commentary 91 · father 18.
Derivation script output + batch files: this directory (`_summary.json`, `<type>.json`).

Order: **commentary + father FIRST** (they feed the /ask exegetical floor — the
coverage census measures what they add), then sermon, then theology. The order's
batch-size rule: whatever keeps the flip transaction under ~10 minutes. Each batch
is four steps; every step is owner-at-terminal (the gates refuse anything else).

## Per-batch sequence (repeat for commentary.json, father.json, sermon.json, then theology-{1..5}of5.json)

**Status 2026-08-08: all four registers DRY-RUN CLEAN** — every work exists on dev with its
sections/anchors/flat payload; zero hard STOPs. Theology pre-split into 5 sub-batches of
92–93 (`theology-1of5.json` … `theology-5of5.json`) to keep the flip transaction friendly.

Env (the credential files live in `$HOME`; these lines never print a secret):

```bash
export CORPUS_COPY_SOURCE_URL=$(cat ~/.neon_dev_owner_url)
export CORPUS_COPY_DEST_URL=$(cat ~/.neon_prod_url)
export COPY_ALLOW=1 COPY_EXPECT_HOST=ep-odd-fog-atnykudm
export CUTOVER_DATABASE_URL=$CORPUS_COPY_DEST_URL
```

```bash
# 0. Dry-run the copy — already DONE 2026-08-08 for every batch file (clean).
node scripts/corpus-copy.mjs --slugs=docs/evidence/corpus-copy/p4n/<type>.json --dry-run

# 1. Copy dev → prod (owner gate, TTY; vectors reused verbatim, nothing re-embedded).
node scripts/corpus-copy.mjs --slugs=docs/evidence/corpus-copy/p4n/<type>.json

# 2. Flip staged → published (owner gate, TTY; serves the rows in the same transaction).
PUBLISH_ALLOW=1 PUBLISH_EXPECT_HOST=ep-odd-fog-atnykudm \
  node scripts/publish-flip.mjs --slugs=docs/evidence/corpus-copy/p4n/<type>.json

# 3. Reconcile — expect zero violations; new works appear as published-fully-served.
RECONCILE_ALLOW_PROD=1 DATABASE_URL=$CORPUS_COPY_DEST_URL node scripts/served-reconcile.mjs

# 4. Coverage census vs the 2026-08-08 baseline — floor must hold; gains are the point.
COVERAGE_ALLOW_PROD=1 DATABASE_URL=$CORPUS_COPY_DEST_URL \
  npx tsx scripts/coverage-census.mts --target=ep-odd-fog-atnykudm \
  --baseline=docs/evidence/corpus-copy/coverage-baseline-2026-08-08.json \
  --write-baseline=docs/evidence/corpus-copy/coverage-baseline-<date>.json
```

## Two one-off items surfaced by the 2026-08-08 verification

**calvin-crosswire — 2 clean `books.google.com` rows unserved on a published work.**
The flip cannot touch a partial state (by design). Serve-or-quarantine is an owner
decision; serving is a 2-row UPDATE, exact inverse shown:

```sql
-- serve (reverse: same statement with =false)
UPDATE embeddings SET served=true
 WHERE user_id IS NULL AND metadata->>'work'='calvin-crosswire'
   AND metadata->>'sourceUrl' ILIKE '%books.google.com%' AND NOT served;  -- 2 rows
```

**spurgeon-talks-to-farmers — published, 298 sections + 298 section_embeddings
(006 model, Book-Reader served), zero flat `embeddings` rows on dev OR prod.**
The /ask sermon lane reads the flat store, so it serves nothing there. Remedy:
embed/label its 298 sections into the flat store (work-keyed, sermon lane) on dev,
verify, then include it in the sermon batch above. ~298 embedding calls.

## E3 deletion set — measured 2026-08-08 (owner call, not executed)

- 67,710 forbidden-provenance rows with served=false — deleting them changes
  NOTHING that serves (verified: 0 served rows on the orphan works; the coverage
  baseline was measured with all of them already unserved).
- 4,174 forbidden rows with served=true = ADR-044's open call (Chrysostom 2,515 +
  Augustine 1,659 historicalchristian.faith). Remedy needs the held-out eval
  re-run first — the eval's DEEPINFRA_API_KEY IS present on this machine now
  (ADR-044's "no key on this machine" is stale).
