# EMBEDDINGS — the vector planes, one model, and the lockstep problem

**Status:** **APPROVED 2026-08-12 (owner).** Owner decisions ruled (§5); D1 deliberately awaits V3's measurement. Design-before-code.
**Filed:** 2026-08-12 against `6fdc483` (`feat/marketing-site` — see governance note, §7).
**Revised the same day** after independent review (R-1…R-6 + governance, verified against the
tree before acceptance). **v1's D6 and D1 were wrong and are rewritten; D2/D3 amended; the
provider guard is promoted to V1.**
**Source:** `docs/pm/EMBEDDINGS_RECON_2026_08_11.md` — committed to the repo under bylaw 1 so
this design's premise chain is openable (v1 cited it off-repo; that was the review's governance
finding, now fixed).
**Companions:** `MIGRATION_DESIGN.md` §5.1, ADR-005 (model pin), ADR-010, ADR-102, ADR-104,
`docs/WORKORDER_PHASE_A.md`. Lane: **A** (corpus/retrieval).

> **MEASURED** = verified against the tree at `6fdc483` on 2026-08-12. **RECORDED** = a
> live-database number captured in a code comment, dated and named by database — dev numbers are
> dev, prod numbers are prod, and the two are an order of magnitude apart here.

---

## 1. The situation (carried from the recon; corrected where v1 erred)

- **One model**, `BAAI/bge-large-en-v1.5`, 1024-dim, 1800-char chunk cap, DeepInfra provider,
  Nebius failover named-not-built. Two spellings in the corpus (`'BAAI/…'` on P1's JSONB path,
  short form on P2's `model_slug`); the user plane already solves parity
  (`user-corpus/model.ts` — *"the embedding model, in ONE place"* — exports the constant, the
  derived slug, `normaliseModel`, `isJoinable`, guarded by `model-parity.test.ts`).
- **Four planes.** P1 `embeddings` (retrieval; `served` lives here; **a mixed table** — user
  uploads land here too, `src/retrieval/store.ts:35`). P2 `section_embeddings` (one vector per
  section; writers exist, **no runtime reader**). P3 user plane (deliberately unindexed). P4
  `hybrid_search()` (a function).
- **P2 decays, and a green test mislabels the decay.** `register-writer.ts:208` DELETEs from
  `section_embeddings` on re-ingest and never INSERTs. The one check that could see it —
  `section-vector-pairing.test.ts` — **inner-joins** `section_embeddings` (`:106`), so a
  vectorless work silently drops out and prints as *"NOT COVERED (no section of sampleable
  length)"* (`:117-119`): a true fact with a false reason. (G8 is tautological by
  STATE_OF_TRUTH's own admission; `ground-truth.mjs` is Barnes-scoped.)
- **P1's model identity is unconstrained** — `metadata->>'model'`, no column, no CHECK. The
  corpus plane has **52** occurrences of the model literal across `src`/`web`/`db`/`scripts`/
  `test` (grepped 2026-08-12; the "~12" in the recon counted one plane).
- **`hybrid_search()` is the control arm of a deliberate A/B — NOT a lab/prod divergence.**
  v1 got this wrong by quoting `WORKORDER_PHASE_A.md:13`'s problem statement and missing the
  DONE block beneath it: **closed 2026-07-11 (`e5677a0`)** — `legalBasePoolSql()` single-sourced
  in `routing.ts`, imported by both production `retrieveCommentary` and the eval `retrieveLegal`,
  base pool byte-identical, re-measured identical (frozen v2 = 65/72). The five scripts that
  still call `hybrid_search` run it as one arm beside the shipped path (`eval-retrieval.mts`
  names all three: `retrieveVector`/`retrieveHybrid`/`retrieveFull`). **The control arm is what
  keeps "vector 97% ≈ hybrid 97%" reproducible. Do not delete it.** What is actually stale:
  `db/migrate.mjs:18`'s comment — *"hybrid_search currently has no callers"* — false (six call
  sites in five files), so the `CREATE OR REPLACE` revert footgun it guards is live, not dormant.
