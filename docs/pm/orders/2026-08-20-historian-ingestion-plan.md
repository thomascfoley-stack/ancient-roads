# Historian ingestion — the plan for the remaining 32 (+3 genre-history Fathers)

**Status: PLAN.** Companion to `docs/HISTORY_RETRIEVAL_DESIGN.md` (the lane, SHIPPED 2026-08-20 and
proven on production: baseline 20/20, bars hold). This plans the CORPUS: 32 historian declarations
with no rows anywhere, plus the three genre-history NPNF volumes. Follows `quality-slice` and
`INGESTION_HARNESS_DESIGN` (per-work digest, auto-decide/escalate, publish = hard human gate).

## Measured ground (2026-08-20, dev + prod reads)

- Manifest: **33 historians**; `josephus-whiston` DONE (served, lane live). **32 remain, all
  declarations only** — no sections on any database.
- `josephus-works` (`ccel josephus/complete`, serve:false) is a **suspected duplicate** of
  josephus-whiston (same Whiston translation, different edition source). No rows exist, so the
  text-match adjudication happens AT FETCH (Phase 1): shingle-containment against whiston's
  sections, the calibrated cross-copy method (ADR-110: same-edition p10 40.7% vs different-work
  max 17.5%, threshold 29.1%). Duplicate → manifest removal with evidence; distinct → it queues.
- Genre-history Fathers (§9 decision 1, ruled IN): `schaff-npnf202` (495 sections) and
  `schaff-npnf203` (584) are published/serving on the father shelf with **section_embeddings = 0**
  (corpus-copy never carried section vectors). `schaff-npnf201` (Eusebius) is **absent
  everywhere** — added to the manifest 2026-08-19, never fetched.

## Phase 0 — metadata (no fetches)

`genre:'history'` onto npnf201/202/203 manifest entries (the ruled mechanism — data per work,
never a slug list in code). Search scope note: lane membership is ALREADY write-gated — only the
historian pipeline writes `history_embeddings` — so scope for genre works = membership + the
existing `status='published'` read-time check; the `source_type='historian'` clause in
`history-search-db.ts` SCOPE widens to admit genre members, and the behavioral scope test derives
its expected set from works holding history vectors (never a typed list).

## Phase 1 — the converter, proven DEEP on one work

Build `src/ingest/ccel-to-historian-jsonl.ts`: cached CCEL ThML/XML (adapter-ccel already fetches
and caches) → heading-tree walk → the JSONL node contract `ingest-historian.ts` consumes
(`{path: string[], text}` per node; chunking/EMBED_MAX/period-verbatim/anchors stay the INGESTER's
job — the converter grows no second mechanism).

Proof work: the SMALLEST clean single-volume historian (candidates `miller-shortpapers`,
`bede-history`, `dickinson-musicchurch`; chosen at fetch by tree size + heading cleanliness).
End-to-end on dev: fetch → JSONL → ingest (staged) → **per-work digest gates**:

1. sections count sane vs the CCEL TOC (LOOK AT THE DATA: print the first nodes, read them);
2. anchors/section reported against josephus's 1.10 baseline — EXPECTED LOWER (the gazetteer is
   Josephus-skewed); ~zero FLAGS for review, never silently admits;
3. **the gazetteer-growth loop**: the digest lists the work's top UNANCHORED capitalized tokens as
   candidates. Adoption is CURATED (editorial, like MUST_NOT_SERVE) and verbatim-gated as ever —
   derived candidates, human-adopted, never grown from eval queries (circularity rail).
4. period coverage reported (verbatim A.D./B.C. only, per contract §5);

then backfill vectors → dev search spot-check (an entity IN the work returns it; not eval tuning)
→ frozen-v1 rerun (regression floors; controls must stay 4/4).

**Phase-1 exit produces the number the schedule needs**: measured sections + embed cost per work.
No estimate is offered before it exists (the 2026-08-19 lesson: extrapolation from the smallest
batch was wrong three times).

## Phase 2 — the wide run (dev), batched by the owner's priorities

1. **Schaff HCC 1–8** — the church-history spine (early church, Rome, middle ages).
2. **Martyrs**: `foxe-martyrs`, `braght-martyrsmirror`.
3. **Early-church cluster**: bede, robertson, miller, hort, edersheim-lifetimes, schaff-history
   (the 8-vol umbrella row — adjudicate vs the per-volume HCC entries: likely a THIRD duplicate
   shape), josephus-works adjudication.
4. **Reformation & modern**: baird, winkworth-tauler, bangs ×4, bacon, wuttke,
   chesterton-historyengland, dickinson, young, rutherford, remainder.

Frozen-v1 after EVERY batch. Digests committed per work. JSONL is evidence
(`data/raw/historians/` is gitignored scratch — digests + counts are what's committed).

## Phase 3 — genre-history annotate (existing sections, NO re-ingest)

A small tool for works whose sections already exist: gazetteer×verbatim anchors + verbatim periods
over EXISTING sections + embed them into `section_embeddings` + backfill `history_embeddings`.
Applies to npnf202/203 (~1,079 sections, needs embedding — the one real embed cost known today)
and npnf201 after its ordinary father ingest. Re-ingesting would duplicate serving sections; this
must not.

## Phase 4 — prod (every step owner-gated, per occasion)

corpus-copy (it carries sections + section_embeddings + section_history_anchors — verified in its
table list) → `backfill-history-embeddings --apply` → `serve-batched --table=history_embeddings`
(the serve list file grows) → publish-flip `--status-only` for shelf visibility → frozen-v1 on
prod → coverage re-census.

## Decision points (owner; none blocks Phase 1)

1. **Gibbon** (`gibbon-decline`): unambiguously PD history, and famously NOT "a Christian writing
   to a Christian audience" in chs. XV–XVI. The ADR-114 editorial standard applies; the Renan
   precedent says the stance call is yours. Flagged BEFORE fetch so no work is wasted either way.
2. `bennett-expositor10` (Expositor's Bible: Chronicles) is typed `historian` but smells like a
   mis-shelved COMMENTARY — adjudicate type before ingest.
3. `schaff-history` (umbrella) vs `schaff-hcc1..8` (volumes) — probable self-duplicate set.
4. Standing: decision #4 (retire the /ask historian lane) and §8b (similarity floor) unchanged.
