# W-SLICE4 — /ask integration of the user corpus — sub-design

Sub-design gate artifact (order §8 preamble). DESIGN PHASE ONLY — no product code until an
independent verifier approves this design.

## Problem

MASTER.md B5 open item: "/ask integration (Slice 4) with its RetrievalContext.traditions
caveat." Today `teach()` (`web/src/lib/teacher/teach.ts`) retrieves corpus-only and receives
no user identity, so an asking user's own uploads can never appear in an answer.

## The caveat, quoted verbatim, and its answer

`docs/SERMON_SEARCH_DESIGN.md:94-97`:

> - **Never counts toward `≥2 traditions`.** The G1 grounding floor is satisfied only by corpus voices. User voices
>   are *additive* — they enrich, they never make the guarantee.
> - **Origin-aware verifier.** The verifier already resolves `origin: 'corpus' | 'user_library'` (`ResolvedSection`);
>   the `/ask` integration (Slice 4) must make user-origin sections additive-only.

`docs/SERMON_SEARCH_DESIGN.md:186`:

> - **Slice 4 — the `/ask` integration:** origin-aware verifier, user voices additive-only, the trust boundary
>   (§7) enforced end-to-end.

`web/src/verifier/types.ts:38-42`:

> // What retrieval returned for this query — the diversity rule is judged
> // against what was available, not against the whole corpus.
> export interface RetrievalContext {
>   sectionIds: number[];
>   traditions: string[]; // distinct traditions present in the retrieval set

The caveat: `RetrievalContext.traditions` is the AVAILABLE side of the diversity gate
(`availableTraditions`, v1.ts:335; the floor engages at `>= 2`, v1.ts:348). If user voices
entered that list with real tradition values, a user's own uploads could ENGAGE the
two-tradition requirement on breadth no corpus voice provides — laundering user breadth into
the guarantee's premise and inflating the "across N traditions" count shown to readers.

**Answer:** user voices never carry a real tradition anywhere in the /ask path. User
documents have no adjudicated tradition (migration 100 has no tradition column — this is the
data, not a fiction), so their tradition is always the absent marker (`unknown`), which the
verifier's `NOT_A_TRADITION` set (v1.ts:332) already drops from BOTH the available and the
used side. `RetrievalContext.traditions` continues to list corpus-voice traditions only.
`sectionIds` appending user sections is inert: `requiredVoices = min(3, len)` is already
saturated by the five corpus voices. The USED side is already origin-filtered
(`corpusVoiceBlocks`, v1.ts:293-339). Both directions of the caveat close with zero verifier
changes.

## Why H4 (origin-blind verifier) is preserved

The H4 fix already shipped and is load-bearing here: v1.ts:287-353 filters grounding,
diversity-voices, and diversity-traditions to corpus-origin blocks, red-proven by
`web/test/verifier-origin.test.ts`; `normalize-contract.ts:119-133` stamps
`attribution.origin` from the lookup namespace (`corpus:<id>` vs `user_library:<id>`), never
a constant. **This slice changes neither the verifier, nor the contract, nor the accuracy
gates, nor `normalize-contract`.** It only feeds the existing machine honestly: user sections
enter the lookup under the `user_library:` namespace, so the stamped origin is true and every
H4 check applies to them automatically.

## Approach (core only, per the §8 size bound)

- `teach()` gains `opts.userId`. Both /api/ask routes pass `user.id`; `/api/eval/bait` passes
  none → lane inert, eval reproducibility unchanged.
- New lane `retrieveUserVoices(userId, queryVec)` in `web/src/lib/teacher/user-voices.ts`,
  mirroring the RegisterLaneChunk idiom: fired in parallel with the existing lanes, fail-soft
  (empty on error — an additive lane never breaks the exegetical answer), K=3. It REUSES
  `semanticSearch` (`user-corpus/search.ts`) — the existing RLS-bound `runAsUser` scan — plus
  one anchor-span query (`user_section_anchors` min/max per hit) for the verifier's
  `anchor_offbase` range. No second retrieval path, no new embedding call.
- User sections are appended to the composer source list (ids continue after the corpus
  voices) with `author: You`, `work: <document title>`, `tradition: unknown`. teach.ts
  appends this block to the `buildUserPrompt` output string; **`prompt.ts` is NOT touched**
  (byte-identical CLI/web guard, `test/web-core-sync.test.ts`).
- `buildCorpusLookup` (`teacher/corpus.ts`) accepts the user sections, keyed
  `user_library:<id>`, with `verses` = the section's anchor span. teach.ts's
  `sectionAttributions` carry `origin: 'user_library'`, so normalize-contract stamps the true
  origin and the verifier resolves quotes/attribution against the real user text.
- Client (`ask-client.tsx`): `origin: 'user_library'` voice cards render labelled "From your
  library — <doc title>" (§7(a): labelled as theirs, never as an attributed historical
  voice). Label + neutral styling only; no new surface.
