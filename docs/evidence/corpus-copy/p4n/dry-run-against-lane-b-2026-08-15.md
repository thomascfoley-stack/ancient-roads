# P4.n dry-runs re-executed against the surviving source — 2026-08-15

The runbook's "all four registers DRY-RUN CLEAN 2026-08-08" was measured against `ep-tiny-hat`,
which the 2026-08-10 branch reset emptied of this payload (3 of 669 slugs survive there). This
re-executes the same dry-runs against the branch that still holds it.

## Source

`lane-b-uploader` — `br-fancy-block-ateczkh0` / **`ep-snowy-bird-atmdsv3g`**, credential
`~/.neon_lane_b_owner_url`. Child of `dev-pre-reset-20260810` (`br-divine-cell`), branched
2026-08-03, so it predates the reset and carries the pre-reset corpus.

`corpus-copy.mjs`'s only source-side guard is "SRC is not production"
(`corpus-copy.mjs:45`), so lane-b is an accepted source with no flag or code change.

```bash
CORPUS_COPY_SOURCE_URL="$(cat ~/.neon_lane_b_owner_url)" \
  node scripts/corpus-copy.mjs --slugs=docs/evidence/corpus-copy/p4n/<batch>.json --dry-run
```

`--dry-run` never contacts the destination (`corpus-copy.mjs:118` — `CORPUS_COPY_DEST_URL` is
required only when not dry), so **production was not connected** for any run below.

## Result — 4/4 clean

| batch | works | outcome |
|---|---|---|
| `father.json` | 18 | clean — per-work census printed, no STOP |
| `commentary.json` | 91 | clean |
| `sermon.json` | 96 | clean |
| `theology.json` | 464 | clean |

All four exited 0 on `DRY RUN — no destination was contacted and nothing was written.`
No missing-work STOP, no error line, on any batch.

Independently cross-checked by direct query against the same branch, so the census is not the
only witness: **669 of 669 backlog slugs present · 46,645 sections · 551,851 work-keyed flat
embedding rows**, every row `served=false`.

## What this does and does not establish

ESTABLISHES: the corrected source is complete for this backlog and the copy tool accepts it.
The runbook is executable once `CORPUS_COPY_SOURCE_URL` is repointed.

DOES NOT ESTABLISH: anything about production. The 2026-08-08 derivation subtracted
already-on-prod slugs from a prod read taken that day; prod has moved since (at minimum the
2026-08-11 withdrawals and the 2026-08-13/14 corpus-backlog copies). **Re-derive against a live
prod read before copying**, or the batches may carry works prod already has. `scripts/derive-p4n-backlog.mts`
does exactly this and takes `DEV_URL` / `PROD_URL` — point `DEV_URL` at lane-b.

DOES NOT ESTABLISH: content quality. `vectors=0` on the census lines is expected — these works
carry `embeddings` (flat retrieval) rather than `section_embeddings` (the 006 Book-Reader model).

## Still to exclude before any copy

`gill-song`, `jamieson-jfb`, `adeney-expositorsonglament` — re-ingested onto the post-reset dev
by the 2026-08-12 Song work. lane-b holds older copies at identical row counts; copying them
would overwrite the newer `primary_book` anchoring with the pre-fix version.
