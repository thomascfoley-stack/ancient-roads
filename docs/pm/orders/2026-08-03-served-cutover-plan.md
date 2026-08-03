# ORDER — the `served` cutover, end to end

**Issued** 2026-08-03 · **Lane A** · supersedes nothing · filed per bylaw 1

**Outcome this order buys:** publishing a work makes it serve, on production, with the corpus
caught up and the accuracy consequence measured before anyone sees it. Today publishing a work
makes it *readable* and leaves it invisible to `/ask` — 76 of the 77 works published on
2026-08-03 are in that state.

**Shape:** IDENTIFY → FIX → TEST → VERIFY (dev) → CONFIRM (gates) → DEPLOY (prod) → CATCH UP →
RECORD. Six production touches total, batched into **two owner sessions**. Everything else is
local or dev.

---

## The critical-path constraint, which drives the whole order

`web/src/lib/teacher/routing.ts` at `4f14f17` queries `embeddings.served`. Production has no such
column. So:

```
apply 039 to prod  ─→  deploy web  ─→  apply 040 to prod
      (expand)          (cutover)         (contract)
```

**Never deploy the web bundle before 039 lands**, or every `/ask` retrieval throws
`column "served" does not exist`. And **never let 039 drop the old indexes while the old bundle is
live** (the defect below), or `/ask` silently starves for the length of the deploy window.

Two failure modes, opposite directions, one ordering that satisfies both.

---

## PHASE 0 — FIX what is already known broken (local only, no database)

### 0.1 · Split 039 into expand/contract  ← BLOCKING, do first

**The defect, owned plainly:** `039` as committed at `4f14f17` builds the new partial indexes,
then `DROP`s the old ones and `RENAME`s the new into their names. Between that migration and the
web deploy, the live bundle still filters on `metadata->>'author' IN (…)`. The planner cannot
prove that implies `served`, so it abandons the partial indexes, walks the full-table HNSW at the
shipped `ef_search=64`, and the selective register filter post-guts the neighbour list. The base
pool starves. No error, no log line, just worse answers — the exact mechanism that killed
migration 009 and that 018 v3's zero-window comment exists to prevent. I reintroduced it under a
comment block explaining why it must not happen.

**Fix:**

- `039` creates the four indexes under **new, final names** (`idx_embeddings_served_legal`,
  `_song_verse`, `_sermon`, `_theology`) and **drops nothing**. Both index sets coexist.
- New `040_drop_preserved_indexes.sql` drops `idx_embeddings_vector_{legal,song_verse,sermon,theology}`
  — applied **only after** the new bundle is confirmed live.
- `legal-hnsw-index-sync.test.ts` retargets to the new names; the anti-slug and lockstep halves are
  unchanged in kind.
- Re-run both red-proofs (slug reappears / conjunct dropped). A retargeted guard is a new guard.

**Cost of not doing it:** silently degraded `/ask` for the deploy window, invisible to every check
we have.

### 0.2 · Register misfiles (#57) — must precede any pool admission

Surface is now `source_type`, so a misfile is a routing decision. Confirmed:

| Work | Filed | Should be | Why it slipped |
|---|---|---|---|
| `spurgeon-comment` | commentary | theology | It is Spurgeon's *bibliography of other people's commentaries*. **Would enter the composed pool.** |
| `hort-james1909` | poetry | commentary | Title contains "Verse 7" |
| `bennett-expositor10` | historian | commentary | Title contains "Chronicles" |
| `chesterton-preexistence`, `tolstoy-confession`, `augustine-confess(ions)` | confession | theology | Word-match on creed/confession |
| `bett-methhymns`, `reeves-hymnlit`, `nutter-hymnwriters`, `hewitt-gerhardt` | hymn | theology | Studies *about* hymns |
| `brownlie-hyndbrow`, `winkworth-hyndwink` | hymn | (drop) | Indexes to hymn translations, not hymns |
| `schaff-person`, `wuttke-ethics1`, `rutherford-triumph` | historian | theology / commentary | Word-match on history |

Plus ~68 of the 508 `theology` defaults recoverable by second-pass rules (17 sermon, 19 historian,
22 devotional, 6 poetry, 4 commentary).

