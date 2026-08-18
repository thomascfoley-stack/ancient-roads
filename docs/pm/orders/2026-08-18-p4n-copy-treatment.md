# P4.n copy — proposed treatment, and the production numbers the diagnosis could not take

**Status: TREATMENT PROPOSAL — step 2 of the owner's loop** (diagnose → **suggest treatment** →
confirm → independent confirm → deploy → test). **Nothing here has been executed.** No work has
been copied, published or served. Companion to
[`2026-08-18-corpus-lane-diagnosis.md`](2026-08-18-corpus-lane-diagnosis.md), which is step 1 and
says in its own header that nothing should be fixed on its strength alone. This document does not
change that: it proposes, it does not authorise.

---

## 0. What this adds to the diagnosis: production

The diagnosis is explicit that **every database number in it is dev**, because bylaw 7 forbids a
production read without the owner's go, and it tags findings **DEV-ONLY** accordingly. That go was
given on 2026-08-18 for a read-only census. So the numbers below are the missing half.

**Method.** `ep-odd-fog`, `neondb_owner`, every statement inside `BEGIN TRANSACTION READ ONLY`
followed by `ROLLBACK`. No writes. No connection string printed. Recorded in `WORKLOG.md`.

### Production, measured 2026-08-18

| status | works |
|---|---|
| published | 164 |
| staged | 7 |
| quarantined | 2 |

By register, published: commentary 31 · hymn 32 · theology 29 · devotional 15 · poetry 15 ·
lexicon 11 · sermon 10 · confession 9 · father 7 · topical_index 4 · **historian 1**.

Prod's 7 staged, named: `origen-commentary` (father, MUST_NOT_SERVE) and six
lexicon/commentary rows — `smiths-dictionary`, `eastons-dictionary`, `isbe`, `naves-topical`,
`bdb-lexicon`, `jfb`. Consistent with A8's "7 held works, each by a cited ruling".

### The backlog, re-derived rather than carried

MASTER.md's A9 row records the 669 as derived 2026-08-08 and warns it "needs re-deriving against a
live prod read before any run". Re-derived against live prod:

**639 works** — commentary 87 · father 18 · sermon 95 · theology 439.

Three numbers have circulated and they are not the same measurement, which is worth stating so the
next reader does not pick the wrong one:

| number | what it is |
|---|---|
| 669 | the 2026-08-08 derivation, against a prod census that has since moved |
| 670 | raw slug set-difference lane-b → prod, **including** ineligible works |
| **639** | the derivation minus 29 ineligible (each with a recorded reason) minus the pre-fix exclusion |

**639 is the one to use.** Batch files in `docs/evidence/corpus-copy/p4n/` now carry it.

---

## 1. Two defects fixed in the batch files before this proposal

Both would have corrupted an owner-run copy, and both are recorded because the second will recur.

1. **`adeney-expositorsonglament` was in the derived commentary batch.** The runbook's STOP block
   says to exclude it — with `gill-song` and `jamieson-jfb` — when the source is lane-b, because
   lane-b holds those three in their **pre-fix** form. `derive-p4n-backlog.mts` does not know about
   that exclusion, so **every re-derivation puts it back**. Removed; commentary 88 → 87.
2. **`theology-{1..5}of5.json` on disk were the stale 464-work split** from 2026-08-17, sitting
   beside today's 439-work `theology.json` — and the runbook's per-batch sequence names those five
   files explicitly. Re-split from today's derivation: 88/88/88/88/87.

---

## 2. The proposal: separate the copy from the serve

The single idea. **Copying and serving are different acts with different blast radii, and the
tooling already separates them.** Treating them as one operation is what makes this look like an
all-or-nothing production change.

| | copy (`corpus-copy.mjs`) | flip (`publish-flip.mjs`) |
|---|---|---|
| user-visible effect | **none** | the works start answering |
| retrieval change? | **no** | **yes** — carries the accuracy diagnostic + held-out eval |
| reversible? | **no** (§4) | **yes** — `--reverse`, same slug file, same guards |

**Phase A — copy, staged and unserved.** Verified from the source, not assumed:

- `status` is the **literal** `'staged'` in the INSERT. The script's own header: "There is no
  parameter, no flag and no code path to 'published'."
