# PRE-REGISTRATION — ADR-118 remedy: ef lever on the legal base pool (2026-08-24)

**Committed BEFORE any measurement run.** Owner ordered the remedy in-session 2026-08-24
("then do adr-118") after the packet's A1 row; the bar is NOT renegotiated.

**Cause (measured, twice, independently):** the shipped `HNSW_EF_SEARCH = 64` was swept on
v3 2026-07-14 ("smallest that reliably fills — 50/50"); the corpus has since grown by the
entire P4.n programme, and the W-PN20 label re-code measured the pool filling **5/20 and
8/20** on the two 0-voice misses, with correct fill at ef=1000. The constant was right;
the corpus outgrew it.

**Lever:** raise ef via the harness's existing `--ef` knob (read-only diagnostic), then ship
the smallest value that clears — a one-line constant change to `HNSW_EF_SEARCH` with the
comment's sweep evidence replaced. Escalation only if no plain ef clears: `iterative_scan
= relaxed_order` in `legalBasePool` (the W-ANN mechanism, owner-accepted there 2026-08-23).

**Sweep plan:** pn20 at ef ∈ {64 (baseline reproduction), 200, 400}. Ship-value rule:
smallest swept ef whose pn20 clears the bar; confirm with the full v4 suite at that value.

**Bars (all pre-registered, none new):**
1. pn20 HIT@2 **≥ 18/20** — ADR-118's frozen bar, unchanged.
2. Full v4 at the chosen ef: every ADR-116 pre-registered bar holds (verse-ref H1 100/100 ·
   pericope ≥80 · epistle ≥96 · topical ≥80 · proper-noun per ADR-118) — no category regresses
   below its bar.
3. Controls stay clean (intent floor; no-content shape unchanged).
4. Pool-fill latency at the chosen ef ≤ 2× the ef=64 p50 (the July sweep measured ~270ms;
   budget ≤ ~540ms) — read from the harness timings.

**Withdrawal rule:** if no swept ef clears bar 1, or bar 2/3 breaks at every clearing ef,
the lever is withdrawn and the finding (with the sweep table) goes back to the packet.
