# SWARM — parallel build-out brief: Study Docs (P2)

**Precondition:** Phase P1 (Fable 5 core) is complete and its gate §4.1 has passed. The routes
and modules exist; you are building against them, not designing them. If an interface is wrong,
record it and work around it — do not edit P1 files (integration fixes belong to P3).

**Mission:** everything user-visible and everything verifiable, in parallel streams.
Specification: `docs/STUDY_DOCS_DESIGN.md` v2 (§7 UI/UX, §8 invariants). Execution contract:
`docs/STUDY_DOCS_BUILD.md` §3 P2.

## Stream map — file-disjoint by construction

| Stream | Owns (create) | Must not touch |
|---|---|---|
| **W1 — invariants, data** | `test/invariants/studies-grants.test.ts` (S-11), `studies-tenancy.test.ts` (S-4), `studies-bounds.test.ts` (S-7), `studies-order.test.ts` (S-14) | other W-streams' files; P1 core |
| **W2 — invariants, licensing** | `test/invariants/clipping-provenance.test.ts` (S-1), `clipping-tombstone.test.ts` (S-2, S-3, S-10), `search-register-groups.test.ts` (S-5, S-6, S-12) | same as W1 |
| **W3 — doc page UI** | `web/src/app/studies/page.tsx`, `web/src/app/studies/[id]/page.tsx`, `web/src/components/study-editor.tsx` (blocks, debounced autosave, **visible unsaved state** — S-13), export trigger | W4/W5 files |
| **W4 — save affordance + sidebar** | `web/src/components/save-to-study.tsx` (default target + picker), sidebar STUDIES section edit | W3/W5 files |
| **W5 — merged search surface** | `web/src/app/search/page.tsx` (or the existing search route's successor), per-register group components, Your-studies group | W3/W4 files; `lib/search-sections.ts` |
| **W6 — route tests + QA** | `test/studies-api.test.ts` (every endpoint: ownership, boundary, provenance, reason codes), then `npm run audit`, knip, lint | W1/W2 test files |

Each stream runs alone in its own working tree or in sequence on one tree (AGENTS.md: one
session per tree — coordinate, don't collide). Merge order: W1/W2 (tests define correctness) →
W3/W4/W5 (UI) → W6 (full QA last).

## Rules every stream follows

1. **Red before green, logged.** Every invariant test is run against a deliberately broken
   fixture first (the red-proof in design §8) and the run is saved under `docs/evidence/`.
   A test never watched go red is deleted, not shipped.
2. **The register wall is presentational law.** Every search row carries its register label;
   sermon/hymn content is never styled or grouped as exegesis (S-5).
3. **R0 grammar.** Turns are flat, dated, independent; composers say "Ask another question."
   Nothing in any UI implies memory or conversation.
4. **Honest empties.** A register group that renders empty says so only because its own query
   returned zero (S-12) — and on prod, non-commentary groups are expected empty until register
   ingest lands (design §2.6); test fixtures must not paper over that.
5. **Client-only state stays client-only.** Collapse, visited markers, last-save target:
   `localStorage`, keyed, never load-bearing (S-9).
6. **Match the file you're in.** House comment style, existing component patterns, existing
   fetch/error idioms — with one exception: the blanket-401 pattern is a known defect; accurate
   codes only.
7. Each stream ends with `npm run audit` green for its own changes and a WORKLOG entry with a
   NOT DONE / UNVERIFIED section.

## Done means (P2 exit, build file §4.2)

S-1…S-14 all exist with logged red runs; UI complete and manually verified at 390px and desktop
in an authenticated session (the `/gate` password — `curl` cannot see these pages, the N4
lesson); clean tree; `npm run audit` green. P3 (independent verification) is a fresh session
that built none of this — do not pre-empt its findings by declaring victory.
