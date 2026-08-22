# FINDING (historians lane) — 50 of 81 served anchored entities live only in STAGED historian works

**Filed by:** W-HISTSCOPE, 2026-08-22 · **Target:** dev (`ep-tiny-hat`) · **Lane:** historians
**Status of the originating row:** MASTER.md Lane F4 opened this as "`history-scope-db` TRUE
POSITIVE". The TEST half was closed 2026-08-21 by `4baefe5` (the probe, not the product, was
defective — watchlist instance 17). This finding carries the PRODUCT half the row was opened
to track, per the W-HISTSCOPE brief: "the test fix must not bury the product signal."

## The signal

Measured on dev 2026-08-22 (`out-of-scope-population.log`, regenerable with
`out-of-scope-population.mjs`):

- served anchored distinct entity labels: **81**
- inside the shipped `vocab()` scope (`served AND status='published' AND source_type='historian'`): **31**
- **out-of-scope served labels: 50** — every one anchored ONLY in `historian/staged` works
  (full label → works enumeration in the log).

Embeddings for staged historian works were backfilled and flipped `served=true` before those
works were published. The shipped scope filters them out at query time, so **nothing user-
visible leaks today** (that is what the fixed suite's leak-direction test guards). But:

1. `history_embeddings.served` no longer means "servable" for these rows — the served set and
   the published set have drifted apart by 50 entities' worth of sections, and any future
   consumer that trusts `served` without the `sources` legs re-opens the leak the suite now
   guards. (The served-partial HNSW index also carries vectors that can never surface.)
2. The historians lane owns the publish decision for the staged works (schaff-hcc1..8,
   bede-history, miller-history, robertson-history, vanbraght-mirror, bangs-history1..4,
   bacon-lw-history, baird-huguenots, chesterton-historyengland, dickinson-musicchurch,
   edersheim-lifetimes, rutherford-triumph, winkworth-tauler, wuttke-ethics1, hort-ecclesia,
   schaff-person, …). When those works publish, their entities enter scope with no further
   work — the drift self-heals per work. Until then it is latent.

**Candidate remedy (owner call, not built):** either publish-or-unserve per staged work
(flip `served=false` on `history_embeddings` for works that stay staged), or accept the drift
as the standing pre-publish state and let the scope predicate remain the gate. No code change
is required for correctness today; the suite's leak-direction test is the tripwire.

## Verification evidence (same directory)

- `out-of-scope-population.mjs` / `.log` — the census above (read-only).
- `seeded-probe-proof.mjs` / `.log` — the brief's both-directions proof, run as verification
  of the ALREADY-DONE fix: a sentinel out-of-scope served label seeded in a rolled-back
  transaction is DRAWN by the pre-`4baefe5` served-only probe and NOT drawn by the corrected
  probe; dev left untouched (rollback verified).
- `suite-run-dev.log` — `history-scope-db` green on dev, 2/2, neither test skipped; the
  leak-direction test exercised (no "NOT EXERCISED" warning — 50 candidate entities exist).
