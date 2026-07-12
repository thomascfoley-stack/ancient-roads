# Production-readiness audit (Phase A item 6)

**Bar:** production grade, no beta. Every Phase-B deferral re-judged as **BLOCKER** or **ACCEPTABLE** against
concrete production criteria: no known critical/high CVEs · alerting a human can be paged on · a rollback
story · secrets managed · no hardcoded config as a legal boundary · the product guarantee (≥2 attributed
voices, never interpret) actually held at scale. **Audit only — nothing fixed here.**

| # | Deferral | Severity | Verdict | Why / recommendation |
|---|---|---|---|---|
| 1 | **SEC-1 auth CVEs** — Neon auth pins better-auth 1.4.18: **2 critical + 7 high**; account-management UI broken | **CRITICAL** | **BLOCKER** | This explicitly gated *public* launch, and there is no beta now — so it gates launch, full stop. No production auth path may ship on known-critical CVEs. **Migrate to Better Auth-direct** (`docs/AUTH_MIGRATION_SPIKE.md`) before any real user. |
| 2 | **Hardcoded author-allowlist as the licensing boundary** + manifest disagreement (5 works vs 9 authors) + `historicalchristian.faith` provenance on ~4,174 patristic rows | **CRITICAL** | **BLOCKER** | Licensing is existential (CLAUDE.md). A hardcoded `LEGAL_CORPUS_FILTER` constant is currently what stands between prod and serving unlicensed text, and 4 of its 9 authors have **no manifest license record**; the patristic provenance is a flagged aggregator (repair pending). Reconcile manifest↔filter under one source of truth, repair the patristic provenance to New Advent, move the boundary to the sources/sections `status='published'` column (Gate-B-enforced). |
| 3 | **V2 summary-faithfulness verifier** deferred; guarantee rests on V1 regex screens + extractive composer | **HIGH** | **BLOCKER (conditional)** | The product's defining promise is faithfulness. V1+extractive **held 35/35 live** — but that is bound to the extractive composer (one neutral framing line). Acceptable *only while extractive*; the hard re-gate trigger (voice.summary / richer summaries / debate-topics) is already locked (ROADMAP). For production confidence at scale, **build V2** as the real summary-faithfulness gate. |
| 4 | **Observability has no provider/DSN** — `logEvent` emits JSON to stdout; nothing is paged | **HIGH** | **BLOCKER** | "Alerting a human can be paged on" is a production criterion and is absent — a prod incident (gate 503 spike, fallback spike, errors) is invisible until someone looks. **Provision Sentry (or equivalent) + a Vercel log-drain alert** on `evt:"gate_locked"` and a `kind:"fallback"` rate spike. The events already exist; this is wiring. |
| 5 | **Retrieval below the ≥2-voices bar** — topical/epistle HIT@2 = 70/76 (v2) after item 2; 85/85 is the guarantee | **HIGH** | **BLOCKER** | This *is* Phase A's objective — the ≥2-voices guarantee is the product. Item 2 (surfaced=1) closed half the gap with zero regression; **item 3 (surfaced=0 doctrine routing)** is the remaining lever (parked, de-risked — §6). Not production-grade until 85/85 on a fresh held-out (v4). |
| 6 | **~14% fallback rate** (≈1 in 7 answers shows raw sources, not a composed answer) | **MEDIUM** | **ACCEPTABLE (with monitoring)** | Fail-closed-safe (never a wrong answer), and a degraded-but-honest response. Not a launch blocker, but a UX quality cost. The `ask_outcome` event now makes it measurable in prod — **watch it; reduce the dominant `schema` (invalid-block) compose failure** as a fast-follow. |
| 7 | **n=35 is the entire faithfulness suite** | **MEDIUM→HIGH** | **BLOCKER (for scale)** | 35 hand-written baits is a de-risk, not a statistical guarantee — wide CI on the product's core promise. Before real traffic, **grow the suite** (from real queries + every verifier rejection, per the suite's own plan) and add **production faithfulness monitoring** (sample + re-screen live answers). The permanent live harness (`/api/eval/bait`) is the substrate. |

## Bottom line
**Not production-ready.** Four independent CRITICAL/HIGH blockers gate launch: **SEC-1 auth CVEs** (1),
**the licensing boundary** (2), **retrieval below the guarantee** (5), and **no alerting** (4) — plus V2
faithfulness (3) and suite size (7) as scale blockers. Ordered by "cheapest to close that unblocks the most":
alerting (4, wiring) → retrieval item 3 (5, a focused slice) → licensing reconciliation (2, needs owner
license confirmations) → auth migration (1, the largest) → V2 (3) → suite growth (7). The ~14% fallback (6)
is the only deferral that is genuinely acceptable for launch, with monitoring.
