# JOB: Corpus ↔ Surface Reconciliation

**Disposable.** One job, one instrument, one pass. Delete this file when the job closes — its
durable residue is the checked-in instrument, its tests, and a WORKLOG entry. Do not let it become
a standing document; a disposable doc that survives becomes a stale one.

**Opened 2026-08-20.** Binding: `CLAUDE.md`, `AGENTS.md`, `docs/THE_LOOP.md`, and the
`quality-slice` skill, whose loop this job runs end to end.

---

## 1. The one job

> **For every work in the corpus, does it reach every surface it should, and no surface it should not?**

That is the whole job. It is not 29 tickets. Every corpus defect found on 2026-08-18/19 is an
instance of exactly two failure directions of that one question:

| Direction | Code | Instance found | Was it visible before? |
|---|---|---|---|
| Legal, served material a surface cannot show | `MISSING` | `gill-song`: 123 sections, 1,942 verse-anchored embeddings, PD, named in the admission predicate — and Song of Songs was the one book of 66 with **zero** passage-search entries | No |
| Material shown on a surface it does not belong to | `MISPLACED` | `hort-james1909`: a Greek critical commentary declared `source_type: "poetry"`, taking 44 of 75 top-3 slots in the hymns lane | No |

Both were invisible because **nothing in this repo asks the question per work × per surface.** The
serving lists, the admission predicate and the register wall each answer a *piece* of it, and the
gap between the pieces is where both defects lived. Fixing the two instances one at a time is the
29-micro-jobs failure mode; the job is to build the instrument that would have found them, run it
once, and act on everything it returns.

**Non-goal, stated so it cannot creep in:** this job does not change ranking, does not tune
retrieval, and does not touch the verifier. Those are separate slices with their own gates. This
job changes only *reachability* — which rows a surface can see.

---

## 2. Pre-registered bars — WRITTEN BEFORE ANY NUMBER EXISTS

Per `quality-slice` step 5. These are fixed now; they are not revised after seeing results. If a
bar turns out to be wrong, that is recorded as a finding and the bar stays.

| # | Bar | Gates |
|---|---|---|
| **B1** | Every `published` + `served` work resolves to **exactly one** primary register, and that register matches the surface(s) it appears on. Zero `MISPLACED`. | Owner call on each exception |
| **B2** | Every work admitted by the passage-search predicate has **≥1 row** in `commentary_entries`. A slug admitted by a clause that cannot fire counts as **FAIL**, not as pass. | Blocking |
| **B3** | Every book of 66 has **≥1** admitted passage-search entry. | Blocking (met 2026-08-19; this bar keeps it met) |
| **B4** | No admission clause is **structurally dead** — every disjunct in the shipped predicate must match ≥1 row, or be deleted. | Blocking |
| **B5** | Every `MISSING` case is resolved as **materialize**, **re-register**, or **quarantine** — never left as "known". | Blocking |

**B4 is the bar that would have caught the Song.** The predicate names 37 work slugs including
`gill-song`; `work IS NOT NULL` is **0 of 371,406 rows**, so that entire disjunct matches nothing.
37 slugs of coverage that admits nothing, standing where a reader sees coverage. That is the repo's
own recurring artefact — a hand-maintained expected set nothing enforces — and B4 is its check.

---

## 3. The instrument

**One script, `scripts/corpus-surface-matrix.mjs`, read-only, producing one matrix: work × surface.**

Rules it must obey, each earned by a specific failure:

1. **Import the shipped predicates. Never retype them.** `LEGAL_COMMENTARY_ENTRIES_PREDICATE`,
   `EXEGETICAL_FTS_EXCLUSION`, the `*_CORPUS_FILTER` set, `MUST_NOT_SERVE_AUTHORS`. A retyped
   predicate validates a lookalike — and worse, a verifier whose expectation is *derived from the
   artifact under test* is the fourteenth watchlist instance. Import; do not re-derive from
   `routing.ts` at runtime either.
