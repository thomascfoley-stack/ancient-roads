# SWARM STATUS — autonomous swarm closeout 2026-08-22 (rewritten by recovery R4/R6, 2026-08-22)

This board replaces the stale "SWARM HALTED AT WAVE 0" seed. The halt was dispositioned by
W-BASEFIX (VERIFIED). The run was then killed by a provider billing-quota 403 mid-Wave-1;
recovery order: `docs/pm/orders/2026-08-22-swarm-recovery-amendment.md`. **The 21 unlaunched
items are NOT resumed** — that decision is the owner's, after the W-PN20 label checks.

## CI-coupling note (R3)

All ten `swarm/*` branches are now pushed to origin. `db-invariants` cuts its ephemeral Neon
branch from **dev**, which carries mutations prod does not: the `register='prose'→'lexicon'`
relabel + section-vector unification (08-22 close-out), a **partial schaff-npnf201 ingest**
(staged, 588 units / 141 anchored / 1,948 embedded), and migration 127 **authored but NOT
applied** (`idx_embeddings_vector` still present on dev, per R1). **Reds on these branches are
read against dev's mutation state before being treated as signal.**

## Baseline (W-PRE, 2026-08-22T17:11Z)

| key | value |
|---|---|
| HEAD at baseline | 7633f3b (branch fix/q1-signed-out-state) |
| origin/main (build base) | 9dce273ef09dffb03bc547cead0431f48fb71ffe |
| baseline audit | was RED (thayers guard) → dispositioned by W-BASEFIX, VERIFIED |
| env hosts | ep-tiny-hat only; no odd-fog/CUTOVER_ in either env file (silent checks) |
| dev DB at baseline | 203 sources; 129 published / 70 staged / 3 quarantined / 1 ingesting |
| §5.2 relabel (dev) | LANDED — 0 register='prose' rows among the 16 lexicon works |
| §5.2 pairing suite (dev) | PASS (98/129 works probed) |
| §5.1 per-run test users | CONFIRMED |
| R1 migration 127 | authored + committed (71ef715), NOT applied anywhere; header corrected |

## Item board

