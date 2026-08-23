# MASTER — Ancient Paths programme sheet

**Read this first, every session.** It is the plan and the gate board. It is **not** the state —
state lives in `docs/STATE_OF_TRUTH.md` and this file points at it rather than copying it.

> **A6 split (2026-08-23).** This file is the BOARD. All long-form narrative — the gate-row
> histories, the A1 blocker narrative, the O-1 corrections, the failure-mode watchlist — moved
> VERBATIM to [`MASTER_HISTORY.md`](MASTER_HISTORY.md). Rows cite it as `MASTER_HISTORY.md §<anchor>`.

Last verified: 2026-08-21 · **live on `ancientpaths.app`: `d5cfa04`** (receipt
`dpl_C56HPSV59onumHD89PpqcxxhySrP`, 2026-08-21T07:13Z) — the night of three deploys: the union that
restored the highlighter release, Daily Office Sprint 1 (+ five-lens audit remediation), study
entrance, desk continuous read, My Works Tier 0, B021. Live sits on `fix/q1-signed-out-state`,
ahead of `origin/main`; the merge-to-main gap remains. This line goes stale the moment the next
lane ships; re-measure it rather than reading it.
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

⚑ = owner go required, per occasion. Full row histories: `MASTER_HISTORY.md §lane-a`.

| # | Gate | Status |
|---|---|---|
| A1 | Stage 2 blockers closed · PR #48 merged | **CLOSED 2026-08-01** — all four blockers re-executed and certified by a fresh session that wrote none of the work; PR #48 merged at `29d6f98`. The blocker narrative: `MASTER_HISTORY.md §a1-blockers` |
| A2 | ⚑ Prod read-only session | **DONE 2026-08-01**, merged to `main` at `1f4bf8d`: 7/7/0/72,863 — nothing changed since 07-30; numbers independently re-verified CLEAN |
| A3 <a id="a3-rule"></a> | Census adjudicated — a published-but-not-admitted work is a STOP (cite `#a3-rule`, not a line number) | **ADJUDICATED 2026-08-01, NO STOP** — six works flip; `barnes-notes` (0 admitted rows) stays staged |
| A4 | ⚑ Publish flip | **DONE 2026-08-01, 20:32 UTC — owner-executed, gate held.** Six works `staged -> published`; exact inverse = same command with `--reverse` |
| A5 | ⚑ Prod instrument run — G10 stops being permanently skipped | **DONE 2026-08-02** — instrument PASSED over the published cohort; the ratchet (not the run) was the deliverable and exposed two verdict defects, both fixed. **G10 FORK DISCHARGE STAYS OPEN** (needs a Neon fork; branch creation forbidden by the standing rails) |
| A6 | ⚑ Deploy A — the irreversible one | **DONE 2026-08-02** — live `dpl_3pbnsm9c3CKi5rKhsTNzVbnCprtR` from `main` @ `e311957`. Three failed attempts first, each now static-guarded (`web-upload-root`, `vercel-json`, `upload-root-lockfile`) |
| A7 | Walk the product — twelve journeys · **G7 for the first time ever** | **DONE 2026-08-02, with one check RETRACTED.** 12/12 journeys PASS; X1 ("no console errors") withdrawn as an unearned green; G7 fired live (three attributed voices through compose-verify) |
| A7b | The wider walk — the surfaces A7 missed | **DONE 2026-08-02** — 14 PASS · 1 PARTIAL · 2 NOT RUN across 17 journeys; write paths exercised for the first time; six defects filed, none a licensing/attribution/interpretation breach |
| A8 | ⚑ Register ingest slice → Deploy B → publish registers | **CLOSED 2026-08-02, all three acts.** 36 works / 277,356 sections copied dev→prod (`mismatch: 0`); Deploy B shipped nothing (serving code was already live); 30 works published. Production: 36 published works / 295,652 sections across 8 registers |
| A9 | ⚑ The `served` cutover — publishing a work is what makes it serve | **P4.0 DONE 2026-08-05; verification DONE 2026-08-08.** 59,023 rows -> served across 89 slugs (85 net after two quarantines); 123 published works fully served. Residuals filed: `calvin-crosswire` 2 clean unserved rows (owner serve-or-quarantine); `spurgeon-talks-to-farmers` needs a dev→prod embeddings copy |

