# Work Order — Phase A (Retrieval: the ≥2-voices guarantee)

**The bar is the product guarantee, not a target.** Ancient Paths promises **≥2–3 grounded, attributed voices**. Anything less on a doctrine query is the product failing its defining promise. **There is no beta. Production grade only. The bar does not move.**

**Gate:** `topical HIT@2 ≥85%` AND `epistle HIT@2 ≥85%` on a **fresh, never-tuned held-out set**, with **no regression** on verse-ref / pericope / proper-noun / controls / no-content.

**Current:** topical **70%**, epistle **64%** (v3, out-of-sample).

---

## 0. Blocking prerequisite — the eval/production divergence

The eval measures **pure-vector over a legal author filter**; production runs **hybrid_search over the full corpus**. **Every Phase A number is fiction until these are one code path.** Unify them (single-sourced) before any fix is measured, or you are tuning a lab configuration that no user will ever hit.

**Status: DONE (2026-07-11, `e5677a0`).** Single-sourced `LEGAL_CORPUS_FILTER` + `legalBasePoolSql()` in
`web/src/lib/teacher/routing.ts`; **both** production `retrieveCommentary` and the eval `retrieveLegal` import
and call it — the base pool is now byte-identical. Hybrid BM25 dropped (owner-measured no-loss: vector 97% ≈
hybrid 97%; reranker carries the lift). Re-measured through the unified path: **frozen v2 = 65/72 (identical),
v3 = 95/87/70/70/64 (identical)** — held by construction, no tuning. Real `retrieveCommentary` confirmed
legal-only over 8 diverse queries. Deployed to prod. **All Phase A numbers below are now on the real path.**

**Licensing-manifest disagreement → PARKED (§6) — a licensing boundary; not guessed.**

---

## 1. The diagnosed gap (14 failures — do not re-diagnose from scratch, build on this)

| Bucket | n | What's happening | Known fix | Status |
|---|---|---|---|---|
| **surfaced = 1** | 7 | Right passage reaches top-6, but only **one author** on it. The 2nd voice exists in the corpus but never enters the candidate pool. | **Per-passage cap** in selection. *(The first attempt capped per-**author** and flooded the top-6 with one chapter — regressed topical 65→50. The correction is per-**passage**, preserving cross-passage coverage.)* | |
| **surfaced = 0** | 7 | The on-doctrine passage **never reaches top-6** — the reranker drifts to a semantically similar wrong passage on abstract terms (perseverance, glorification, effectual calling). | **Doctrine→passage routing** from an **independent** source. **NEVER build this from the catechism eval labels — that is circular and makes the number meaningless.** | |

---

## 2. Attempt log — **every attempt, including failures. This is the point of the doc.**

For each attempt: the hypothesis, the exact change, the measured result on the frozen set, the verdict, and what the failure *taught* you. A failed attempt that produces a sharper diagnosis is progress. A failed attempt that isn't recorded is waste.

### Attempt N
- **Hypothesis:**
- **Change (files, one-line summary):**
- **Measured (whole frozen set — all categories):** topical __ · epistle __ · verse-ref __ · pericope __ · proper-noun __ · controls __ · no-content __
- **Verdict:** improvement / regression / no-change
- **What it taught:** *(the diagnosis this failure sharpens — the next attempt must build on it)*
- **Reverted?**

---

## 3. If retrieval hits a wall — the corpus is the answer, not the bar

If the diagnosis shows the remaining failures are passages where **fewer than 2 PD authors exist in the corpus**, that is a **content** problem, not a retrieval problem. **Do not lower the bar. Do not redefine the metric.** Report the exact passages and author counts, and recommend the specific commentators to ingest to close it. Adding voices is the fix; moving the goalposts is not.

*(Note: the last `≥2-available` diagnostic said every label had 4–9 authors available — so this wall is not currently expected. If it appears, prove it with numbers.)*

---

## 4. Final gate (fresh v4 — v3 is now a dev set)

Mint a **fresh v4 held-out**: same methodology, stratified sampling, **authority-fetched** doctrinal labels (never from memory — park if the authority is unreachable), disjoint from v2 and v3, **frozen + hashed before any number exists**. Run **once**.

| category | metric | bar | v4 | verdict |
|---|---|---|---|---|
| topical | HIT@2 | ≥85% | | |
| epistle | HIT@2 | ≥85% | | |
| verse-ref | HIT@1 | ≥85% (no regression) | | |
| pericope | HIT@1 | ≥70% (no regression) | | |
| proper-noun | HIT@1 | ≥70% (no regression) | | |
| controls | hijacks | 0 | | |
| all | no-content | ≤8% | | |

---

## 5. Bugs found (including ones you did NOT fix)

| Bug | Where | Severity | Fixed? | Commit / why not |
|---|---|---|---|---|

---

## 6. Forks parked

**LICENSING-MANIFEST DISAGREEMENT (parked — do not guess a licensing boundary).**
- **The disagreement:** `ingest/sources.config.json` (the Gate-B licensing authority) records **5 works** —
  Gill / JFB / Clarke / Matthew Henry (helloao PD) + Barnes (biblehub provenance). But the operative legal
  filter now in production (`LEGAL_CORPUS_FILTER`) admits **9 authors** — it adds **John Wesley, John Calvin,
  John Chrysostom, Augustine of Hippo** and **CrossWire-Barnes**, none of which have a manifest license record.
- **So production serves 4 authors + a re-sourced Barnes with NO machine-checkable license entry.** Their
  licensing was established only in prior-session ROADMAP prose (Wesley/Calvin/Barnes = CrossWire
  `DistributionLicense=Public Domain`; Chrysostom/Augustine = PD text verified vs New Advent NPNF/ANF **but
  carrying `historicalchristian.faith` provenance, repair pending**).
- **Options:** (a) extend the manifest to the 9-author set with each work's confirmed license + provenance
  (the honest fix — but it asserts the licensing of the historicalchristian.faith patristic, which I will not
  guess); (b) narrow the filter to the 5 manifest works (drops Wesley/Calvin/Barnes/patristic → **changes the
  measured number**, a real accuracy cost); (c) leave as-is (documented gap).
- **Recommendation:** (a) — but only after the owner/authority confirms the license class + a clean provenance
  for Wesley, Calvin, Chrysostom, Augustine, and CrossWire-Barnes (esp. repairing the patristic provenance to
  New Advent). **This is a production-blocker for a licensing-clean launch** (also raised in the Phase-B audit,
  item 6). **Need:** owner confirmation of the 9-work license records, then I reconcile the manifest ↔ filter
  under one source of truth.

---

## 7. Risks

*(Anything that worries you. Say it plainly.)*
