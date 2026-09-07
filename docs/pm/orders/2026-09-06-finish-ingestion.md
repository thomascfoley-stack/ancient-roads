# Order — finish the ingestion (2026-09-06)

Issued by the owner in session, 2026-09-06: "lets now look at what needs to get done and
finish the ingestion." Recorded per bylaw 1 (if it is not in the repo, it was never issued).

## Scope authorized

- READ-ONLY prod censuses (executed 2026-09-06, results below).
- Staged ingestion writes on the DEV branch (`ep-tiny-hat`) via the guarded adapter-loop —
  the supported path (`register-writer.ts` hard-refuses prod targets).
- Dev→prod copy and publish flips remain OWNER-ONLY via the TTY-gated tools
  (`corpus-copy.mjs`, `publish-flip.mjs`). This order does NOT authorize agents to publish.

## Census baseline (measured 2026-09-06, dev + prod, READ ONLY)

- Manifest: 917 declared (876 ccel · 17 gutenberg · 5 sword · 5 topical-index · 1 helloao ·
  1 thayers · 1 github · 11 none). 3 manifest quarantines; 1 active forbidden-provenance
  exclusion (`wesley-crosswire`).
- Prod (`ep-odd-fog`): 838 sources = 394 published / 441 staged / 3 quarantined.
- Absent from prod: 80 = 79 CCEL works + `geneva-notes-crosswire` (manifest-quarantined,
  excluded by design). The 79-slug list: `/tmp/ap-topup-slugs.json` (session artifact).
- Counter bug FIXED (`7358e36`, LAUNCH_BLOCKERS #14): `ingestState` now counts both
  embedding planes. Prior backlog numbers ("800/890 complete", "713 absent") were artifacts
  of the wrong-table counter + dev/prod divergence.
- The 46,831 missing `section_embeddings` across 668 works is NOT a serving gap: all 228
  published works in the set are fully served via flat `embeddings`; no serving path reads
  `section_embeddings`. Backfill = optional hygiene, deferred as an owner cost call.
- Dev/prod divergence: 635 prod-only works; dev is not a completeness mirror.

## The 79, triaged (probe evidence 2026-09-06)

- Parse-clean subset → dev ingest via adapter-loop (this order's main executable item).
- Scan-only / parser-uncovered subset (expected large — page-scan ThML, single-div1
  structures, TOC-shell first-ids; e.g. newman-apologia, law-clergy, henry-mhc,
  spurgeon-treasury, vincent-word-studies) → per-work adapter profiles or owner skip ruling.
  NOT a blind sweep (the quarantine-rate breaker halts it, correctly).
- `foxe-martyrs` is `source_type: historian` — rides `ingest-historian.ts`, not the loop.

## Related open items surfaced during scoping (not all in this order's scope)

- `thayers-lexicon` publish is gate-blocked pending
  `docs/evidence/thayers-source-verification.md` (checksum/shingle-diff vs the CC0 edition).
  Repeat automated attempts are hitting the gate and STOPping (flip-run logs) — the gate
  is working; the verification file is the work.
- 441 staged works on prod await owner publish batches (all carry flat vectors — no
  embed-before-flip prerequisite).
- `hort-james1909` needs a status ruling (manifest-quarantined + serve:false + staged on
  prod — contradictory), not a flip.
- New gap acquisitions (from the tradition audit): DRC/Weymouth/Twentieth-Century/JPS-1917/
  Brenton-LXX via the translation pipeline; Catena Aurea (sword); Luther Philadelphia ed.
  vols 1-5 (gutenberg); Menno Simons works1/2 (already declared, un-ingested); OCR tier:
  Pulpit Commentary, Cambridge Bible, Haydock. License traps recorded: CrossWire `TNT` is
  Tregelles Greek CC BY-NC-SA (excluded); Weymouth module is the 1912 3rd ed.; CCEL's
  Catena translator metadata is wrong (Newman/Parker edition, not Whiston); CCEL/Gutenberg
  Foxe is abridged and must be labeled so.
