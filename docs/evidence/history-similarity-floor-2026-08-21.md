# History similarity floor — calibration + pre-registration (2026-08-21)

K3's live walk flagged it pre-launch-blocking: nonsense queries got a confident "Closest match"
hero. Measured on dev before building (top-3 cosine against served historian embeddings, shipped
embedder): real-with-data `the fall of Jerusalem in 70 AD` = **0.754/0.720/0.713**; nonsense
`weather forecast` **0.544**, `pizza toppings` **0.454**, `kitchen tap` **0.445**. Clean gap.

**Pre-registered rule (before implementation): `HISTORY_TEXT_COSINE_FLOOR = 0.6`.** A result whose
ONLY evidence is text requires cosine ≥ 0.6 to count as matched at all; FTS word-hits alone never
make a hero (FTS still ranks among qualified results). Entity and period matches are unaffected —
they are verbatim/structural evidence and already honest.

Also observed during calibration, filed not fixed here (it is the -76 lane's recorded ef_search
defect): the history vector lane STARVES at the default ef_search — three of four real probes
returned empty top-3 through the partial-index path. When that lane is fed, real text-only
queries score ≥0.7 and clear this floor; today they fall to the honest empty state, which is
strictly better than the confident wrong hero they could produce.

## Post-implementation battery (dev)

All 8 nonsense queries: suppressed (closest=no, matched=[]) — including the three that produced
confident FTS-word-hit heroes before. Entity-backed real queries keep their hero (Nicaea,
Jerusalem-70AD). Real TEXT-ONLY queries return nothing on dev — **diagnosed, not assumed: their
FTS lane returns 0 rows on dev's thin served-historian corpus** (the Ephesus probe: FTS rows: 0),
so the floor costs zero recall here; there was nothing to lose. On prod (where K3's walk found
Miller/Schaff content) those rows will be cosine-backfilled and real church-history prose
measured 0.71–0.75 — above the floor. That projection is from calibration, not a prod
measurement; the post-deploy walk is where it gets confirmed. Also shipped with the floor: the
history vector lane's ef_search starvation fixed (set_config rides the same transaction — the
stateless-driver rule), and EVERY text candidate now carries a real cosine via one batch lookup,
so the floor judges semantics, never word-hits.
