# VERDICT — W-SLICE4 sub-design (docs/pm/swarm-2026-08-22/w-slice4/DESIGN.md @ a256082)

**APPROVE-WITH-CONDITIONS.** Independent verifier; did not write the design. Verified against
the worktree /tmp/swarm-slice4 (branch swarm/w-slice4-ask-integration), reading shipped code.

## What checks out (verified, not trusted)

1. **Verbatim quotes are accurate.** SERMON_SEARCH_DESIGN.md:94-97 (never counts toward ≥2
   traditions; origin-aware verifier), :186 (Slice 4 line), and web/src/verifier/types.ts:38-42
   (RetrievalContext comment + fields) all match the design's quotations exactly.
2. **Zero-verifier-changes is substantively TRUE.** web/src/verifier/v1.ts:293 filters
   `corpusVoiceBlocks` to `origin === 'corpus'`; :295 builds grounding ranges from those only;
   :332 `NOT_A_TRADITION = {'unassigned','unknown',''}` drops the absent marker from BOTH the
   available (:335) and used (:338, corpus-only anyway) tradition sets; :339 counts distinct
   corpus-origin sections for the voices floor. normalize-contract.ts:119-133 stamps
   `attribution.origin` from the lookup namespace (`src.origin ?? priorOrigin ?? 'corpus'`),
   never a constant. web/test/verifier-origin.test.ts exists. Migration 100 has no tradition
   column (verified) — `unknown` is the data, not a fiction.
3. **Counterexamples fail closed, as claimed.** A retrieval set of ONLY user voices:
   `availableTraditions`=∅ (traditions gate never engages), `distinctVoiceSections`=0 <
   `min(3, N)` → `diversity_voices` violation, and `groundingRanges`=∅ → every passage
   `passages_grounded` violation. A compose resting solely on a user voice: resolution/quote/
   attribution checks run and pass against the real user text, but no passage can be grounded
   and the voices floor can't be met → rejected. Through teach() this case can't even reach
   compose (teach.ts:211-213 early-returns empty on corpus-empty retrieval — unchanged).
4. **RLS is real, end-to-end, and double-bound.** runAsUser (web/src/lib/db.ts:111-121) sets
   `app.current_user_id` transaction-locally via set_config; migration 100 enables RLS with
   user-scoped policies on all four user tables; migration 122 applied FORCE RLS — red-proven
   (docs/evidence/uploader-deep-dive-2026-08-20/migration-12x-redproof.log: the table owner
   without the GUC sees all rows BEFORE, is policy-bound AFTER). semanticSearch adds an explicit
   `user_id` predicate as a second independent filter. Prod boot asserts the runtime role is
   NOBYPASSRLS. User A surfacing for user B requires defeating BOTH bindings. The bait path is
   genuinely inert: /api/eval/bait/route.ts:44 calls `teach(question)` with no opts, and the
   lane only fires on `opts.userId`. Both /api/ask routes already have `user.id` from
   requireUser() — passing it is a one-line change each.
5. **Pre-reg satisfies §2.4 in structure.** Claim, method, frozen dataset identity, hard
   pass/fail bars, withdrawal bar, anti-tuning rule; committed with results `_pending_` before
   measurement. Datasets are real: v4-ctl-01..10 exist in web/src/scripts/heldout-v4-queries.mts
   (:150-159); interpretation_bait.yaml (35 cases) + _v2.yaml (65) = n=100;
   web/src/scripts/bait-run.mts exists and drives the real teach() (:72).
6. **Scope discipline is good.** One new ~60-line lane + teach.ts + corpus.ts + two routes +
   client + tests. The NOT-built list explicitly forecloses cross-account use, join-semantics
   changes, verifier/contract/gate/prompt.ts changes. prompt.ts untouched preserves the
   byte-identical CLI/web guard.

## Conditions (all small, design-level; none expand scope)