2. **Name the artifact for every column.** Per `quality-slice` step 0. `commentary_entries.book` is
   a `smallint` book number; `verse_start` is a verse **within a chapter**, max 176. On 2026-08-19 a
   book-22 measurement used `verse_start/1000000` and returned 0 for **all 66 books** — and agreed
   with the right answer by coincidence. Each column the matrix reads gets a one-line justification
   in the script.
3. **Derive the surface list from code, not from this document.** If a fifth `/ask` lane ships, the
   matrix must grow a column without anyone editing it.
4. **Report `NOT MEASURED` distinctly from `absent`.** An instrument that cannot reach a surface
   must say so. A negative result that is really a NOT RUN is the sixth watchlist shape.

**Surfaces (as of writing — the script derives them, this list is orientation only):** `/ask`
exegetical · `/ask` song-verse · `/ask` sermon · `/ask` theology · `/ask` historian · passage
search (`commentary_entries`) · library catalog/register shelves.

---

## 4. Failure codes

Every cell that is not clean gets exactly one code. The single count scores the corpus; the codes
say which layer to fix — fixing the wrong layer is the most common waste.

| Code | Meaning | Layer |
|---|---|---|
| `MISPLACED-REGISTER` | Declared `source_type` puts the work in the wrong lane | Manifest + DB register |
| `MISSING-MATERIALIZATION` | Legal + served, admitted in principle, but no rows on the surface | Backfill (the `gill-song` shape) |
| `MISSING-ADMISSION` | Rows exist; the predicate cannot admit them | Predicate (or the dead-clause fix) |
| `DEAD-CLAUSE` | A predicate disjunct matches 0 rows table-wide | Delete or repair — bylaw 3 allows deletion |
| `BLOCKED-PROVENANCE` | Correctly excluded: aggregator/forbidden source | **None. This is the gate working.** |
| `UNANCHORED` | Served but no valid verse anchor, so it can only surface via unconstrained fall-through | Anchoring or a lane floor (**out of scope — B031, separate slice**) |

`BLOCKED-PROVENANCE` is listed so it is never mistaken for a defect. Song of Songs has 1,745 raw
rows from Bede, Bernard, Ambrose, Gregory of Nyssa — nearly all `historicalchristian.faith`. That
material stays out. Licensing fails closed and is not negotiable against coverage.

---

## 5. Phases, with exit criteria

Run in order. Do not start a phase until the previous one's exit criterion is met.

**P0 — Build the instrument. Exit: it reproduces both known defects from a clean run.**
The instrument is not trusted until it independently re-finds `hort-james1909` as
`MISPLACED-REGISTER` (against a seeded restore of its `poetry` registration) and `gill-song` as
`MISSING-MATERIALIZATION` (against a seeded delete of the 115 rows). **A check that has not been
watched go RED proves nothing.** Both seeds are restored before P1.

**P1 — Run it. Read-only, production, owner go per bylaw 7. Exit: a committed matrix + code counts.**
No fixes in this phase. Fixing while auditing loses the map.

**P2 — Look at the data before judging any cell.** Print the raw input for every non-clean cell —
title, first 800 chars, the actual anchors. A number is not evidence until the input behind it has
been read. Two nights of content were lost once to a grep that matched a substring in the wrong
Gospel.

**P3 — Fix by code, not by work.** All `DEAD-CLAUSE` together; all `MISSING-MATERIALIZATION`
together; all `MISPLACED-REGISTER` together. One commit per code with its red-proof. This is what
makes it one job instead of 29.

**P4 — Re-run the whole matrix, not the cells touched.** A registration change moves lane
membership everywhere. Confirm no new `MISPLACED` anywhere, and no book of 66 regressing to zero.

**P5 — Close.** WORKLOG entry with the counts and the code breakdown; `ROADMAP`/`MASTER` status;
delete this file.

---

## 6. Rails — non-negotiable, and each cost something to learn