## Lane B — gates

Full row histories: `MASTER_HISTORY.md §lane-b`.

| # | Gate | Status |
|---|---|---|
| B0b | Is stated-text recall the right metric? | **RULED 2026-08-03 — ADR-103.** SUPERSEDE for the ship gate, KEEP as regression check; K re-derived, not carried |
| B0a | K re-validation on a fresh held-out set | **DONE 2026-08-03 — K SHIPS AT 3 (ADR-105).** K=2 won the pre-registered rule but is strictly dominated; the ruling followed the table |
| B0 | Slice 0 — anchor recall | **CLEARED.** Held-out n=30, recall 90% (CI lower bound 74% vs a 70% bar); precision clears at K=2 and K=3 |
| B1 | ⚑ Owner: a Neon dev branch to build against | **CLOSED 2026-08-03** — `lane-b-uploader` / `ep-snowy-bird-atmdsv3g`. [Stale note corrected 2026-08-21: migrations 100–104 are on PRODUCTION, 105 later] |
| B2 | ⚑ Owner: confirm DeepInfra `bge-large` | **CLOSED 2026-08-03 — ADR-102.** The non-formality is WHICH STRING (API id vs DB slug); Slice 1 derives the slug from the API id, one module, guard test |
| B3 | ⚑ Owner: Vercel Pro | **CLOSED 2026-08-03** — Pro badge observed; Slice 1's queue does not use cron at all |
| B4 | Translation decision | **RULED 2026-08-03 — ADR-100.** Option A, per-document detection; the family union measured 1.640× and was withdrawn against its pre-registered 1.50 bar |
| B5 | Slice 1 — prose/sermons end-to-end + the tradition-gap join | **SHIPPED AND LIVE** (row corrected 2026-08-21) — on prod since 2026-08-05; the 2026-08-21 remediation wave closed H3/H4/H5/H8, D1/D2/D13–D19, M2, M3. Open from the deep-dive order: Slice 4 (/ask integration — in build on `swarm/w-slice4-ask-integration`), the anchor backfill for pre-detection documents, H9's owner-terminal EXPLAIN, the `asserted_ownership_at` licensing column (owner) |

## Lane C — UX remediation (opened 2026-08-07)

Spec `docs/UX_REMEDIATION.md`; sequencing `docs/pm/UX_REMEDIATION_ROADMAP.md`. Full row histories:
`MASTER_HISTORY.md §lane-c`.

| # | Gate | Status |
|---|---|---|
| C1 | `R0` recon | **DONE 2026-08-07** — four false claims, five already shipped; three spec defects corrected by owner (v1.4) |
| C2 | `INSTR` — instrument both broken loops | **DONE 2026-08-07** — `Mark as read` was `permission denied for table plan_days` (039 cited a premise 032 had invalidated); `Delete plan` broken identically; /ask did NOT reproduce (latency, not failure) |
| C3 | ⚑ `L2` — the plan-write outage | **STEP 1 DONE AND LIVE 2026-08-07** — migration 106 grants, owner-applied, verified live. Step 2 (optimistic toggle): the C4 row claimed it shipped — **disproven 2026-08-22**; implemented on `swarm/W-L2TOGGLE-plan-toggle`, deploy pending |
| C4 | ⚑ Deploy — ships `L1`'s retry, `L2` step 2, UX-5 | **DEPLOYED** — `2611e1f` live 2026-08-09. The .docx ReDoS CRITICAL is CLOSED and LIVE (`1ab40de`, guarded). Carried open (NOT re-verified 2026-08-10): `db-invariants` red on `main`; DEPLOY_PREFLIGHT rollback bundle predates 044/045 |
| C5 | ⚑ Neon Auth cutover | **LIVE 2026-08-08** — email/password AND Google verified. Three leftovers filed (GHSA-g38m precondition assembled; 12-char minimum + reset-revokes unenforceable; branded sender lost). **RLS under Neon's user-id format is UNPROVEN** |
| C6 | Waves 1–4 closed | **OPEN.** `T1`/`T2` wait on an auth migration that does not exist; `T4` on an owner schema call; `T3` is `DEVICE`-only (code complete per `UX_REMEDIATION.md`; device leg NOT RUN); `S1` needs owner-supplied content |

