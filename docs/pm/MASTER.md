# MASTER — Ancient Paths programme sheet

**Read this first, every session.** It is the plan and the gate board. It is **not** the state —
state lives in `docs/STATE_OF_TRUTH.md` and this file points at it rather than copying it.

Last verified: 2026-08-02 · `main` @ `b569c90` · working branch: none — re-measured, not copied

> The line above went 57 commits stale while still naming a working branch that had been merged and
> deleted, and the board's own A2 row said "(unmerged)" of a commit that merged at `1f4bf8d`
> (deep audit M25). A header that dates itself is worse than no header: it is read as measurement.
> **Re-measure it, do not copy it** — `git rev-parse --short HEAD` and `git branch --show-current`.
> The PR #48 detail it used to carry (merged 2026-08-01 02:19:30Z by merge-commit, all 21 `Model:`
> trailers preserved) belongs to the A1 row below, where it is about a gate rather than about today.

## Bylaws

1. **If it is not in the repo, it was never issued.** Orders, verdicts, audit prompts and decisions
   live under `docs/pm/`. A decision that exists only in a chat window does not exist.
2. **The docs are the source of truth.** Do not characterise a document you have not opened.
3. **Least code.** A fix must state what it costs to *not* fix it. **Deletion is an allowed remedy.**
   A check that cannot be made honest should be removed, not padded.
4. **Fixer ≠ verifier.** Agent-written work is never self-certifying. Independent audit at every STOP.
5. **A property is not an implementation.** State the property; the builder chooses how and red-proves it.
6. **Scale rigour to blast radius.** Full ceremony before an irreversible production write. Not before a
   documentation tranche.
7. **Any production connection, read or write, needs the owner's explicit go, every time** (`AGENTS.md`).
8. **Every commit carries a `Model:` trailer.**

## Where the work is

| Lane | What | Independent of |
|---|---|---|
| **A** | The product pipeline — publish, deploy, walk it | — |
| **B** | Sermon search, `docs/SERMON_SEARCH_DESIGN.md` — writes user tables on a dev branch | Lane A entirely (BUILD_MODEL §2 file-disjoint) |

## Lane A — gates

⚑ = owner go required, per occasion.

