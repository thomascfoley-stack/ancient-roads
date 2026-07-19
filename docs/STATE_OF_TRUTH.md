# STATE OF TRUTH — where the project actually is, verified (2026-07-15)

One page an agent can read cold to know the real state. **Every row was checked against the running system**
(read-only prod SQL via `scripts/ground-truth.mjs`), the code, or git — not against memory or another doc. Where
a canonical doc disagreed with reality, the doc was corrected and the correction is listed in §6 with its proof.

Method: `node scripts/ground-truth.mjs` (read-only, no DDL, no secrets) + `git log` + file reads. Re-run
`ground-truth.mjs` to reproduce the prod rows; it prints a claim/source/expected/actual/verified table.

---

## 1. Retrieval accuracy — ⚠️ THIS TABLE IS SUPERSEDED (kept for history)

> **Corrected 2026-07-19.** This section used to be headlined "the numbers that are TRUE right now"
> while a bullet at the bottom of the very same section said the numbers had moved. An agent reading
> this page cold took the headline, not the footnote. **The CURRENT numbers are in `WORKLOG.md`
> 2026-07-18** (the option-(c) lane config: the honest v3 baseline — v3 is now a **dev set**, measured
> against repeatedly, never gated on — plus the frozen v4 run and its caveats below).

**Historical source: `docs/PHASE_A_CLOSE.md` §5 (2026-07-14), frozen v3 held-out, measured read-only through
`lib/teacher/routing.ts` on the shipped un-starved path (`pool=20, ef=64, cap=2`).** These superseded the
2026-07-13 figures that CLAUDE.md/ROADMAP carried until that reconcile (§6), and were in turn superseded by the
2026-07-18 option-(c) measurement.

| category | n | HIT@1 | HIT@2 | role |
|---|---|---|---|---|
| verse-ref | 40 | 95% | 98% | **hard gate** |
| pericope | 15 | 87% | 100% | **hard gate** |
| proper-noun | 10 | 80% | 90% | **hard gate** |
| epistle | 25 | 72% | 88% | diagnostic (not a gate) |
| topical | 20 | 35% | 70% | diagnostic (not a gate) |
| control | 10 | clean 10/10 | hijacks=0 | guard |

- **Topical HIT@2 is 70, and 70 is NOT an improvement.** The earlier 75 was a 5-doc-pool artifact (the reranker
  had almost no pool); filling the pool to 20 surfaced the honest read (70). Do not file topical as "improved."
- **Epistle/topical are diagnostic, not gates** (ADR-022). At n=25/20 the 95% CIs — epistle ≈ [70, 96], topical ≈
  [48, 86] — both span 85, so neither is measurably at/below 85. **Unmeasurable at these n, not failed.** The
  honest next step is a larger v4 (n≈100/stratum) or a label-free gate (≥2 distinct grounded voices).
- **No longer current (2026-07-18):** the "git log … EMPTY" claim this line used to make is false — the
  `reconcile` branch changed retrieval (the sermon/theology register-lane architecture, ship option (c),
  ADR-023; 21 commits touch those paths). The current numbers live in **WORKLOG 2026-07-18**: the honest
  option-(c) v3 baseline (v3 is now a dev set) + the frozen v4 run.

- **v4 "clears every pre-registered bar except proper-noun" — the four caveats that must travel with that
  sentence** (added 2026-07-19; this page previously stated the headline with none of them, which reads far
  stronger than the evidence supports):
  1. **"Clears" means the POINT ESTIMATE clears, not proven-above.** Topical 90 and pericope 80 are point
     estimates whose 95% CIs **straddle their own bars** — not measurably above them.
  2. **v4's labels are KJV-phrase-anchored**, which makes the doctrinal strata *easier* than v3's abstract
     queries. The abstract-topical failure mode — the one v3 actually exposed — **is not exercised by v4.**
  3. **v4 samples ZERO Song of Solomon**, so `no-content 0/110` does **not** clear the known SoS hole
     (zero served exegetical rows for SoS remains an open gap). **And the hole is worse than
     "coverage" (verified 2026-07-19, ADR-028):** 0/4 SoS queries reach the no-content fallback —
     retrieval has no relevance floor, so SoS returns six NON-SoS sources (Barnes/Wesley on the New
     Testament, Chrysostom on Matthew/John/Acts). The user is still safe today only because the
     **verifier** rejects the result downstream. Evidence:
     `docs/evidence/part4/sos-fallback-verification.txt`.
  4. **The "disjoint" claim is overstated** — `HELDOUT_EVAL_DESIGN.md` asserts v4 is disjoint from v3 while
     its own caveats say otherwise, and the ADR-024 label anchor-check script was never committed, so v4
     label verification **is not reproducible from this repo**.

