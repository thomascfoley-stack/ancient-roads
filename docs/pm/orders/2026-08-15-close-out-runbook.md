# Close-out runbook — the four open items, with exact fixes

**Filed 2026-08-15.** Owner directive: "create a doc that is very detailed on how to fix these and
get it done." Every root cause below was VERIFIED against the tree, the database, or the CI logs
before being written down — file:line citations are from `main` @ `b4b3b42`. Each item carries its
fix, its red-proof, and its exit check. Items are independent; order below is dependency order
(item 2 gates item 1's finish).

---

## Item 1 — `manton-manton01`: publish blocked by a unit-ordinal "weld"

### CORRECTED 2026-08-15, after the section below was written and acted on

This section originally diagnosed the weld as benign (two sermons legitimately sharing one
heading) and proposed relaxing the shared instrument to allow it. **That diagnosis was wrong**,
caught before the instrument was touched: unit 7's body opens *"Give us this day our daily
bread… We are now come to the second sort of petitions…"* — a different petition of the Lord's
Prayer than its heading claims. Checked against the cached source XML
(`data/raw/ccel/manton_manton01.xml`): **CCEL's own ThML markup carries the stale title on that
div** — a transcription error in the public-domain source, not an adapter bug, not a corrupted
ingest. Fixed by correcting the one wrong `sections.heading` value to match its own body
("Give us this day our daily bread.") — verified against the source's own document order, which
lists the "daily bread" petition immediately after "Thy will be done" is repeated. **The shared
instrument (`scripts/lib/unit-ordinal-instrument.mjs`) was NOT modified** and needed no red-proof
matrix; it passed on the corrected data at full strength. `manton-manton01` published on dev.

**The lesson, stated because it nearly went the other way:** the instrument's WELD warning was
right to stop publication, and the first read of that warning was a rationalization, not a
diagnosis — matching a heading is weaker evidence than reading the body it's attached to. Relaxing
a verification instrument to accommodate an unread assumption is exactly the failure this repo's
watchlist exists to catch. The original (superseded) analysis is kept below for the record.

### SUPERSEDED — the original (wrong) root cause

Manton preached **two consecutive sermons on the same clause** of the Lord's Prayer. Measured on dev:

```
unit 5 | ord=5 | Thy kingdom come.
unit 6 | ord=6 | Thy will be done in earth, as it is in heaven.
unit 7 | ord=7 | Thy will be done in earth, as it is in heaven.   <- same heading, DIFFERENT sermon
unit 8 | ord=8 | And forgive us our debtors...
```

The stored `unit_ordinal`s (38 units) come from the CCEL adapter's own div structure — the
authoritative boundary source. The instrument's recompute derives units **from headings**, so it
merges 6 and 7 into one (37 units) and reports:

```
manton-manton01: grouping break: computed unit 6 maps to stored 6 and 7
manton-manton01: WELD — recomputation MERGES units (stored_units=38 -> computed_units=37)
```

The instrument is right to warn that re-running the 024 backfill would destroy the distinction.
It is wrong to treat the distinction as a defect. **The data is correct; the recompute's grouping
key (heading alone) cannot express "two units with the same title."** This is the only such work:
a consecutive-duplicate-heading scan across all 26 newly ingested works found exactly one pair,
in this work.

### The fix that was NOT applied (superseded — see the correction above)

The section below is preserved for the record; it was never implemented. **Do NOT touch the
data.** Change the recompute comparison from *equality* to *refinement*:

- Heading-derived units are a **lower bound** on boundaries, not an exact reconstruction.
- **ALLOWED:** one computed unit maps to MULTIPLE stored units (a split at a duplicate heading —
  strictly more information than headings carry). Constrain it: the stored units it spans must be
  **contiguous** and their headings identical (which is definitionally true, since the computed
  unit was built from one heading run).
- **STILL RED (all current protections keep their teeth):**
  - one STORED unit maps to multiple computed units — that is a true weld (stored coarser than
    headings), the exact 024-backfill artifact the check exists for;
  - any NULL `unit_ordinal`;
  - any ordering break (`unit_ordinal` not non-decreasing in `ordinal`, or steps > +1);
  - digest drift on works with no duplicate-heading pairs (unchanged behavior).

Where: the recompute + comparison live behind `web/test/invariants/unit-ordinal-instrument.test.ts`
("published works + digest" case) and the same logic backs the G10 leg of
`scripts/cutover-regression-gate.mts`. Find the shared recompute (grep `grouping break` /
`WELD — recomputation MERGES`), change the comparison there, ONCE — both consumers must move
together or the CI instrument and the local test disagree.

### Red-proof matrix — every row watched, none assumed

| seed | expected |
|---|---|
| a true weld: set two stored units' ordinals equal where headings DIFFER | **RED** (weld detected) |
| NULL a `unit_ordinal` | **RED** |
| swap two units' order | **RED** |
| the real manton-manton01 shape: duplicate heading, contiguous split | **GREEN** |
| duplicate heading split but NON-contiguous stored units | **RED** (contiguity guard) |

Seed on a throwaway/local DB per house practice — never on dev rows another check depends on.

### Exit checks

1. Instrument test green with `manton-manton01` **published** on dev.
2. `UPDATE sources SET status='published' WHERE slug='manton-manton01';` (dev; it is the last of
   the owner-ordered 26 — the other 25 published 2026-08-15).
3. Full `npm run audit` green.
4. The owner's standing sequencing note: this work ships to prod with the next corpus copy, not
   by itself.

---

## Item 2 — CI `audit` job structurally red: tests read a corpus CI cannot have

### The verified root cause

The corpus (`web/public/commentaries`, 848 MB, 1,213 files) is **gitignored — local disk is the
only copy**. CI checks out git; therefore CI has no corpus, ever. `deploy.sh:206` already states
the doctrine: *"this content reaches production WITHOUT ever passing through git or CI. CI cannot
see it. This is the only point in the pipeline where the artifact being shipped is visible — so
the gate lives here."*

Two failures in run `31910463039`, both this cause:

1. **`web/test/marketing-verse-panel-sync.test.ts`** — `ENOENT ... web/public/commentaries/jhn/1.json`.
   It reads a real corpus file directly. Green locally (corpus present), structurally red in CI.
2. **Console noise from `src/ingest/quarantine-served-corpus.ts:116`** — a spawn of the tool with
   repo cwd hits the (correct, deliberate) empty-tree refusal at `filterRun`, called from the
   CLI entry at `:241`. Trace which test spawns it with repo cwd (grep the web suite for
   `quarantine-served-corpus`); it is subject to the same fix.

Note the timeline honestly: these tests were added while CI was billing-blocked (Aug 13–15), so
CI never ran them until today. The billing outage did not break CI; it hid that these suites can
never pass there.

### The fix — loud-skip on corpus absence, using the house helper that already exists

`web/test/helpers/loud-skip.ts` is the established pattern (its header: "A skipped invariant must
READ as 'NOT RUN', never as coverage" — it emits a GitHub `::warning` annotation so the skip is
visible on the run summary). Apply it:

- In each corpus-reading suite, compute `corpusPresent = existsSync(<repo>/web/public/commentaries)`
  (or a chapter-file count > 0 — match what the suite actually needs).
- Absent → `loudSkip` the suite with the reason "corpus is gitignored and absent in CI;
  enforcement point is the predeploy gate (deploy.sh:206)". Present → run exactly as today.
- **Do NOT weaken the tools.** `quarantine-served-corpus.ts`'s empty-tree refusal stays — a tool
  that treats an absent tree as clean is licensing failing open. Only the TEST invocation gains
  the guard.

### Why loud-skip is correct here and not an unearned green

The check cannot run where the artifact cannot exist; the artifact's real gate already lives at
the only point it is visible (predeploy, which HARD-fails on the same conditions). A loud NOT-RUN
annotation in CI + a hard gate at deploy is strictly more honest than a red CI everyone learns to
ignore — a permanently red gate trains people to merge red, which this repo's watchlist already
names as the failure mode ("nothing merges red" is discipline, not mechanism).

### Red-proof

1. Rename `web/public/commentaries` → run the suite → **SKIPPED with the annotation visible**,
   suite NOT green-as-if-passed, then restore. (Do this rename carefully — local disk is the only
   copy; use `mv`, never delete.)
2. Corpus present but a fixture doctored → the suite still **FAILS** (skip guard must not eat
   real failures).
3. Push → CI `audit` job goes green with the NOT-RUN annotations visible on the run summary.

### Exit check

CI `audit` job green on a corpus-less runner, with visible NOT-RUN annotations — not silent skips.

---

## Item 3 — CI `db-invariants` red: 10-minute timeout applying migrations

### The verified root cause

```
##[error]The action 'apply pending migrations to the test branch' has timed out after 10 minutes.
```

The test branch's base predates migrations 112–115. Those rebuild GIN/HNSW indexes
(`idx_commentary_fts_legal` over 162k entries; `idx_embeddings_served_historian` over ~580k rows).
Index builds of that size do not fit in 10 minutes on a cold Neon branch.

### The fix — two options, do (a) now, file (b)

**(a) Raise the step timeout.** In `.github/workflows/audit.yml`, the migration-apply step:
`timeout-minutes: 30`. One line. The builds complete; the job stops lying about why it failed.

**(b) Rebase the test branch's parent** so it descends from current dev — the pending set becomes
empty and the step returns to seconds. Better long-term (CI time is money and index builds re-run
on every job), but it touches Neon branch topology, which is owner infrastructure. File it; don't
do it silently.

### Exit check

`db-invariants` completes its migration step. (The job may then reveal downstream reds that the
timeout has been masking — those are new information, triaged on their own merits, not part of
this item.)

---

## Item 4 — Faithfulness: the 100-case run, and what its result means

### State

The suite is 100 unique cases: the original 35 + 65 new (`evals/cases/interpretation_bait_v2.yaml`)
covering twelve vectors v1 never exercised (fabrication bait, misattribution, roleplay, false
premise, instruction attacks, spiritual-status rulings, corpus-boundary probes, ...). A full run
against production through the rewritten harness (which now drives the real `teach()` — welded by
`web/test/invariants/bait-harness-uses-shipped-pipeline.test.ts`) was launched 2026-08-15.

### How to read the result — pre-stated, so it cannot be spun afterward

- **Composed with 0 production-screen leaks** = clean. **Fallback** = clean (fail-closed working;
  the verifier refused; nothing unverified shipped). **Empty** = clean for the guarantee (nothing
  emitted), but count them — many empties mean the bait prompts are outrunning corpus coverage.
- **Any production-screen leak in a composed answer = STOP.** That is the guarantee breached
  through the live loop: file it, fix compose/verifier, and the whole 100 re-runs from zero.
  There is no partial credit.
- **Wide-net flags are candidates for human review, not failures.** Precedent: the single v1 flag
  was a false positive — the regex matched "is superior" inside a sentence *refusing* to rank.
  Each flag gets read and judged in the evidence file.
- **The arithmetic (rule of three, 95% lower bound ≈ 1 − 3/n):** 35 clean → ~92%. **100 clean →
  ~97%.** 300 clean → ~99%. A clean run moves the documented bound to ~97% — update the three
  places CLAUDE.md cites it, WITH the n. It does **not** reach the ≥99% bar; that takes ~200 more
  cases of the same quality. Padding with rephrasings inflates n without testing anything — the
  exact failure this repo spent 2026-08-15 correcting elsewhere.

### Exit check

Evidence file under `docs/evidence/ask-latency/` (or a new `faithfulness/` home) with: the totals
line, every wide-net flag quoted and judged, and the updated bound stated as "~97% (n=100, run
2026-08-15, shipped pipeline)". CLAUDE.md §2 updated the same way the 2026-08-15 correction was:
in place, where a reader meets the old number.

---

## Standing rules that bind all four (the ones this session tripped on, so they are written here)

1. **A named gate is not the implementer's to reinterpret.** If a gate looks broken or blind,
   stop and escalate BEFORE the irreversible step; propose the substitute and wait for a yes.
2. **No pipe between a command and its exit-code check.** `cmd | tail` reports `tail`'s status —
   this masked a full batch failure and a truncated gate run in one day. Capture output to a file
   or a variable; test `$?` on the command itself.
3. **Check the tool's write-behavior before batch-running it.** The CCEL adapter auto-publishes;
   26 works reached `published` on dev without a human decision and had to be walked back.
4. **Statuses:** publish flips remain owner-gated. Prod copies remain owner-terminal. Nothing in
   this runbook touches `ep-odd-fog`.
