# W-SEC-CURSOR — `after=1e21` → 500 on the sections route

Workstream: W-UX1 · Branch: `swarm/W-UX1-ux1-desk-bible` · Base: `9dce273` (origin/main)

## Status: FIXED — audit green except one PRE-EXISTING baseline red (2026-08-23)

`npm run audit` in the worktree: every leg green, all new/changed tests pass inside the suite
(web 1625 passed | 128 skipped; root 847 passed) EXCEPT
`test/publish-flip-toolchain.test.ts > thayers evidence gate > the SHIPPED CLI refuses…` — a
BASELINE red on origin/main 9dce273 (test 256701e asserts the absence of
`docs/evidence/thayers-source-verification.md`, which abe5252 later committed). Proven
pre-existing: a pristine-base audit of the same worktree fails identically (1 failed | 847
passed, same counts). Owned by W-BASEFIX (`swarm/w-basefix-thayers-guard`, pushed) — deliberately
NOT duplicated here. Logs: `docs/evidence/swarm-2026-08-22/w-ux1-workstream/audit-*.log`.
Expect green at Wave 8 once basefix merges.

Transitions: CLAIMED → RED-PROVEN → FIXED → AUDIT-GREEN* (*see baseline-red note above). VERIFIED/MERGED: Wave 7/8 (not this agent).

## The defect

`GET /api/work/[slug]/sections?after=1e21`: `Number('1e21')` passes `Number.isInteger`, reached
SQL as `ordinal > '1e+21'` against the INT `ordinal` column → `NeonDbError 22P02` → handler threw
→ Next 500. WORKLOG 2026-08-21 deferred security finding.

## Red (watched before the change)

- `docs/evidence/swarm-2026-08-22/w-sec-cursor/red-live.log` — live dev DB (ep-tiny-hat), real
  route handler, published slug `matthew-henry`: `HANDLER THREW (Next would 500): NeonDbError
  code=22P02 invalid input syntax for type integer: "1e+21"`.
- `docs/evidence/swarm-2026-08-22/w-sec-cursor/red-unit.log` — the new invariant test failing
  against the unfixed route (400 expected, 200 via mocked data layer = invalid input forwarded).

## Fix (least code)

`web/src/app/api/work/[slug]/sections/route.ts` — one clause added to the existing param guard:
`after > 2_147_483_647` → 400 with the repo's standard `INVALID_REQUEST` shape. Cost of not
fixing: any unauthenticated caller can 500 a public route at will.

## Green + red-proofs

- `green-unit.log` — 16/16 in `web/test/invariants/api-hardening.test.ts`.
- `green-live.log` — live route now answers `HTTP 400 {"error":{"code":"INVALID_REQUEST",…}}`.
- `redproof-seeded.log` — the `after > INT4_MAX` clause removed → the new test fails; restored → green.

## Notes

- Route file is NOT among the 16 handlers touched by `swarm/W-SEC-CSRF-csrf-floor` (GET-only) — no merge adjacency.
- Provider spend (A1): $0.00 — no embeddings/LLM calls; local vitest + one dev read.