- RLS end-to-end: retrieval runs inside `runAsUser` (existing), so Postgres RLS binds and the
  asking user's id is the only scope; nothing user-origin is written to shared tables.

## Exact file list (implementation phase)

- `web/src/lib/teacher/user-voices.ts` — NEW, the lane (~60 lines).
- `web/src/lib/teacher/teach.ts` — `opts.userId`, lane wiring, prompt append, attributions.
- `web/src/lib/teacher/corpus.ts` — `user_library:` namespace in `buildCorpusLookup`.
- `web/src/app/api/ask/route.ts`, `web/src/app/api/ask/stream/route.ts` — pass `user.id`.
- `web/src/components/ask-client.tsx` — labelled rendering of user-origin voice cards.
- Tests (below); pre-reg (below). No migrations, no config flags, no env vars, no deps.

## Explicitly NOT built

Cross-account sharing or any use of user content for another user's query (§14 standing);
tradition-gap join semantics changes (the join's corpus predicate, ADR-104, is untouched);
ANY verifier/contract/gate/prompt.ts change; draft-check or quota work; OCR; "your library
argues X" framing beyond the labelled voice card; serving user content as a public voice.

## Test plan

1. **Two-account RLS** (`web/test/ask-user-voices-rls.test.ts`, dev-DB idiom of
   `user-corpus/search.test.ts` / `rls-two-account-REDPROOF.log`): seed users A and B with
   documents; A's /ask retrieval never returns B's sections. Red-proof: run with the
   `user_id` predicate removed → B's rows leak → green leg goes red → restore.
2. **Additive-not-load-bearing** (`web/test/ask-additive-not-load-bearing.test.ts`): seed an
   answer resting solely on user voices through the SHIPPED compose→normalize→verify path;
   the verifier must reject it (`diversity_*` / `passages_grounded`). Red-proof: launder the
   seeded blocks' origin to `corpus` → passes → restore. (Verifier-level coverage exists in
   `verifier-origin.test.ts`; this adds the pipeline level.)
3. **Lane unit tests** (`web/test/ask-user-voices.test.ts`): K bound, fail-soft on DB error,
   lookup namespace/verses round-trip, prompt block shape, attributions origin stamping.
4. **§2.4 pre-registration** (retrieval-surface change): skeleton committed BEFORE any
   measurement at `docs/evidence/swarm-2026-08-22/w-slice4/PRE-REG.md` — no-regression run of
   the /ask control stratum (frozen v4 `v4-ctl-*`) + `interpretation_bait` v1+v2 (n=100) via
   the committed live harness (`web/src/scripts/bait-run.mts`, real `teach()`), baseline vs
   after, with the lane ACTIVE under a seeded user; bars: control hijacks stay 0, bait
   faithfulness ≥99% (standing ADR-116 bar); withdrawal → revert + ADR proposal +
   HELD-FOR-OWNER. No tuning to the set after the pre-reg commit.

Cost of not building: B5's moat stays demoless — users can search their uploads but the
teacher never cites them.
