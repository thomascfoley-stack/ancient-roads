# Overnight run — morning report (2026-07-24 → 25)

One consolidated report per §5. Everything below is DEV-only; prod was never touched
(hard stops honored). Four commits on `main`, held unpushed pending the cold-audit (D)
clearing tonight's code.

## Per-slice: the check that could have failed, and whether I watched it go red

| slice | the falsifiable check | red watched? |
|---|---|---|
| env safety | `assert-ingest-env-dev.mjs`: refuse if root env is not dev-owner with a live control | YES — refused while pointed at prod (ep-odd-fog); green after repoint (Gill 28,843) |
| A populate | composite-defect sweep (heads+tails) + inline license/provenance gate | YES — sweep fired on origen=Clement + josephus=pseudo-Josephus; gate flagged a seeded copyright + biblehub row |
| B cutover | STEP ZERO abort-coverage | YES — wrong-endpoint / wrong-role / bad-credential / empty-target all exit 1; green preflight exits 0 |
| C D2 | (analysis) projection maps the slice rate onto the right E-step | n/a (measurement) — dominant step identified + caveated |
| D audit | 6 cold lenses + adversarial verify | see §D below |
| E remeasure | verse-ref positive control alive; controls clean | YES — control 40/40, controls 10/10 clean, so the numbers are real |
| F design | (doc only) SEC-1 gate stated as a hard blocker | n/a (design) — owner approves before code |

## A — dev per-register published counts (post-run)

| register | published works | published sections | change tonight |
|---|---|---|---|
| commentary | **5** | **84,292** | +gill/jfb/clarke (was 2 / 27,283) |
| sermon | 7 | 162,805 | — |
| theology | 3 | 28,726 | — |
| father | 3 | 18,371 | origen stays staged |
| confession | 1 | 4,852 | — |
| poetry | 10 | 3,533 | donne/herrick quarantined |
| hymn | 5 | 1,690 | — |
| historian | 0 | 0 | josephus PARKED (spurious tail) |
| lexicon | 0 | 0 | 5 staged (reference-pane open call) |

Parked-and-logged (not defects, decisions): josephus (spurious pseudo-Josephus "Discourse
to the Greeks concerning Hades" appended by Whiston — owner call to serve or excise);
lexicon x5 (reference-pane-vs-/ask serving UX is an open owner call); origen (composite
defect + editorial ruling); donne/herrick (quarantined composite volumes). No historian
read path shipped (edersheim/schaff have 0 sections; josephus parked).

## B — cutover script dry-run + abort-coverage

`scripts/cutover.mjs`, prod PARKED. Dry-run plan emitted (STEP ZERO + E1-E6 with hazard
guards). STEP ZERO refuses to start on not-prod / not-owner / can't-connect / can't-write /
empty-target (all exit 1); green preflight requires endpoint + owner role + write capability
+ non-zero positive control. Hazards 1/2/4 + the E3 ratchet are in-script asserts. E2/E4/E6
real actions `die("PARKED")` rather than half-do a write. Detail: `B-cutover-script.md`.

**End-to-end census-clone rehearsal is PARKED:** the ep-young-hat string exists nowhere in
the repo. To rehearse: `CUTOVER_DATABASE_URL=<ep-young-hat owner> CUTOVER_EXPECT_HOST=ep-young-hat
node scripts/cutover.mjs --dry-run` then `--preflight`, then a full E1-E6 against the clone.
That rehearsal is what converts C's estimate into a measured number.

## C — D2 prod runtime projection

E2-E4 projected at **25-50 minutes** (full unattended E1-E4 window **35-70 min**), dominated
by E4 (the ~113k-vector 1:1 section slice at the measured 121-190 s/10k). E2 is a metadata
UPDATE (1-5 min), E3 a 71,884-row DELETE (2-5 min). Two caveats: (1) prod compute size is
unreadable (census `SHOW` returned unavailable), so a dev rate is projected onto an unknown
prod class; (2) E1's legal-HNSW rebuild (~84k 1024-dim vectors under CONCURRENTLY, untimed
anywhere) is a separate 8-20 min precondition that could dominate on small prod compute. The
census-clone rehearsal is the only way to time E1 directly. Detail: `docs/D2_PROD_RUNTIME_PROJECTION.md`.

## E — B2 re-measure (frozen v4, live, dev)

