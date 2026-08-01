# Survey: Gate A8: register ingest -> Deploy B -> publish registers — order of operations, human gates, publish-flip reuse, digest contract, doc contradictions

## What "Deploy B" means
"Deploy B" occurs exactly once in the tracked repo: the A8 row, docs/pm/MASTER.md:44 ("Register ingest slice → Deploy B → publish registers | Blocked on A7"). No document defines it — git grep returns that single hit. By parallel with "Deploy A" (docs/DEPLOY_PREFLIGHT.md:1-8: the 7-step `deploy.sh` pipeline ending in the only irreversible act, the `vercel --prod` promotion at step 7, DEPLOY_PREFLIGHT.md:44-49,66-69), Deploy B is a second run of that pipeline — but that reading is inference; the definition is NOT ESTABLISHED. Note the ordering inversion: commentaries flipped before deploying (A4 flip → A6 Deploy A, MASTER.md:40-42); A8 places the deploy BEFORE the publish. Rationale: NOT ESTABLISHED anywhere.

## Required order of operations (assembled from the docs)
1. **A7 closes first** (MASTER.md:44).
2. **Declare works** in `ingest/sources.config.json` — the license/provenance registry written before ingest, reviewed before backfill (docs/INGESTION_RUNBOOK.md:25-64).
3. **Build a guarded prod ingest writer — it does not exist.** Registers live only on dev; prod flat embeddings carry no work key and register ingest never ran there (docs/STATE_OF_TRUTH.md:78-81,116; docs/DECISIONS.md:680-682). Every existing writer refuses prod: adapters write dev `status='staged'` (RUNBOOK:66-84); dev-only guards at src/ingest/repoint-sections-work.ts:92, rebuild-register-indexes.ts:13, historian-contract-backfill.ts:28, suppress-chrysostom-prolegomena.ts:66. The precedent to copy is scripts/publish-flip.mjs (env-only credential, exact endpoint declaration via `PUBLISH_EXPECT_HOST`, server-side `neondb_owner` assertion, TTY owner gate, full snapshot, delta assertion — publish-flip.mjs:80-199) plus the spec shape in docs/pm/orders/2026-08-01-a3-a6-readiness.md:111-137, red-proved on throwaway local Postgres. Whether A8 re-runs adapters against prod or copies dev→prod: NOT ESTABLISHED.
4. **Ingest to `staged`** (migration 023's `'ingesting'` in-flight marker, RUNBOOK:119-124), embed inline in the writers (RUNBOOK:135-149), then **`gate:ingest`** per work + corpus, irreversible-first L1-L5/R1-R5 (RUNBOOK:86-115).
5. **Owner editorial preconditions:** josephus excise §4113-4124 (12 sections) then publish ~4,112 to the historian register; lexicons stay staged; edersheim/schaff stay staged (docs/DECISIONS.md:465-473). ADR-029: no CCEL work publishes without a composite-volume boundary check (DECISIONS.md:308-309).
6. **Per-work digest → owner approval** (see below).
7. **Fresh held-out vN before any publish-affecting decision** (docs/INGESTION_HARNESS_DESIGN.md:82-86).
8. **Deploy B** (position fixed by MASTER.md:44, before publish).
9. **Adjudicate the register flip list** (A3-analog emitting a new slug file), **rehearse the flip + G10-analog on a fork BEFORE prod** (ADR-043, DECISIONS.md:890-897 — fork creation is owner-level, readiness:152-156).
10. **Publish flip** with publish-flip.mjs, then the §4 census diff (scripts/publish-flip-verify.mjs) and a human read of one work (docs/evidence/work-order-v2-stage2/PUBLISH_FLIP.md:117-121).

## Hard human gates
- Bylaw 7: any prod connection, read or write, owner go per occasion (MASTER.md:21).
- Digest approval IS the publish authorization; never auto-fires (INGESTION_HARNESS_DESIGN.md:46-47; RUNBOOK:159-166).
- The flip's interactive gate: TTY-only stdin, literal word `publish`, piped input refused (publish-flip.mjs:104-123).
- Deploy step 7 promotion (DEPLOY_PREFLIGHT.md:66-69).
- Fork creation, josephus excision, lexicon hold, CCEL rulings (above).
- **Flag:** the A8 row carries no ⚑ marker though it contains at least two ⚑-class acts (MASTER.md:33,44).

## Can publish-flip.mjs be reused as-is?
Mechanically yes — registers are `sources` rows and the guards/idempotency/`--reverse` transfer. What must differ:
- **New slug file** (`--slugs=`): current flip-slugs.json is the 6 commentary works only; slugs are read literally, never a predicate (publish-flip.mjs:62-78). Also pass `--evidence` (default is the stage2 dir, :53).
- **Prod rows must exist first**: missing slugs are a hard STOP (:158-161); prod `sources` today holds only the 7 commentary-pilot rows (STATE_OF_TRUTH.md §2d:~137-150).
- **Admission tooling gap:** publish-flip-census.mts:62 and publish-flip-adjudicate.mts:78 admit by `SERVED_PROSE_WORKS ∪ SERVED_LANE_WORKS` only — `SERVED_SONG_VERSE_WORKS` (15 hymn/poetry works, web/src/lib/teacher/routing.ts:85-91) is NOT in the admission set, so a song/verse flip would false-STOP as published-but-not-admitted.
- **Provenance blind spot:** the flip's `sections.source_url` leg (:222-235) is vacuous for register works — `ingest-sermon.ts`/`ingest-historian.ts` never populate `source_url` (docs/SECTION_PROVENANCE_DESIGN.md:143-151); legality rests on `sources.provenance` + ingest-time gates.

## What the per-work digest must show the owner
Five pre-verified card elements (INGESTION_HARNESS_DESIGN.md:52-58): work + source; license class + source URL + translator/edition/year + forbidden-domain result (green only if Gate B passed); match result (% repair/re-embed/quarantine with 2-3 sampled comparisons); accuracy delta on the held-out eval measured in staging; recommended action + rationale. `ingest-harness.ts --source=<slug>` prints it and publishes nothing (RUNBOOK:153-157). Cadence: event-based batching, delivered in chat; pause ingest above ~2 unreviewed source-works (~30 works); >30% quarantine on one work escalates as "source/edition likely wrong" (HARNESS:121-125).

## Contradictions a fresh agent will trip over
1. RUNBOOK:161-163: "There is deliberately **no publish script** in this repo" — false since scripts/publish-flip.mjs:1 (the A4 writer).
2. MASTER.md:40 says A4 is blocked on "tooling that does not exist"; the tree now carries publish-flip.mjs, publish-flip-verify.mjs, publish-flip-adjudicate.mts, and PUBLISH_FLIP.md §1's table is filled with the 6 flipped works — the board is stale against tonight's state.
3. "Deploy B" is undefined (single occurrence, MASTER.md:44).
4. RUNBOOK:181-183: "no history read path exists" — stale; the Book Reader gates on `status='published'` (web/src/lib/work.ts:64,77) and the owner call publishes josephus "for the Book Reader" (DECISIONS.md:470-473).
5. INGESTION_HARNESS_DESIGN.md:3-6 status stamp ("holds 4 works") is dev-pilot-era.
6. G5 register wall is VACUOUS on prod (STATE_OF_TRUTH.md:116); ADR-035 forbids hard-coding "non-empty after A8" — ratchet + printed denominators instead (DECISIONS.md:686-690).
7. ROADMAP.md:11 / WORKLOG.md:109 record a standing HOLD on "Phase 3 / E5 deploy / register ingest".
