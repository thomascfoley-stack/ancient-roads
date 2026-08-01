# A2.4 — the standing gaps, re-measured on production

Measured read-only on `ep-odd-fog-atnykudm` as `app_runtime`,
2026-08-01T05:03:53Z, in the same connection as A2.1. Raw output:
[`census.txt`](census.txt).

Positive control: `John Gill` rows = **28,843** (probe fires).

---

## 1. `app_runtime`'s grants on `embeddings` — **CONFIRMED**

`STATE_OF_TRUTH.md:300-304` says `app_runtime` still holds
`INSERT/UPDATE/DELETE` on `embeddings`, and `SELECT`-only on
`commentary_entries`, `sources`, `sections`. Asked of the server via
`has_table_privilege`:

| table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `embeddings` | YES | **YES** | **YES** | **YES** |
| `commentary_entries` | YES | no | no | no |
| `sources` | YES | no | no | no |
| `sections` | YES | no | no | no |

**The record is accurate in every cell.** The gap is real and still open: the
servable corpus is the one table the app's own role can write. No `REVOKE` was
attempted — `STATE_OF_TRUTH.md:304` reserves it as an owner action, and a prod
`GRANT` change is a write.

Worth noting for whoever drafts that `REVOKE`: this session proves the *read*
path needs none of the three. Every measurement in A2 ran as `app_runtime` inside
`SET TRANSACTION READ ONLY`.

## 2. The G1 user-data inventory — **MEASURED for the first time**

`STATE_OF_TRUTH.md:92-94` marks "prod user data is empty" as **owner-asserted,
not measured**, with no deletion receipt ever committed, and notes that the
newest committed artifact (`cutover-2026-07-28/23-prod-readonly-AFTER.txt`) still
reports pre-deletion counts. Measured now:

| table | rows | distinct users |
|---|---|---|
| `waitlist` | **4** | n/a (no `user_id` column) |
| `channels` | **0** | 0 |
| `highlights` | 0 | 0 |
| `notes` | 0 | 0 |
| `chats` | 0 | 0 |
| `messages` | 0 | 0 |
| `bookmarks` | 0 | 0 |
| `reading_progress` | 0 | 0 |
| `user_library` | 0 | 0 |
| `library_items` | 0 | 0 |
| `chat_memories` | 0 | 0 |
| `reading_history` | 0 | 0 |
| `study_guides` | 0 | 0 |
| `user_profiles` | 0 | n/a (no `user_id` column) |
| `user_integrations` | 0 | 0 |
| `api_rate_limit` | **41** | 8 |

**Three results, in order of importance.**

**(a) `channels` is EMPTY, and the record says it must not be.**
`STATE_OF_TRUTH.md:89` and `CUTOVER_DESIGN.md:82-84` both state `channels` holds
**1 row** — "a real study group named `test`, not qa residue; **do not delete**
to tidy housekeeping" — and list it among the rows that must survive cutover.
Production has **zero**. Read-only, I cannot distinguish "it was deleted" from
"the 1-row claim was never true of this database". Either way, E1's G1 assertions
are written against a row that is not there, and a digest-plus-count invariant
over an empty table can only prove nothing moved, not that anything was
preserved — the limit `CUTOVER_DESIGN.md:153-156` already names.

This is **not** the order's §2d abort condition, which is scoped to the sources
census; that agrees exactly (see `census.txt`). Recorded as a finding, not acted
on.

**(b) The annotation clearance is now corroborated by measurement.** Every
annotation table reads 0. That is consistent with the owner-asserted 2026-07-28
deletion. It does not retro-prove the deletion receipt — an empty table is
equally consistent with several histories — but the assertion is no longer
unsupported by any reading.

**(c) `waitlist` = 4 matches the record exactly**, and `api_rate_limit` = **41
rows / 8 distinct users** reproduces the "41 rows, operational" figure from
`CUTOVER_DESIGN.md:102-103` that the A1 verdict noted appears nowhere under
`docs/evidence/`. It does now.

## 3. Forbidden provenance against the 71,884 ratchet — **UNCHANGED**

Flat store, by `metadata->>'sourceUrl'`:

| domain | rows |
|---|---|
| biblehub | 15,707 |
| studylight | 0 |
| historicalchristian | 56,177 |
| **TOTAL** | **71,884** |

Exactly the `STATE_OF_TRUTH.md:111` figure — 15,707 + 56,177, ratchet intact, not
one row moved. G6 holds.

**The sections store carries 0 forbidden `source_url` rows** across all 7 works.
This is worth stating precisely because it is easy to misread: `barnes-notes` is
recorded as the biblehub-provenance work (G6, `STATE_OF_TRUTH.md` §2b), and it
still is — but that provenance lives in `sources.provenance` / the ingest
manifest, **not** in any `sections.source_url`. The A2.2 instrument reached the
same conclusion from the other direction: it found `barnes-notes`
manifest-ineligible while its section-level provenance scan came back clean.

## Context, not a verdict

| fact | value |
|---|---|
| flat platform embeddings (`user_id IS NULL`) | 190,635 |
| of those, no work key | 112,815 (59.2%) |
| `section_embeddings` | 72,863 |
| `sections` | 72,863 |

The 59.2% figure is consistent with `STATE_OF_TRUTH.md` §2b (E2 labeled 77,820;
112,815 remain unlabeled) — unchanged since the 2026-07-29 cutover log.
