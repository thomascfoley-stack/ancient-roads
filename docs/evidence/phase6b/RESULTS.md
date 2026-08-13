# FROZEN_V4 held-out eval — post-Phase-6b flip, against DEV (2026-08-13)

**Why this run exists.** Phase 6b (corpus-backlog decision 9a; ADR-044 option (1)) flipped 4,174
forbidden-provenance `embeddings` rows (John Chrysostom 2,515 + Augustine of Hippo 1,659,
`historicalchristian.faith`) from `served=true` to `served=false` on dev and prod. CLAUDE.md:
"Re-run the accuracy diagnostic on every retrieval change and record the number." ADR-044 gated
the exclusion on exactly this eval; its blocker (no `DEEPINFRA_API_KEY` on the machine) is stale —
the key is in `web/.env.local` now. This is the discharge run.

**Target: DEV** (`ep-tiny-hat-atdgpisx`), read-only. The eval (`web/src/scripts/eval-heldout.mts`)
is documented READ-ONLY and was observed to issue only SELECTs plus DeepInfra embed/rerank calls.

**Set integrity.** `npx vitest run test/heldout-frozen-hash.test.ts` → 2/2 green immediately before
the run. The frozen query file and labels were not touched. Run command:

```
export DATABASE_URL="$(grep '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2-)"   # root .env.local = dev
cd web && npx tsx --env-file=.env.local src/scripts/eval-heldout.mts --v4
```

(First attempt failed before any DB contact: `set -a; . ./.env.local` silently drops
`DATABASE_URL` because the value contains an unquoted `&` — bash backgrounds the assignment.
Fixed by exporting via `grep|cut`; no secret value was printed by the run.)

**Pool state verified on dev immediately before/after the run (read-only):**
Chrysostom served=8,912 / unserved=3,712 · Augustine served=5,059 / unserved=2,629 ·
**0 served rows carry `historicalchristian.faith` provenance** · 0 served `source_type='historian'`
rows (the uncommitted historian-lane edits in the working tree's `routing.ts` therefore had no
effect on this run; `LEGAL_CORPUS_FILTER` is `(served)` at HEAD and in the working tree alike).

## Result (verbatim tail; full per-query log in `heldout-eval-post-6b-20260813T042458Z.log`)

```
category        n   HIT@1  HIT@2   pass / <2 / wrong / none
  verse-ref     40   100%  100%    40 / 0 / 0 / 0
  pericope      15    80%  100%    15 / 0 / 0 / 0
  epistle       25    84%   96%    24 / 0 / 1 / 0
  topical       20    85%   95%    19 / 0 / 1 / 0
  proper-noun   10    60%  100%    10 / 0 / 0 / 0
  control       10   clean 10/10  hijacks=0
TAG corpus=legal(shared) pool=20 ef=64 cap=2 :: topicalH2=95 pericopeH1=80 epistleH2=96 verserefH1=100
```

No DeepInfra 429s; no retries fired.

## Against the pre-registered bars and both prior v4 measurements

| category | metric | bar | v4 frozen 2026-07-18 | v4 post-A8 2026-08-02 (prod) | **v4 post-6b 2026-08-13 (dev)** | verdict |
|---|---|---|---|---|---|---|
| Canon-coverage verse-ref | HIT@1 | ≥ 85% | 100% | 100% | **100%** | clears |
| Held-out pericopes | HIT@1 | ≥ 70% | 80% | 73% | **80%** | clears |
| Proper-noun / rare | HIT@1 | ≥ 70% | 60% **MISS** | 70% | **60%** | **below bar — same point estimate as the frozen July run** |
| Topical | HIT@2 | ≥ 85% (GA) | 90% | 90% | **95%** | clears |
| Epistle | HIT@2 | ≥ 85% (GA) | 100% | 100% | **96%** | clears |
| Negative controls | hijacks | **0** | 0 | 0 | **0** | clears |
| Corpus sufficiency | no-content | ≤ 8% | 0 | 0 | **0** | clears |

## Delta reading — does the exclusion degrade any gated category below its bar?

**No gated category newly fails because of the flip.** Every core beta gate that cleared in the
frozen 2026-07-18 run still clears, and the two GA-bar strata (topical/epistle HIT@2) remain above
85. Point-by-point:

- **proper-noun 70 → 60 (HIT@1)** is the only below-bar number, and it is **one query at n=10**
  (10 points per query). It returns to exactly the frozen July baseline (60), which ADR-028 already
  ruled an **accepted limitation for gated beta and blocking for public launch** pending a
  re-measure at larger n. The post-A8 70 was a one-query improvement, not a new plateau. All 10
  proper-noun queries still pass HIT@2 (≥2 distinct-author voices) — the moves are in top-1
  ordering, not in whether the voices are found. Attributing the single flipped query to the
  Chrysostom/Augustine exclusion versus provider-side embedding/rerank drift is not possible at
  this n without repeated runs; the proper-noun labels are OT-narrative figures (Achan, Endor,
  Naboth, Nehushtan…), passages where the excluded fathers' homilies were never the label content.
- **epistle HIT@2 100 → 96** is one query (v4-ep-17, "psalms and hymns and spiritual songs",
  wrong-passage) at n=25 — 4 points per query. Still above the 85 GA bar. The failure code is
  wrong-passage, not no-content: the pool still holds on-label content; retrieval ordered off-label
  material first. Reported, not tuned against.
- **topical HIT@2 90 → 95** and **pericope HIT@1 73 → 80** are single-query improvements in the
  other direction — further evidence that ±1-query noise dominates these strata (topical n=20,
  pericope n=15; the design doc already warns their CIs straddle their bars).
- **verse-ref 100, controls 10/10 clean with 0 hijacks, no-content 0/110**: unchanged. The
  exclusion did not hollow out any passage into a no-content miss — consistent with the post-flip
  pools still holding 8,912 Chrysostom + 5,059 Augustine served rows from clean provenance.

**Caveats that travel with these numbers** (from `HELDOUT_EVAL_DESIGN.md` §v4 and
`STATE_OF_TRUTH.md` §1, still in force): point estimates whose 95% CIs straddle their bars are not
proven above them; v4's KJV-phrase-anchored labels make the doctrinal strata easier than v3's
abstract style, which remains unexercised; v4 samples zero Song of Solomon, so no-content=0 does
not clear the known SoS hole; 26% of v4 labels also appear in v3. **Additional confound specific
to this run:** the baseline being compared against (2026-08-02) was measured on **production**
pre-flip, and dev today is under concurrent Phase 2–5 work — the comparison answers "did the flip
break a gate" (it did not), not "every point of delta is the flip's effect."

## Faithfulness axis (interpretation_bait) — NOT run, with reason

`eval-heldout.mts` covers retrieval accuracy only; the design doc scopes faithfulness out as a
separate gate. The permanent bait harness (`docs/BAIT_HARNESS.md`) runs through the **live HTTP
endpoint** `web/src/app/api/eval/bait/route.ts` gated by `EVAL_HARNESS_SECRET`. That secret is
absent from `web/.env.local` in this worktree (the route fails closed with 503 by design) and no
dev server is running here — a localhost run is never a production measurement anyway. Skipped for
that reason; the last certified number remains 35/35 live (2026-07-11, ~92% lower bound at n=35).
If the owner wants the faithfulness side re-certified against the post-flip pool, it needs
`EVAL_HARNESS_SECRET` plus a running server, or `BAIT_URL` pointed at a deployed host.
