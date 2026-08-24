# W-SEC-CCEL — hardcoded `(CCEL)` provenance on copied citations

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

`web/src/components/history-results.tsx` copy-citation button appended the literal ` (CCEL)` to
EVERY citation — Josephus (a CrossWire SWORD module, the one published historian on dev) copied
as "(CCEL)". WORKLOG 2026-08-21 deferred security finding. The entry named no site; the code grep
found exactly one hardcode (the manifest `edition` fields are data, not the defect).

## Replacement (the entry's intent was not ambiguous)

Derive from the source record: `sources.provenance ->> 'edition'` — the ADR-008/010 provenance
registry, present on every `sources` row on dev (verified: `with_ed == count` for every
source_type/status bucket). Chain: `ROW_COLS` projection → `Row.edition` → `WorkRef.edition` →
clipboard string; no suffix when the record has no edition.

Files: `web/src/lib/history-search-db.ts`, `web/src/components/history-results.tsx`,
fixture ripple in `web/test/invariants/history-results.test.tsx` (interface field).

## Red / green / red-proofs

- `docs/evidence/swarm-2026-08-22/w-sec-ccel/red-unit.log` — new
  `web/test/history-citation-provenance.test.tsx` failing against the hardcode (2/2 red).
- `green-unit.log` — citation test + `history-row-to-result` + `history-results` 13/13 green.
- `redproof-a-hardcode.log` — seeded the literal ` (CCEL)` back → both citation tests red.
- `redproof-b-projection.log` — seeded removal of the `edition` projection from `ROW_COLS` → the
  derived contract assertion red. (ROW_COLS check lives in `web/test/history-row-to-result.test.ts`.)

## Notes

- Citation format: `Author, Title, Heading — Path — <edition>`; no parenthetical invention.
- `history-threads.ts` persists the payload as JSONB — the added field round-trips untouched.
- Provider spend (A1): $0.00 — no embeddings/LLM calls.
