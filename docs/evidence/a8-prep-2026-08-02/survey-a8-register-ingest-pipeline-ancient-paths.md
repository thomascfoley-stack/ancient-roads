# Survey: A8 register ingest pipeline (Ancient Paths)

# A8 register-ingest pipeline as code

## What the writer writes

`src/ingest/register-writer.ts` is "the ONE writer every register adapter uses" (:1). Per work it writes three stores, in this order: (0) `deleteWork` wipe for replacement-idempotency (:176, :133-152 — `DELETE FROM embeddings WHERE user_id IS NULL AND metadata->>'work'=$1` plus removal of the work's entries from `web/public/commentaries/*/*.json`); (1) a `sources` row inserted with `status='ingesting'` (:181-189); (2) the SERVED flat `embeddings` table — batches of 64, `user_id NULL`, `source_type`, `source_id` = `type:slug:section[.chunk]` (:200), `chunk_index 0`, content, vector, metadata jsonb incl. `work`, `register`, `verseId`, `license` (:223-226, ON CONFLICT DO NOTHING); (3) static reader JSON for verse-anchored sections into `web/public/commentaries/<book>/<ch>.json` (:254-265); then (4) the final stamp `UPDATE sources SET status = publish ? 'published' : 'staged'` (:267-268). **Yes — it writes `status='published'` directly** when `work.publish` is true; a crash mid-write leaves `'ingesting'` (:178-180). Re-ingest of an already-published slug without `publish` refuses (:170-173).

Publish flag provenance: adapter-loop derives it from the served allowlists `SERVED_PROSE_WORKS`/`SERVED_SONG_VERSE_WORKS` in `web/src/lib/teacher/routing.ts:63-92` (`src/ingest/adapter-loop.ts:20-25, :124`); `sword-register-bridge.ts:42` uses manifest `entry.serve !== false`; `reference-register-bridge.ts:40` hardcodes `publish: false`.

Sermon/historian adapters are a DIFFERENT store: the 006 sections model, `status:'staged'` hardcoded in the INSERT — `ingest-sermon.ts:205`, `ingest-historian.ts:149` — writing `sources`→`sections`→`section_anchors`(/`section_history_anchors`) in a tx, then `section_embeddings` outside the tx (sermon :258-274; historian :219-239). They never publish; publishing them is the flip's job. `adapter-loop.ts:72-74` excludes historians from the register path by design (embeddings CHECK).

## Dev-only guards needing a guarded prod path

- `register-writer.ts:55-62` `assertDevBranch()` — paired-source `NEON_BRANCH` must be `dev|test`; used by `adapter-loop.ts:57, :89, :93`.
- `register-writer.ts:160-161` same NEON_BRANCH check inline in `writeRegisterWork`, plus `:165` hard endpoint regex `/ep-tiny-hat|localhost|127\.0\.0\.1/` (added by A6 audit so a stale `NEON_BRANCH=dev` on a prod URL cannot pass). These two block every register adapter (gutenberg/ccel via `writeRegisterWork`, sword-register-bridge, reference-register-bridge — none has its own env guard).
- `ingest-sermon.ts:190-193` NEON_BRANCH dev|test (no endpoint regex); published-slug refusal :198-201.
- `ingest-historian.ts:113-116` NEON_BRANCH dev|test; published refusal :142-145.
- `src/ingest/rebuild-register-indexes.ts:13` `if (!/ep-tiny-hat/.test(url)) throw` — naive substring, no override, no declaration.
- `scripts/register-label-embeddings.mjs` is ALREADY prod-capable (ran on prod as E2, `cutover.mjs:388`): `assertCutoverTarget` with `CUTOVER_ALLOW=1|B2_ALLOW_PROD=1|MIGRATE_ALLOW_PROD=1` + exact `CUTOVER_EXPECT_HOST` (:25-35). Note it labels only pre-existing rows with NULL `work`; new register ingest stamps `metadata.work` itself (register-writer.ts:204), so E2 is not re-needed for A8 works.

## Embeddings/index steps, order

Embedding is inline per work: `chunkWhole` at `REGISTER_EMBED_MAX=1200` chars (:19, :109-127), whole-chunk (never truncated), model `BAAI/bge-large-en-v1.5` via DeepInfra (:20, :66), batch-64 with per-text retry fallback that throws rather than insert empty vectors (:83-106). Index side: migrations 017/018/019/020 (register source_type, partial HNSW/FTS indexes, embeddings CHECK widening) are ALREADY on prod — applied in E1 on 2026-07-29 (`cutover.mjs:271-279`, concurrent :279; `docs/STATE_OF_TRUTH.md` §2b). New rows matching the partial-index predicates are indexed automatically; a rebuild is needed only if the served lists change, since 018 predicates "must stay in lockstep with LEGAL_CORPUS_FILTER/SONG_VERSE_CORPUS_FILTER" (`db/migrations/018_register_partial_indexes.sql:4-6`) and rebuilds must use the zero-window new-name-then-rename pattern (018:9-17). `rebuild-register-indexes.ts` (drop-INVALID-then-recreate, :18-40) is the tool but is dev-locked.

Sequencing note: `writeRegisterWork` against prod DB also mutates LOCAL `web/public/commentaries` — those static entries reach production only via `deploy.sh`→`predeploy-gate.ts` (`vercel --prod` uploads the gitignored corpus; predeploy-gate.ts:1-22). Hence the A8 shape "register ingest slice → Deploy B → publish registers" (`docs/pm/MASTER.md:44`): DB ingest staged, Deploy B ships static corpus + routing.ts served lists + register lanes, flip last.

## E/G machinery

E1 (migrations incl. registers) and E2 (register-label) are done on prod (STATE_OF_TRUTH §2b: 77,820 labeled, 112,815 remain). Regression-gate legs G1-G10 must each report per run (`scripts/lib/gate-leg-inventory.mjs:2-9`); **G5 "register wall" is currently VACUOUS on prod — "0 lane/song slug rows (register ingest never on prod)"** (STATE_OF_TRUTH table, §2b) and becomes load-bearing at A8. Supporting checks: `web/src/scripts/register-wall-check.mts` (GO_LIVE A5), `web/test/invariants/register-wall-surfaces.test.ts` and `register-end-to-end.test.ts`, plus the read-only `pnpm gate:ingest` (`src/ingest/gate-ingest.ts:1-17`). Bylaw 7: any prod connection needs the owner's per-occasion go (MASTER.md:24).

## Credential discipline today

Writer + sermon/historian: `localEnv()` reads `process.env` first, else falls back to `web/.env.local` (register-writer.ts:46-51; ingest-sermon.ts:35-40; ingest-historian.ts:30-35) — that file points at DEV, so a prod path must not inherit this fallback. `register-label-embeddings.mjs:16-23` prefers `CUTOVER_DATABASE_URL`, then env, then root `.env.local`, with timeouts/keepAlive/application_name (:57-65). `rebuild-register-indexes.ts:12` env-only. `publish-flip.mjs:80` env-only (`CUTOVER_DATABASE_URL`), never a dotfile, scrubbed logging.

## Closest prod-capable patterns

1. **Cutover delegate pattern** (`assertCutoverTarget`, `scripts/lib/target-guard.mjs:98-108`: dev free, non-dev needs override + exact endpoint id) — proven by `register-label-embeddings.mjs` on prod; the natural upgrade for `writeRegisterWork`/`assertDevBranch` and `rebuild-register-indexes.ts`.
2. **Publish-flip pattern** (`scripts/publish-flip.mjs`) for anything that flips status on prod: env-only credential (:80), `assertPublishTarget` requiring `PUBLISH_ALLOW=1` + `PUBLISH_EXPECT_HOST` even for dev (`scripts/lib/publish-flip-guard.mjs:31-77`), TTY-only owner gate (:104-123), server-side `neondb_owner` assert since `app_runtime` cannot write `sources` (:139-145, migration 010), full snapshot + delta assert + in-tx imported legal gates (:150-247). MASTER.md's A4 row confirms the precedent: every prior writer "refuses prod by construction", and publish-flip is the sanctioned adaptation (publish-flip.mjs:8-13).

Safest A8 composition per existing code: force `publish:false` on any prod-capable writer (staged ingest; avoids register-writer's direct `status='published'` bypassing the flip's snapshot/legal gates) and reuse `publish-flip.mjs` verbatim for the final flip. Whether A8 will do this is NOT ESTABLISHED — no A8 order document exists yet (only the MASTER.md:44 row; grep for "A8"/"Deploy B" in docs/pm/orders returns nothing).