- **The lockstep scar tissue** (009 → 012/018 → 037-caught → 044/045) and the existing guard
  suite (`legal-hnsw-index-sync`, `fts-legal-index-sync`, `served-*`, `quarantine-served-corpus`,
  `publish-admission-covers-served-lists`) stand as the recon recorded them. The 045 redeploy
  window is prose-only enforcement.
- **Numbers, labelled by database:** dev `embeddings` ≈1.07M rows, dev `section_embeddings`
  ≈362,948 (RECORDED in `model.ts:17-18`, dev-backed). Prod is far smaller (flat rows 190,635
  at 2026-07-23; `served=true` 398,113 at the 2026-08-10 probe — the served set grows with
  licensing adjudication; any undated count is wrong within a week). **Prod model conformity
  confirmed 2026-08-12 (T0-d, Fable prod read): all 569,845 corpus rows carry
  `BAAI/bge-large-en-v1.5` exactly** — V4's `VALIDATE CONSTRAINT` will validate; note the stored
  value is the API-id string, not the short slug, so the pin constant must be the long form.

---

## 2. Rulings (v2)

### D1 — P2: stays an owner decision, re-put honestly (v1's feasibility claim was wrong)

v1 claimed "~15 lines, zero embed cost — the vector is reused." False for the general case:
`register-writer.ts:236-258` chunks one section into **N chunks** and embeds **per chunk**;
`section_embeddings`' PK is `(section_id, model_slug)` — **one vector per section**. For any
multi-chunk section there is no vector in hand to reuse, and storing chunk 1's would fail
`section-vector-pairing.test.ts`'s calibrated thresholds (≥0.95 prose / ≥0.90 verse, `:50-51`) —
turning a green invariant red.

The honest options:

| | What | Cost | Coverage |
|---|---|---|---|
| (a) | Insert chunk-1 vector for **single-chunk sections only** | ~15 lines, free | **partial** — multi-chunk sections stay bare; must be stated, and V-3 must count per-shape, not equate totals |
| (b) | A real per-section embed pass at ingest | correct coverage, **real DeepInfra cost** per new work | full |
| (c) | Mean of the section's chunk vectors | cheap, defensible for ANN recall | full, but likely fails the pairing test's 0.95 threshold for long sections — the test would have to learn about it |

**Owner decision (§5).** V3 (below) produces the number that prices this — how many register
sections are multi-chunk — for free. v1 asked for a YES on (a) while reading (b)'s coverage and
(c)'s price tag; that ask is withdrawn.

### D2 — One model constant, in the home that already exists (amended)

Do **not** found a second constant in `embedder.ts` (v1's error — a second single source of
truth is how 52 literals become 53). `user-corpus/model.ts` already is the one place.
**The real work is the workspace boundary**: `model.ts` lives under `web/`, the ingest literals
under `src/` — a shared module both packages import. Budget against **52 sites**, not 12.
V-2 is restated accordingly (§4): the two spellings are both correct — one **un-derived**
literal plus derivations, exactly what `model.ts:39-44` already implements.

### D3 — P1 model pin, amended (v1's CHECK had four defects)

```sql
ALTER TABLE embeddings ADD CONSTRAINT embeddings_model_pinned
  CHECK ( user_id IS NOT NULL
          OR (metadata->>'model' IS NOT NULL AND metadata->>'model' = '<the constant>') )
  NOT VALID;                    -- brief lock; enforces NEW rows immediately
--SPLIT--
ALTER TABLE embeddings VALIDATE CONSTRAINT embeddings_model_pinned;  -- SHARE UPDATE EXCLUSIVE, non-blocking
```

- **`IS NOT NULL AND …`** — v1's bare `=` passed on NULL: a writer that forgot to stamp the
  model would sail through. The three-valued-logic trap, on the corpus plane this time.
