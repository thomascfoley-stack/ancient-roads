# Shelf cleanup — deep-audit C-1/H-3 (2026-09-07)

Remediation of the confirmed live-serving defect in
`docs/pm/audits/2026-09-07-wave-deep-audit.md` (C-1, H-3), following the ADR-117
`chesterton-preexistence` static-JSON pattern. Full entry-level snapshot and per-file
CDN before/after counts: `shelf-cleanup-c1-h3-2026-09-07T05-57-25Z.json` (same dir).

## What was serving and why it had to come off

| slug | files | entries | basis |
|---|---|---|---|
| `calvin-calcom` | 10 | 10 | quarantined 2026-08-06 (DB-only cleanup; shelf never cleaned) |
| `augustine-confessions` | 10 | 13 | quarantined 2026-08-06 (same) |
| `adeney-expositorsonglament` | 26 | 26 | staged on dev, never published |
| `donne-divine-poems` | 1 | 1 | staged, never published |

The audit transposed the quarantined pair's counts (it says calvin 13 / augustine 10);
disk and CDN both measured calvin 10 / augustine 13. Quarantine remains legally
absolute; the staged pair returns when published + rematerialized, not before.

## Method

1. Surgical edit of the 46 carrier files under `web/public/commentaries/` (gitignored
   deploy artifact): parse, drop only entries whose `work` is one of the 4 slugs,
   re-serialize. Round-trip fidelity was proven first — `JSON.stringify(JSON.parse(raw))`
   is byte-identical on all 46 files, so the rewrite touched nothing but the removed
   entries. Post-edit, a whole-tree grep for `"work":"<slug>"` is negative for all 4.
2. Corpus manifest regenerated (`node scripts/build-corpus-manifest.mjs` →
   `docs/evidence/corpus-manifest-23f4f6dd-2026-09-07T05-58-34-094Z.json`, corpusHash
   `60de26f3…`); all 4 slugs absent.
3. Scoped CDN sync, one `scripts/corpus-blob-sync.mjs --execute --prefix commentaries/<book>/`
   run per affected book dir (21 runs). A full-corpus dry-run was inspected first: within
   `commentaries/` the only drift was exactly these 46 files, 0 deletes. Every scoped plan
   below shows 0 deletes; 46 uploads total. Sync manifest rewritten by the tool
   (prefix-merge); verified hash-consistent with disk for all 46 files afterwards.
4. Live verification: all 46 files re-fetched from
   `https://mbp8qokd9o4o9qnz.public.blob.vercel-storage.com/commentaries/<book>/<ch>.json`
   after the sync — 0 target entries remain in every file; per-file CDN entry-count
   delta equals the number of entries removed, for all 46 files.

## Sync plans (dry-run, quoted; execute runs printed identical plans)

```
plan: 1 upload(s), 0 delete(s), 15 unchanged (prefix: commentaries/1co/)
plan: 1 upload(s), 0 delete(s), 21 unchanged (prefix: commentaries/1ki/)
plan: 1 upload(s), 0 delete(s), 35 unchanged (prefix: commentaries/2ch/)
plan: 1 upload(s), 0 delete(s), 24 unchanged (prefix: commentaries/2ki/)
plan: 1 upload(s), 0 delete(s), 8 unchanged (prefix: commentaries/amo/)
plan: 1 upload(s), 0 delete(s), 39 unchanged (prefix: commentaries/exo/)
plan: 1 upload(s), 0 delete(s), 47 unchanged (prefix: commentaries/ezk/)
plan: 5 upload(s), 0 delete(s), 45 unchanged (prefix: commentaries/gen/)
plan: 1 upload(s), 0 delete(s), 2 unchanged (prefix: commentaries/hab/)
plan: 3 upload(s), 0 delete(s), 10 unchanged (prefix: commentaries/heb/)
plan: 4 upload(s), 0 delete(s), 62 unchanged (prefix: commentaries/isa/)
plan: 6 upload(s), 0 delete(s), 46 unchanged (prefix: commentaries/jer/)
plan: 2 upload(s), 0 delete(s), 19 unchanged (prefix: commentaries/jhn/)
plan: 1 upload(s), 0 delete(s), 41 unchanged (prefix: commentaries/job/)
plan: 2 upload(s), 0 delete(s), 22 unchanged (prefix: commentaries/luk/)
plan: 1 upload(s), 0 delete(s), 3 unchanged (prefix: commentaries/mal/)
plan: 2 upload(s), 0 delete(s), 26 unchanged (prefix: commentaries/mat/)
plan: 1 upload(s), 0 delete(s), 12 unchanged (prefix: commentaries/neh/)
plan: 9 upload(s), 0 delete(s), 141 unchanged (prefix: commentaries/psa/)
plan: 1 upload(s), 0 delete(s), 15 unchanged (prefix: commentaries/rom/)
plan: 1 upload(s), 0 delete(s), 7 unchanged (prefix: commentaries/sng/)
```

Total: 46 uploads, 0 deletes. The 27,544 "deletes" visible in an unrestricted
`--roots commentaries` dry-run are an artifact of root restriction (manifest paths
outside the scanned roots look absent); no such plan was executed.

## CDN before → after (entry totals; forbidden-slug counts)

Per-file detail is in the JSON snapshot. Aggregate:

| slug | CDN before (files/entries) | CDN after |
|---|---|---|
| `calvin-calcom` | 10 / 10 | 0 / 0 |
| `augustine-confessions` | 10 / 13 | 0 / 0 |
| `adeney-expositorsonglament` | 26 / 26 | 0 / 0 |
| `donne-divine-poems` | 1 / 1 | 0 / 0 |

## Negative re-verification (what else is in those 46 files)

Checked every fetched file against a 49-slug watch set: the 43 ADR-029 FAIL works
(`docs/evidence/adr029-scan-2026-09-06/verdict.md`), the three quarantined slugs
(incl. `chesterton-preexistence`), and the known staged works (`hooker-just`).

- The ADR-029 **held-8** (`dev58-held-adr029-2026-09-07.json`): **absent** — confirms
  the audit's sampled finding, now on all 46 files.
- `chesterton-preexistence`, `hooker-just`: **absent**.
- FOUND SERVING (pre-existing, outside this cleanup's scope, reported not removed):
  `luther-bondage` (11 entries across 8 of the touched files), `manton-manton02` (5
  entries, 3 files), `manton-manton01` (1 entry, `psa/145`). All three are ADR-029
  verdict-FAIL works — held from the pending 439 flip for non-authorial front matter —
  but they are not quarantined, not in the held-8, and were live before this cleanup;
  the deep audit's wrong-serving finding named only the 4 slugs above. Removal is an
  owner ruling, not an operator call.
