# W-SLICE4 — /ask integration of the user corpus (sub-design gated, Wave 3)

Status: **DESIGN-FILED** (awaiting independent verifier design review; NO product code written)
Branch: `swarm/w-slice4-ask-integration` · Worktree: `/tmp/swarm-slice4`
Base: `9dce273ef09dffb03bc547cead0431f48fb71ffe` (origin/main, Wave-0 baseline)

## Transitions

- **CLAIMED** 2026-08-23 — design phase only per the §8 sub-design gate. Read order §§1, 2,
  8 (W-SLICE4 brief), 12A; `docs/SERMON_SEARCH_DESIGN.md:88-101,186`;
  `web/src/verifier/types.ts:38-47`; the 2026-08-20 uploader deep dive (H4 additive-voices
  rule); the /ask pipeline (`web/src/app/api/ask/`, `web/src/lib/teacher/`); the user-corpus
  retrieval modules (`web/src/lib/user-corpus/`).
- **DESIGN-FILED** 2026-08-23 — `docs/pm/swarm-2026-08-22/w-slice4/DESIGN.md`: the
  RetrievalContext.traditions caveat quoted verbatim and answered (user voices carry no real
  tradition → `NOT_A_TRADITION` drops them from both sides of the diversity gate; zero
  verifier changes), H4 preservation argued (verifier/normalize-contract untouched; the
  `user_library:` lookup namespace feeds the shipped origin machine honestly), exact file
  list, NOT-built list, test plan. §2.4 pre-reg skeleton committed BEFORE any measurement at
  `docs/evidence/swarm-2026-08-22/w-slice4/PRE-REG.md`.

## Key facts established during reading

- H4 is already fixed at base: verifier origin-filters grounding + both diversity floors
  (`web/src/verifier/v1.ts:287-353`), red-proven by `web/test/verifier-origin.test.ts`;
  `normalize-contract.ts:119-133` stamps origin from the lookup namespace. Slice 4 changes
  none of these files.
- `teach()` currently receives no user identity (`teach(question)`); both /api/ask routes
  have `user.id`; `/api/eval/bait` calls `teach(question)` with none — the design keeps the
  lane inert there so eval reproducibility is unchanged.
- `prompt.ts` is byte-identical CLI/web (`test/web-core-sync.test.ts`) — the design appends
  the user-library block in teach.ts and does NOT touch prompt.ts.
- RLS idiom: `runAsUser` (`web/src/lib/db.ts:111`) + `semanticSearch`
  (`web/src/lib/user-corpus/search.ts`) — reused, not rebuilt.

## Spend (A1)

$0.00. Design phase only: no embeddings, no LLM compose/verify calls, no eval runs.
(Reading + worktree bootstrap only.)

## Env bootstrap (§2.7)

Both env files silently checked before copying (`grep -qE 'odd-fog|CUTOVER_'`): root
`.env.local` CLEAN, `web/.env.local` CLEAN. No values printed. Assets + `node_modules` +
`web/node_modules` copied APFS `-c`.

## Next

Independent verifier design review (Wave 7 eyes on the DESIGN.md). On APPROVE: implement per
the design's file list; red-proofs before fixes; `npm run audit` green in the worktree; then
the pre-registered no-regression measurement. On REQUIRED CHANGES: revise the design first.