**Faithfulness (separate axis):** `interpretation_bait` 35/35 = 100% live through real `teach()`→verify, 0
breaches (PHASE_A_CLOSE §7). That is a **95% lower bound of ≈92%** (rule of three on n=35), **NOT ≥99%** — the
≥99% DoD needs ~300 clean cases. CLAUDE.md already states this correctly.

## 2. Corpus & prod DB — verified rows (`ground-truth.mjs`, 2026-07-15)

| fact | value | verified |
|---|---|---|
| Legal commentary authors served | **9** (Gill, JFB, Clarke, Henry, Barnes, Wesley, Calvin, Augustine, Chrysostom) | ✅ |
| `commentary_entries` | **371,406** rows | ✅ |
| commentary `embeddings` (user_id IS NULL, source_type='commentary') | **190,635** rows | ✅ |
| user rows in `embeddings` | **0** — no user row can be served as corpus | ✅ |
| vector index | **HNSW** present, ivfflat absent | ✅ |
| partial legal HNSW `idx_embeddings_vector_legal` (mig 012) | exists + `indisvalid=t` | ✅ |
| partial legal FTS `idx_commentary_fts_legal` | exists | ✅ |
| `legalBasePool(50)` | returns **50** (starvation fixed) | ✅ |
| `sources` / `sections`≈`section_anchors`≈`section_embeddings` (Barnes pilot) | 2 / **5,510 each** (equal invariant holds) | ✅ |
| App runtime connection | connects as **`app_runtime`**, `rolbypassrls=false` (RLS not bypassed) | ✅ |

## 3. Bible text plane — served from files, NOT a prod DB schema

- **No `translations`/`verses`/`books` tables exist in prod** (`SELECT 1 FROM translations` errors). Bible text
  is static JSON under `web/public/bible/`, fetched client-side. `docs/SCHEMA.md`'s relational Bible framing is
  aspirational, not deployed.
- **18 translations ship** (akjv, anderson, asv, bbe, bsb, darby, geneva, kjv, lsv, nheb, noyes, rotherham,
  rwebster, tyndale, ukjv, web, webster, ylt) — **not 22**. The license gate removed 4 (jubilee, leb, litv, mkjv;
  verified gone from `web/public/bible/`). Removed dirs are gitignored → reversible via re-ingest, not git.

## 4. Gates & safety — what's shipped and what's open

- **License gate (`web/src/lib/licensing.ts`, shipped 2026-07-14):** per-work `{license, commercial_use, source,
  verified_on}`; **block-by-default** — allow ships, conditional ships only if id ∈ `LICENSE_ACK`, deny/unknown/
  no-record block. `predeploy-gate.ts` reads it; the gate is **blind to UGC by construction** (imports no DB
  handle/blob store — red-proven in `gate-ugc-blindness.test.ts`). LITV/MKJV deny, LSV allow, LEB conditional,
  jubilee unknown→deny.
- **Verifier hole closed (PHASE_A_CLOSE §7):** `passages_grounded` grounds a passage **only** on source anchors
  (soft-boost `queryRanges` removed as an auth boundary); anchors must intersect their cited section
  (`anchor_offbase`). src↔web byte-identical.
