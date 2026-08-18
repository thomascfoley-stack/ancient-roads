# MASTER — Ancient Paths programme sheet

**Read this first, every session.** It is the plan and the gate board. It is **not** the state —
state lives in `docs/STATE_OF_TRUTH.md` and this file points at it rather than copying it.

Last verified: 2026-08-18 · **live on `ancientpaths.app`: `7f62991`** (receipt
`dpl_DyCgDgehRbadxTHznQCj9a9fuysJ`, 2026-08-18T06:08Z) — the CDN-freshness unblock deploy: two
docs-only commits atop `13e3abb` plus the 211-file corpus CDN re-sync (metadata repair —
`year`/`verseEnd` on the corpus-backlog authors — parity green; WORKLOG 2026-08-17 ops entry).
**The live commit sits on `fix/q1-signed-out-state`, ahead of `origin/main` (`13e3abb`) by those
two commits** — ancestry gate satisfied (live CONTAINS origin/main), but main needs the branch
merged to close the gap. This line will go stale the moment the next lane ships; re-measure it
rather than reading it.

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
| A9 | ⚑ The `served` cutover — publishing a work is what makes it serve | **P4.0 DONE 2026-08-05 (this row was stale by four days — corrected 2026-08-08).** Mechanism closed 2026-08-04: 044 applied to prod, deploy `cb58446` live and aliased (`dpl_Cnq58Y...`, [receipt](../evidence/deploys/deploy-cb58446.txt)), verified via live `EXPLAIN` (`Index Scan using idx_embeddings_served_legal` — the shipped query, not a lookalike), 045 applied closing the redeploy window — old `idx_embeddings_vector_{legal,song_verse,sermon,theology}` confirmed dropped, only the `idx_embeddings_served_*` set remains. **Admission executed 2026-08-05 06:26 UTC:** the owner ran the flip with `serve-89-2026-08-05.json` (the 88 + `spurgeon-talks-to-farmers`) — **59,023 embedding rows -> served=true across all 89 slugs**, 0 status rows moved, gate held ([run log](../evidence/work-order-v2-stage2/flip-run-2026-08-05T06-26-44-571Z.log) · [snapshot](../evidence/work-order-v2-stage2/flip-pre-snapshot-2026-08-05T06-27-04-926Z.json)). 2026-08-06: `calvin-calcom` + `augustine-confessions` quarantined back out (P0.1 aggregates; 1,484 rows unserved, [evidence](../evidence/register-cleanup/)) — **85 net served from the batch**. **Verification DONE 2026-08-08 (owner go):** `served-reconcile` — 123 published works fully served of everything legally servable; wesley-crosswire's 1,021 unserved rows are biblehub provenance correctly held for E3 (NOT a gap); 3 inert orphans (poole-tcp, pnt-crosswire, scofield-crosswire; 2,811 biblehub rows, 0 served — E3 inventory); **one real residual: calvin-crosswire has 2 clean `books.google.com` rows unserved — owner-terminal serve-or-quarantine, filed**; `spurgeon-talks-to-farmers` measured at 298 sections / 0 work-keyed embeddings — needs a dev→prod embeddings copy to serve on /ask. `josephus-whiston` keyless as expected. `coverage-census` baseline written ([coverage-baseline-2026-08-08.json](../evidence/corpus-copy/coverage-baseline-2026-08-08.json)): **95.6% of canon verses with a served exegetical voice, 77.1% with ≥2 distinct authors** — the floor every P4.n batch diffs against. Archive.org forks RULED 2026-08-08 (ADR-110): cross-copy containment, staged-only alignment, Menno held — **and the first build landed the same day**: calibrated proof (same-edition p10 40.7% vs different-work max 17.5%, threshold 29.1%, [evidence](../evidence/p40-prep-2026-08-08/archive-crosscopy-calibration-2026-08-08.txt)) + `adapter-archive-ryle.ts` validating Ryle-on-Matthew (85 sections / 28 chapters, 90.6% cross-validated) to JSONL, no DB rows per Fork B. **P4.n backlog derived 2026-08-08: 669 works in 4 register batches + owner runbook at [p4n/RUNBOOK.md](../evidence/corpus-copy/p4n/RUNBOOK.md)** — **and its SOURCE was emptied two days later. Corrected 2026-08-15:** the 08-10 dev reset (`br-cool-flower` from `production`) destroyed the payload; **3 of 669 backlog slugs survive on `ep-tiny-hat`**. The corpus is intact on `lane-b-uploader` / `ep-snowy-bird` (669/669 · 46,645 sections · 551,851 flat rows, all `served=false`), and the four dry-runs were re-executed there **4/4 clean** ([evidence](../evidence/corpus-copy/p4n/dry-run-against-lane-b-2026-08-15.md)). The runbook carries a STOP block with the repointed variable. **Zero of the four batches have been copied**, and the 669 itself needs re-deriving against a live prod read before any run — it subtracts an 08-08 prod census that the 08-11 withdrawals and 08-13/14 corpus-backlog copies have since moved. Historians re-measured: no 41-work staged backlog exists (1 published on prod, 3 on dev) — the historian head is the unbuilt slice. E3 re-measured: 67,710 unserved rows are deletion-safe by construction; the live exposure is ADR-044's 4,174 served rows (owner call; its eval-key blocker is stale). ([order](orders/2026-08-03-served-cutover-plan.md)) |

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
| C4 | ⚑ Deploy — ships `L1`'s retry, `L2` step 2, and UX-5 | **DEPLOYED — row corrected 2026-08-10; it still read BLOCKED four deploys after reality.** `2611e1f` is live on `ancientpaths.app`, alias verified serving `dpl_4SRFDzwh5HbKLrAXCu5UqpHTu4aw` by deployment-id match ([receipt](../evidence/deploys/deploy-2611e1f-2026-08-09T01-11-00Z.txt)); the C5 auth-cutover deploy `f197406` and the 08-08/09 marketing+restyle deploys also landed. History: pre-deploy deep audit (5 lenses) returned **DO NOT DEPLOY**: `npm ci` would have failed on the builder *after* the upload, and the guard written for exactly that class was green. Both closed at `7bc3bdd`. **A1 re-run 2026-08-07** as two lenses (both completed): all 26 API routes now audited, 20 findings — **1 CRITICAL** (.docx ReDoS, 919-byte upload → 46s CPU, reproduced independently) and 3 HIGH. **Carried open (NOT re-verified 2026-08-10):** `db-invariants` was red on `main`; `DEPLOY_PREFLIGHT.md` pointed rollback at a bundle predating migrations 044/045. [Checklist](../evidence/predeploy-audit-2026-08-07/CHECKLIST.md) |
| C5 | ⚑ Neon Auth cutover | **LIVE 2026-08-08 — email/password AND Google both verified working.** Deploy `f197406` (`dpl_9sEyz51uegvYXbiGbNc4afMW61i7`) serves `ancientpaths.app`. Blast radius held to the four files the design predicted; `requireUser`/`currentUser` kept their signatures, so none of the 18 callers changed. **§10 PARTIALLY RUN — sentence corrected 2026-08-15; it claimed the Better Auth tests and package were untouched five days after F2 removed them.** The Better Auth tests and the `better-auth` package were deleted 2026-08-08 (`dc87099`, bylaw 3); migration 104's `auth_*` tables remain in prod, dead but holding 7 pre-cutover rows (`SECURITY.md`). Rollback is therefore no longer a bare `git revert` + redeploy. **The runbook's §0 owner-actions list was INCOMPLETE and cost a debugging cycle: Neon's trusted-domains list is a FOURTH console action, and with it empty every OAuth redirect is blocked with no signal visible to the repo, the SDK types, or the deploy gate.** Three things carried over worse than Better Auth and are filed, not fixed: GHSA-g38m's precondition is now fully assembled and reachable (ADR-109 + `SECURITY.md`); the 12-char password minimum and reset-revokes-sessions are UNENFORCEABLE (no such fields exist in Neon's config); and auth mail moved to Neon's shared sender `auth@mail.myneon.app`, replacing the project's branded Resend sender on the account-recovery path. **RLS under Neon's user-id format is UNPROVEN** — a working sign-in does not prove `runAsUser` binds a value the policies match, and that failure is silent (matches-nothing reads as "no data", which is indistinguishable from the ADR-108 clean start). Design: [`AUTH_CUTOVER_V2_NEON.md`](../AUTH_CUTOVER_V2_NEON.md) · runbook: [`AUTH_V2_IMPLEMENTATION.md`](../AUTH_V2_IMPLEMENTATION.md) |
| C6 | Waves 1–4 closed | **OPEN.** `T1`/`T2` wait on an auth migration that does not exist; `T4` on an owner schema call; `T3` is `DEVICE`-only; `S1` needs owner-supplied content. See the roadmap |

## Lane D — corpus CDN + /ask latency (opened 2026-08-13, [plan](orders/2026-08-13-cdn-and-ask-latency-plan.md))

| # | Gate | Status |
|---|---|---|
| D1 | Fork merge — `worktree-corpus-cdn-build` + `main` both grew the serving lists | **DONE 2026-08-15**, [PR #90](https://github.com/thomascfoley-stack/ancient-roads/pull/90) @ `08aca18`, audit green. Three checks red on the union, all real: **`gill-song` is missing from `idx_commentary_fts_legal` wherever 113 was applied** — 113 was rebuilt from a `routing.ts` that never carried it, while the other branch had it deployed and serving since 2026-08-12 (`509d690`). Neither branch was wrong alone; the union is what could see it. **Measured on dev; INFERRED for prod** from 113's text plus the 2026-08-13 WORKLOG's "applied dev+prod" — no prod read was taken (bylaw 7), so confirm with `pg_index` at the terminal. Also: the `publish-flip-toolchain` serve:false fixture moved for the **third** time (thayers published by close-out #4 → `josephus-works`), and `ObsFields` widened for the per-attempt timing arrays |
| D2 | ⚑ Migration **115** on prod | **DONE — applied 2026-08-15 10:58:20 UTC, ledger `sha256 1840d90f0d00…` (the same hash this row recorded for dev). This row read OPEN until 2026-08-16, a full day after the migration it says is outstanding had been applied to the database it names.** Verified two ways rather than one, because a ledger row is a record of intent and the planner reads the index: `schema_migrations` carries `115_fts_legal_rejoin_gill_song.sql`, AND `pg_get_expr(indpred)` on the live `idx_commentary_fts_legal` contains `gill-song`. So the predicate is 115-era and the exegetical FTS is **not** silently seq-scanning — the failure this row correctly described never occurred. `116_ask_outcomes.sql` also applied, 2026-08-16 00:52:10 |
| D3 | ⚑ Write credential for the **new** public Blob store | **OPEN — A5's premise was wrong.** The existing store is **private and holds Lane B's private `user-corpus/` uploads**; making it public would expose them. `ancient-paths-corpus` (`store_mBP8qokd9O4O9qNZ`, public, base `mbp8qokd9o4o9qnz.public.blob.vercel-storage.com`) created and **deliberately not connected** — connecting a second store is what can overwrite the `BLOB_READ_WRITE_TOKEN` Lane B depends on (verified unchanged). Owner: a token from the dashboard, or connect with a non-default env prefix. A1–A4 are built, merged and audited; the dry run plans 24,992 uploads / 0 deletes |
| D4 | B2 — where the seconds go in `/ask` | **DEV-LOCAL DONE 2026-08-15; both pre-registered rules UNTRIGGERED, so B4 built nothing.** p50 9.1s: retrieve 47.8% · compose 50.3% · verify ~0% · embed 1.8% · lanes 0ms (overlapped); 10/10 composed. Rule 1 50.4% (bar 60) · Rule 2 4.2s (bar 15). **Says nothing about production** — C2 measured ~104s there on 2026-08-07, and the prod run needs the timers deployed (D2). Cold start put 18.2s into retrieve on ask 1 vs a 4.2s p50; one ask took three compose attempts. [Evidence](../evidence/ask-latency/B2-measurement-2026-08-15-devlocal.md) |

**Ingestion note (2026-08-15):** the Kimi corpus session died mid-run on a **provider quota**, not
on context. Dev is frozen at its last polled number (flat embeddings 580,939); `bernard-song-sermons`,
`julian-revelations` and `kempis-imitation-benham` landed staged with vectors; `luther-church`,
`brooks`, `manton`, `bunyan`, `pascal`, `ignatius` **never staged** (the session's own guess that its
agents were "writing final reports" is not what the database says). Restartable from the manifest.

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
| UX-4 | **SHIPPED 2026-08-16/17** — Research History closed this: threads persist per-account at `/ask/[id]`, results open on the desk without losing the search, the §4.7 Show filter ships, every ask runs fresh (owner-ruled). Built, 4-agent-inspected, 48 tests + a 20-question live battery; deployed `e59213d`. Remaining polish filed (P2 rail refresh, P3 thread header); P4/B1 retrieval findings to quality-slice. Original text kept below for the record. |
| UX-4 (historical) | **Results cannot be opened; searches do not persist** | Captured 2026-08-02, deliberately NOT designed (owner is mid-thought and said so). Settled: click a result -> open in reader, WITHOUT losing the search; searches persist with history; history probably lives in the study-partner tabs. Open: which thing opens (the anchored passage or the voice's own work), per-device vs per-account history, and whether a stored search keeps the answer — caching generated output is governed by the accuracy bar and goes stale when the corpus moves, as it just did. **Same problem as UX-1 and should be one slice with it** |
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
| 6 | **SEC-1 — the gate decision IS the public-launch decision.** The site password gate (`middleware.ts`, everything but `gate\|api/gate\|_next/\|favicon\|manifest\|icons`) stays up until the Neon Auth transitive CVEs are resolved. Note the second-order effect measured 2026-08-16: **nothing reaches `/api/ask` while the gate is up**, so `ask_outcomes` accumulates only from owner asks — Phase-D's ~1–2k training examples are blocked behind this decision, not merely "started" | public launch · Phase-D |

### O-1 — ROTATE THE PRODUCTION DATABASE PASSWORD

**Filed 2026-08-16. Step 1 DEFERRED BY OWNER DECISION the same day, to January 2026** — "we're
in build mode… when we are done I will rotate. I will get users in January, in January I will
rotate keys." That is a ruling, not an open action: **do not re-raise it as a blocker in any
session before then.** Everything below is the standing state it is deferred *against*, and
the pre-flight that was completed around it.

Pre-flight ran 2026-08-16 ([session](../../WORKLOG.md), commits `5618cf6` · `0c47ef1`). It found
**more than this row originally described**, so read the corrections before acting in January.

**What is exposed, re-measured 2026-08-16.** A live `neondb_owner` production credential is in
git history, and **the current `~/.neon_prod_url` password is one of them** — verified by boolean
comparison, never printed. The old string was observed **connecting to `ep-odd-fog` at 17:44 UTC**,
so it is live in fact and not merely by inference. That observation is the pre-rotation control
leg of the eventual red-proof; the January session inherits a check already watched green.

**Correction 1 — the row's own measurement command counts itself.** `git log --all -S'neondb_owner:npg_'
--pickaxe-regex` now returns **7 commits**, because `c27c59a` and `1eb2b40` *quote the search
pattern*. Classifying matches by characters-after-`npg_` separates them: **12 real diff lines
across 5 commits, 6 files, 1 distinct secret.** The original numbers were right; the instrument
inflates by one every time someone writes the finding down.

**Correction 2 — scope was wider than "only `neondb_owner` [on prod]", and the working tree was
NOT clean.** A **second live credential** was in the tree and in history: `neondb_owner` on the
**dev** branch `ep-tiny-hat-atdgpisx`, a **43-character** password in Neon's pre-`npg_` format,
which no `npg_`-keyed search can see. Byte-compared against `.env.local` `DATABASE_URL_UNPOOLED`:
**identical**. `bf2fbb0` rewrote the exact line it sat on — redacting the prod credential later in
the same string and leaving this one earlier in it — because it redacted by **pattern, not by
class**. Now redacted in the tree (`5618cf6`); still in history, so **this credential needs
rotating too**, and until it is, step 3 stays blocked *independently of the prod rotation*.

**Correction 3 — step 1's Vercel precondition is closed, by measurement.** The dashboard read it
asked for is **impossible** (all three vars are Sensitive; see the order's §3b). Settled two other
ways instead: `pg_stat_activity` under load shows **`app_runtime` and nothing else** connecting,
and `web/src/lib/db.ts:24-29` throws in production rather than falling back to `DATABASE_URL`,
with a boot canary (`assertAppRuntimeRole`, `instrumentation.ts:8`) that hard-fails on any
`BYPASSRLS` role — proven red at `web/test/db-boot-assert.test.ts:34`. **Serving is unaffected by
this rotation. No redeploy step.**

**Correction 4 — a rotation of `production` alone does not close the exposure.** The project has
**8 branches, 3 of them cut directly from `production`**, and a Neon branch clones `pg_authid`, so
it keeps the parent's role passwords from the moment it was cut; a later reset does not propagate.
`pre-cutover-ep-odd-fog-atnykudm-20260729164220` → **`ep-delicate-bonus-atpq28cq`** was cut
2026-07-29 and is a full production snapshot. **UNVERIFIED whether it accepts the leaked
credential** — owner ruled test-first. The sweep across all 7 reachable endpoints is in the
order's Phase 4.

The order below is **load-bearing, not preference**:

1. **Rotate `neondb_owner`** — **DEFERRED to January by owner decision, 2026-08-16.** Then, in the
   same sitting: `~/.neon_prod_url`; the **dev** branch per correction 2; and `ep-delicate-bonus`
   if the sweep shows it accepting the old value. Breaks OWNER tooling only —
   `~/.neon_prod_url`, `CUTOVER_DATABASE_URL`, migrations — never serving (correction 3).
2. **Blob-store token** for the corpus CDN (D3) — a separate secret, unaffected by the rotation.
3. **Branch-protection call** (Pro upgrade, or make the repo public) — **NEVER before step 1.**
   The repo being private is the only thing capping the blast radius; publishing it pre-rotation
   publishes **two** working credentials, prod and dev.

Rotation is the fix, not history-scrubbing: once the secrets are dead, the history is inert.

**Shipped 2026-08-16 instead of the rotation, and it is the durable half.** The leak had a
mechanism — `scripts/land-wave.sh` `tee`s a spawned command line carrying the full
`CUTOVER_DATABASE_URL` into `docs/evidence/` — and the mechanism now has a gate:
`test/invariants/no-committed-credentials.test.ts`, which runs in `npm run audit` and CI, plus
`.githooks/pre-commit` step 4 as the fast pre-filter. Two legs, deliberately different in kind:
format-keyed repo-wide for `npg_`, and **format-agnostic** under `docs/evidence/` — the leg
`bf2fbb0` lacked. Red-proof matrix and the two defects red-proofing exposed in the check itself
are in `0c47ef1`. See `docs/SECURITY.md` → SEC-4 for the defect class.

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
not mechanism. **Re-measured 2026-08-15** (owner directive "fix main"): both endpoints re-executed
and both return the same 403 — `Upgrade to GitHub Pro or make this repository public`. The only
two routes out are owner-level: upgrade the plan, or take the repo public (which must come AFTER
the prod-credential rotation — the value is in git history, and publicizing it pre-rotation would
be the worse exposure). No agent-side mechanism exists; the note stands until one of those moves.

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
