# LENS 3 — Regression + Residual Risk (ship committee, 2026-07-19)

READ-ONLY assessment of `main` after the `reader` merge, the 3 commentary slices,
the chrysostom §1–95 suppression, and the jsdom install. Nothing was shipped,
published, or modified. Repo was clean throughout (`git status` = only this
untracked evidence dir).

## Test suites (both run, full)

| suite | result |
|---|---|
| root `npx vitest run` | 24 files passed, **1 file skipped** · 231 passed, 1 skipped |
| `web` `npx vitest run` | 34 files passed · **171 passed, 0 skipped** |

The skipped root file is `test/retrieval.integration.test.ts` (triple-gated on
`RUN_INTEGRATION` ∧ `DEEPINFRA_API_KEY` ∧ `DATABASE_URL`; `RUN_INTEGRATION` appears in
no script/workflow/config). jsdom now present → `work-reader-paging`,
`work-reader-ui`, `work-toc-bounded` (13 tests) execute for the first time.

## HALF A — live /ask probe (real `teach()`, real DeepInfra, real DEV Neon)

`/api/ask` is auth-gated (`requireUser`), so the pipeline was driven directly through
the shipped `web/src/lib/teacher/teach.ts` via an out-of-tree vitest config
(zero repo footprint). 10 live calls total.

| query | ms | kind | distinct authors |
|---|---|---|---|
| John 3:16 | 34551 / 9829 / 36661 | composed | 4 |
| Romans 8:28 | 9068 / 9031 | composed | 5 (incl. **John Chrysostom**) |
| Matthew 5:3 "poor in spirit" | 34251 / 11002 | composed | 6 |
| Acts 2:38 | 17769 / 23775 | composed | 6 |
| Hebrews 11:1 | 21120 / 14664 | composed | 6 |
| John 1:1 | 32014 / 13628 | composed | 6 (incl. **John Chrysostom**) |

All composed, all ≥2 distinct voices, all quoted+attributed with anchors.
**Chrysostom-territory queries (Matthew/Acts/Romans/Hebrews/John) all pass**, and
`chrysostom-homilies` still returns as a voice post-deletion. No retrieval regression
from the 95-row suppression observed.

**2 of 10 calls failed** on `embedQuery` — `AbortSignal.timeout(30_000)`,
`web/src/lib/teacher/deepinfra.ts:32`, **no retry on that call**. A timeout there
throws out of `teach()` → `/api/ask` returns `INTERNAL`. Both recovered on retry.

Latency observed 9–37s (median ~15s), materially above the ~5s recorded after the
teacher-latency fix.

## HALF A — reader surfaces

- `/read/jhn/3` renders. `/read/psa/23` (OT) renders with prev/next.
  (Note: slugs are 3-letter codes — `/read/john/3` is *not* a valid URL and correctly
  shows "Unknown book". Not a defect.)
- Tap-verse → study panel opens on John 3:16 with **Commentaries (17)**, Word study,
  Notes tabs; Matthew Henry / Adam Clarke render attributed with tradition + year.
- `/library` renders: Commentaries 5, Sermons 7, Hymns & Poetry 15 = **27 of 31
  published works**. `theology` (calvin-institutes, hodge-systematic, owen-works) and
  `confession` (schaff-creeds) have **no catalog** — 4 published works are
  unreachable from the Library hub (reachable by direct `/work/<slug>` URL).

## HALF A — annotations (migration 025)

Schema PROVEN on DEV: `notes`/`highlights` carry `target_kind`, `section_id`,
`source_content_hash`; migrations 024–030 all applied. The arbiter index
`upsertNote` names exists with the exact predicate:

```
idx_notes_user_verse UNIQUE (user_id, verse_id)
  WHERE ((deleted_at IS NULL) AND (target_kind = 'verse'::text))
```

Pre-existing rows survived non-destructively: notes n=2, highlights n=5, **all
backfilled to `target_kind='verse'`**, 0 anchor-XOR violations.

**End-to-end through the signed-in UI is UNPROVEN** — auth blocked (creating an
account / entering a password is out of bounds). The panel shows "Sign in to
highlight and save notes to your account". The real-DB RLS suites
(`annotation-rls-tenancy`, `annotation-exact-substring`, `highlight-tenancy`,
`annotations-polymorphic`) exercise load+write against the real DB and pass locally.

## Chrysostom non-1 ordinal origin — 2 reproduced defects