- **CVE gate (`scripts/deps-audit.mjs`, 2026-07-14):** npm's retired audit endpoint (410) is bypassed via the
  bulk advisory endpoint; fails on un-ignored high/critical; honors `pnpm.auditConfig.ignoreGhsas`.
- **Phase A: CLOSED (2026-07-14).** Hard gates hold with no regression; deploy is permitted by the license gate.
- **Deploy (updated 2026-07-18):** real prod = the git-DISCONNECTED Vercel project **`web`**, serving
  **ancientpaths.app**; last deploy **`24677ba`** (2026-07-18, hero + nav labels). Deploys happen ONLY via
  `./deploy.sh` (`vercel --prod` from a clean worktree) — pushing `main` deploys nothing (see
  `docs/DEPLOYMENT.md`). SEC-1 gates public launch.

## 5. Sermon search — designed & measurement-proven, NOT built

- `docs/SERMON_SEARCH_DESIGN.md` is the approved design (two spines, three modes, per-user brute-force + HNSW
  tripwire, model parity, trust boundary). **No user-corpus code or tables exist yet.**
- **Slice 0 (2026-07-14, frozen harness):** uncited-quote anchor **recall 90% chapter-level on a held-out n=30**
  (27/30, 95% CI [74, 96]) — clears the ≥70% bar with the CI lower bound above it. **Precision** trade curve:
  K=1 33% / K=2 68% / K=3 96%; recall K=1 93% / K=2 82% / K=3 75%. **Both bars (recall ≥70, precision ≥60) clear
  at K=2 and K=3** → Slice 1 is justified. Slice 1 (one type end-to-end) is the next build.

## 6. Corrections made this pass (doc → reality), with proof

| # | doc:claim (before) | corrected to | proof |
|---|---|---|---|
| 1 | `CLAUDE.md:12` / `ROADMAP.md:15` — topical HIT@2 **75→80**, epistle **84**, proper-noun H1 **70**, dated 2026-07-13 | topical **70**, epistle **88**, proper-noun H1 **80**, dated 2026-07-14 | `PHASE_A_CLOSE.md` §5 (supersedes ADR-018); `git log 38c7a85..HEAD -- web/src/lib` empty (unchanged since) |
| 2 | `ROADMAP.md:204` — "Bible content plane (**22 translations**), 244M" | **18** ship (4 removed by license gate) | `ls web/public/bible/` = 18 dirs; jubilee/leb/litv/mkjv gone |

## 7. Known open gaps (verified real, not yet fixed — none fixable read-only)

1. **`app_runtime` still holds INSERT/UPDATE/DELETE on `embeddings`** (SELECT-only on `commentary_entries`,
   `sources`, `sections`). `embeddings` is the servable corpus (190,635 rows, all user_id NULL), so a write grant
   there is a least-privilege gap on the most integrity-critical table. `ground-truth.mjs` finding #5. **Fix = a
   `REVOKE` (a prod GRANT change = a write), deferred** — must first confirm the ingestion path's role isn't
   `app_runtime`, or ingestion breaks. Owner action; draft, do not auto-apply.
2. **Bible not in a prod DB schema** (§3) — a framing lie in `docs/SCHEMA.md`, not a functional bug (files serve
   fine). Left as-is; noted here so no agent trusts the relational framing.
3. **SEC-1** — `better-auth 1.4.18` CVEs via `@neondatabase/auth` beta; blocks *public* launch. Interim question
   to Neon pending (`docs/SECURITY.md`, `OWNER_ACTIONS.md` §2).
4. **CI (`db-invariants` job)** — split 2026-07-15 (`3ac0d9f`): the `audit` job is green on every push; the
   licensing/tenancy invariants run only when the `APP_DATABASE_URL_TEST` secret (Neon test branch) exists, else a
   visible green-with-`::warning::` placeholder. Verified locally under CI conditions; **the actual GitHub run has
   not been observed from this environment** (`gh` not installed, private repo). Owner action: create the test
   branch + secret (`OWNER_ACTIONS.md` §1).
