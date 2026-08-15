# FABLE 5 — core build brief: Study Docs (P1)

**Mission:** build the complete data layer and API core for Study Docs — Phase P1 of
`docs/STUDY_DOCS_BUILD.md`, against the specification in `docs/STUDY_DOCS_DESIGN.md` v2.
You are the deep-work builder: migrations, data access, routes, the clipping engine, the
servability module, revisions, export. The UI and the test swarm come after you, against your
interfaces. Build for that: your route shapes and module signatures are contracts a parallel
team will code against without talking to you.

## Read first, in order

1. `AGENTS.md` → `CLAUDE.md` → `docs/THE_LOOP.md` → `docs/BUILD_MODEL.md` — the standing rules.
   Highlights: licensing fails closed; never print a secret; never write a production connection
   string to disk; a check not watched go RED proves nothing; **your work is not self-certifying**
   — a later independent session verifies it.
2. `docs/STUDY_DOCS_DESIGN.md` v2 — the spec. §6 (data) and §8 (invariants) are your contract.
3. `docs/STUDY_DOCS_BUILD.md` — tasks 1.1–1.8 are yours, in order, with acceptance criteria.
4. `web/src/lib/chat.ts` and `web/src/lib/db.ts` (`runAsUser`) — the belt patterns you mirror.
5. `db/migrations/106_plan_write_grants.sql` and `032_audit_2026_08_02_data_layer.sql` — the
   grants failure you must not repeat, and its postmortem.
6. `web/src/lib/search-sections.ts` — the engine P2's search surface will call; do not modify it.
7. `docs/ASK_HISTORY_DESIGN.md` §4.4 + its audit's F-4/F-8 — why the servability module exists.

## Scope — yours

Everything in P1 (build file §3): migration `108_studies.sql` (confirm next free number);
`web/src/lib/studies.ts`; `web/src/app/api/studies/**`; the two-leg clipping `INSERT…SELECT`;
`web/src/lib/servability.ts`; revisions; `web/src/lib/study-export.ts`;
`scripts/study-clipping-purge.mjs` (dry-run default).

## Scope — not yours (do not touch)

- Any UI (`web/src/app/studies/**` pages, components, sidebar) — the swarm builds against your routes.
- Invariant tests beyond the red-proof smoke checks you need for your own loop — the swarm owns S-1…S-14.
- `search-sections.ts`, `retrieve.ts`, `teach.ts`, anything in `src/ingest/`, any existing
  licensing predicate, `chats`/`messages` (companion design's slices), deploys, and anything
  touching `ep-odd-fog`. Lane discipline: file-disjoint from A and B.
- No new dependencies without surfacing it first — match what's already imported nearby.

## Hard requirements (the build will be rejected without them)

1. **Grants + self-verifying tail in the migration**, modelled on 106. Watch the `DO $$` block
   raise on a deliberately wrong grant before trusting it.
2. **Provenance is structural:** clipping quote/attribution are written only by the server-side
   `INSERT…SELECT`. Routes 400 any client-supplied `quote`/`attribution`.
3. **Every query through `runAsUser`**; H1 belt on reads, H2 `WHERE EXISTS` on writes.
4. **Tombstone is a data state** (`quote IS NULL` + `attribution`), render rule shared from
   `servability.ts` — not reimplemented per caller.
5. **Soft delete cascades the tombstone** to blocks in the same transaction.
6. **Accurate error codes.** Do not copy the blanket-401 bare-catch pattern from
   `/api/chats` / `/api/messages` — it is a known defect.
7. **Bounded reads** with `ORDER BY position, id`; base-62 fractional position helper.
8. `npm run audit` green when you finish. WORKLOG entry with a NOT DONE / UNVERIFIED section —
   you did not run the independent verification, and you say so.

## Working style

- Sequential and careful beats fast: this is the layer every later mistake compounds through.
- When the design doc and the tree disagree, the tree wins — stop, record the discrepancy in
  WORKLOG, and proceed on the measured facts (or leave the task flagged; do not guess).
- Keep each module's header comment in the house style: what it guarantees, which invariant
  guards it, which finding motivated it (see `search-sections.ts:1-29` for the shape).
- Evidence: log your red-proof runs (commands + output) under `docs/evidence/` per repo custom.

## Done means

Build file §4.1: migration applies and self-verifies on dev; routes hand-tested for the
ownership, boundary, and provenance cases; `npm run audit` green; WORKLOG appended. You do not
declare the feature working — you declare the core built and list what you did not verify.