Only source in the corpus with a non-1 origin: `ordinal` 96..8941 (contiguous, 8846
rows), `unit_ordinal` 17..394. Everything else starts at 1.

1. **Progress rail offset** — `web/src/app/work/[slug]/page.tsx:132`
   `(progress.ordinal - 1 + scrollPct) / total` treats a raw ordinal as a 1-based
   position. First section (ordinal 96) → **~1.07% read on open**; ordinals 8847..8941
   (final 95 sections) all render **100%**.
2. **Phantom "↑ Earlier in this work"** — `web/src/lib/use-work-sections.ts:81,166`
   `hasPrev: (page.sections[0]?.ordinal ?? 1) > 1`. **Reproduced in the browser**: the
   button renders on the first section of `/work/chrysostom-homilies`, clicking it
   fires a 50-row fetch and changes nothing, and the button persists.
   `/work/calvin-institutes` (1-based) correctly has no such button.

Latent: migration `024_sections_unit_ordinal.sql:129` assigns `unit_ordinal` by
`dense_rank()` (dense 1..N). The suppression script never renumbered. Re-running 024's
backfill would silently renumber chrysostom 17..394 → 1..378, invalidating stored
`#s{ordinal}` deep links, bookmarks and section annotations.

## The 935 apparatus/index sections

Detector `heading ~* '(Latin Words and Phrases|General Index|Original Table of
Contents|Index of)'` on published works:

| work | sections | in a Library catalog? |
|---|---|---|
| schaff-creeds | 408 | no (confession) |
| hodge-systematic | 256 | no (theology) |
| owen-works | 41 | no (theology) |
| watson-works | 17 (20 in `embeddings`) | **yes — Sermons** |
| calvin-institutes | 6 | no (theology) |
| maclaren-expositions | 2 | **yes — Sermons** |
| edwards-works | 1 | **yes — Sermons** |

All are in `sections` (reader + FTS, `tsv` non-null), in `section_embeddings`, **and
in the flat `embeddings` table that `/ask` retrieves from (734 rows)**.

**Reader harm — CONFIRMED, and worse than "renders as garbage".** At
`/work/watson-works#s2543` the page numbers have been **stripped**, so an alphabetical
index of Latin tags renders as continuous justified **prose** under the byline
"THOMAS WATSON · REFORMED · PURITAN · PUBLIC DOMAIN". It does not look like an index;
it looks like a Latin devotional meditation by Watson. Same family as the ADR-029
misattribution class: not a rival author, but not authored prose at all, presented as
the author's text. The resume pill reads "Continue — Latin Words and Phrases".

**Retrieval harm — real but not observed on realistic queries.**
- The apparatus works are NOT in `LEGAL_CORPUS_FILTER`'s exegetical pool
  (`SERVED_PROSE_WORKS` = keil-delitzsch, catena-aurea, chrysostom-homilies,
  augustine-homilies). A positive control embedding a verbatim schaff-creeds apparatus
  body returned **0** apparatus rows and did not return itself → **that probe was
  invalid**, and its 0-hit result proves nothing about the base pool.
- Re-probed against the surfaces that DO serve these works — `retrieveSermonLane` /
  `retrieveTheologyLane`. **Positive control fires**: apparatus body → 3/3 apparatus in
  both lanes, target row returned in the theology lane. Detector demonstrably works.
- With a valid control, 5 realistic queries ("John Owen on mortification of sin",
  "Thomas Watson on repentance", "Maclaren on the love of God in Romans 8", "What is
  assurance of salvation?", "Latin phrases in Puritan theology") → **0 apparatus hits
  in 30 lane slots**.

So the apparatus is retrievable in principle and sits one bad query away from being
quoted as a voice, but its embedding neighbourhood is disjoint from natural
theological queries — the same structural argument ADR-029 made for the Prolegomena.
5 queries is a small sample and is not a measurement.

## v4 held-out re-measure — verdict

Not owed **for the chrysostom deletion**. The reachability check ran the shipped
`legalBasePool` at production pool/ef with a working positive control (15 target rows
in a 20-row pool) and found 0 hits across 120 queries / 2,400 pool rows;
`chrysostom-homilies` is genuinely in `SERVED_PROSE_WORKS`, so the check was on the
right path, and live probes confirm Chrysostom still retrieves.

Also not owed for the three slices: john-gill / jfb / adam-clarke were sliced into
`sections` only. `/ask` and all three lanes read the flat `embeddings` table, where
those authors were already served. `sections` is gated on `status='published'`, and all
three remain `staged`. The slicing is inert for every measured surface.