1. **Correct the false "inert" claim about `sectionIds`.** The design says appending user
   sections to RetrievalContext.sectionIds is inert because "min(3, len) is already saturated
   by the five corpus voices." That holds only when ≥3 corpus voices exist. With 1–2 corpus
   voices (sparse retrieval; RETRIEVE_K=6 does not guarantee 5), appending 3 user ids raises
   `requiredVoices` from min(3,1|2)=1|2 to 3 (v1.ts:340) — a bar only corpus-origin sections
   can clear (:339) — turning previously-passable sparse answers into guaranteed
   `diversity_voices` rejections. Fail-closed, but a real behavior change the design denies.
   Fix: keep `sectionIds` corpus-only (don't append user ids); the floor is judged against
   corpus availability anyway. Amend the design text.
2. **Fix the test-1 red-proof — as written it cannot go red.** With migration 122's FORCE RLS
   and the NOBYPASSRLS runtime shape, removing the explicit `user_id` predicate does NOT leak
   user B's rows (RLS still binds), so "predicate removed → leak → red" is an unwatchable red.
   The red leg must weaken both bindings (e.g., also run outside runAsUser / clear the GUC, or
   drop the policy on a throwaway DB), or red-proof each binding separately. Also correct the
   citation: `rls-two-account-REDPROOF.log` does not exist; the real precedents are
   web/test/user-corpus/search.test.ts (two-account leg) and
   docs/evidence/uploader-deep-dive-2026-08-20/migration-12x-redproof.log.
3. **Pre-reg references a nonexistent script.** `scripts/served-pool-snapshot.mjs` exists
   nowhere in the repo (searched worktree and main). Create it or amend the pre-reg BEFORE any
   measurement run; amending after measurement starts would breach §2.4 rule 4.
   (Orchestrator note: the script exists on branch swarm/w-adrv4rerun @ 0abbd5b, added by
   W-ADRV4RERUN — the builder may port that committed copy rather than write a new one.)
4. **Declare the harness change in the file list.** PRE-REG AFTER(b) ("lane ACTIVE under a
   seeded dev user") requires bait-run.mts (or a declared sibling) to pass a userId into
   teach(); it currently calls `teach(c.prompt)` only (:72). Add it to the design's file list.
   (Verifier note: baseline sha `9dce273…` could not be confirmed from this read-only review —
   confirm it resolves before the baseline run. Orchestrator: confirmed, it is origin/main.)
5. **Client: specify the tombstone bypass.** resolveVoiceSourceId (save-to-study.tsx:141-161)
   matches voice quotes against the CORPUS retrieval payload, so user voices resolve to null,
   and ask-client.tsx:903 tombstones any unresolvable voice whenever the withdrawal set is
   non-empty — a user voice would render attribution-only with its quote stripped. The design
   must state that origin `user_library` cards skip the withdrawal/tombstone path (withdrawals
   are corpus-row concepts). Already-acceptable behavior to record: `workHref(undefined)` →
   null → renders unwrapped (:94-96); `eraOf(undefined)` → Modern neutral (:122-123); the
   save-to-study affordance auto-suppresses on null sourceId (fail-closed, fine).
6. **State what "From your library" does and doesn't mean (one paragraph in the design).**
   Up to K=3 top-ranked passages, brute-force over the user's own chunks (no ANN recall
   collapse — search.ts:76-81); absence of a user voice carries NO meaning (top-3 ranking can
   miss relevant passages — cf. the 70% chapter-level stated-text recall at shipped K=3,
   STATE_OF_TRUTH §5); and a user voice can never appear alone — corpus-empty queries still
   return "No relevant sources found" (teach.ts:211-213), unchanged. The design's refusal of
   "your library argues X" framing is right; this adds the absence-means-nothing half so
   reader expectations are set honestly.

None of the conditions require new product surface, new dependencies, config flags, or scope
beyond the brief's core. With 1–6 folded into the design, build may proceed.