**A reclassification is a THREE-place write, and this is the trap:** `sources.source_type`,
`embeddings.source_type` (the surface router), and the flat rows' `source_id` key, which
`register-writer.ts:242` builds as `${sourceType}:${slug}:${n}` — so changing the register without
rewriting that key orphans the rows against `idx_embeddings_source`. Write one script that does all
three in one transaction, or leave the register alone.

**Deliverable:** `scripts/reclassify-register.mjs`, dry-run by default, with a red-proof that a
partial write (sources only) is detected and refused.

### 0.3 · Aggregates, duplicates, empty ingests (#59)

- `calvin-calcom` — 14 sections; it is the series landing page, not text. Quarantine.
- `augustine-confessions` (13 sections) vs `augustine-confess` (276) — same work, keep the split one.
- `schaff-history`, `edersheim-lifetimes` — ingested, 0 sections. Re-ingest or quarantine.
- **OWNER DECISION:** 13+ George MacDonald *novels* (`lilith`, `princessgoblin`, `backofnorth`,
  `sirgibbie`, `donal-grant`, `elginbrod`, …) are filed `theology`. Victorian fantasy, legitimately
  PD, in a theology lane on a Bible-study product. Keep / drop / own register. **Blocks nothing —
  they can ship unserved — but decide before they reach the pool.**

### 0.4 · `npm run audit` green, commit each of 0.1–0.3 separately

---

## PHASE 1 — VERIFY on dev, where the risky measurement belongs

Dev carries all ~900 works. **Every question about what admitting the corpus does to accuracy can
be answered here, before production is touched at all.** This is the phase that de-risks the whole
order, and it costs nothing but time.

### 1.1 · Apply 039 to dev, when the ingest is idle

`ADD COLUMN` takes a brief `ACCESS EXCLUSIVE` lock and `adapter-loop.ts` writes `embeddings`
continuously. Wait for it to drain (≈5h from 2026-08-03 19:45, ~500 works remaining) or stop it.

```bash
DATABASE_URL="$(cat ~/.neon_dev_owner_url)" node db/apply-migration-concurrent.mjs db/migrations/039_embeddings_served_column.sql
DATABASE_URL="$(cat ~/.neon_dev_url)" node scripts/verify-served-backfill.mjs
```

**Gate:** 7/7 green. Then `--red-proof` and watch it fail. A verifier not watched go red on the
real database proves nothing (THE_LOOP §4) — the throwaway run does not transfer.

### 1.2 · BASELINE the eval on dev, before admitting anything

Frozen v4, `web/src/scripts/eval-heldout.mts`. Bars pre-registered in `docs/HELDOUT_EVAL_DESIGN.md`.
Record verse-ref / pericope / epistle / topical / proper-noun / controls / no-content.

**This number is the whole point of the phase.** Without it, every number in 1.4 is uninterpretable.

### 1.3 · Admit ONE batch on dev

Start with the commentary/father works only — the composed pool is the sensitive surface; lanes
are retrieve-and-quote and cannot breach the wall. Flip them with `publish-flip.mjs` (which now
writes `served`).

### 1.4 · Re-run the eval. Decide.

- **Improves or holds** → proceed, widen the batch, repeat.
- **Regresses** → stop. The corpus is not automatically an improvement; 130 commentary works of
  uneven quality diluting a tuned 11-cohort pool is a real and expected outcome. Failure-code the
  misses per the `quality-slice` skill before changing anything.

**No production step depends on the answer being "improves."** Phase 3 ships the *mechanism*;
what is admitted is a separate, reversible flip.

---

## PHASE 2 — CONFIRM (gates, no database)

1. `npm run audit` — typecheck strict · lint · knip · deps · tests+coverage · web typecheck+lint · `next build`.
2. **`deep-audit` skill, 4–8 parallel lenses.** Required by CLAUDE.md before any production deploy
   and after any long autonomous run — both are true here. **Bylaw 4: I wrote 039, the verifier and
   the guard, so I may not be the one who certifies them.** Lenses that matter most for this change:
   data layer (the migration, index validity, lock behaviour), domain invariants (licensing — every
   path to a served row), AI pipeline (does the eval measure the shipped path), ops (deploy order).
3. Browser check at **390px and desktop**, real interaction, no console errors — `/ask`, a reader
   page, library. Screenshot, not "typechecks".

---

