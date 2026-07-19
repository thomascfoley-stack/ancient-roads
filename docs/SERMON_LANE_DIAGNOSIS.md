# Sermon-lane Step 1 diagnosis (2026-07-18) — the premise is falsified

Following the `quality-slice` skill: diagnose before building. I ran 6 pool
configs through the SHIPPED retrieval path (read-only `--exclude-*`/`--work-cap`
knobs on `legalBasePool`, default off = production SQL) on the v3 broad axes.

## The data (v3, pool=20, ef=64, rerank on)

| Config | topical HIT@2 | epistle HIT@2 | proper-noun HIT@2 |
|---|---|---|---|
| **v3 baseline (recorded 2026-07-14)** | **70** | **88** | **90** |
| BASE — full corpus (all 14 works) | 45 | 72 | 80 |
| exclude sermons (source_type) | 55 | 64 | 80 |
| legacy commentary only (exclude all 14) | 50 | 72 | 90 |
| legacy + clean fathers only | **60** | **76** | — |
| exclude sermon + theology | 60 | 64 | — |
| full corpus + per-work cap=3 | 55 | 68 | 80 |

Failure codes (BASE): topical 9 pass / 10 wrong-passage; epistle 18 pass / 6
wrong. Excluding sermons moved epistle to 16 pass / **8 wrong** — i.e. removing
sermons made epistle find the WRONG passage MORE often.

## Three findings that overturn the plan's premise

**1. It is NOT purely the sermon flood.** Removing sermons *helps* topical
(45→55) but *hurts* epistle (72→64, wrong-passage 6→8) — sermons were supplying
correct-passage epistle voices. And no config that keeps the other new prose
reaches baseline. The mechanism is "the whole prose expansion shifts broad-query
ranking," not "Spurgeon floods everything." The proposed fix (move sermons to a
lane) is therefore NOT targeted to the confirmed mechanism, and would regress
epistle.

**2. The recorded baseline (70/88) is not reproducible on the current corpus.**
Best achievable in any tested config: topical 60, epistle 76 (legacy + clean
fathers). The gap is explained by things that changed the LEGACY pool since
2026-07-14, independent of the new works:
- **B2 correctly removed the historicalchristian.faith Chrysostom/Augustine rows**
  (56k) that were IN the recorded-baseline pool and covered epistle/topical
  verses. Those are forbidden provenance — they cannot and must not come back.
  The clean NPNF replacements cover different verses (Mt/Jn/Ps).
- The **v3-tp-12 RELABEL was removed** in A6 (it was derived from retrieval
  output — circular). That legitimately changes topical scoring.
So the recorded 70/88 was partly propped up by content that is now correctly
gone. It is not an honest target.

**3. The v3 broad axes are too noisy to be a ship gate.** n=20 (topical) / n=25
(epistle); the recorded baseline's own 95% CIs are **topical [48,86]** and
**epistle [70,96]** (CLAUDE.md). The best config (60/76) sits INSIDE both CIs;
BASE topical 45 is just below the CI floor. Most config differences here are
within noise — you cannot distinguish 70 from 60 at this n. CLAUDE.md already
flagged this and called for a larger v4.

## Why I stopped here (per the skill)

"Diagnose before fixing — do NOT build until the fix is targeted to the confirmed
mechanism" and "if it can't clear the bar, STOP and surface the number + options,
never tune to pass." The confirmed mechanism is not the one the plan assumed, the
pre-registered bars (70/88) are unreachable on the cleaned corpus, and the
instrument is too noisy to gate on. Building the lane + tuning to hit 70/88 would
be tuning to a burned, noisy, partly-invalid target. That is the exact failure
the skill exists to prevent.

## Recommended revised plan (for owner sign-off)

The sermon lane is still worth building — sermons ARE a distinct register, Spurgeon
genuinely dominates the exegetical pool, and you want it as the sermon-search
primitive. But the ship gate and the target need to change:

- **Build the sermon lane** (Step 2) as planned — architecturally right regardless
  of the v3 number; extend the register wall to sermons.
- **Set the exegetical pool to its best-measured composition**: legacy commentary +
  clean fathers + the verse-anchored new commentary (K&D), with sermons AND
  systematic-theology (Owen/Hodge/Calvin-Institutes — these are topical treatises,
  not verse-commentary) routed to their own lanes, not the exegetical pool.
- **Replace the target**: the honest reproducible ceiling is ~60/76 on v3's broad
  axes (within the baseline CI). Pre-register v4 bars at the honest level, NOT the
  unreproducible 70/88 — OR fund a real retrieval upgrade (hybrid BM25+vector,
  a stronger reranker, or query-type routing) if you want to beat it.
- **Build a LARGER fresh v4** (n≈50+ per broad stratum) so the CI is tight enough
  to actually distinguish these differences — the v3 broad axes cannot gate this.

The open decision for you: (a) accept the honest bar (~60/76) and ship the lane +
best-pool config on a larger v4; or (b) invest in a retrieval upgrade to push broad
accuracy higher before shipping the full corpus into /ask; or (c) keep decision-(b)
from go-live (reader = full corpus, /ask = commentary baseline) until the upgrade
lands. I did not tune to pass and did not build a fix aimed at the wrong mechanism.
