# STUDY DOCS — build file

**Status:** build plan for `docs/STUDY_DOCS_DESIGN.md` v2 (2026-08-11). That document is the
specification; this document is the execution contract. If they disagree, the design doc wins —
fix this file.
**Lane:** C (client surfaces + user-data layer). Must stay file-disjoint from Lane A
(corpus/ingest/retrieval) and Lane B. Nothing in this plan touches the ask pipeline, ingest,
or any licensing predicate.
**Governing rules, in order:** `CLAUDE.md`, `docs/THE_LOOP.md` (every check watched go RED),
`docs/BUILD_MODEL.md` §1.4 (fixer is not verifier — no builder certifies its own work),
`docs/ENGINEERING.md`, `docs/TESTING.md`. `npm run audit` is the definition of green.
**Session discipline:** one agent session per working tree (AGENTS.md). Deploys via `deploy.sh`
only. Nothing touches `ep-odd-fog` without the owner's explicit go.

---

## 1. Non-negotiables (read before any task)

1. **Grants are part of the schema.** Tables created after migration 032 are born SELECT+INSERT
   for `app_runtime`. Every migration in this build carries its GRANTs and a self-verifying
   `DO $$ … has_table_privilege … $$` tail that raises on failure (model:
   `db/migrations/106_plan_write_grants.sql`). A migration that cannot verify its grants has failed.
2. **No client-supplied corpus text, ever.** Clipping writes are single `INSERT…SELECT`
   statements that snapshot server-side (design §6.3). Any route that accepts `quote` or
   `attribution` from a request body rejects with 400. This is structural, not conventional.
3. **Fail closed on licensing.** Tombstone = `attribution IS NOT NULL AND quote IS NULL`
   (data state), plus the render-time re-check (belt). Any error resolving servability →
   tombstone. Positive predicates only — never `NOT unservable` (three-valued-logic trap).
4. **Belts, not just RLS.** Every read carries explicit `user_id`; every write is
   ownership-checked (`WHERE EXISTS`). RLS is the backstop; C5 says it is unproven under Neon's
   user-id format.
5. **Bounded everything.** Every list, read, and search group has a row cap and a stated byte
   ceiling. An empty register group is its own query's zero — never a truncation artefact.
6. **R0: independence.** No conversational memory, no LLM call, nothing in any UI that implies
   either. Turns are flat, dated siblings; the composer says "Ask another question."
7. **Every invariant ships with its red-proof** (design §8, S-1…S-14). A check that has not been
   watched go red does not exist.

---

## 2. Phase plan

| Phase | Contents | Owner | Gate to exit |
|---|---|---|---|
| **P0 — recon** | T0 measurements (design §10): ask-surface `source_id` resolvability aggregate; register census refresh; provenance leg for `section_id`-keyed re-check | owner-approved read-only prod session (rides gate A5) | numbers in `docs/evidence/` |
| **P1 — core (Fable 5)** | Migration; data-access module; studies + block-op routes; clipping write engine (both legs); tombstone/re-check module; revisions; export serialization | Fable 5 brief (`docs/pm/FABLE5_CORE_BRIEF.md`) | §4.1 |
| **P2 — parallel build-out (swarm)** | Invariant tests S-1…S-14; UI surfaces (studies list, doc page, picker, merged search); route tests; QA sweeps | swarm brief (`docs/pm/SWARM_PARALLEL_BRIEF.md`) | §4.2 |
| **P3 — integration + verify** | Independent verification of all invariants RED→GREEN; browser passes 390px + desktop, authenticated; evidence capture; `npm run audit`; WORKLOG; deploy via `deploy.sh` | fresh session (not P1/P2 builders) | §4.3 |