## Lane D — corpus CDN + /ask latency (opened 2026-08-13, [plan](orders/2026-08-13-cdn-and-ask-latency-plan.md))

Full row histories incl. the ingestion note and watchlist instances 15/16: `MASTER_HISTORY.md §lane-d`.

| # | Gate | Status |
|---|---|---|
| D1 | Fork merge — `worktree-corpus-cdn-build` + `main` | **DONE 2026-08-15**, PR #90 @ `08aca18`. The union exposed `gill-song` missing from `idx_commentary_fts_legal` wherever 113 was applied — measured on dev, INFERRED for prod (confirm with `pg_index` at the terminal) |
| D2 | ⚑ Migration **115** on prod | **DONE — applied 2026-08-15**, verified two ways (ledger + `pg_get_expr(indpred)` contains `gill-song`). `116_ask_outcomes.sql` applied 2026-08-16 |
| D3 | ⚑ Write credential for the **new** public Blob store | **OPEN — A5's premise was wrong.** The existing store is private and holds Lane B uploads. `ancient-paths-corpus` created and **deliberately not connected**. Owner: a token from the dashboard, or connect with a non-default env prefix. A1–A4 built, merged, audited; dry run plans 24,992 uploads / 0 deletes |
| D4 | B2 — where the seconds go in `/ask` | **DONE.** Prod n=25 (2026-08-15): compose 74.4% · retrieve 23.8% · p50 10.5s / p95 20.6s — Rule 1 FIRES, both halves already shipped, so the remaining lever is compose itself. Read prod numbers as WARM |

### Queued behind A8 — filed 2026-08-02

Full rows: `MASTER_HISTORY.md §queued-a8`.

| # | Item | Status |
|---|---|---|
| UX-1 | Bible reachable on the desk | **CLOSED — ALREADY-DONE at base.** The pane model holds Scripture (`kind:'scripture'`) and the picker gap was closed 2026-08-02 at `5760eec` (BookPicker pick mode + desk add-rail book button + "Open the Bible" empty state). Verified by two independent workstreams + the orchestrator (adjudication: `docs/pm/swarm-2026-08-22/ADJUDICATION.md`) |
| UX-2 | The `+` affordance is unexplained | **ADDRESSED 2026-08-07** (`e196e4b`, one visible line above the work list); **browser-verified 2026-08-22** on `swarm/W-UX2VERIFY-ux2-browser-verify` (merge pending) |
| UX-4 | Results cannot be opened; searches do not persist | **SHIPPED 2026-08-16/17** — Research History closed this; deployed `e59213d`. Remaining polish filed (P2 rail refresh, P3 thread header) |
| UX-3 | Desk layout model | Grid, no 3-pane cap, drag-resize, collapsible chrome. **In build 2026-08-22** on `swarm/w-ux3-desk-grid` — sub-design APPROVE-WITH-CONDITIONS (core = grid + virtualization + cap 3→16; drag-resize/chrome are stretch). The standing caveat: the cap is doing performance work — `spurgeon-sermons` (118,371 sections) makes this a virtualisation problem before a layout one |

### UX-5 — the rail hid five features below an unmarked scroll

**CLOSED 2026-08-07, `e196e4b`** — content mask applied only while something is below, red-proofed
both ways. Full narrative incl. the walk's four wrong claims: `MASTER_HISTORY.md §ux-5`.

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

**DEFERRED to January 2026 by owner ruling 2026-08-16** — "we're in build mode… in January I will
rotate keys." A ruling, not an open action: **do not re-raise it as a blocker before then.** Two
live credentials (prod AND dev) sit in git history; the leak's mechanism is gated
(`test/invariants/no-committed-credentials.test.ts` + pre-commit hook). Never before step 1:
taking the repo public. Full pre-flight, corrections 1–4, and the load-bearing step order:
`MASTER_HISTORY.md §o-1`.

## Lane E — corpus↔surface reconciliation (opened and CLOSED 2026-08-20)

Full row histories: `MASTER_HISTORY.md §lane-e`.