- **Scoped off user uploads** (`user_id IS NOT NULL OR …`) — `embeddings` is a mixed table
  (`store.ts:35`); a table-wide pin would silently rule that user uploads may never use a
  different embedder. If the owner *wants* that ruling, make it explicitly in §5, not by
  accident in a hygiene migration.
- **`NOT VALID` + `VALIDATE`** — v1's one-step form takes ACCESS EXCLUSIVE for a full scan of a
  million-row dev table carrying five HNSW indexes; `/ask` errors for the duration. The repo
  already knows this pattern (044's `CONCURRENTLY` + `--SPLIT--`).
- **The honest claim:** this catches **non-pipeline writers** (manual INSERTs, ad-hoc scripts,
  future ingest paths with their own literal). It does **not** catch the pipeline switching
  models — writer and check would read the same updated constant; `model.ts:29-33` names that
  tautology in advance (*"the bug wearing the check's uniform"*). The guard against a pipeline
  switch is V1 below — the only check that compares against a value the pipeline didn't write.

### D4 — `lexicon` served by nothing
Stays with A8 (owner). Unchanged; the review accepted this scoping.

### D5 — Provider drift guard: **promoted to V1** — **BUILT 2026-08-12**
Assert the response `model` equals the pin, fail fast. **Built on every path whose response
self-reports a model**: the corpus embedder (`src/retrieval/embedder.ts`), the request-path
embedder and the composer (`web/src/lib/teacher/deepinfra.ts` — compose included because this
hazard already bit there, the Qwen3.6 auto-forward incident recorded at `:9-11`), and the
user-corpus batch embedder (`user-corpus/embed.ts`), plus dimension assertions on both embed
writers. **The rerank path is a documented gap:** `/v1/inference/{model}`'s response is
`{ scores: number[] }` with no model field (provider docs, checked 2026-08-12) — no
response-side assertion is implementable; the gap is recorded in `rerank.ts` and the residual
guard is the eval harness's measured numbers. Live smoke against the real provider confirmed
both endpoints echo the exact requested model string (no false-positive risk). Red-proofed:
`test/embedder-model-guard.test.ts` (5) + `web/test/embed-model-guard.test.ts` (7) went red
against unguarded code, green after. D5b (provider abstraction for switchability) remains ruled
and unbuilt — separate slice.

### D6 — Withdrawn, except one line (v1 was wrong)
No harness port, no V-4 red-proof — the A/B control stays. **The whole of D6: fix
`db/migrate.mjs:18`'s false comment** ("no callers" → six, in five files), so the footgun's
status is honest. If the footgun itself is to be closed, that is a `migrate.mjs` change and its
own small slice.

---

## 3. Slices (v2 order)

- **V1 — provider drift guard.** Response `model` assertion on embed + rerank; dims assertion on
  the corpus writer. I-1, I-2.
- **V2 — `db/migrate.mjs:18` comment fix.** One line. No invariant; the diff is the proof.
- **V3 — the P2 truth pass.** Run `section-vector-pairing.test.ts` on dev; read the `NOT
  COVERED` list; one `count(*)` per name separates "no short sections" from "no vectors" — that
  **is** the P2 coverage number, free. Then **fix the check's labelling** so the two causes can
  never merge again (report `vectorless` separately from `unsampleable`). I-3. Output prices D1.
- **V4 — the model pin, amended** (D3 as above). I-4.
- **V5 — constant consolidation, re-homed** (D2 across the workspace boundary). I-5.

V1–V5 change no retrieval behaviour, ranking, or request-path query shape — no accuracy
diagnostic is implicated. If a P2 reader ever ships (post-D1), that slice designs its own
diagnostic and `interpretation_bait` pass.

---

## 4. Invariants — each ships with its red-proof

| # | Invariant | Red-proof |
|---|---|---|
| I-1 | The embedder fails fast when the provider response `model` ≠ the pin (all three embed paths: corpus ingest, request-path query, user-corpus batch) | stub the provider returning a forwarded model id → red (shipped: `test/embedder-model-guard.test.ts`, watched red 2026-08-12) |
| I-2 | The **composer** fails fast on a forwarded model (the path that already bit); both embed writers drop non-1024-dim responses. The **reranker is exempt** — its response carries no model field (provider docs, 2026-08-12); gap documented in `rerank.ts` | stub each → red (shipped: `web/test/embed-model-guard.test.ts`, watched red 2026-08-12) |
| I-3 | A vectorless published work is reported **as vectorless** by the pairing check — never merged into "no section of sampleable length" | seed a fixture work with sections and no vectors; assert the two labels report separately → red |
| I-4 | No row lands in `embeddings` (platform-scoped) with a missing **or** wrong model | INSERT with a wrong literal → red; INSERT with the key **absent** (NULL) → red — both halves |
| I-5 | One un-derived model literal on the corpus plane; every other spelling is derived from it (`replace(/^[^/]+\//, '')`, not typed) | hand-type either spelling in a second module → red (shape: `legal-hnsw-index-sync.test.ts`) |

v1's V-3 (`count(section_embeddings) == count(sections)`) and V-4 ("point a script back at
`hybrid_search` → red") are **deleted** — the first goes green on a partial plane, the second
punishes the repo's own reproducible no-loss finding.

---

## 5. Owner decisions

| # | Decision | Blocks | Recommendation |
|---|---|---|---|
| D1 | P2 population: (a) partial/free, (b) full/paid, (c) aggregate/test-adjust — priced by V3's output | post-V3 | **Run V3 first; decide with the multi-chunk fraction in hand.** Nothing to rule today — explained to owner 2026-08-12 |
| D4 | `lexicon` lane (A8) | — | Out of scope here |
| D5b | Provider failover/switching build timing | — | **RULED 2026-08-12: build it, strengthened to switchability.** Owner expects providers to keep improving and cheapening fast (possibly swapping on a ~30-day horizon) and must not be locked into one. So: a provider **abstraction** with easy switch-out — failover is the minimum, portability is the goal — in place before the next corpus-scale embed run |
| D7 | May user uploads (mixed `embeddings` table) ever use a different embedding model than the corpus? | V4 | **RULED 2026-08-12: keep the option open** — the pin scopes off uploads. Owner's stated principle: **no model lock-in.** Moving between providers/models in future (Qwen, Kimi, Fable, a locally trained model) must never require a rebuild; hard-binding the system to specific models is tech debt the product cannot afford. Applies beyond uploads: D5b's provider abstraction and this ruling are the same principle |

---

## 6. What this changes operationally

- **The 045 redeploy-window constraint** (rolling back past 045 restores silent starvation) moves
  from a migration header to the deploy checklist — prose still, but prose at the moment it
  matters.
- **Eval numbers are trustworthy as-is** — the base pool has been byte-identical since
  `e5677a0`. (v1's "suspect" instruction is withdrawn; repeating it would discredit correct
  numbers — an inverse unearned green.)

---

## 7. Governance notes (from the review, accepted)

- **Bylaw 1:** the recon is now in the repo (`docs/pm/EMBEDDINGS_RECON_2026_08_11.md`); v1's
  reconciliation clause against an unopenable document is gone.
- **Bylaw 4:** v1 suggested the recon's author as this design's independent reviewer — inverted;
  authorship disqualifies. The review that produced this v2 was independent *because* its author
  did not write the recon.
- **Lane/branch hygiene:** this design declares Lane A while filed on `feat/marketing-site`, and
  the tree carries untracked `docs/` files — `deploy.sh` gates on a clean tree (the 2026-08-08
  incident). These documents should land on an appropriate branch before any deploy attempt.

---

## 8. What this design does not claim

- That D1 has a cheap correct answer — that is exactly what was re-put for the owner.
- That all dev `embeddings` rows currently conform to the model pin (V4's `VALIDATE` will prove
  or find it; prod conformity is a gate-A5 ride-along).
- Anything about recall, latency, or answer quality — no retrieval behaviour changes.
- That this document is verified. It is a list of measured claims until its invariants have been
  watched go red.