| # | Gate | Status |
|---|---|---|
| A1 | Stage 2 blockers closed · PR #48 merged | **CLOSED 2026-08-01.** All four re-executed by a fresh session that wrote none of the work — the first independent verdict this repo has carried ([verdict](orders/2026-08-01-stop-verdict-a1-closure.md)). PR #48 merged at `29d6f98`. Six findings, none blocking; three corrected by [the post-A1 tranche](orders/2026-08-01-post-a1-corrections.md), which was **itself audited on 2026-08-02** — 48 findings, 20 confirmed, 12 fixed, and the audit does not satisfy bylaw 4 ([verdict](orders/2026-08-02-stop-verdict-corrections-branch.md)) |
| A2 | ⚑ Prod read-only session — instrument over `staged` + serving census, one log, no writes | **DONE 2026-08-01** on `a2/prod-readonly-2026-08-01` @ `4b31c0c`, **merged to `main` at `1f4bf8d`** (the board said "(unmerged)" until 2026-08-02): 7/7/0/72,863 — nothing changed since 07-30; instrument PASS over staged; numbers independently re-verified CLEAN | 
| A3 <a id="a3-rule"></a> | Census adjudicated — a published-but-not-admitted work is a STOP (**seven documents cite this rule as `MASTER.md:37`; it has moved and will move again — cite [`#a3-rule`](#a3-rule), and read a line number in an older doc as "the A3 row", not as line 37**) | **ADJUDICATED 2026-08-01, NO STOP** — offline, from A2's committed artifacts, after a 4-agent adversarial verification of the evidence (CLEAN) and the rule. Six works flip; `barnes-notes` (0 admitted rows) stays staged. [Record](../evidence/a3-adjudication-2026-08-01/README.md) · flip list at `evidence/work-order-v2-stage2/flip-slugs.json` |
| A4 | ⚑ Publish flip — `UPDATE sources SET status`, exact inverse, snapshotted | **DONE 2026-08-01, 20:32 UTC — owner-executed at the terminal, gate held.** Six works `staged -> published` (`adam-clarke`, `calvin-crosswire`, `jfb`, `john-gill`, `matthew-henry`, `wesley-crosswire`); `barnes-notes` stays staged per A3. §4 diff verified: exactly the six slug lines, the register line (`commentary: 6`) and the totals line (`staged=7 published=0` → `staged=1 published=6`); `sources=7`, `sections=72863` unchanged. Evidence: `evidence/work-order-v2-stage2/flip-before.log` / `flip-after.log` / `flip-pre-snapshot-2026-08-01T20-32-31-268Z.json` (7 rows, written before COMMIT). Exact inverse: same command with `--reverse`. First refusal was the owner gate eating a pasted second command — the gate working; nothing was written on that attempt |
| A5 | ⚑ Prod instrument run — G10 stops being permanently skipped | **DONE 2026-08-02.** Instrument PASSED first run over the published cohort: 6 works, 0 NULL `unit_ordinal`, rollup `ed463702a08018a680e480fee4f9c134` ([log](../evidence/work-order-v2-stage2/instrument-published.log)). **The run was not the deliverable — the ratchet was**, and it exposed two defects that had left G10 surveying: `.cutover-checkpoint.json` held `unitOrdinal: null`, which `g10()` read as "no baseline" (asserts nothing) while the verdict read as "compared", so the gate printed `✓ REGRESSION GATE PASSED` with no qualifier; and the baseline lived only in a gitignored file that AGENTS.md records being clobbered twice, so a fresh clone silently returns to survey mode. The verdict now reports what G10 did rather than re-deriving it, and `evidence/g10-unit-ordinal-baseline.json` is the committed floor. Ratchet executed against production and red-proofed three ways ([record](../evidence/a5-published-cohort-run.log)). **G10 FORK DISCHARGE STAYS OPEN** — the end-to-end gate run wants a Neon fork, branch creation is forbidden by the standing rails, and ADR-043 wanted it BEFORE the flip; that departure is a fact and belongs in the A6 record |
| A6 | ⚑ Deploy A — the irreversible one | **DONE 2026-08-02.** Live deployment `dpl_3pbnsm9c3CKi5rKhsTNzVbnCprtR` from `main` @ `e311957`, aliased to `ancientpaths.app`; receipts under `evidence/deploys/`. **Four attempts, and the three failures are the point** — each died on something no local check could see, because it ran in a tree shape production does not have: (1) `98124b2` — `Module not found: '../../../src/ingest/forbidden-provenance.mjs'`; `vercel --prod` uploads `web/` ALONE. (2) `4275bf2` — `Invalid vercel.json - should NOT have additional property '//'`; Vercel schema-validates that file. (3) the lockfile itself, generated inside the pnpm workspace, recorded `../node_modules/.pnpm/...` paths that do not exist in the upload. All three now have static guards (`web-upload-root`, `vercel-json`, `upload-root-lockfile`). Install is `npm ci --legacy-peer-deps`, so a lockfile disagreement fails the build. The two-clone problem and the Vercel link, which this row named as blockers, were both already closed — see M24. |
| A7 | Walk the product — Stage 5's twelve journeys (unfiled; a list was derived and filed, see below) · **G7 for the first time ever** | **DONE 2026-08-02, with one check RETRACTED.** 12/12 derived journeys PASS, and **X1 ("no console errors") is WITHDRAWN as an unearned green** — the wider A7b walk found production throwing a React #418 hydration exception on essentially every reader page load, and it had been doing so the whole time. The console tool only reports messages captured after it starts listening, so a read taken *after* navigation cannot see an error thrown *during* the load it is asking about. **That check could not have failed**, which is the definition this repo already carries (`THE_LOOP.md` §6). X2 (mobile overflow) stands. The journeys stand — they were driven, not grepped. See the [A7b results](../evidence/a7b-wider-product-walk-2026-08-02.md) for the two proven mismatches (`sidebar.tsx:115-134` Sign in/Sign out, `reader-header.tsx:68` WEB/KJV) and why `layout.tsx:58`'s `suppressHydrationWarning` does not cover them. **G7 fired for the first time**: `/ask` returned three attributed voices (Barnes/Presbyterian, Clarke/Methodist, Augustine/Patristic) with the compose-verify retry loop visible live. One defect found and fixed: `/read/john/1` did not resolve while `/read/jhn/1` did — the alias table already knew "john", two callers never consulted it, a THIRD found by deriving the caller set instead of hand-listing it. Fixed, tested, red-proofed, deployed, and re-verified against production in a fresh unauthenticated session. [Order](orders/2026-08-02-a7-product-walk.md) · [results](../evidence/a7-product-walk-2026-08-02.md) |
| A7b | The wider walk — the surfaces A7's derived list missed (annotations, desk, My library, settings, sign-in) | **DONE 2026-08-02**, by an agent that wrote none of the code it walked (bylaw 4). 14 PASS · 1 PARTIAL · 2 NOT RUN across 17 journeys. **Write paths exercised for the first time** — highlight, sub-verse span, note, all verified to survive a full reload and then deleted through the UI, leaving production as found. Six defects, none a licensing/attribution/interpretation breach: the A7-X1 retraction above (MEDIUM); the reading theme control mis-states itself and "Light" does not survive a reload, because two theme systems own the `dark` class (MEDIUM); notes link to the chapter, not the verse (LOW); the bookmark write path has zero call sites while the table and its tests exist (LOW); `/settings` is a `ComingSoon` stub behind a first-class nav entry (LOW); `/auth/sign-in` serves a full login form to a signed-in user (LOW). **Still uncovered by BOTH walks:** `/study`, `/chat`, `/channel`, `/account`, `/library/books`, `/library/uploads`, and anything needing a second account — so nothing in either walk says anything about RLS. [Order](orders/2026-08-02-a7b-wider-product-walk.md) · [results](../evidence/a7b-wider-product-walk-2026-08-02.md) |
| A8 | ⚑ Register ingest slice → Deploy B → publish registers | **CLOSED 2026-08-02. All three acts.** **Act 1:** 36 works / 277,356 sections / 277,356 vectors copied dev->prod in four owner-executed runs, `mismatch: 0` on each, vectors reused verbatim so nothing was re-embedded. **Act 2:** Deploy B shipped NOTHING, because there was nothing to ship: zero changes under `web/` since the deployed sha `29a4a16`. The plan assumed serving code shipped with the data; the routing lists were already live and the registers returned nothing purely for want of rows. **Act 3:** 30 works `staged -> published`, owner-executed at the terminal, gate held (a first attempt typing `PUBLISH` was refused, nothing written). Production now serves **36 published works / 295,652 sections** across 8 registers; the 7 held works (`origen-commentary`, five lexicons, `barnes-notes`) are untouched and still staged, each by a cited ruling. Snapshot `flip-pre-snapshot-2026-08-02T19-06-12-786Z.json` (43 rows, before COMMIT); exact inverse is the same command with `--reverse`. **Getting there required fixing the flip tooling itself**, which had never completed a run: the census crashed on `sections.source_url` (prod-only) while refusing production by design; admission was modelled by slug membership and returned FALSE STOPs on four author-admitted commentaries (twelfth instance of the watchlist's first artefact); and the A3 rule had one serving category where the product has two, which is why the josephus ruling was mechanically unexecutable. Admission is now MEASURED against the shipped predicates, across BOTH surfaces (lane and shelf), with must-not-serve authors unadmittable by either. [Flip list](../evidence/corpus-copy/a8-flip-list.json) |
| A9 | ⚑ The `served` cutover — publishing a work is what makes it serve | **MECHANISM CLOSED 2026-08-04. Admission (P4.0) still OPEN.** 044 applied to prod, deploy `cb58446` live and aliased (`dpl_Cnq58Y...`, [receipt](../evidence/deploys/deploy-cb58446.txt)), verified via live `EXPLAIN` (`Index Scan using idx_embeddings_served_legal` — the shipped query, not a lookalike), 045 applied closing the redeploy window — old `idx_embeddings_vector_{legal,song_verse,sermon,theology}` confirmed dropped, only the `idx_embeddings_served_*` set remains. Publishing a work now genuinely serves it. **Not done:** P4.0 (serve the 88 already-published-but-unserved works — the flip mechanism works, nobody has run it against the current set yet) and the successor work below, unchanged. ([order](orders/2026-08-03-served-cutover-plan.md)). **Context this row also RECORDS, because nothing else on the board did:** the 2026-08-03 sweep published **77 works** to production (owner-executed, gate held; evidence committed), taking prod to **124 published works — 88 of them served by NOTHING (measured from the committed pre-flip snapshot + frozen lists + the six author-cohort works; payload committed at docs/evidence/corpus-copy/serve-88.json; an earlier '76' was sweep-local arithmetic, caught by the bylaw-4 refuters)**, which under the [A3 rule](#a3-rule) is a standing divergence, filed here and resolved by this gate's P4.0 rather than adjudicated away. Retrieval reads four hand-typed slug lists (30 slugs); migration `044_embeddings_served_expand.sql` materializes `embeddings.served` as the switch, written only by the publish flip. The first cut of this work (`4f14f17`, as migration 039) was audited by 16 agents under bylaw 4: **four plan-materially-flawed verdicts, 6/6 CRITICAL/HIGH confirmed** — a circular verifier (its expectation derived from the file under test), a register-wall breach in `diversityBackfillSql`, an unscheduled+irreversible serve of the 76, migration-number collisions (twice, once LIVE mid-rename against the concurrent /plans session), and fictional session arithmetic. All code findings fixed and watched red→green (`1ae0323`, `68d9792`); the /plans slice's four applied migrations committed to fence the numbers (`851963d`); plan re-filed as v2 in place. [Audit verdict](orders/2026-08-03-stop-verdict-served-plan-audit.md). NOT moved by this gate, filed as successor work: commentary_entries FTS + static reader + today.ts (still slug-list-gated), the ~125k work-less legacy rows (no per-work off switch), the 36,205 world-readable blocked static entries. Committed STATE_OF_TRUTH §2 still records 6 published works — stale by two publish rounds; this row supersedes it until its own re-measure. Next actions: P0.1-P0.5 local, then dev (timed apply + v3 baseline), then owner sessions per the order |

### A1 — the four Stage 2 blockers

From the independent STOP audit at `ac19935`
([verdict](orders/2026-07-31-stop-verdict-stage2.md) · [prompt](orders/2026-07-31-stop-audit-stage2.md)).
Every inventory item was VERIFIED by re-execution; these are what the inventory did not cover.

| # | Blocker | Verdict § |
|---|---|---|
| B-1 | The causal sentence is unwritten. `db-invariants` went red→green because **data on `ep-tiny-hat` and `ep-tiny-bonus` was rewritten, not because code changed** — confirmed from the runs, with the `+56`-line refactor beside the flip ruled out. Not recorded in `STATE_OF_TRUTH.md` §2e or the evidence index. | [§B](orders/2026-07-31-stop-verdict-stage2.md) |
| B-2 | `REQUIRED_GATE_PREFIXES` is typed, not derived — the **eighth** instance of the recurring class, introduced by the tranche meant to close it. Adding a `G11` leg leaves the check and its test green; the test builds its reported set from the constant it validates. | §D-1 |
| B-3 | The perturbation suite runs the **unscoped** 024 backfill and writes to sources it does not own — proven to heal a seeded NULL, i.e. it erases the drift the published leg exists to detect. | §D-4 |
| B-4 | The weld check lives only in `scripts/repair-unit-ordinal.mjs` — not in the instrument, not in CI, no test. Ordered into the CI instrument by [the 07-31 weld order](orders/2026-07-31-weld-finding-and-order.md) §1 (BLOCKING); did not land there. The guard is correct (auditor drove it against a seeded weld) but nothing re-proves it. | §F |

**Status at `03516b6`:** all four fixed, each with a red-proof re-executed against a throwaway local
Postgres, and both suites confirmed *executed* (not skipped) against the real CI test DB —
`unit-ordinal-instrument.test.ts` 15 tests, `gate-leg-inventory.test.ts` 10 tests (was 3).
**CERTIFIED 2026-08-01, and A1 is closed.** A fresh session that wrote none of the 21 commits
re-executed all four blockers and signed off: B-1 by loading both library versions side by side
(cohort recompute SQL byte-identical, 2790 == 2790), B-2/B-3/B-4 by seeding real product code and
watching each check fail. Six findings, none blocking. [Verdict](orders/2026-08-01-stop-verdict-a1-closure.md).

`DEPLOY_PREFLIGHT.md` was rewritten at `bf34b21` from 25 lines to 241 (**405 today** — this count is re-measured, and was "348" against an actual 353 when the audit checked it; `wc -l docs/DEPLOY_PREFLIGHT.md`). The
"still 25 lines (NOT DONE, carried)" line that stood here was **true when it was written and then
went stale**: `ccf7f3c` wrote it at 15:45 on 2026-07-31, when the file really was 25 lines, and
`bf34b21` rewrote it 67 minutes later. `ccf7f3c` is an ancestor of `bf34b21`, checked by ancestry
and not by timestamp.

The sentence that stood here before said the opposite — "false when it was written, `bf34b21`
precedes the commit that wrote it" — which inverts the order of the two commits. It came from the
A1 verdict, which said "false when LAST written" and named `68b14ad`; compressing it dropped "last"
and turned file-level staleness into a claim about the line's origin. `68b14ad`'s MASTER hunks are
at @37/@73/@111 and never touch these lines, so no commit that wrote the line postdates `bf34b21`
and the fallback reading fails too. The tranche that existed to stop this board contradicting its
own commits put a false history claim in it, and the count in the same sentence was stale by 100
lines. Corrected 2026-08-02 after the branch audit; see
[the verdict](orders/2026-08-02-stop-verdict-corrections-branch.md).

**Verified but not closed:** the repair's guards (weld abort, prod refusal on the *resolved* endpoint,
dry-run default, single-column scope) all fire. Its **execution** is UNVERIFIED — the auditor had no
dev credentials, so the 61,486-row claim rests on the tool's own log.

**Why the first payload is small:** nothing in this pipeline has ever run successfully on production.
E5 never ran. Whether `deploy.sh` works end-to-end is an open question in the work order itself.
The first pass should be the one where, if something breaks, you know what broke it.

## Lane B — gates

| # | Gate | Status |
|---|---|---|
| B0b | Is stated-text recall the right metric? | **RULED 2026-08-03 — ADR-103. SUPERSEDE for the ship gate, KEEP as a regression check.** Gold = an ≥8-word verbatim run; eligibility = any document with \|gold\| ≥ floor, **no epigraph required**, which is what unblocks B0a. **K must be RE-DERIVED, not carried over** — carrying K=3 across is B-1's circularity in a new costume. The two recalls never share a table (different denominators). Bounded, and stated: the new metric says nothing about paraphrase, so it cannot be the sole evidence the feature works |
| B0a | K re-validation on a fresh held-out set | **DONE 2026-08-03 — and K SHIPS AT 3 (ADR-105).** Unblocked by ADR-103 (no epigraph required), then run: derived on 90 documents across **33 authors**, validated on a disjoint 90 across **34**, author-disjoint, Spurgeon excluded from both. The pre-registered rule (smallest K with precision ≥0.60) selected K=2, which cleared (0.729) and transferred (0.716) — that derivation is valid. **But K=2 is strictly dominated:** recall is FLAT across K=1..3 because gold is an ≥8-word run and an 8-word run contains exactly three 6-word runs, so every gold verse contributes ≥3 shingles by construction and K≤3 cannot drop one. K=3 gives precision **0.935 / 0.951** against 0.729 / 0.716 at identical recall, with a third fewer returns. Ruled to 3 (ADR-105), which records that the ruling followed the table and why that is acceptable — the argument is arithmetic, not the measured values. **Exclusion rate, the paper's predicted headline:** of 8,395 units scanned, ~18% have zero gold and 2,114 more fall below the floor — over 40% of real theological prose argues about Scripture without quoting it, invisible to this metric and the old one alike. v1 of the run was UNDERPOWERED by its own floor (2 authors) and is preserved as a finding. [pre-reg v2](../evidence/lane-b-slice1/k-rederivation-PRE-REGISTRATION-v2.md) · [result](../evidence/lane-b-slice1/k-rederivation-RESULT.md) |
| B0 | Slice 0 — anchor recall | **CLEARED.** Held-out n=30, frozen harness, recall 90% (CI lower bound 74% vs a 70% bar). Precision clears at K=2 (82/68) and K=3 (75/96) |
| B1 | ⚑ Owner: a Neon dev branch to build against | **CLOSED 2026-08-03 — re-measured, not copied.** Neon branch `lane-b-uploader` = `br-fancy-block-ateczkh0`, endpoint `ep-snowy-bird-atmdsv3g`, parent `dev`. Measured on it 2026-08-03: 832 sources (35 published · 796 staged · 1 quarantined), 435,991 sections, 1,070,674 embeddings of which **328,775 carry `served=true`**. Migrations `100`/`101`/`102` applied there and nowhere else (`schema_migrations` on that branch lists exactly `044`, `100`, `101`, `102`). Two credentials, because `app_runtime` has no CREATE: `~/.neon_lane_b_owner_url` for migrations, `~/.neon_lane_b_url` for the app and for every RLS check. **This row read OPEN until 2026-08-03 while three migrations had already been applied against the branch it says does not exist** — the board's own staleness warning, one lane over |
| B2 | ⚑ Owner: confirm DeepInfra `bge-large` as the committed embedding model | **CLOSED 2026-08-03 — ADR-102.** Confirmed: `BAAI/bge-large-en-v1.5`, same model/provider/dims as the corpus. **The non-formality is WHICH STRING:** the DeepInfra API id is `BAAI/bge-large-en-v1.5`, the DB slug in `section_embeddings.model_slug` is the short `bge-large-en-v1.5`. Writing `model_slug: embedder.model` stores a value that does not equal the corpus's, and a check written as `userRow.model_slug === EMBED_MODEL` is **tautologically green while every user row mismatches** — the bug wearing the check's uniform. The literal is hand-typed in 12 places with zero shared exports; Slice 1 adds one module with the slug DERIVED from the API id, plus a no-other-file guard test |
| B3 | ⚑ Owner: Vercel Pro (hobby cron is daily; useless for an ingestion queue) | **CLOSED 2026-08-03.** The `home-network-hardening` team carries the **Pro** badge in the Vercel dashboard (observed 2026-08-03 while provisioning the Blob store). **The reason this gate existed is now moot rather than merely satisfied:** Slice 1's queue does not wait for cron at all — `web/src/app/api/user-corpus/upload/route.ts` kicks a fire-and-forget drain via `after()`, per §8 and the Slice 1 order. Cron granularity would only matter for a straggler sweep, which Slice 1 does not ship |
| B4 | Translation decision — shingle against the user's translation, or all. Moved the headline 17 points | **RULED 2026-08-03 — ADR-100.** Option A, per-**document** detection, no user setting in Slice 1. Three things the [paper](../SLICE1_TRANSLATION_DECISION.md) left open are closed by the ADR: the bar is **end-to-end channel recall with detection running, not detector top-1 accuracy** (the 18 translations are not equidistant — kjv↔akjv costs ~0, kjv↔web costs ~17 points); detection resolves to a **family**, ~~and unions within it when the top two are close~~ **(union WITHDRAWN 2026-08-03 — measured)**, with a below-floor fallback **recorded** in `user_section_anchors.confidence` rather than applied silently; families are **derived from measured 6-gram overlap, never typed**. **MEASURED, pre-registered at `edefd92` before the run:** the five KJV-descended translations cluster exactly as predicted (claim 1 holds, at every threshold tested, against a median pairwise Jaccard of 0.053 across 153 pairs) — but the family union costs **1.640×** the largest member against a pre-registered withdrawal bar of 1.50, so decision 3 is withdrawn and the channel shingles against ONE detected translation. The rest of the ADR is strengthened: Option B (union across all 18) measures **7.821×**, so rejecting it is now measured rather than argued. [pre-registration](../evidence/lane-b-slice1/translation-family-PRE-REGISTRATION.md) · [result](../evidence/lane-b-slice1/translation-family-RESULT.md) |
| B5 | Slice 1 — prose/sermons end-to-end + the tradition-gap join | **IN PROGRESS.** All of B0-B4 now closed or ruled (B2→ADR-102, B0b→ADR-103, B4→ADR-100 as amended). **Done:** step 1 (migrations 100-103 on `lane-b-uploader`; RLS proven two-account over `app_runtime`, 28 legs watched red), step 2 (upload/parse/status; docx zip-bomb cap, scanned-PDF loud failure, `SKIP LOCKED` drain — all red-proofed; blob round-trip proven against the live store), step 3a-3d (the uncited channel with differential parity to the FROZEN primitives, the prose packer at the corrected 1200-char budget, `anchorChunk` with two channels, and the pre-registered family measurement). **Next:** §4 — ADR-103's metric as a fresh vN, deriving K on one set and validating on a disjoint second. **Gated:** the tradition-gap join, on Lane A merging `served` (ADR-104) — until then Slice 1 is, in the order's own words, the filing cabinet |

## Lane C — UX remediation (opened 2026-08-07)

A third lane, file-disjoint from A and B: client surfaces plus the plan data layer. Spec is
[`docs/UX_REMEDIATION.md`](../UX_REMEDIATION.md) (19 blocks, 5 waves); sequencing and blockers in
[`UX_REMEDIATION_ROADMAP.md`](UX_REMEDIATION_ROADMAP.md). **This lane had no row here until
2026-08-07, by which point it had already applied a migration to production** — caught by its own
pre-deploy audit (finding 6), not by this board.

| # | Gate | Status |
|---|---|---|
| C1 | `R0` recon — confirm or kill the spec's "reuse the existing X" claims | **DONE 2026-08-07.** Four false, five items already shipped at `e196e4b`, two claims about things not in this build. Three defects in the spec itself, since corrected by owner decision (v1.4) |
| C2 | `INSTR` — instrument both broken loops | **DONE 2026-08-07.** `Mark as read` was `500`, 5/5 — **not** the auth-scope fault the audit deck inferred, and not the 404 `R0` guessed. `permission denied for table plan_days`: `032` narrowed the schema default, `039` then created `plans`/`plan_days` citing a `016` comment `032` had already invalidated. **`Delete plan` was broken identically and neither audit had tried it.** Ask did NOT reproduce — 2/2 succeeded; what showed up was latency (~104s/~58s vs the block's stated 18s/45s) |
| C3 | ⚑ `L2` — the plan-write outage | **STEP 1 DONE AND LIVE 2026-08-07.** `db/migrations/106_plan_write_grants.sql` — `UPDATE` on `plan_days`, `DELETE` on `plans`, derived from the only write verbs in `store.ts`. Red-proofed on a throwaway by replaying `001 → 032 → 039`, three checks watched RED, cascade proven with a control. Owner-applied; ledger `sha256 7893d0d8ebc5…`. Verified live: 10/10 marks persist, survives reload, delete works. Step 2 (optimistic toggle) deferred to the next deploy |
| C4 | ⚑ Deploy — ships `L1`'s retry, `L2` step 2, and UX-5 | **BLOCKED.** Pre-deploy deep audit (5 lenses) returned **DO NOT DEPLOY**: `npm ci` would have failed on the builder *after* the upload, and the guard written for exactly that class was green. Both closed at `7bc3bdd`. **A1 re-run 2026-08-07** as two lenses (both completed): all 26 API routes now audited, 20 findings — **1 CRITICAL** (.docx ReDoS, 919-byte upload → 46s CPU, reproduced independently) and 3 HIGH, of which three are **live on production now** and independent of the deploy. **Still open:** `db-invariants` is red on `main`; `DEPLOY_PREFLIGHT.md` points rollback at a bundle predating migrations 044/045. [Checklist](../evidence/predeploy-audit-2026-08-07/CHECKLIST.md) |
| C5 | ⚑ Neon Auth cutover | **DESIGNED 2026-08-08, not started.** Owner ruled to leave Better Auth (ADR-107); SEC-1 re-opens knowingly, because `@neondatabase/auth@latest` is still `0.4.2-beta` pinning `better-auth@1.4.18` — measured from the registry twice. Design: [`AUTH_CUTOVER_V2_NEON.md`](../AUTH_CUTOVER_V2_NEON.md). **Runbook for a fresh session: [`AUTH_V2_IMPLEMENTATION.md`](../AUTH_V2_IMPLEMENTATION.md).** Blocked on three owner actions in the Neon console (Enable Auth, copy the Auth URL, mint the cookie secret) — no code is worth writing before they exist. Blast radius is small and measured: **two** server files import better-auth, plus the client module; `requireUser`/`currentUser` keep their signatures |
| C6 | Waves 1–4 closed | **OPEN.** `T1`/`T2` wait on an auth migration that does not exist; `T4` on an owner schema call; `T3` is `DEVICE`-only; `S1` needs owner-supplied content. See the roadmap |

**Watchlist, instance fifteen — and it is the same shape as fourteen, one layer down.** `039` broke
two shipped features by **citing a documented fact forward instead of re-reading the current
state**: `016`'s "migration 001 grants full DML, so no new GRANT is needed" was true when written
and false once `032` narrowed the default. The cure for a hand-maintained grant was a narrower
default, and nothing checks that a migration's cited premise still holds. **Sixteen is in the same
audit:** `upload-root-lockfile.test.ts` was written to catch A6's lockfile failure and asserted a
dependency has *some* locked version rather than a *satisfying* one — green on the tree where
`npm ci` refused. Both are assertions weaker than the property they name, guarding the exact defect
they exist for.

### Queued behind A8 — filed 2026-08-02

| # | Item | Note |
|---|---|---|
| UX-1 | **The Bible cannot be reached on the desk** | **Corrected 2026-08-02**: this row first said the pane model could not hold Scripture and needed a design decision. Wrong — `lib/desk.ts` already has `kind:'scripture'` beside `kind:'work'` and `/desk` renders both, so a Bible pane opens today by URL. It is a **picker gap**: `+` routes to `/library?desk=…`, which offers catalogs of works only. Much cheaper than filed |
| UX-2 | **The `+` affordance is unexplained** | Row opens the work alone, `+` adds it to the desk, nothing says so; the tooltip is hover-only and absent on touch. **ADDRESSED 2026-08-07** (`e196e4b`): one visible line above the work list — "Tap a work to read it, or + to open it beside what is on your desk" — rather than a label on every row, which is the same answer twenty times down a page. **NOT browser-verified**: `/library/[catalog]` needs DB credentials the working tree does not have, so this is typecheck-and-lint only (WORKLOG 2026-08-07 NOT DONE). A 2026-08-07 UX walk reported the `+` as having "no label or tooltip" — it has both an `aria-label` and a `title`; this row already had the real diagnosis |
| UX-4 | **Results cannot be opened; searches do not persist** | Captured 2026-08-02, deliberately NOT designed (owner is mid-thought and said so). Settled: click a result -> open in reader, WITHOUT losing the search; searches persist with history; history probably lives in the study-partner tabs. Open: which thing opens (the anchored passage or the voice's own work), per-device vs per-account history, and whether a stored search keeps the answer — caching generated output is governed by the accuracy bar and goes stale when the corpus moves, as it just did. **Same problem as UX-1 and should be one slice with it** |
| UX-3 | **Desk layout model** | Grid not a row (top-to-bottom as well as left-to-right), no 3-pane cap, drag-resize, collapsible left chrome. **The cap is doing performance work**: an uncapped grid over `spurgeon-sermons` (118,371 sections) is a virtualisation problem before it is a layout one |

[Order](orders/2026-08-02-reader-ux-desk-and-bible.md). Deliberately not merged into A8: these are
client changes to a working surface, and A8's remaining act is a status flip that has been kept
narrow on purpose.

### UX-5 — the rail hid five features below an unmarked scroll (CLOSED 2026-08-07, `e196e4b`)

Filed and closed in one pass, from an owner-supplied UX walk of the live app. The rail's `<nav>`
scrolls while `Settings` sits OUTSIDE it behind a `border-t`, so a cut-off list read as a finished
one. **Measured before the fix, at 1280x720: 158px of overflow hiding exactly five destinations** —
Theology & Creeds, Passage search, My library, Word study, and My Works, the last of these being
the most differentiated feature in the product. Closed with a content mask (background-agnostic,
because the same component renders on two different surfaces) applied only while something is
below; red-proofed both ways — on with 418px hidden, off at the bottom.

**The same walk's other findings landed with it**, and four of its claims were wrong in ways worth
keeping: the verse handle already had a pointer cursor, a hover shift and full ARIA; selecting
verse text already opens a popover; the library `+` already had a label and a tooltip (UX-2 above
had the real diagnosis); and the ToC's `Part N` rows are mechanical chunks of one work, so the
per-chunk titles it asked for do not exist in the data. **Two defects it did not name** turned up
while working the list: `/account/settings` exists and **nothing linked to it** — the
orphaned-surface bug on its fourth surface after the Library hub, the Historians shelf and My Works
— and the `/ask` lane checkboxes carried `text-accent-700`, the `@tailwindcss/forms` idiom, with
that plugin **not installed**, so the class was inert and the boxes rendered browser-blue. That is
the watchlist's "a dead check that looks like the fix" wearing a stylesheet.

**Ask latency is NOT in this tranche and should not be**: it is a retrieval/compose change, gated
by the accuracy diagnostic and `interpretation_bait` through the live loop. Swapping the example
prompts for ones that "reliably succeed" is likewise not done — that is tuning to the demo.
`npm run audit` did not run (refuses without a dev `DATABASE_URL`); DB-free legs green, DB-backed
legs NOT RUN. See WORKLOG 2026-08-07.

## Owner decisions outstanding

| # | Decision | Blocks |
|---|---|---|
| ~~1~~ | ~~Neon dev branch for Lane B~~ | **DONE 2026-08-03** — `lane-b-uploader` / `ep-snowy-bird-atmdsv3g`. See B1 |
| ~~2~~ | ~~Confirm `bge-large` for user-corpus embedding~~ | **DONE 2026-08-03 — ADR-102.** See B2 |
| ~~3~~ | ~~Vercel Pro~~ | **DONE 2026-08-03** — Pro badge observed; and Slice 1's queue does not use cron at all. See B3 |
| 4 | Front-matter gating — all admitted hits stop, or strong-only (`origin/wip/front-matter-strength`) | merge of that branch |
| 5 | Each ⚑ gate above | that gate |

## Failure-mode watchlist

**Fourteen instances so far.** The thirteenth: the four SERVED_*_WORKS routing lists themselves,
closed by MATERIALIZATION rather than derivation (migration 044, `embeddings.served` — a partial
index predicate cannot hold a subquery, so the set became a column with one writer; A9). **The
fourteenth is the inversion of the cure, and it is the new shape to watch for: a verifier whose
expectation is DERIVED FROM the artifact under test.** `verify-served-backfill.mjs` v1 parsed its
expected filters out of the live `routing.ts` "so the copy could never go stale" — then the same
commit rewrote `routing.ts`, and every load-bearing check silently became `served` diffed against
`served`: a tautological equality, an unsatisfiable licensing check, and a red-proof that counted
ANY failure as success (2026-08-03 audit finding 1, CONFIRMED; fixed by FREEZING the expectation
and welding it to the migration text — `scripts/lib/served-backfill-frozen.mjs`,
`test/invariants/served-backfill-frozen-sync.test.ts`). Derivation cures hand-maintenance ONLY
when the derivation source is not the thing being verified. Corollary from the same fix, watched
red on a throwaway: **SQL three-valued logic makes `NOT predicate` checks silently skip
NULL-evaluating rows** — `FALSE OR NULL = NULL`, so the repaired unreachability check STILL
could not see a wrongly-served work-less row until coalesced. A licensing predicate that can
evaluate NULL fails open.

The eighth was introduced by the tranche meant to fix the class; the
tenth was introduced by the tranche meant to *name* it; **the eleventh had a test standing guard
over it, built from the same wrong list** — `publish-flip-census.test.ts` asserted the census
mentions `SERVED_PROSE_WORKS` and `SERVED_LANE_WORKS`, which is exactly the incomplete pair the
census was wrongly admitting from, so the guard certified the gap for the life of the defect
(A8/B2, closed by derivation 2026-08-02, [record](orders/2026-08-02-a8-b2-admission-and-decisions.md)).
Read that as the standing lesson for this class: **a guard whose expected set is typed by the same
hand that typed the thing it guards is not a second opinion.** `b9ad463` §2.2 declares itself the ninth (the
served-asset directory list, closed by derivation). The tenth is
`test/ask-max-duration-literal.test.ts:26-29` — a hand-typed two-route array in the file whose own
header names this class, already incomplete at the commit that introduced it, closed by derivation
on 2026-08-01 ([red-proof](../evidence/post-a1-2026-08-01/maxduration-redproof.md)).

**The artefact list below names ten items against a count that has never matched it** (it read
"eight" while listing ten). The count above is of *instances found*, which is not the same list;
no attempt is made here to renumber the artefacts to match, because inventing a mapping is how this
kind of drift becomes permanent.

- **A hand-maintained expected set that nothing enforces.** CI file allowlist · `USER_TABLES` · the gate's
  legs · `isUserScoped` · the licence-manifest domain list · role literals · `REQUIRED_GATE_PREFIXES` ·
  the served-asset directory list (ninth, derived at `b9ad463`) · the `maxDuration` route list
  (tenth, derived 2026-08-01) · the publish **admission** set (eleventh, derived 2026-08-02 —
  `SERVED_WORK_LISTS` / `ALL_SERVED_WORKS`, enforced by
  `test/invariants/publish-admission-covers-served-lists.test.ts`).
- **A verdict computed separately from the report of that verdict.** `reportExpectRedMismatch` beside
  `compareExpectRed` · a header certifying "clean-provenance works only" while another predicate chose the
  sample · a CLI growing its own `formatExcerptLine`.

Also seen: red-proofs seeding a *copy* of the predicate · checks that are algebraic identities · mocks
asserting they return what they were told · "audit green" while `db-invariants` is red · a test that
repairs the defect it measures (the perturbation suite's unscoped backfill) · **an unearned RED**:
`db-invariants` failed on `ca53457`, a docs-only commit, because
`web/test/invariants/section-vector-pairing.test.ts` calls the live DeepInfra embedding API and got
`429 engine_overloaded`. Re-run with no code change: green. The gate is therefore non-deterministic,
and a red does not distinguish "broken" from "the provider was busy" — which is how a real red gets
waved through. Not fixed here; a bounded retry on 429, or an explicit NOT RUN on provider
unavailability, would make the signal mean one thing again.

**A fifth, found by T1 (2026-08-01): a gate nobody runs is not a gate.** `next build` was not in CI —
neither `audit` nor `db-invariants` compiled the app — so the production build sat broken at HEAD with
every check green. The deploy itself, at step 6 of 7, was the only thing that would have caught it.
**CLOSED at `19798ec`**: `.github/workflows/audit.yml:55-65` runs `next build` as step 7 of the
`audit` job, with `set -o pipefail` so a failure through `tee` is not swallowed, and a second
annotation that names the likely cause because Next reports segment-config errors without naming a
route. Watch for gates that exist only inside an irreversible operation.

**Still open, and it is not the same thing:** `main` is **unprotected** — `required_status_checks`
is empty and rulesets are unavailable on this plan for a private repo. `audit` is not a required
check. So the build gate is real inside the job, and nothing mechanically stops a red commit
reaching `main`. Every "nothing merges red" sentence in this repo is a statement about discipline,
not mechanism.

**A sixth, and it produced two of this week's errors: an instrument's blind spot recorded as a
property of the thing it could not see.** `6ab5779` established, correctly and precisely, that the
Vercel CLI on this machine cannot reach the `web` project — it authenticates as `thomas-5672`
against scopes that do not contain it. It then wrote down that the deployment "appears in no Vercel
listing", and told readers to delete the id from every document. The id is real: it is the
deployment serving `ancientpaths.app`. A scope limit became a claim about the world. **Same family
as reporting a provider outage as a failure: a negative result that is really a NOT RUN.** The tell
is a universal negative ("appears in no…", "exists nowhere…") whose evidence is one instrument's
silence. Corrected in [RECOVERY.md](../RECOVERY.md) §2 on 2026-08-01.

**A fourth, found by B-1: an eligibility rule that selects for the population it was built on.** The
Slice 0 stated-text parser reads Spurgeon's CCEL typography (quote-then-reference) and matches
essentially nothing else — 63 hits on 78,655 Spurgeon lines, 1 on 116,162 lines of Wesley/Edwards/
Whitefield, who all state the reference first. So every "held-out" set built by that rule is drawn from
one author by construction. Watch for filters whose reach is narrower than the population they claim to
sample.

**A third shape, and a standing check on this directory: a correction filed where nobody meets the
claim it corrects.** The `chrysostom-homilies` "+16 prolegomena" story lived in the ADR-029 addendum;
the correction to it (deltas are **(16, 17)** — two deletion points) was first written only into
`STATE_OF_TRUTH.md` §2e, which a reader of ADR-029 has no reason to open. It now sits in both. Apply
this to every correction: **name the document a reader reaches when they meet the wrong version, and
put it there** — the canonical record is where the correction is *complete*, not where it is *first*.

**Instance nine is not a strategy.** This needs one deliberate decision — a mechanical check, or explicit
acceptance that it recurs and audits catch it.

## Index

- Plan: `docs/pm/WORKORDER_V2.md` (six stages) — **NOT YET FILED.** The index previously pointed at
  `AP_WORKORDER_V2.md`, which is not in this repo either. Per bylaw 1 the plan is currently unissued;
  the target path above is where it goes.
- Programme brief: `docs/pm/PROGRAM_BRIEF.md` — **NOT YET FILED.**
- Two-lane strategy: `docs/pm/orders/2026-07-31-strategy-two-lanes.md` — **NOT YET FILED.**
- State: `docs/STATE_OF_TRUTH.md`
- Rulings: `docs/DECISIONS.md`
- Orders and verdicts: `docs/pm/orders/`
- Lane B design: `docs/SERMON_SEARCH_DESIGN.md`
