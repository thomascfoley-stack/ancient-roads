# PRE-REGISTRATION — W-PN20, ADR-118 proper-noun held-out set

**Registered 2026-08-22, before any measurement.** Committed ahead of the first eval run per
docs/pm/orders/2026-08-22-autonomous-swarm-closeout.md §2.4 and the W-PN20 brief (§6).

## The claim under test

ADR-118 (docs/DECISIONS.md, ruled 2026-08-21, bar amended 2026-08-22) gates public launch on:

> **Proper-noun HIT@2 ≥ 90% on the POINT ESTIMATE at n = 20 fresh cases — pass requires 18/20.**
> The 95% CI lower bound is reported alongside and is NOT what the gate compares against.

This item mints the n=20 fresh set (it does not exist today) and measures the shipped retrieval
path against it. It tunes nothing: the number is reported, not fixed (merge rule in the brief).

## Measurement method

- Harness: the existing shipped-path harness `web/src/scripts/eval-heldout.mts`, extended with a
  `--pn20` flag that selects the new set — the same code path that produced the v4 run
  (docs/evidence/eval-v4-post-a8-2026-08-02.md). It runs queries through the SHARED production
  routing path (`web/src/lib/teacher/routing.ts`: legal base pool → inject → merge → rerank →
  floor → backfill → selectDiverse) at the shipped constants (K=6, CANDIDATE_POOL=20, ef=64,
  corpus=legal(shared)). Read-only against **dev** (`ep-tiny-hat`, via `web/.env.local`).
- Case file: `web/src/scripts/heldout-pn20-queries.mts` (`FROZEN_PN20`), same `Q[]` format as
  `heldout-v3/v4-queries.mts`. Filed beside the sets the harness imports — NOT under
  `evals/cases/`, which holds YAML for a different runner (`src/evals/run.ts`); the brief's
  "reuse its format" is the binding clause. Deviation recorded in the status file.
- Freeze discipline: the case file is content-hashed and pinned in
  `test/heldout-frozen-hash.test.ts` BEFORE the first measurement, exactly as v3/v4.
- Label reproducibility: STATE_OF_TRUTH §1 caveat 4 records that the label anchor-check script
  was never committed. This item writes `web/src/scripts/heldout-anchor-check.mts`, which
  mechanically verifies every anchor phrase cited in a case's `source` field against the in-repo
  KJV (`web/public/bible/kjv`), for the pn20 set AND for v4's epistle/topical/proper-noun
  anchors. It is committed with a red-proof before measurement.
- Concurrent mutation: the DB-writer lane mutates dev during the run (§5.1). Served-pool counts
  (`embeddings WHERE user_id IS NULL AND served`, total / by source_type / distinct works) are
  snapshotted at measurement start AND end and recorded in RESULT.md.

## Sampling rule

20 proper-noun queries (Bible persons), each naming an entity and its defining episode, in the
style of the prior proper-noun strata. Drawn from entities covered by the served corpus and
**author- and passage-disjoint from the pilot, v2 (frozen), v3, and v4** per ADR-118 §3.

**Exclusion list — every prior proper-noun case is burned. Explicitly excluded:**

- v4 (burned per the brief, named one by one): Achan (Josh 7), Mephibosheth (2 Sam 9), witch of
  Endor (1 Sam 28), Apollos (Acts 18 / 1 Cor 3), Demas (2 Tim 4 / Col 4), Jephthah (Judg 11),
  Rechabites (Jer 35), Agrippa (Acts 26), Naboth's vineyard (1 Kgs 21), Nehushtan (2 Kgs 18).
- v3: Enoch, Deborah, Gehazi, Nebuchadnezzar, Simeon & Anna, Nathanael, Ananias & Sapphira,
  Dorcas/Tabitha, manna & quail, bronze laver.
- v2/frozen: Rahab, Barnabas, Cornelius, Lydia, Urim & Thummim, Nazirite vow, Esau's birthright,
  leviathan & behemoth, the ephod, Gog & Magog.
- pilot: Melchizedek, Onesimus, Nephilim.
- older diagnostic sets (eval-retrieval / eval-failure-codes / eval-legal-corpus, not frozen
  held-outs but equally un-fresh): Nicodemus, Jonah/Nineveh, burning bush, David & Goliath,
  Samaritan woman, Damascus road, Abraham/Isaac, Jacob's ladder, Joseph's coat, Ruth & Naomi,
  Solomon's wisdom, Zacchaeus, woman caught in adultery, Stephen, Ethiopian eunuch, Bartimaeus.

**Passage-disjointness:** no pn20 label uses a chapter that appears in ANY prior set's
`expected` list (verified mechanically at mint time by the anchor-check script's label table and
recorded in RESULT.md). Consequences of the v4 exclusions, as examples: 2 Kings 5 is out (Gehazi
→ Naaman is out); Acts 18 is out (Apollos → Priscilla/Aquila is out); Acts 10 is out (Cornelius).

## Labeling rule

Labels are objective verseId chapter ranges derived from the query's own scripture, never from
retrieval output — the v4 discipline (HELDOUT_EVAL_DESIGN.md §v4). Each case carries a `source`
field citing a KJV anchor (book-chapter:verse + quoted phrase); the anchor phrase MUST occur in
every labeled chapter, verified mechanically against `web/public/bible/kjv` by
`heldout-anchor-check.mts` before the freeze. A case whose anchor fails at mint is corrected
BEFORE freezing; after the freeze there is no relabel path (a correction is a new file + new pin).

**Scoring (matches ADR-028 / ADR-116 and the harness's existing code, eval-heldout.mts):**
- **HIT@1**: the rank-1 returned voice's verseId falls in the labeled range.
- **HIT@2**: the returned top-K voices include on-target voices from **≥ 2 distinct authors**
  (the "two voices" guarantee; HIT@2 is the gated metric per ADR-116).
- Failure codes (reported, not tuned): `pass` / `<2-voices` / `wrong-passage` / `no-content`.

## Bar and statistics

- **Bar: HIT@2 point estimate ≥ 90% at n=20 → PASS iff ≥ 18/20.** Below 18/20 the item reports
  LAUNCH-BLOCKER-CONFIRMED in its status file; no retrieval tuning under this item.
- HIT@1 is measured and reported (it is not the gate).
- 95% CIs (Wilson score interval) reported for both metrics; not gated (ADR-118).

## Withdrawal conditions

- Capture incomplete (`complete: false` in the harness's whole-capture file) → run is void,
  reported NOT RUN, never reported as a result.
- A label found wrong AFTER the freeze → the case stays, is scored as frozen, and the defect is
  reported in RESULT.md; no in-place edits (THE_LOOP rule 5).
- Dev DB unreachable, or env carries a forbidden host → NOT RUN, never fabricated.
- Served-pool snapshot drift between start and end is reported with both snapshots; it does not
  void the run (readers must expect drift, §5.1) but is disclosed alongside the number.
- If the number lands below bar: report LAUNCH-BLOCKER-CONFIRMED. Remedies (re-run with more
  cases, owner amendment) are the owner's, per ADR-118's no-softening ruling.