| W-id | Wave | Status | Branch / evidence |
|---|---|---|---|
| W-PRE | 0 | DONE | baseline recorded; halt fired and dispositioned |
| W-BASEFIX | 0-fix | **VERIFIED** | `swarm/w-basefix-thayers-guard` @ 156c5ff; verdict `verdicts/w-basefix.md` |
| W-DRAIN | 1b | **DONE-UNVERIFIED** (R6: self-certified, Wave 7 never ran) | `swarm/W-DRAIN-drain-failure-semantics` @ 5190014 |
| W-HISTSCOPE | 1b | **DONE-UNVERIFIED** (R6) — fix was ALREADY-DONE at base (`4baefe5`); finding filed | `swarm/W-HISTSCOPE-history-scope-db` @ 0765d38; `FINDING-historians-lane.md` |
| W-VEC429 | 1b | **DONE-UNVERIFIED** (R6) — retry existed (`f462114`); jitter added | `swarm/W-VEC429-provider-429-retry` @ f352512 |
| W-PN20 | 1a | **RESULT-FILED — GATE OPEN: HIT@2 17/20 = 85% vs 18/20 bar**. Labels RE-CODED (`46d8b9c`): count unchanged (no mis-scored cases); all 3 misses retrieval-side (0 no-content, 0 coverage, 0 routing-regression; `e033023` exonerated); ef=64 base-pool starvation (5/20 and 8/20 rows) flagged as cheapest lever — remedy is the owner's decision | `swarm/w-pn20-proper-noun` @ 46d8b9c; `docs/evidence/swarm-2026-08-22/w-pn20/` (RESULT.md, LABEL-RECODE.md) |
| W-SEC-CSRF | 1b | FIX-COMMITTED-UNVERIFIED (red: 18 unguarded handlers; 16 floored + 1 HELD; SEC-5) | `swarm/W-SEC-CSRF-csrf-floor` @ f1d36b7 |
| W-RELVOICE | 1b | IN-PROGRESS — conjunct fix committed; migration 127 authored NOT applied; index drop + dev re-exercise outstanding | `swarm/W-RELVOICE-related-voices-source-type` @ 71ef715 |
| W-ADRV4RERUN | 1a | **DONE-UNVERIFIED** — full re-run discharged: all gates clear EXCEPT ADR-118 (17/20, reproduced W-PN20 exactly — two independent runs, one number); controls 10/10, bait 0 breaches; spend <$1 (first recorded compose→verify cost) | `swarm/w-adrv4rerun` @ 02c9dd2 |
| W-EUSEBIUS | 1c | **DONE-UNVERIFIED** — npnf201/202/203 STAGED on dev with parity (588/495/584 sections); annotate pass + resilient-embed root-cause fix + genre carriage + SCOPE widening shipped; history eval 20/20 pre-registered bars hold; audit 847/848 (only the known baseline red). **A5 probe numbers: ≈6.4¢ API, ~25 min DB writes.** Phase 4 = owner packet (prepared, 5 steps) | `swarm/w-eusebius-npnf201` @ e7f4585 |
| W-DOCRESTATE | 1b | **DONE-UNVERIFIED** — guard verified correct + complete by the finish pass (16/16, red + red-proof re-executed, audit green modulo the baseline red); merge c476a8c + 1216773 | `swarm/W-DOCRESTATE-finish-docrestate` @ 1216773 |
| W-SEC-CURSOR | 1b | **DONE-UNVERIFIED** — adjudicated: canonical = cherry-pick `6983321` (int4 bound → 400; live red + red-proof) | `swarm/W-T3-cursor-ccel-ux` (cherry-pick); ADJUDICATION.md |
| W-L2TOGGLE | 3 | **DONE-UNVERIFIED** — adjudicated: canonical = whole branch @ `9b0e12d` (was genuinely absent; C4's "shipped" disproven) | `swarm/W-L2TOGGLE-plan-toggle` @ 9b0e12d |
| W-UX2VERIFY | 1b | **DONE-UNVERIFIED** — adjudicated: canonical = whole branch @ `01c45ad` (CDP harness, two widths, seeded red) | `swarm/W-UX2VERIFY-ux2-browser-verify` @ 01c45ad |
| W-UX1 | 3 | **ALREADY-DONE** — gap closed at `5760eec` (2026-08-02); nothing merges | ADJUDICATION.md |
| W-T3 | 3 | **ALREADY-DONE (code) + NOT RUN (device)** — guard exists + runs in audit; housekeeping MOOT (ROADMAP pointer is live; `bad9875`'s "fix" flagged do-not-merge) | ADJUDICATION.md |
| W-SEC-CCEL | 1b | **HELD-FOR-OWNER** — four divergent remedies (host-from-url / edition / host+exports / delete-tag); policy question, not engineering | ADJUDICATION.md; owner packet |
| W-FILE3DOCS | 6 | **DONE-UNVERIFIED** — all three programme docs filed as reconstructions; Stage 6 + originals stated unrecoverable, not invented | `swarm/W-FILE3DOCS-programme-docs` @ 9d8f404 |
| W-HISTBACKLOG | 1c | **DONE-UNVERIFIED** — remainder enumerated live (32-work universe, 31 with parity): the ENTIRE remainder is `foxe-martyrs`, re-probed — no ThML edition exists; PARKED with candidate row; zero ingested, $0 | `swarm/w-histbacklog-historians` @ f7e92b2 |
| W-UX3 | 3 | **DONE-UNVERIFIED** — grid + cap 3→16 + windowed panes (≤24 mounted/pane) built per all 5 verdict conditions; red-first + 3 seeded red-proofs; desk suite 103/103, web suite 1638/0; **bounded-DOM browser evidence on spurgeon-sermons (118,371 sections): max 24 mounted over 471,353px scrolled**; $0. Stretch (drag-resize, collapsible chrome) → packet | `swarm/w-ux3-desk-grid` @ b19acdd |
| W-SLICE4 | 3 | **HELD-FOR-OWNER** — built per the amended design (all 6 conditions), all safety properties red-proven, bait ≥99% cleared ×3, hijacks=0 ×2, lane delta inside measured churn — BUT the pre-reg's teach-level control pin failed EVERY run incl. baseline (defective bar; reported, not redefined). §2.4 step 3 executed: behavior REVERTED (`5c8ab31`), ADR proposal filed. Owner rules the frozen-definition reading | `swarm/w-slice4-ask-integration` @ 477a34e; `docs/pm/orders/2026-08-22-w-slice4-adr-proposal.md` |
| W-THAYER | 1c | **DONE-UNVERIFIED** — 484/484 oversized sections re-chunked to D1(b) + re-embedded; 2,865 stale flat rows backed up WITH VECTORS then deleted on dev (banked call STAGED, not discharged); all four verifications pass; spend <$0.01; prod replay in packet (B2). Filed: 5 pre-existing served-reconcile dev divergences on other lexicon works | `swarm/w-thayer-lexicon-repairs` @ 5edf712 |
| W-ANN | 2 | IN-FLIGHT — ADR-gated (pre-reg before any measurement) | `swarm/w-ann-history-recall` (launching) |
| W-SCANRE | 2 | IN-FLIGHT — ADR-gated (adversarial set ≥30 + pre-reg) | `swarm/w-scanre-false-floor` (launching) |
| W-SEC1 | 5 | NOT-STARTED — next batch (A5 slot) | — |
| W-SIXWORKS | 6 | NOT-STARTED — enumeration only; next batch (A5 slot) | — |
| W-STRONGS | 1c | IN-FLIGHT — lane position 4 (G2316 truncated glosses) | `swarm/w-strongs-gloss-fix` (launching) |
| W-REGDURABLE · W-RELVOICE-finish · W-ANCHORBACKFILL · W-OWNERSHIPCOL · W-DEVROW | 1c/4 | NOT-STARTED — writer lane positions 5–9, sequential | — |
| W-BOARDHYGIENE | 6 | NOT-STARTED — runs last among docs (orchestrator) | — |

## Conventions

- Statuses: DONE-UNVERIFIED = work complete + audit-green claimed by the author only (§2.3:
  not done until independently verified). VERIFIED = independent verdict on file.
- Per-item files: `items/<w-id>.md`; verdicts: `verdicts/`. (A3: items write their own files
  on completion; the orchestrator aggregates but is not the only writer.)
- This board lives in the repo at `docs/pm/swarm-2026-08-22/STATUS.md`; the scratch original is
  `/tmp/swarm-status-seed/STATUS.md`.
