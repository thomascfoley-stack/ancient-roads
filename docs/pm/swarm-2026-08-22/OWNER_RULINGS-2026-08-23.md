# Owner rulings — 2026-08-23

Given by the owner in session, recorded here per bylaw 1 (a decision that exists only in a chat
window does not exist). These discharge the four HELD-FOR-OWNER items.

| # | Item | Ruling |
|---|---|---|
| 1 | **W-SLICE4** | **YES — ships.** The control bar is read as the frozen ADR-028 definition (intent-floor-based, the one the v4 record has always used). Under that reading every pre-registered bar cleared. Un-revert the behavior change. |
| 2 | **W-ANN** | **SHIP IT.** `hnsw.iterative_scan = relaxed_order` is accepted, including the cold-start latency tail (one probe at 11.59 s against the pre-registered 5 s max). A search that silently returns nothing is worse than a slow first query; warm p50 improves 1,035 ms -> ~200 ms. Un-revert. |
| 3 | **W-SCANRE** | **SHIP IT.** The corroboration-gate extension merges at 33 -> 2 false floors, against a pre-registered bar of 0. The bar is not renegotiated retroactively; the owner accepts the residual 2/36 as a large improvement over a live 33/36. The two residual design questions stay open and are NOT blocking. |
| 4 | **W-SEC-CCEL** | **Cite the source work / original work if it can; otherwise DELETE the tag.** Conditional ruling: a candidate that attributes the ORIGINAL WORK (or its edition) satisfies it and is preferred; host attribution does not. If no candidate can cite the original work, delete the ` (CCEL)` suffix entirely. |

Ruling 3 note: the owner is overriding a pre-registered bar after seeing the measurement, knowingly
and explicitly. That is the owner's prerogative and is recorded as such rather than by rewriting the
bar — the pre-registration stands in the record as written.