## PHASE 3 — DEPLOY (⚑ owner session #1, one sitting, ~45 min)

Six steps, in this order, no reordering:

| # | Step | Check before moving on |
|---|---|---|
| 1 | Apply `039` (expand) to prod | Every new index `VALID` and `READY` — the runner asserts it |
| 2 | `verify-served-backfill.mjs` on prod, read-only, `VERIFY_SERVED_ALLOW_PROD=1` | 7/7 green. **Served set identical to before.** |
| 3 | `/ask` smoke on the OLD bundle | Still answers. Both index sets live, old predicate still served by old index |
| 4 | `deploy.sh` | Deployment id recorded, alias moved |
| 5 | `/ask` smoke on the NEW bundle | Three attributed voices; `EXPLAIN` shows `idx_embeddings_served_legal` |
| 6 | Apply `040` (contract) | Old indexes gone; re-run step 5 |

**Rollback at every step.** 1–3: nothing user-visible, `040` never ran, old indexes intact.
4–5: redeploy the previous deployment id. 6: rebuild the old indexes from 018/037 (the only step
with a real undo cost, which is why it is last and behind a confirmed-live check).

---

## PHASE 4 — CATCH UP the corpus (⚑ owner session #2, repeatable)

Ingest finishes at ~900 works; production is at 124. The loop, once per batch:

```bash
node scripts/build-sweep.mjs                      # regenerate from dev, not from memory
node scripts/corpus-copy.mjs --slugs=…            # ⚑ owner go
node scripts/publish-flip.mjs --slugs=…           # ⚑ owner go — now writes `served` too
```

**`039` must be on prod before the first of these**, or the flip's `served` UPDATE errors and rolls
back the whole transaction. It fails closed, which is correct, but it wastes a session.

Re-run the eval after each batch that adds commentary/father works. Record in `WORKLOG.md` —
CLAUDE.md requires an accuracy number on every retrieval change, and admitting works to the pool
is a retrieval change.

**Not coming through this pipeline, and not to be forgotten:** 5 CrossWire/TCP commentaries with no
adapter · `vincent-word-studies` (absent from CCEL) · `spurgeon-treasury` (page scans) · 8 works
held by quality rulings · 30 works with live copyright claims (`ccel-survey-all.json`).

---

## PHASE 5 — RECORD (bylaw 1: not in the repo, never happened)

- `WORKLOG.md` — the session, both eval numbers, the 039 expand/contract defect and its catch.
- `docs/pm/MASTER.md` — a new gate row; A8 is closed and this is not A8.
- `docs/DECISIONS.md` — ADR: serving is a materialized column, publish-flip is its only writer.
- `docs/STATE_OF_TRUTH.md` — works published, works served, the two numbers now equal.
- **Failure-mode watchlist** — the twelfth instance, and a note that its *guard* enforced the
  treadmill for six months while staying green. That is the transferable lesson, not the count.

---

## Deferred deliberately

**#58, under-split reader sections.** 214 works average >12k chars/section; `schaff-encyc01` is 9
sections with one of 2.5 MB. Retrieval is unaffected (the flat store chunks at 1,200). It is a
**reader** defect and it is real, but it is orthogonal to everything above and shipping it inside
this order would couple a data-quality fix to a retrieval cutover. Separate slice.

---

## Dependency graph

```
0.1 expand/contract ──┬─→ 1.1 dev apply ─→ 1.2 baseline ─→ 1.3 admit ─→ 1.4 eval
0.2 registers ────────┤                                        │
0.3 aggregates ───────┘                                        │
                                                               ▼
                          2. audit + deep-audit + browser ─→ 3. PROD ─→ 4. catch up ─→ 5. record
```

0.2 and 0.3 are independent of each other and of 0.1; all three block Phase 1. Phase 4 is the only
phase that repeats.

## Owner decisions this order needs

| # | Decision | Blocks | Can proceed without? |
|---|---|---|---|
| 1 | MacDonald's novels — keep, drop, or own register | 0.3 | Yes, they ship unserved |
| 2 | Go for prod session #1 (six steps above) | Phase 3 | No |
| 3 | Go for each copy/publish batch | Phase 4 | No |
| 4 | If 1.4 regresses: tune, or ship the mechanism and admit nothing yet | 1.4 | Decide when measured |