verse-ref 100/100 (positive control), pericope **67**/100 (H1 wobble, H2 still 100), epistle
92/96, topical 80/95, proper-noun 60/100, controls clean. The pericope H1 drop from 80 is
entirely inside the HIT@2-pass band (top-1 went to a neighbour; >=2 correct voices still
retrieved) - a ranking-margin effect of this week's ~1,040-row suppressions, NOT B2 (whose
gate is downstream of what the eval measures, and whose parser change can't touch non-SoS
queries). Two true wrong-passage misses, both "fatherless" (James 1:27 / Ps 68:5), a likely
embedding collision. Re-running frozen v4 is a dev-set DRIFT CHECK, not a re-gate; a true
re-gate needs a fresh v5 that samples Song of Solomon. Detail: `E-v4-remeasure.md`.

## F — uploader + pastor-sermon-search design

`docs/UPLOADER_DESIGN.md` (doc only, committed `32fed49`). Four-table user corpus with
auth-grade RLS (default-deny, per-user policies, no owner connection on any request/worker
path); user vectors structurally separated from the platform pool; ingestion off the request
path via a queue; **SEC-1 is a hard gate — multi-user upload cannot ship on the current auth
CVEs** (owner-only beta carve-out allowed under four conditions). Ten red-first acceptance
checks. Seven open questions with recommendations (translation-index fork, beta quotas,
Blob-vs-bytea, etc.). Owner approves before any code (hard stop 2).

## D — cold deep-audit findings + residual risk

6 fresh lenses (none audited its own output) + adversarial-verify on every HIGH. **61
verified-clean, 36 not-covered, 18 findings; 2 HIGH survived refutation.** Full map +
coverage in `REMEDIATION_CHECKLIST.md`. Headlines:

- **2 HIGH, both confirmed adversarially, one FIXED tonight:**
  - catalog-search XSS (raw ts_headline snippet via `dangerouslySetInnerHTML`, sanitizer had
    drifted out of the new component) — **FIXED** (shared `sanitizeSnippet`, both sinks,
    red-first test).
  - STATE_OF_TRUTH §2 census stale + mislabeled (reads dev, not prod; predates tonight) —
    correction note landed; full re-verify owed.
- **1 MED in my own B2 code, FIXED:** coverage floor false-covered on `verseEnd≤0`.
- **ESCALATED (not touched):** the verifier's ≥2-voices-counts-sections (integrity core,
  §3.3), and LEGAL_CORPUS_FILTER's missing structural register fence (hazard 5, "holds by
  provenance coincidence" — no leak seen in the v4 controls, but make it structural).
- **Owner follow-ups:** work.ts unbounded TOC read (triggered by tonight's whole-Bible
  commentaries — page it before ship), CCEL ThML render junk, CI DB-invariants secret.

**Residual risk after tonight's fixes:** the two escalations (verifier author-count, register
fence) are faithfulness/robustness softness, not proven leaks. The unbounded TOC read is the
most concrete pre-ship item. PROD RLS enforcement remains unobserved (dev-only reachable) —
the two-account prod check is still owed per CLAUDE.md DoD.

The reader/RLS core came back strong: NOBYPASSRLS enforced (not just granted), platform corpus
unwritable by app_runtime (probed), no owner connection on any request path, corpus SELECT-only.

## Owner-blocking items still open

- **Prod-credential verification:** the refreshed prod owner string still works (census ran
  2026-07-23). For the cutover, source it into `CUTOVER_DATABASE_URL` from `.env.prod`
  (I moved it there tonight as the §7 hygiene fix; root `.env.local` now points at dev).
- **Two CI secrets:** `APP_DATABASE_URL_TEST` (Neon TEST branch app_runtime) still unset, so
  the db-invariants CI job skips the RLS/tenancy/published-boundary suites; plus the TEST
  branch itself must be created. Owner-only (needs neonctl/gh).
- **6 dependency CVEs:** RESOLVED earlier today (next 15.5.21 + postcss/fast-uri/sharp
  overrides); `deps-audit` and full audit green. No longer blocking.

## What this run did NOT touch (the honest "not covered")

- Prod (all E-steps parked). The reader browser-render of the 3 new commentaries at 390px +
  desktop (data change to a tested route; SQL-verified, browser smoke recommended before prod).
- The census-clone rehearsal (no string). Lexicon publish (open call). Josephus spurious-tail
  ruling (open call). A fresh v5 eval sampling SoS (recommended to re-gate pericope).
