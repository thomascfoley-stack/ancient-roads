# Slice A — finish dev population (2026-07-24, dev ep-tiny-hat)

**The check that could have failed, and the red I watched:**
1. Composite-defect sweep (`scripts/sweep-composite-defect.mjs`, read-only). RED watched: on
   `origen-commentary` the head is "The First Epistle of Clement to the Corinthians" (the known
   1/2-Clement-under-Origen defect), and on `josephus-whiston` the tail is the spurious pseudo-
   Josephus "Discourse to the Greeks concerning Hades". The tool surfaced both by the head/tail
   eye-dump. (The marker-regex net returned 0 on both — those are author-substitution defects, not
   front-matter; logged as a tool limitation, the eye-dump is the real net.)
2. Inline publish gate (`scripts/publish-works.mjs`) — license + forbidden-provenance, fail-closed
   in-transaction. RED watched: seeding `john-gill`→license `copyright` and `jfb`→`biblehub.com`
   provenance inside a rolled-back txn, the gate flagged both. Then it passed the real clean rows.

## Published this slice (staged → published, reversible flip)

| work | register | sections | license | provenance |
|---|---|---|---|---|
| john-gill | commentary | 28,843 | Public Domain | bible.helloao.org |
| jfb | commentary | 15,473 | Public Domain | bible.helloao.org |
| adam-clarke | commentary | 12,693 | Public Domain | bible.helloao.org |

Sweep verdict for each: head = Genesis 1, tail = Revelation 22 (full canonical span), no foreign
author, no front/back matter; all marker hits verified false-positive (legit prose: "catalogue",
"advertisement", "flying roll"). CrossWire/helloao verse-keyed modules, clean by construction.

## Per-register published counts (post-slice, positive-control census)

| register | published works | published sections | note |
|---|---|---|---|
| commentary | **5** (was 2) | **84,292** (was 27,283) | + gill/jfb/clarke |
| sermon | 7 | 162,805 | unchanged |
| theology | 3 | 28,726 | unchanged |
| father | 3 | 18,371 | origen (1) stays staged |
| confession | 1 | 4,852 | unchanged |
| poetry | 10 | 3,533 | donne/herrick quarantined |
| hymn | 5 | 1,690 | unchanged |
| historian | 0 | 0 | all 3 staged (see parked) |
| lexicon | 0 | 0 | all 5 staged (see parked) |

## Deliberately NOT published (logged, per §2A "ambiguous stays staged")

- **josephus-whiston** (historian) — PARKED. Whiston's edition appends the spurious pseudo-Josephus
  "Discourse to the Greeks concerning Hades" (u2690–2696, ~10 of 4,124 sections; traditionally
  attributed to Hippolytus). Serving-or-excising spurious matter is an owner editorial call.
  edersheim / schaff have 0 sections (no read path possible). So NO historian read path shipped.
- **lexicon** (bdb, easton, isbe, nave, smith; 52,043 sections staged) — the reference-pane vs
  blend-into-/ask serving-UX question is an OPEN OWNER CALL (GO_LIVE quarantine list). Per §2A
  ("only if the reference-pane question is separable — else leave staged"), left staged.
- **origen-commentary** (father) — stays staged. Two reasons: (1) the composite defect above; (2) the
  standing MUST_NOT_SERVE 'Origen' editorial ruling.
- **poetry donne-divine-poems / herrick-noble-numbers** — quarantined composite volumes (whole
  secular books under sacred titles); not legitimately publishable without section-scoped re-profiling.

## Postcondition gates (all green)

- Gate B (`src/ingest/check-licenses.ts`) against dev: **0 violations** with the 3 new published works.
- Catalog fence: `commentaries` catalog returns exactly the 5 commentary works, nothing cross-register.
- No accidental publish: historian/lexicon still staged; father origen still staged.

## Not covered (the honest gap list)

- Browser render of `/library/commentaries` showing gill/jfb/clarke was NOT booted this slice (data
  change to an already-tested UI route; catalog query verified at SQL level). Recommend a 390px +
  desktop smoke before this data reaches prod.