- `served` is **absent** from the `embeddings` INSERT, and prod defaults that column
  **`false NOT NULL`** (verified against prod's `information_schema`). Copied rows cannot serve.
- `ON CONFLICT (slug) DO NOTHING` on `sources`; `ON CONFLICT DO NOTHING` on `embeddings`. A re-run
  is safe.
- The gate requires a TTY and the typed word **`copy`** (lowercase). A4's first refusal was this
  class — the owner typed the wrong word — so it is written down here.

**Phase B — flip, one register at a time, each with the eval.** Not proposed for scheduling yet;
it is the step that needs the accuracy diagnostic, and §20 of the diagnosis already lists which
items require it.

---

## 3. Sequencing, by measured volume

Measured on lane-b, read-only, 2026-08-18. The runbook's batch-size rule is "whatever keeps the
flip transaction under ~10 minutes"; these are the numbers that rule needs and did not have.

| batch | works | sections | flat rows |
|---|---|---|---|
| **father** | 18 | 7,445 | **26,674** |
| theology-3of5 | 88 | 3,289 | 42,985 |
| theology-4of5 | 88 | 3,133 | 43,369 |
| theology-5of5 | 87 | 4,175 | 49,106 |
| theology-1of5 | 88 | 11,762 | 54,268 |
| theology-2of5 | 88 | 3,548 | 55,785 |
| commentary | 87 | 6,540 | 101,662 |
| sermon | 95 | 4,346 | 146,205 |
| **TOTAL** | **639** | **44,238** | **520,054** |

**Proposed order: `father` first** — smallest by flat rows, which is the bulk of the transfer, and
0 collisions on prod. Then `commentary`, because commentary + father are what feed the `/ask`
exegetical floor and the coverage census measures what they add. Then sermon, then theology.

This inverts the runbook's "commentary + father FIRST" only in that father precedes commentary
within that pair; the register order is unchanged.

---

## 4. What is NOT verified, and the one real risk

**The copy has no undo.** This is the risk, stated plainly because an earlier draft of this plan
called the copy "fully reversible" and that was wrong:

- `corpus-copy.mjs` has **no** `--undo` and no reverse mode. Its only `ROLLBACK`s are error paths.
- `--reverse` belongs to **`publish-flip.mjs`** (published → staged). It does not remove rows.
- Removal is `phase1-kill-work.mjs`, which is **one work per run**, refuses if any user-data
  dependent is non-zero, and writes its own snapshot + inverse SQL.

So undoing an 18-work copy is 18 gated runs. The honest description is **additive and inert, not
reversible.** That is a good property for a first batch and a poor one for a 639-work sweep, which
is the strongest argument for going one batch at a time.

**Also not verified:**

- **Copy transaction duration at scale.** The tool batches writes with parameterised `unnest` and
  keyset-pages reads (a 2026-08-02 rewrite, after the one-row-per-round-trip version measured
  ~6.8 hours on a large register). No wall-clock has been taken on the current implementation
  against prod. `father` at 26,674 flat rows is the cheapest way to get that number.
- **Collision checks were run for `father` and `commentary` only** (0 each). Sermon and the five
  theology sub-batches are unchecked.
- **The `/ask` claim rests on one join.** All 105 works in father+commentary carry flat rows
  (128,336, keyed as the tool counts them: `metadata->>'work'`), and `routing.ts` retrieves
  `FROM embeddings` — so these would serve after a flip. `vectors=0` in the dry-run is
  `section_embeddings`, a different table, and was briefly mis-reported as a blocker. **The other
  six batches' flat coverage has not been checked per-work.**
- **G10:** 0 NULL `unit_ordinal` across father+commentary's 13,985 sections, so the eventual flip
  clears the ratchet for those two. Unchecked for the rest.

**§17.10 does not block this.** The diagnosis's licensing finding concerns `commentary_entries`
(Tyndale Study Notes, Origen, Lewis, Chesterton, Tolkien — excluded only by absence from an
8-name allowlist). `corpus-copy.mjs` writes to `sources`, `sections`, `section_anchors`,
`topical_entries`, `section_embeddings`, `section_history_anchors` and `embeddings` — enumerated
from the script; **`commentary_entries` is not among them.** The two are orthogonal. §17.10 still
needs its ruling before the A048 backfill, as the diagnosis says.

---

## 5. Decisions this asks for

1. **Phase A at all?** Copying 639 works to prod as staged/unserved changes nothing a reader sees
   and cannot be undone in bulk. Yes / no / smaller.
2. **`father` alone first, then stop and read the numbers?** Recommended. It buys the wall-clock
   measurement that everything after it should be scheduled from.
3. **Phase B sequencing** — deferred. It needs the accuracy diagnostic per register, and should be
   proposed separately once Phase A has produced real timings.

## 6. If confirmed, the exact Phase A commands

Env — four variables, no more (enumerated from the script; the runbook's extra
`CUTOVER_DATABASE_URL` line is inert for this tool). **`CORPUS_COPY_SOURCE_URL` must be lane-b, not
dev** — the 2026-08-10 reset emptied dev of this payload:

```bash
export CORPUS_COPY_SOURCE_URL=$(cat ~/.neon_lane_b_owner_url)
export CORPUS_COPY_DEST_URL=$(cat ~/.neon_prod_url)
export COPY_ALLOW=1 COPY_EXPECT_HOST=ep-odd-fog-atnykudm
```

```bash
node scripts/corpus-copy.mjs --slugs=docs/evidence/corpus-copy/p4n/father.json --dry-run
```

```bash
node scripts/corpus-copy.mjs --slugs=docs/evidence/corpus-copy/p4n/father.json
```

The gate prints a summary and asks for the word **`copy`**. Anything else refuses and writes
nothing. Evidence lands in `docs/evidence/corpus-copy/` (default; the directory is created).

**Then stop.** Do not run `publish-flip.mjs`. Report the wall-clock and the destination census
delta, and Phase B gets proposed against those numbers.