| # | Gate | Status |
|---|---|---|
| E1 | Instrument built and red-proved | **DONE** — `scripts/corpus-surface-matrix.mts`; predicates IMPORTED not retyped |
| E2 | ⚑ Production run | **DONE 2026-08-20** — 362 works; 294 of 296 first-run findings were the instrument (vestigial SERVED_* lists treated as declared register); reclassified → 2 |
| E3 | Dead clause resolved | **DONE** — 37-slug clause naming a NULL column deleted after neutrality proven (64,331 admitted both ways); migration 119 rebuilt the FTS index |
| E4 | Missing materializations closed | **DONE** — `gill-song` + `barnes-crosswire-nt` (7,431 rows / 27 books). Books of 66 with zero admitted entries: **NONE** |
| E5 | Matrix clean | **DONE — 0 findings across 362 published works.** NOT in CI (needs production data): periodic owner-gated run; CI carries the code-level half |

## Lane F — the gate that could not go green (opened 2026-08-21)

Full row histories incl. F4: `MASTER_HISTORY.md §lane-f`.

| # | Gate | Status |
|---|---|---|
| F1 | The CI parent predates the corpus | **CLOSED `13eed33`** — repointed to `dev`; trade recorded (green but drifting) |
| F2 | Migration `011` could not be applied to any fresh branch | **CLOSED `c851c2c`** — the migration set could not replay from zero; proven by execution |
| F3 | The gate executed ~45% of the time | **CLOSED `a55db09`** — repo-wide concurrency key starved it; re-keyed per-ref. Neon branch cap NOT READ |
| F4 | Name what remains red, and who owns each | `history-scope-db` **CLOSED 2026-08-23** — W-HISTSCOPE merged into the closeout candidate, Wave-7 verified live (both directions green on dev, 27s real execution); the 50-entity out-of-scope population stays filed as a historians-lane finding (packet A9). `licensing`/`plan-tenancy`/`register-wall-surfaces` still UNCONFIRMED on the repointed parent |
| F5 | ⚑ First green run | **ACHIEVED 2026-08-22** — run `32562471249` @ `2012e03`, BOTH jobs SUCCESS: the first green `db-invariants` in repo history, every suite truthfully accounted (ADR-119 criterion) |

## Queued — the `SCAN_RE` false-floor class (filed 2026-08-21, owner: not beta-blocking)

`SCAN_RE`'s bare numeric path floors non-citations where an ordinary noun is also a book alias
(`1 mark 5`, n=2/10 measured) — a precision leak on idiomatic phrasing, not a wrong-book defect on
genuine citations. Candidate direction: extend ADR-015's corroboration gate to numerics whose book
word is a common English noun. **In progress under W-SCANRE** (closeout swarm, pre-registered bar,
merge-only-if-clear). Full analysis: `MASTER_HISTORY.md §scanre`.

## Failure-mode watchlist

The standing watchlist — eighteen named instances plus the artefact list (hand-maintained expected
sets, verdict/report splits, unearned greens AND reds, gates nobody runs, instrument blind spots
recorded as properties) — lives at `MASTER_HISTORY.md §watchlist`. It is required reading before
writing any new check; the one-line form: *an extraction whose match set is wider than the
property, read as the property; a guard whose expected set is typed by the same hand that typed
the thing it guards is not a second opinion.*

## Index

- Plan: `docs/pm/WORKORDER_V2.md` (six stages) — **FILED 2026-08-22 as a reconstruction (W-FILE3DOCS).** The index previously pointed at
  `AP_WORKORDER_V2.md`, which is not in this repo either. Per bylaw 1 the plan is currently unissued;
  the target path above is where it goes.
- Programme brief: `docs/pm/PROGRAM_BRIEF.md` — **FILED 2026-08-22 as a reconstruction.**
- Two-lane strategy: `docs/pm/orders/2026-07-31-strategy-two-lanes.md` — **FILED 2026-08-22 as a reconstruction.**
- Board history (long-form narrative moved out under A6, 2026-08-23): `docs/pm/MASTER_HISTORY.md`
- State: `docs/STATE_OF_TRUTH.md`
- Rulings: `docs/DECISIONS.md`
- Orders and verdicts: `docs/pm/orders/`
- Lane B design: `docs/SERMON_SEARCH_DESIGN.md`