- **Licensing fails closed.** Verify per-work by text-match to a PD reference, never by author name.
  Quarantine, never delete. Forbidden aggregators live in the gate, not in memory.
- **Production: owner go, every time, per occasion** (bylaw 7). Reads included.
- **One writer.** On 2026-08-19 an out-of-band `CREATE INDEX CONCURRENTLY` sat 558s in
  `waiting for writers before build` behind CI's own `UPDATE`, and the wait was read as progress.
  Any script that writes `embeddings` or `commentary_entries` **refuses to start while another
  session is writing that table**, and prints the refusal.
- **Snapshot before write, in the same transaction. Print the exact inverse.**
- **Match the table's conventions; do not invent them.** `commentary_entries.tsv` is GENERATED;
  bodies truncate at 5,000 chars; `entry_index` sequences a passage's entries **across authors**.
  Read each convention off the table before writing a row.
- **Do not encode a coincidence as an invariant.** A guard requiring one Gill entry per verse was
  true across all 28,300 of his rows and still wrong: 155 authors hold multiple entries per slot,
  and enforcing it would have silently dropped half of four verses. Measure the **table**, not the
  one author in front of you.
- **`await` the async thing.** A verifier test passed two of three legs vacuously because
  `verifyV1` is async and was never awaited. Every new test gets a seeded RED before it counts.
- **Committed ≠ live.** Nothing is done until verified in the environment it protects.

---

## 7. Known inputs — measured, not assumed

Carried in so the job does not re-derive them, each with its date. **Re-measure before acting; the
corpus moved three times in 48 hours.**

- Corpus, prod 2026-08-19: **811 sources** (363 published) · **1,113,390 embeddings** (754,801 served).
- `commentary_entries`: **371,406 rows**, `work IS NOT NULL` = **0**, `register IS NOT NULL` = **0**.
- Admission predicate names **37 work slugs**; that disjunct matches **0 rows**. → `DEAD-CLAUSE`.
- Song of Songs: 1,745 raw rows, ~all forbidden provenance; **115 admitted** after the 08-19
  materialization; books of 66 with zero admitted entries: **NONE**.
- Hymns lane after quarantine: **46 works / 10,988 rows**.
- `unassigned` tradition: **301 served works / 356,167 rows** (47% of served). Gate no longer counts
  it; the 251-work backfill plan is derived and **unrun** (`scripts/derive-tradition-backfill.mjs`).

---

## 8. Explicitly out of scope

Named so they are not smuggled in, each with where it belongs:

- **B031 — no relevance floor on any lane.** Real, measured (historian: 6,492 served, 493 validly
  anchored, 0 in a typical verse band). It is a *ranking* change and needs the accuracy diagnostic.
  Separate slice.
- **The 251-work tradition backfill.** Improves display and genuine breadth; no longer load-bearing
  for the gate. Separate slice.
- **`Anglican`/`anglican`** — 11 published rows. Cosmetic since the gate and the displayed count
  both fold case. Backlog.
- **CI `db-invariants` step 11** — `plan-tenancy` seed coverage, empty `devotionals` catalog,
  `neon-auth-live` secrets. Test-branch data gaps, not product defects. Separate.

---

## 9. How to run it

```
P0  build scripts/corpus-surface-matrix.mjs; seed both known defects; watch RED; restore
P1  owner go -> read-only prod run -> commit the matrix under docs/evidence/
P2  print raw inputs for every non-clean cell and read them
P3  fix by code: DEAD-CLAUSE, then MISSING-*, then MISPLACED-*; one commit + red-proof each
P4  re-run the whole matrix; confirm no regression, no book of 66 at zero
P5  WORKLOG + status; delete this file
```

**Done means:** every cell is clean or carries a code with a recorded decision; B1–B5 all hold;
the matrix is checked in; and the instrument runs in CI so the next `gill-song` is found by a
check rather than by someone noticing that a famous book had no commentary.