P0 produces numbers, not code. P1 and P2 are sequenced (P2 builds against P1's routes). P3 is
independent eyes — BUILD_MODEL §1.4.

---

## 3. Work breakdown

### P1 — core (single builder, sequential)

| # | Task | Files (create) | Touches | Acceptance |
|---|---|---|---|---|
| 1.1 | Migration: `studies`, `study_blocks`, `study_block_revisions` per design §6.1 — CHECKs, indexes (incl. `btree_gin` composite), RLS policies, **GRANTs + verification tail** | `db/migrations/108_studies.sql` (next free number — confirm at build time) | — | applies clean on dev; the `DO $$` block passes; a deliberately wrong grant makes it raise (watch it fail) |
| 1.2 | Data-access module: all queries for the three tables, every one through `runAsUser`, H1/H2 belts, bounded reads (`ORDER BY position, id`), fractional position helper (base-62 midpoint) | `web/src/lib/studies.ts` | — | mirrors `lib/chat.ts` structure; no query outside `runAsUser` |
| 1.3 | Routes: `GET/POST /api/studies`, `PATCH/DELETE /api/studies/[id]` (rename, pin, soft-delete **cascading the tombstone to blocks in the same transaction**), `GET/POST/PATCH/DELETE /api/studies/[id]/blocks` (block ops) | `web/src/app/api/studies/**` | — | boundary validation; client-supplied `quote`/`attribution` → 400; distinct error codes (not blanket 401 — the existing routes' bare-catch pattern is a known defect, do not copy it) |
| 1.4 | Clipping write engine: both `INSERT…SELECT` legs (design §6.3), reason codes on 0 rows, whole-body cap | inside `lib/studies.ts` | — | atomic; licensing gate in the statement |
| 1.5 | Servability re-check + tombstone module, shared with the (future) history surface: two legs (source_id / section_id), fail closed, one bounded query per document | `web/src/lib/servability.ts` | — | positive-form predicates only |
| 1.6 | Revisions: append on text overwrite, same transaction; append-only by grant | inside 1.2/1.3 | — | outgoing body preserved before UPDATE |
| 1.7 | Export: study → markdown serialization (deterministic; tombstones render as attribution + notice) | `web/src/lib/study-export.ts` | — | pure function over the bounded read |
| 1.8 | Flow D ops job: purge quotes by `source_id`/`section_id` set (`cleared_at`), and re-hydration on re-instatement | `scripts/study-clipping-purge.mjs` | — | dry-run default; owner go for prod |

### P2 — parallel build-out (swarm; streams are file-disjoint, see swarm brief)

- Invariant tests S-1…S-14, each with its red-proof run and logged.
- UI: `/studies` list, `/studies/[id]` doc page (blocks, autosave with visible failure state,
  export), Save-to-study affordance (default-target + picker), merged search surface
  (per-register grouped queries + Your studies), sidebar STUDIES section.
- Route/integration tests for every endpoint.
- QA sweeps: `npm run audit`, knip, lint, type check.

### P3 — integration + verify

- A session that built nothing re-runs every red-proof (RED first, then GREEN), runs the
  authenticated browser passes, captures evidence to `docs/evidence/`, runs `npm run audit`,
  appends WORKLOG, and only then is `deploy.sh` invoked.

---

## 4. Gates

### 4.1 P1 exit
Migration applies and self-verifies on dev; all routes respond correctly to the ownership,
boundary, and provenance cases by hand-test; `npm run audit` green; no UI required to exit P1.

### 4.2 P2 exit
All S-1…S-14 checks exist and each has a logged RED run; UI complete at both viewports;
`npm run audit` green on a clean tree.

### 4.3 P3 exit (ship)
Independent re-verification of every invariant; evidence in `docs/evidence/`; clean tree;
`deploy.sh` (which itself gates on the licensing ratchet).

---

## 5. Standing risks to watch during the build

- **The 106 failure mode** — any new table, any new verb: grants verified in the migration, S-11
  in the test suite.
- **GIN write amplification** on `idx_blocks_user_tsv` under debounced autosave — set
  `fastupdate` deliberately; measure, don't assume corpus tuning transfers.
- **Blanket-401 error handlers** — the existing `/api/chats`/`/api/messages` pattern is a known
  defect (indistinguishable failures); new routes return accurate codes.
- **Cross-design dependency** — collapse model, visited markers, thread pinning live in the
  ask-history slices. If they slip, this build ships without them; do not absorb them ad hoc.
- **Prod corpus reality** — non-commentary register groups are honestly empty on prod until
  register ingest lands; no demo or browser pass may claim otherwise.
