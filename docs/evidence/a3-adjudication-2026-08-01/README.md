# A3 — the census adjudicated. NO STOP. Six works to flip; barnes-notes stays.

Adjudicated 2026-08-01, offline, from A2's committed artifacts (branch
`a2/prod-readonly-2026-08-01` @ `4b31c0c`). No database connection of any kind was opened for
this gate. Preceded by a 4-agent adversarial verification of A2's evidence and of the
adjudication rule itself; A2's numbers came back CLEAN — every figure reproduces from the
as-run artifacts, arithmetic closing exactly (72,863 sections; 83,993 = 71,561 + 12,432).

## The verdict

| slug | register | status | admitted | verdict |
|---|---|---|---|---|
| `adam-clarke` | commentary | staged | yes | OK |
| `barnes-notes` | commentary | staged | **NO** | OK — stays staged, so MASTER.md:37's STOP does not fire |
| `calvin-crosswire` | commentary | staged | yes (5,088 of 5,090 — see residuals) | OK |
| `jfb` | commentary | staged | yes | OK |
| `john-gill` | commentary | staged | yes | OK |
| `matthew-henry` | commentary | staged | yes | OK |
| `wesley-crosswire` | commentary | staged | yes | OK |

**Flip list** (`docs/evidence/work-order-v2-stage2/flip-slugs.json`): `adam-clarke`,
`calvin-crosswire`, `jfb`, `john-gill`, `matthew-henry`, `wesley-crosswire` — mechanically
confirmed equal to the expected six, `barnes-notes` excluded. Traceable to the census bytes:
`a2-census.json` embeds sha256 of `census.txt`, `serving-census-stdout.log` and
`instrument-staged.txt`, and carries the instrument's rollup digest
`10cd5eb46c9e53cb4b7b980e38e4720f`.

## How this was produced

1. `build-census-json.mjs` parsed the **as-run stdout artifacts** (never a hand-typed table)
   into `a2-census.json`, refusing on any unparseable row, and cross-checking A2.1 against
   A2.3 (statuses and section counts must agree; they do).
2. `scripts/publish-flip-adjudicate.mts` applied the codified STOP rules
   (`scripts/lib/publish-flip-census.mjs`, imported, already red-proved) — exit 0, no STOP.

## THE ADMISSION DEFINITION — a recorded departure from the readiness order

The readiness order (`docs/pm/orders/2026-08-01-a3-a6-readiness.md`, MUST-BUILD §1) specified
admission as slug membership in `SERVED_PROSE_WORKS ∪ SERVED_LANE_WORKS`. **A2 proved that
definition admits ZERO production works** — none of the seven slugs is in either list; every
admission on production runs through `LEGAL_CORPUS_FILTER`'s author legs. Applying the order's
letter would have produced "STOP: nothing to flip", a wrong verdict about a corpus that serves
83,993 rows.

**Applied instead:** `admitted := (rows admitted by the measured LEGAL_CORPUS_FILTER) > 0`, per
work, from A2.3's ADMITTED column. This is the definition MASTER.md:37 intends (work-grain: a
published work "served by nothing"), it is what the A2 order itself asked ("per source —
admitted by the filter?"), and it is how `publish-flip-census.mjs:11-13` says admission is
decided ("by the runner using the imported LEGAL_CORPUS_FILTER"). The readiness order carries a
correction pointing here.

Explicit booleans matter: the adjudicator's fallback is the slug-membership rule, so a census
JSON missing `admitted` flags would have silently marked all seven not-admitted. The bridge
therefore refuses to emit a row without deciding the boolean, and the flip list was mechanically
diffed against the expected six after the run.

## Residuals — recorded, none blocking

- **calvin-crosswire serves 5,088 of its 5,090 sections** — the only work whose admitted count
  is below its own section count. Two sections will be listed by the reader and unservable by
  retrieval. Not the MASTER.md:37 failure (that is a work served by *nothing*); undiagnosed
  read-only.
- **calvin 1,127 / wesley 1,021 flat-store rows are unadmitted** (non-crosswire `sourceUrl`).
  Flat-store facts; the flip does not change them.
- **12,432 admitted flat rows have no `sources` row** (Albert Barnes 6,850, Augustine 2,995,
  Chrysostom 2,587). Served identically before and after the flip — the UPDATE targets rows
  they do not have.

## What A4's gates will meet — including the one blind spot

- **`sources.license` on production has NEVER been read by anything committed.** No A2 artifact
  selects it. The manifest declares `Public Domain` for all six candidates (that is a MANIFEST
  declaration, not DB state) and the ingest writers copy licence from the manifest — inference
  from code, not measurement. If any row carries NULL or a variant string, `publish-flip.mjs`
  refuses inside the transaction (safe — ROLLBACK, nothing published — but the ceremony fails).
  **The before-log closes this: `publish-flip-verify.mjs` prints the licence per source. Read
  that column BEFORE typing `publish`.**
- `sections.source_url`: **0 forbidden rows across all seven works, measured** (census.txt).
  Gate (c) will pass.
- `sources.provenance` for the six candidates: clean by two-step inference (instrument
  eligibility: "6 eligible (7 in cohort)", and barnes is necessarily the ineligible one via its
  manifest quarantine). Barnes's own biblehub provenance cannot trip the gates — they scan
  `status='published'` only, and barnes stays staged.

## What the flip changes — set expectations before the go

- **Nothing a visitor sees changes until A6 — literally nothing.** The live deployment is
  `24677ba` (2026-07-19), which predates the catalogs, the work reader and cross-corpus search
  entirely. The flip is what makes A5 non-vacuous and what A6's deploy will light up.
  > **CORRECTION, 2026-08-02.** This bullet said "the only externally visible change is
  > `/api/health`'s publishedWorks 0→6". That is impossible: `/api/health` does not exist on
  > `24677ba`. `git ls-tree -r 24677ba web/src/app/api/` lists thirteen routes and no health
  > route, and `publishedWorks` appears nowhere in that tree; the route was added later, at
  > `ba82a5d` (2026-07-30), which is not an ancestor of `24677ba`. There are no rewrites and the
  > middleware is only the password gate, so nothing else serves the path. RECOVERY.md on this
  > same branch already said "GET /api/health did not exist on old bundles" — this record
  > contradicted its own branch. The endpoint 404s or gates before the flip and after it.
- **The ask pipeline is untouched.** Retrieval is allowlist-based over `embeddings` and consults
  `sources.status` nowhere; the served author pool is 9 before and after. The register wall and
  the ≥2-voices floor are unaffected. The flip affects library surfaces only.
- PUBLISH_FLIP.md §4's "open one flipped work in the reader" cannot run against the live site
  (no `/work` route is deployed); it runs via a local dev server against prod, or defers to A6.

## What the A4 go must explicitly accept (unchanged from the readiness order)

1. Departure from ADR-043: G10 is not discharged on a fork first — fork creation is forbidden.
2. The restore point is the pre-COMMIT snapshot + `--reverse`, which restore `sources.status`
   and nothing downstream — not a Neon branch.
3. First execution of `publish-flip.mjs` against real data is production (rehearsed on a local
   throwaway only; 22 red-proof cases in `../post-a1-2026-08-01/publish-flip-redproof.md`).
