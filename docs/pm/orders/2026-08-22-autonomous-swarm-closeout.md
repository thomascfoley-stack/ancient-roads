# ORDER — Autonomous swarm closeout of the outstanding hit list

**Issued:** 2026-08-22 · **Issuer:** owner (via planning session) · **Status:** APPROVED (v4) — both reviewers signed 2026-08-22 (§13); launched 2026-08-22.

**Purpose.** Close every item on the 2026-08-22 outstanding-work hit list that can be closed
without a production touch or an owner ruling, and prepare everything else as a one-command
owner-return packet. The owner is away; the swarm runs unsupervised. This order is written so
that an agent with zero context can execute any single workstream from its own section alone.

**Authority granted by the owner for this order (2026-08-22, planning session):**

1. **HOLD ALL PROD TOUCHES.** No production reads or writes, no deploys, no exceptions.
2. **Scope: everything on the hit list**, including the two big features (Slice 4, UX-3),
   each gated behind its own sub-design step (§8).
3. **ADR-level items: pre-registered bar, else hold** (§2.4).
4. Plan approval requires two independent reviewer agents agreeing (§13), then launch.
5. **Migrations to dev, lane-b, and throwaway local Postgres may be agent-applied** (this
   suspends BUILD_MODEL §2's owner-run rule for those three targets only); prod migrations
   remain owner-applied, via the packet (§11).

---

## 1. Authority envelope — read before anything else

### 1.1 Forbidden for the duration of this order (violations abort the workstream, §2.6)

- **Any connection to production.** `ep-odd-fog-atnykudm` (prod endpoint), `~/.neon_prod_url`,
  `CUTOVER_DATABASE_URL`, any URL string containing `odd-fog`. **Not even read-only.** Bylaw 7
  requires the owner's go *per occasion*; the owner is away, so there is no go.
  `scripts/prod-census.mjs` is therefore banned; use `scripts/ground-truth.mjs` (dev).
- **Deploys.** Do not run `deploy.sh`, `vercel`, or anything that aliases `ancientpaths.app`.
- **Neon console / Vercel dashboard mutations.** No tokens, no store connections, no env vars.
- **Git mutations on `main` or the primary working tree** by any workstream agent. Only the
  orchestrator integrates, in its own dedicated worktree, per Wave 8 (§10).
- **Deleting, unstaging, or overwriting another session's files, branches, staged changes, or
  worktrees — including the currently staged deletion of
  `scripts/ci-fetch-bible-kjv.mjs`.** A concurrent session is live in the primary tree. Treat
  every unfamiliar artifact as in-progress work. No swarm commit may contain that staged
  deletion; the session that staged it (or the returning owner) decides its fate.

### 1.2 Permitted without further authorization

- Read/write the **dev** database (`ep-tiny-hat`, via `web/.env.local`) using the repo's
  existing runner scripts — **serialized, one DB-writer at a time** (§5.1).
- Read/write the Lane B branch (`ep-snowy-bird`, lane-b-uploader) via its existing credential
  files, same serialization rule.
- Apply migrations to dev, lane-b, and throwaway local Postgres. **This order suspends
  BUILD_MODEL §2's owner-run rule for those three targets only**; prod migrations remain
  owner-applied, via the packet (§11).
- Create git worktrees under `/tmp/swarm-*`, branches `swarm/<id>-*`, commits on those branches.
- Run the full local toolchain: `npm run audit`, vitest, ingest scripts pointed at dev, eval
  harnesses, dev servers on localhost.
- External network for corpus acquisition (CCEL, archive.org, etc.) per the existing ingest
  adapters, and the DeepInfra embeddings API via the existing key in `.env.local`.
- Edit docs in the repo (WORKLOG, evidence, verdicts, status files) — on the swarm integration
  branch, not the primary tree (Wave 8).

### 1.3 Held by standing ruling — do not touch, do not re-raise

- **O-1 credential rotation** — deferred to January by owner ruling 2026-08-16. Do not rotate,
  do not test whether `ep-delicate-bonus` accepts the leaked credential, do not write about it
  as a blocker. It is ruled.
- **Repo public / GitHub Pro** — owner-level, sequenced after the rotation.
- **The public-launch decision itself** (SEC-1 gate down) — the swarm may do SEC-1 *code* work
  (§9, W-SEC1) but the gate stays up and the decision stays the owner's.
- **Owner-only content/rulings**: S1 legal/marketing copy, T4 `user_profiles` schema ruling,
  historian-lane retirement, `chesterton-aquinas` admission (ADR-112), §10 plan-template
  un-scope, interlinear highlighting, Journeys / Rules shelf / Lectio / memory (gated
  features). For each: a one-paragraph brief in the owner-return packet (§11). Nothing built.
- **E3 forbidden-provenance deletion** (71,884 rows) — owner call, deferred slice. Packet only.
- **W-SIXWORKS as an ingest** — see §6: the manifest mapping is unresolvable and a prior
  supervised session refused to invent it; enumeration only, ingest held for the owner.

---

## 2. Engineering loop — binding on every workstream

These restate `docs/THE_LOOP.md`, `docs/BUILD_MODEL.md`, `docs/PRINCIPLES.md`,
`docs/ENGINEERING.md`, `docs/TESTING.md` as operational rules. Where this order and those docs
disagree, those docs win (except the single explicit suspension in §1.2) and the disagreement
is filed in the workstream's status file.

### 2.1 Red before green (THE_LOOP rule 4)

No fix is claimed without a watched RED: a failing test, a measured defect log, or a
reproduction transcript captured **before** the change, committed under
`docs/evidence/swarm-2026-08-22/<id>/`. A check that has never been seen red proves nothing.
If a defect cannot be reproduced, the item is NOT RUN with the attempt logged — never fixed
blind.

### 2.2 Red-proof the check, not just the fix

Every new test/guard ships with proof it can fail: seed the defect it exists to catch and show
it failing. Red-proof transcripts go beside the fix evidence.

### 2.3 Fixer ≠ verifier (BUILD_MODEL §1.4)

The agent that writes a change never certifies it. Every workstream's DONE requires an
independent verifier agent (fresh context, Wave 7) re-executing the red-proofs and the audit
leg. Self-certified work is treated as unverified.

### 2.4 ADR-level changes: pre-registration protocol

Anything touching retrieval/routing/accuracy behavior (W-ANN, W-SCANRE, W-ADRV4RERUN,
W-SLICE4's retrieval surface) follows this exact sequence:

1. **Write the pre-registration first** at `docs/evidence/swarm-2026-08-22/<id>/PRE-REG.md`:
   the claim, the measurement method, the dataset, the pass/fail bar, and the withdrawal bar —
   committed before any measurement runs.
2. Measure. Report the number against the bar, with confidence intervals where n allows.
3. **Merge only if the pre-registered bar clears.** If it does not: write the ADR proposal at
   `docs/pm/orders/2026-08-22-<id>-adr-proposal.md`, revert the behavior change, keep the
   measurement, mark the item HELD-FOR-OWNER.
4. Never tune to the demo: no swapping eval queries, floors, or labels after the pre-reg is
   committed.

### 2.5 Least code, no dead code (PRINCIPLES / ENGINEERING)

- State what it costs to *not* fix it, one line, in the commit message or status file.
- Deletion is an allowed remedy; prefer it over padding.
- No new exported function without a call site in the same change. No new config flag, env
  var, or setting without an owner ruling — hard rule for an unsupervised run.
- No abstraction used once. Three similar lines beat a premature helper.
- Match the surrounding file's conventions. Minimal diffs; no opportunistic cleanup, renames,
  or reformatting outside the change's blast radius.
- After a behavior change, sweep comments/docstrings that now describe the old behavior.

### 2.6 Stop conditions — when to walk away from an item

Mark the item **BLOCKED** in its status file, write what was tried, and move on when any of:

- The work requires a forbidden action (§1.1). Do not find a clever route around it.
- A precondition in the item brief is false (file moved, defect already fixed, branch merged).
  Record the evidence; the item becomes ALREADY-DONE or MOOT, not FAILED.
- Credentials/data the item needs are absent. Mark NOT RUN, never fabricate a result.
- Two consecutive attempts fail to turn the same red green. Stop; do not thrash.
- `npm run audit` is red at baseline (Wave 0 fails) — halt the whole swarm, not just the item.

### 2.7 Commits and worktrees

- One worktree per workstream: `git worktree add --detach /tmp/swarm-<id> <base-sha>` then
  `git checkout -b swarm/<id>-<slug>` inside it. **`<base-sha>` is the `origin/main` sha
  recorded in the Wave-0 baseline (after `git fetch origin`) — never the primary tree's
  HEAD**, which is the live session's branch carrying unreviewed work; cutting from HEAD
  would sweep that session's commits into Wave 8's merges. The Wave-0 baseline audit runs on
  HEAD as a tree-state check, not as the build base.
- A fresh worktree lacks the gitignored corpus assets and env files; bootstrap it before any
  test or dev-server work (APFS copy-on-write, near-free):
  ```sh
  cp -c -R web/public/{bible,commentaries,original,concordance,lexicon} /tmp/swarm-<id>/web/public/
  cp -c -R node_modules /tmp/swarm-<id>/
  cp web/.env.local /tmp/swarm-<id>/web/.env.local
  cp .env.local /tmp/swarm-<id>/.env.local   # only for items whose scripts source the root env
  ```
  Before copying either env file, check it SILENTLY — `grep -qE 'odd-fog|CUTOVER_'
  .env.local` (and the same for `web/.env.local`); record only the boolean, never echo the
  matched line (a match IS the secret; §5.3). If either file matches, do NOT copy it —
  report the finding. A root-env match: proceed with `web/.env.local` only. A
  `web/.env.local` match: halt the swarm — the dev assumption in §1.2 is false.
  (`concordance` and `lexicon` are the small ones that get forgotten; copy all five asset
  dirs. `npm run audit` refuses without a dev `DATABASE_URL`, which `web/.env.local` carries.
  Both env files are gitignored; the `no-committed-credentials` invariant and the pre-commit
  hook must never be bypassed.)
- Every commit carries a `Model:` trailer. Commit with explicit pathspecs — never a bare
  `git commit` after `git add` of `.`.
- Never commit secrets.

### 2.8 The definition of green

`npm run audit` is the definition of green. It must pass in the workstream worktree before the
verifier is called, and on the integration branch after every merge (Wave 8). DB-backed legs
that cannot run in a given environment are reported as NOT RUN with the reason — never
silently skipped, never called green.

### 2.9 Records

- Each workstream keeps a status file at `docs/pm/swarm-2026-08-22/items/<id>.md` with
  transitions: `CLAIMED → RED-PROVEN → FIXED → AUDIT-GREEN → VERIFIED → MERGED`, or a terminal
  `BLOCKED` / `HELD-FOR-OWNER` / `NOT RUN` / `ALREADY-DONE` / `MOOT` with evidence.
- The orchestrator alone maintains `docs/pm/swarm-2026-08-22/STATUS.md` (the aggregate board)
  and the WORKLOG entries, to avoid concurrent-write conflicts on shared files.
- Corrections go where a reader meets the wrong claim (MASTER.md watchlist, third shape): if a
  workstream discovers a doc statement that is false, fix it *in that doc* and note it in the
  status file. Do not fix docs opportunistically beyond discovered falsehoods.

---

## 3. Orchestration model

- **Waves** (§4) run in order; items within a wave run in parallel as swarm subagents.
- **Wave 0 gates everything.** If Wave 0 does not complete clean, the swarm halts (§2.6).
- **DB-writer serialization** (§5.1) applies across waves: ingest/migration items run in the
  single-writer lane, never concurrently with each other.
- **Eval/measurement items** (W-ADRV4RERUN, W-PN20) are long-running and independent; launch
  them first, in the background, at Wave 1 start.
- **Verification (Wave 7)** is a separate wave per item, after its fix wave.
- **Integration (Wave 8)** is orchestrator-only, sequential, in a dedicated worktree, after
  all verifications.
- The swarm is launched from the repo's primary session via AgentSwarm, using the item briefs
  in §§6–9 verbatim as prompts (each is self-contained). Maximum parallelism: 6 coding agents
  + 2 background measurement agents; the DB-writer lane holds at most 1.

---

## 4. Wave plan

| Wave | Contents | Gate to next wave |
|---|---|---|
| 0 | Pre-flight (W-PRE) — single agent | All checks green; baseline recorded |
| 1a | Background measurements: W-PN20, W-ADRV4RERUN | (runs long; gates only their own items) |
| 1b | Independent code fixes W-RELVOICE, W-DRAIN, W-HISTSCOPE, W-VEC429, W-DOCRESTATE, W-SEC-CSRF, W-SEC-CURSOR, W-SEC-CCEL, W-UX2VERIFY | Each: audit green in worktree |
| 1c | DB-writer lane, strictly sequential: W-EUSEBIUS → W-HISTBACKLOG → W-THAYER → W-STRONGS → W-REGDURABLE | Each: dev-only, instrument green |
| 2 | ADR-gated retrieval items: W-ANN, W-SCANRE (pre-reg → measure → merge-if-clear) | Pre-reg committed before measuring |
| 3 | UX/features: W-UX1, W-L2TOGGLE, W-T3, then W-UX3, W-SLICE4 (sub-design gated, §8) | Sub-design approved by verifier before build |
| 4 | Backfill/migrations on dev: W-ANCHORBACKFILL, W-OWNERSHIPCOL, W-DEVROW | Dev applied; prod held via packet |
| 5 | SEC-1 code state: W-SEC1 | Memo + branch state; launch decision held |
| 6 | Docs + enumerations: W-FILE3DOCS, W-SIXWORKS (enumeration only), W-BOARDHYGIENE | — |
| 7 | Independent verification of every non-MOOT item (Wave 7, §10) | Every verdict filed |
| 8 | Integration (orchestrator, dedicated worktree, Wave 8, §10) + owner-return packet (§11) + final WORKLOG | Full audit green on integration branch; `main` push only under the sole-ownership gate |

---

## 5. Cross-cutting protocols

### 5.1 The single DB-writer lane

Items W-EUSEBIUS, W-HISTBACKLOG, W-THAYER, W-STRONGS, W-REGDURABLE, W-ANCHORBACKFILL,
W-OWNERSHIPCOL, W-DEVROW write the dev database. They run **one at a time**, in the order
listed. Each begins by re-checking its precondition against the live dev DB (counts move), and
ends by re-running the repo instrument or suite named in its brief. Read-only DB consumers
(measurements, tests) may run concurrently with the writer lane but must expect counts to
drift and must not assert exact row counts captured from docs. Test writes from parallel
audit legs are user-scoped/throwaway rows and collision-safe by design; instruments are
read-only; only the writer lane mutates shared corpus data.

### 5.2 In-flight jobs from 2026-08-22 (pre-existing, detached)

Two detached jobs were launched by a prior session under owner authorization: the
`register='prose' → 'lexicon'` relabel (dev then prod, 2,000-row batches) and the
section-vector unification (dev first). Wave 0 checks their landing **on dev only** (count
`metadata->>'register'='prose'` rows remaining among the 16 lexicon works; run the
section-vector-pairing suite). **Do not start or restart any prod-side batch.** If a prod-side
batch is observed still running from the earlier authorization, leave it alone and note it in
STATUS.md. Outcomes feed W-THAYER's verification.

### 5.3 Secrets discipline

Never print, log, or write a secret value. Source env from `.env.local` / `web/.env.local`
exactly as existing scripts do. Evidence files contain counts, hashes, and booleans — never
connection strings.

---

## 6. Wave 0 and Wave 1 item briefs

> Every brief below is a complete prompt. The swarm launcher pastes §1, §2, and the single
> item brief into each subagent.

### W-PRE — Pre-flight (Wave 0, single agent; read-only everywhere + one scratch worktree)

**Goal:** establish that the ground the plan assumes still exists, and record the baseline.
This agent mutates NOTHING in the primary tree — not the index, not files, not worktrees it
did not create.

1. `git status`, `git rev-parse HEAD`, `git branch --show-current` in the primary tree. If the
   tree is dirty with anything other than the known staged deletion of
   `scripts/ci-fetch-bible-kjv.mjs`, halt and report — a concurrent session owns it.
2. **Report only, never touch:** investigate the staged deletion read-only
   (`git log --oneline -3 -- scripts/ci-fetch-bible-kjv.mjs`; read commit `8c8b895`). Record
   in the baseline whether the file was superseded (its function moved elsewhere) or not.
   That is all. Do NOT unstage it, do NOT commit it, do NOT plan a swarm commit containing
   it (§1.1). The session that staged it, or the returning owner, decides.
3. Confirm the first green db-invariants still stands: `gh run view 32562471249` (read-only).
   Record run id, sha, and the verdict line in the baseline.
4. Baseline audit — **not in the primary tree.** First, verify the §1.2 dev assumption
   without printing values: extract host tokens only — `grep -ohE 'ep-[a-z]+-[a-z]+'
   .env.local web/.env.local | sort -u` — and confirm every one is `ep-tiny-hat` or
   `ep-snowy-bird`; record only booleans in the baseline. Any other host, or any `odd-fog`
   match → halt the swarm per §2.6. Then create `/tmp/swarm-baseline` per §2.7
   (worktree from current HEAD, full bootstrap including env files and corpus assets) and run
   `npm run audit` there. It must be green. If red: halt the swarm per §2.6, write the failure
   to the baseline report, done. (If the worktree bootstrap is impossible, accept CI run
   `32562471249` as the recorded baseline with that caveat stated.)
5. Dev-DB checks (read-only, via existing scripts): `scripts/prod-census.mjs` is FORBIDDEN
   (prod). Use `scripts/ground-truth.mjs` (dev) and record: published/staged/quarantined
   counts; `metadata->>'register'='prose'` remaining among the 16 lexicon works (§5.2); the
   section-vector pairing suite result if runnable. Also spot-check one DB-writing audit
   suite to confirm the audit's test writes use per-run test users (the §5.1 collision-safety
   premise); record the finding in the baseline — if they do not, later audit flakes on
   shared fixtures are filed as honest NOT RUNs, not reds.
6. Write the baseline report and the item board seed (all W-ids, status PENDING) to a scratch
   path `/tmp/swarm-status-seed/` — the orchestrator places them on the integration branch at
   Wave 8 step 1 (not before; the primary tree stays untouched).

**Done when:** baseline recorded, audit green (in the scratch worktree or via the CI caveat),
board seeded. **Red-proof equivalent:** the halt paths in steps 1/4 either fire or the checks
pass; record which.

---

### W-PN20 — ADR-118 proper-noun held-out set (Wave 1a, background measurement)

**Context.** ADR-118 (`docs/DECISIONS.md`, ruled 2026-08-21, bar amended 2026-08-22) ruled
the proper-noun accuracy bar at HIT@2 ≥ 90% on n=20 fresh cases. The 20 cases do not exist; v4's ten proper-noun cases
are burned (used for prior tuning). The gate cannot be measured until this set exists.

**Procedure:**
1. Pre-register at `docs/evidence/swarm-2026-08-22/w-pn20/PRE-REG.md`: sampling rule
   (proper-noun queries drawn from served corpus entities NOT appearing in v4's ten cases;
   state the exclusion list explicitly), labeling rule (what counts as a hit at rank ≤2,
   matching ADR-028/ADR-116's HIT@2 definition), the bar (≥18/20), and the withdrawal
   conditions. Commit before step 2.
2. Locate the existing eval harness (`evals/cases/`, `src/evals/`, and the v4 run referenced
   by `docs/evidence/eval-v4-post-a8-2026-08-02.md`). Reuse its format. If the v4 label
   anchor-check script is genuinely absent from the repo (STATE_OF_TRUTH §1 caveat 4), write
   it as part of this item and commit it — that closes a known reproducibility gap.
3. Mint 20 cases per the pre-reg; file them under `evals/cases/` following existing naming.
4. Run through the shipped retrieval path read-only against dev. Measure HIT@1 and HIT@2.
   **Snapshot the served-pool counts at measurement start and end** (the DB-writer lane is
   mutating dev concurrently, §5.1) and record both in the result.
5. Write `docs/evidence/swarm-2026-08-22/w-pn20/RESULT.md`: n, hits, CIs, per-case table,
   served-pool snapshots.

**Merge rule:** the case set + harness merge regardless of outcome (they are measurement
infrastructure). The *result* is reported, not fixed — if below bar, the item reports
LAUNCH-BLOCKER-CONFIRMED in STATUS.md; no retrieval tuning under this item.

---

### W-ADRV4RERUN — Full /ask accuracy re-run (Wave 1a, background measurement)

**Context.** A full accuracy re-run through the live loop is owed against ADR-028 (WORKLOG
2026-08-21: "blocking public launch"; ADR-115 was a scoped departure, not a discharge).
This is a measurement, not a fix.

**Procedure:**
1. Pre-register: categories (verse-ref, pericope, proper-noun incl. the W-PN20 set, epistle,
   topical, control), bars per category per the ADR-028/ADR-116 record (hard gates vs
   diagnostics), the live-loop path (compose → verify, `interpretation_bait` guard included),
   dataset identity, and the rule that results are reported as measured. Commit first.
2. Locate the frozen harness from the v4 post-A8 run; re-execute against dev through the
   shipped path. If any harness piece is missing from the repo, rebuild and commit it (same
   reproducibility gap as W-PN20 — coordinate so only one of the two items rebuilds it;
   W-ADRV4RERUN yields to W-PN20's version if both exist, prefer the committed one).
3. Run. Include the control stratum (hijacks must be 0) and the `interpretation_bait` set.
   **Snapshot served-pool counts at start and end** and record them (§5.1 drift).
4. Write `RESULT.md` with per-category numbers, 95% CIs, and a plain verdict per gate.

**Merge rule:** harness + results merge. Below-bar results are findings for the owner packet
and STATUS.md — never silently patched.

---

### W-RELVOICE — `related-voices.ts` missing `source_type` conjunct

**Context.** WORKLOG 2026-08-21: `web/src/lib/user-corpus/related-voices.ts` carries no
`source_type` conjunct, so it is served only by the ~8 GB full-table `idx_embeddings_vector`;
fixing it makes that index droppable (called "worth more than halfvec").

**Procedure:**
1. Read the module and its callers.
2. RED: capture `EXPLAIN (FORMAT JSON)` of the shipped query shape against dev showing the
   full-table index (or seq scan) in use. Commit the plan.
3. Fix: add the `source_type` conjunct matching the served-pool predicate pattern used by the
   neighboring routing code — import the shared predicate/constants; do not retype them
   (watchlist class: hand-maintained expected set).
4. GREEN: `EXPLAIN` now shows a partial/served index. Commit both plans.
5. Tests: unit-test the query builder (if one exists in the module's idiom); add an invariant
   test asserting the conjunct's presence derived from the shared predicate, and red-proof it
   by seeding its removal.
6. Index drop: author migration **`db/migrations/127_drop_full_table_vector_index.sql`**
   (number 127 is pre-assigned to this item to avoid a collision with W-OWNERSHIPCOL's 128;
   verify both `db/migrations/` and `supabase/migrations/` for the true next free number
   before writing — if 127 is taken, take the next and note it in the status file). Apply to
   dev ONLY (§1.2 migration suspension) after the change is verified live on dev (the
   `EXPLAIN` pair + the module's callers exercised before/after is the evidence). Prod
   application goes to the owner packet.

**Done when:** query uses the partial index on dev, tests + red-proofs committed, migration
applied on dev, owner-packet entry written.

---

### W-DRAIN — Drain failure-semantics defects (2)

**Context.** Order `docs/pm/orders/2026-08-22-drain-failure-semantics.md` filed two defects:
(1) a config error is retried as if transient; (2) `drain()` counts unprocessed documents as
processed. Read that order first — it is the spec.

**Procedure:** per defect: reproduce RED with a focused test (config-error case must surface
as permanent, not retried; a drain with N unprocessed docs must report N unprocessed), fix at
the site the order names, watch green, red-proof each test by seeding the old behavior.
Follow the existing test idiom for the upload/drain pipeline (`web/test/`, user-corpus
suites).

**Done when:** both defects have failing-then-passing tests, audit green.

---

### W-HISTSCOPE — `history-scope-db` true positive

**Context.** MASTER.md Lane F4: dev carries 81 served anchored entities, only 31 inside the
shipped `vocab()` scope; the test's probe draws from a join WITHOUT the `sources` legs the
shipped `vocab()` applies, so its `LIMIT 1` probe is out-of-scope ~62% of the time. MASTER.md
frames this as "The entity scope leak, correctly reported."

**Procedure:** read `web/test/invariants/history-scope-db.test.ts` and the shipped `vocab()`
implementation (locate via `grep -rn "vocab" web/src`). Make the probe's predicate **import or
reuse** the shipped scope legs rather than retyping them (watchlist: the probe must be derived
from the thing it measures). RED-proof: seed an out-of-scope served label on dev (or a
transaction-rolled-back insert) and watch the corrected probe NOT draw it, then watch the OLD
query draw it — both directions committed. **Additionally:** enumerate the out-of-scope served
entity population (~50 of 81) and file it as a finding for the historians lane in the owner
packet — the test fix must not bury the product signal the F4 row was opened to track.

**Done when:** suite green on dev with the probe provably scoped; out-of-scope population
filed; the fix is a test fix, no product code expected.

---

### W-VEC429 — `section-vector-pairing` provider-429 nondeterminism

**Context.** MASTER.md watchlist: this suite calls the live DeepInfra API; a 429
`engine_overloaded` produced an unearned RED on a docs-only commit. Fix = bounded retry on
429/5xx, else an explicit loud NOT RUN (the repo's loud-skip helper), so red means broken and
skipped means provider-down.

**Procedure:** locate the test and the loud-skip helper (`grep -rn "announceSkip\|loud-skip\|LOUD_SKIP" web/test scripts`). Implement: exponential backoff, ≤3 attempts, jitter; on
persistent unavailability declare the declared-skip path (the same mechanism
`neon-auth-live` uses). RED-proofs: (a) stub the embed client to 429 twice then succeed →
test passes and the retry path is exercised (assert attempt count); (b) stub persistent 429 →
the suite declares NOT RUN, not FAIL; (c) stub a 400 → immediate FAIL, no retry. Use the
suite's existing mocking idiom; if it has none, inject the smallest possible client seam and
no more.

**Done when:** the three red-proofs committed; a live run against the real API still passes.

---

### W-DOCRESTATE — Doc-restatement guard

**Context.** WORKLOG 2026-08-21 (~lines 906–910): design settled, not built — a check that
CLAUDE.md's restated ruled values match DECISIONS.md. The entry itself notes that deriving
from DECISIONS.md is *not* watchlist-fourteen (DERIVING from the ruled source is the cure,
not the disease).

**Procedure:** find the settled design (grep WORKLOG around 2026-08-21 for "restatement";
read the entry fully — it names the values in scope). Implement the check as
`test/invariants/doc-restatement.test.ts` (or the script location the design named), covering
exactly the ruled values the design lists — no speculative expansion. Derive expectations from
DECISIONS.md (the source of truth), never the reverse. RED-proof: seed a mismatched value in a
fixture and watch it fail; include the fixture in the test. Wire into `npm run audit` exactly
as the design says. If the design is NOT actually findable in WORKLOG, stop at NOT RUN with
the search log — do not invent the design.

**Done when:** check in audit, red-proof committed.

---

### W-SEC-CSRF / W-SEC-CURSOR / W-SEC-CCEL — Deferred security findings (3 separate items)

**Context.** WORKLOG 2026-08-21 security entry deferred four findings; three are in scope
here (the fourth — no global daily ceiling on the history limiter — goes to the owner packet
unscheduled, see §11).

- **W-SEC-CSRF:** the entry says "CSRF Content-Type floor across ~13 routes" and nothing
  more. Intended policy (state it in the status file before touching code): mutating methods
  (POST/PUT/PATCH/DELETE) on cookie-authenticated API routes reject simple Content-Types —
  i.e. require the Content-Type the route actually parses (typically `application/json`) and
  415/400 everything else, per the repo's standard error shape (`docs/API_ERRORS.md`).
  Enumerate the routes by globbing `web/src/app/api/**/route.ts` for exported mutating
  handlers lacking the check. Implement as ONE shared guard used by each route — if a guard
  helper already exists, extend it; do not add a second mechanism. Tests: one parameterized
  test over the route list asserting rejection of simple content types; red-proof by removing
  the guard from one route in a fixture. **The route list in the test must be derived** (glob
  the route files), not hand-typed (watchlist class). **Ambiguity stop:** if the enumerated
  routes turn out to need heterogeneous policies (multipart uploads, webhooks), implement the
  floor only where `application/json` is the parsed type and mark the remainder
  HELD-FOR-OWNER with the per-route list — do not invent per-route policy.
- **W-SEC-CURSOR:** the entry puts `after=1e21` → 500 on the **sections** route (not the
  history routes). RED: request with `after=1e21` → 500 transcript. Fix: validate/clamp per
  the endpoint's existing param-handling idiom → 400 with the standard error shape. Test both.
- **W-SEC-CCEL:** find the hardcoded `(CCEL)` provenance (grep `"(CCEL)"` / `'(CCEL)'`).
  Replace per the WORKLOG entry's intent (derive from the source record); if the entry is
  ambiguous about the intended replacement, mark HELD-FOR-OWNER with the finding instead of
  guessing. Test the provenance string is now derived.

**Done when (each):** red→green transcripts, tests, audit green.

---

### W-UX2VERIFY — Browser-verify the UX-2 fix

**Context.** UX-2 (the `+` affordance explainer line) shipped at `e196e4b` typecheck-and-lint
only — never browser-verified (MASTER.md UX-2 row; WORKLOG 2026-08-07 NOT DONE).

**Procedure:** start the dev server from a worktree (bootstrapped per §2.7, env included),
drive a real browser to `/library/[catalog]` (any catalog that renders without extra
fixtures), confirm the explainer line is visible above the work list, capture a screenshot to
`docs/evidence/swarm-2026-08-22/w-ux2verify/`. If the dev server cannot run in the environment
(missing service, port, credential), record NOT RUN with the exact failure — do not claim the
verification.

**Done when:** screenshot evidence committed, or honest NOT RUN.

---

### W-EUSEBIUS — Resume npnf201 ingest (DB-writer lane, position 1)

**Context.** WORKLOG 2026-08-21: Eusebius (npnf201) father ingest died on a transient
connection error, resumable; the annotate pass + scope widening then covers npnf201/202/203.

**Procedure:** read the WORKLOG entry (grep `npnf201` in WORKLOG.md, read the full session
entry) for the exact resume point and the manifest/state files it names. Re-run per
`docs/INGESTION_RUNBOOK.md` and the existing adapter for that source — **dev only**, staged
status, with embeddings. Verify: the work lands staged with section/vector parity (sections ≈
section_anchors ≈ section_embeddings invariant), register wall respected. Then run the
annotate pass and scope widening **on dev only**, as the WORKLOG entry describes for
npnf201/202/203. The entry's arc continues to a Phase 4 (prod copy/flip/serve) — that phase
is FORBIDDEN under §1.1; write it to the owner packet instead. If the entry's described
resume mechanism no longer matches the scripts, stop and mark BLOCKED with both versions
quoted — do not improvise an ingest path.

**Done when:** npnf201 staged on dev with parity; annotate + scope widening applied on dev
per the entry; instrument/suite the entry names is green; Phase 4 in the packet.

---

### W-SIXWORKS — Enumeration only; ingest HELD-FOR-OWNER (Wave 6)

**Context.** MASTER.md ingestion note 2026-08-15 lists six works as "never staged":
`luther-church`, `brooks`, `manton`, `bunyan`, `pascal`, `ignatius` — "restartable from the
manifest." **Reviewer finding: the mapping does not resolve.** `ingest/sources.config.json`
has no `luther-church` slug; `brooks` exists only as `jowett-brooks`; `manton` matches ~8
slugs, `bunyan` ~5, `pascal` ~3, `ignatius` ~2. And WORKLOG (~lines 4549–4553) records the
prior session *deliberately refusing* this exact resume because "inventing that scope
overnight is how slop happens." An unsupervised agent does not get to invent it either.

**Procedure (no ingest, no embeddings, no DB writes):** build the enumeration table for the
owner packet: for each of the six WORKLOG names, the candidate manifest slug(s) with their
titles/authors; the most likely intended slug where one is clearly dominant (and the
evidence); an embeddings-quota estimate per candidate; and the WORKLOG refusal quote. That
table, plus a recommended minimal interpretation, is the deliverable. Mark the item
HELD-FOR-OWNER.

---

### W-HISTBACKLOG — Historians backlog remainder (DB-writer lane, position 2)

**Context.** WORKLOG: 38 historians unbuilt at the 08-18 census; 27 shipped 08-21; the
remainder is unaccounted. Foxe is parked (no CCEL ThML at that id).

**Procedure:** reconstruct the remainder list from the manifest + dev DB `sources` table (set
difference, not prose). For each remaining work: **only if its manifest entry is an
unambiguous 1:1 mapping** (single slug, declared source, existing adapter), ingest to dev
staged with the same parity rules as W-EUSEBIUS. Any work whose mapping is ambiguous gets the
W-SIXWORKS treatment: candidate table entry, parked with reason — never an invented choice.
If a work's basis is missing/unverifiable (the Foxe pattern), list it with the reason.

**Done when:** remainder enumerated; unambiguous works staged on dev with parity; ambiguous/
unverifiable works parked with per-work reasons in the packet table.

---

### W-THAYER — Thayer's follow-on chain (DB-writer lane, position 3)

**Context.** WORKLOG 2026-08-21/22: (a) 2,865 of 7,570 prod flat rows map to no live section;
(b) Thayer's sections are unchunked, up to 34.6K chars; (c) the 7,570-vs-5,507 vector
reconcile. Dev and prod copies are byte-identical (sha256 proven 2026-08-22), so all repair
work happens on dev and is replayable to prod later by the owner. **Note (banked owner
call):** WORKLOG 2026-08-22 records "Owner call, banked for the next menu: delete the 2,865
stale thayers flat rows… recommendation: delete." The hit-list scope grant covers dev-side
execution here: dev's stale rows are unserved and reversible by re-copy, so dev execution
*stages evidence for* the banked call — it does not discharge it. The prod replay stays
owner-gated in the packet.

**Procedure:**
1. Confirm §5.2's check: the dev relabel + vector unification jobs landed. If still running,
   skip to the next lane item and retry once at lane end; if still running then, mark NOT
   RUN — do not write over an active batch job.
2. Re-chunk the oversized Thayer's sections on dev using the ingest adapter's existing
   chunking (leading-body convention `backfill-section-embeddings.mjs` mirrors: bare body,
   1,800 chars; match the D1(b) convention the unification job used). Re-embed with
   `BAAI/bge-large-en-v1.5` via the existing embed path.
3. Reconcile the stale flat rows on dev: rows mapping to no live section get unserved/removed
   per the repo's existing suppression tooling pattern (slug-scoped, dry-run default, log to
   evidence). Do not hand-write DELETEs.
4. Verify: section-vector-pairing suite; parity invariant; greekHeading/strongsKeyed counts
   unchanged (5,507); the stale-row count on dev now 0.
5. Write the prod replay script + dry-run log to the owner packet (prod itself untouched).

**Done when:** dev Thayer's clean per the four checks; owner-packet entry written, citing the
banked call as still-open.

---

### W-STRONGS — Strong's truncated glosses (DB-writer lane, position 4)

**Context.** WORKLOG 2026-08-21: Strong's ingest data nit — truncated glosses (G2316 named).

**Procedure:** find the entry (grep `G2316` WORKLOG.md), the Strong's adapter, and the raw
source (`data/raw/`). Fix the adapter's gloss extraction at root cause (not a per-row patch);
re-run the Strong's ingest on dev; verify G2316 and a 20-entry random sample against the raw
source; record before/after for G2316 in evidence. If truncation is in the SOURCE, not the
adapter, mark MOOT-with-finding and cite the source bytes.

**Done when:** adapter fixed + dev re-ingested + sample verified, or MOOT with evidence.

---

### W-REGDURABLE — Register flip durability (DB-writer lane, position 5; design + tooling)

**Context.** WORKLOG 2026-08-19: sermon and theology register flips "unflipped", wanting a
durability story better than a 7-hour transaction.

**Procedure:** read the 08-19 WORKLOG entry fully. Write a short design note
(`docs/pm/swarm-2026-08-22/w-regdurable/DESIGN.md`, ≤1 page): the durable mechanism
(batched idempotent flip with resumable state, per the repo's existing batch-job idioms —
check how the 08-22 relabel does 2,000-row resumable batches and reuse that pattern, not a
new framework). Implement the tool as a script with dry-run default and `--apply`, guarded to
dev (`ep-tiny-hat`) exactly like the existing suppression scripts. Execute the dev-side flip
if the 08-19 entry's preconditions still hold; otherwise dry-run only and say why. Red-proof:
interrupt a throwaway run mid-batch (local Postgres), resume, assert no double-application.

**Done when:** design note + guarded tool + dev execution or dry-run evidence + resume
red-proof. Prod execution → owner packet.

---

## 7. Wave 2 — ADR-gated retrieval items

### W-ANN — ANN post-filter recall collapse in history search

**Context.** WORKLOG 2026-08-21: real product defect, proven on dev, inferred for prod; a
retrieval change gated by the accuracy diagnostic. Filed, not fixed.

**Procedure:**
1. Find the filed evidence (grep WORKLOG 2026-08-21 for "ANN" / "post-filter"; read the whole
   finding including its reproduction).
2. Reproduce on dev; commit the reproduction transcript (RED).
3. Pre-register per §2.4: the fix hypothesis, the measurement (recall on the entry's own
   failing set + a no-regression set from existing evals), the bar (failing set recovers AND
   no regression beyond CI noise on the control), the withdrawal bar.
4. Implement minimally at the filter site the evidence names.
5. Measure against the pre-reg. Merge-if-clear; else ADR proposal + revert + HELD-FOR-OWNER.

**Done when:** pre-reg + result committed; merged-with-evidence or held-with-proposal.

### W-SCANRE — SCAN_RE false-floor class

**Context.** MASTER.md "Queued — the SCAN_RE false-floor class" (2026-08-21): bare
`([a-z]{2,})\s+(\d…)` floors non-citations (`she is 1 mark 5 points…`); n=2/10; candidate
direction named (extend ADR-015's corroboration gate to numerics whose book word is a common
English noun); explicitly "needing its own measurement"; not beta-blocking.

**Procedure:**
1. Grow the adversarial set from 10 to ≥30 cases: idiomatic non-citations with
   mark/james/job/acts/numbers/kings + a matched set of genuine citations that must KEEP
   flooring. File at `evals/cases/` per existing format. This set growth also partially
   discharges the standing "adversarial eval set is n=10; should grow" note.
2. Pre-register per §2.4: bar = 0 false floors on the non-citation set AND 100% preserved
   floors on the genuine-citation control AND no movement on the existing reference-routing
   fixtures (ADR-115's set).
3. Implement the corroboration extension per the candidate direction, minimal diff in the
   routing code (`web/src/lib/teacher/`).
4. Measure. Merge-if-clear; else write the ADR proposal, revert, HELD-FOR-OWNER.
5. Either way, the enlarged eval set merges (measurement infrastructure).

---

## 8. Wave 3 — UX and feature items (sub-design gated)

> The two big features (W-UX3, W-SLICE4) were owner-approved for attempt with a sub-design
> gate: before any build, the workstream writes a ≤1-page design at
> `docs/pm/swarm-2026-08-22/<id>/DESIGN.md` (problem, approach, file list, what is explicitly
> NOT built). An independent verifier reviews the DESIGN before code is written. If the
> design exceeds the size bound stated in the brief, build only the named core and file the
> remainder in the owner packet. This is the anti-over-engineering control.

### W-UX1 — Bible reachable from the desk picker

**Context.** MASTER.md UX-1: the pane model already holds Scripture (`lib/desk.ts`
`kind:'scripture'`; `/desk` renders it); a Bible pane opens by URL today. The gap is only the
picker: `+` routes to `/library?desk=…`, which offers catalogs of works only.

**Procedure:** read `lib/desk.ts` and the `/library?desk=` flow. Minimal fix: add a Bible
entry point to the desk-picker path that opens a scripture pane using the EXISTING
`kind:'scripture'` machinery — no new pane type, no new data model. Choose the smallest UI
that answers "I want the Bible beside this work" (e.g., a Bible row/section in the desk-add
flow; match the surface's existing idioms). Tests: desk model unit tests per existing
`desk` test files; browser-verify per W-UX2VERIFY's method. No design gate needed (small).

**Done when:** Bible openable on the desk through the picker, tests + screenshot evidence.

### W-L2TOGGLE — Plan mark-as-read optimistic toggle (L2 step 2)

**Context.** MASTER.md C3 says step 2 (optimistic toggle) was "deferred to the next deploy";
C4's deploy row says the deploy "ships L1's retry, L2 step 2, and UX-5". The board
contradicts itself, so:

**Procedure:** FIRST verify presence/absence — read the plans store (`grep -rn "plan_days\|markAsRead\|toggle" web/src/lib web/src/stores web/src/app` — the 106 migration was
derived from `store.ts`'s write verbs, start there). If an optimistic toggle already exists,
the item is ALREADY-DONE per §2.6 (record the evidence; no change). If absent, implement it
in the store's existing mutation idiom, with rollback-on-error matching how the codebase
handles other optimistic writes (if none exist, do the simple thing: mutate, on error revert
+ surface the repo's standard error). Tests: store-level tests per existing idiom. Watch for
the dual-theme class of bug (A7b finding) — verify against the real component, not just the
store.

**Done when:** ALREADY-DONE evidence, or toggle implemented with tests.

### W-T3 — Lane C T3 (device-bound; expect ALREADY-DONE + NOT RUN)

**Context.** MASTER.md C6: "T3 is DEVICE-only". The spec is `docs/UX_REMEDIATION.md`, with
sequencing in `docs/pm/UX_REMEDIATION_ROADMAP.md` (both exist — an earlier revision of this
brief claimed the ROADMAP file did not exist and ordered a "dead pointer" fix; that premise was
FALSE, corrected 2026-08-22 after two workstreams measured the file present at base `9dce273`.
**Do not "correct" the MASTER.md pointer — it is live.**) `UX_REMEDIATION.md` line ~201 marks
T3 "CODE COMPLETE, DEVICE OPEN" with a regression guard.

**Procedure:** read the T3 block in `docs/UX_REMEDIATION.md` in full. Verify the code-complete
claim: the regression guard exists and runs in `npm run audit`. If it does, the item is
ALREADY-DONE (code) + NOT RUN (device leg) — record both, no changes. If the guard is
missing, implement exactly what the block specifies and red-proof it. Do not reinterpret T3
into something bigger to make it "more done". (No housekeeping: the MASTER.md ROADMAP pointer
is live — see the context note above.)

### W-UX3 — Desk layout model (sub-design gated; core = grid + virtualization)

**Context.** MASTER.md UX-3: grid not a row (top-to-bottom as well as left-to-right), no
3-pane cap, drag-resize, collapsible left chrome. Standing caveat: "The cap is doing
performance work — an uncapped grid over `spurgeon-sermons` (118,371 sections) is a
virtualisation problem before it is a layout one."

**Size bound:** core = grid layout + virtualization of pane content + lift the 3-pane cap.
Drag-resize and collapsible chrome are explicitly stretch; build only if the core lands clean
and the diff stays reviewable. No new dependency without owner ruling — if virtualization
needs a library not already in `web/package.json`, check for an existing in-repo
virtualization idiom first; if none and a library is genuinely required, implement the core
with a bounded window renderer (simple, in-repo) rather than adding a dependency, and note
the trade in the design.

**Procedure:** sub-design → verifier design review → implement → tests (layout model unit
tests; a render test over a large fixture asserting bounded DOM nodes) → browser-verify with
`spurgeon-sermons`-scale content if the dev DB serves it, else a fixture. Red-proof the
virtualization bound: before = node count scales with sections; after = bounded.

### W-SLICE4 — /ask integration of the user corpus (sub-design gated)

**Context.** MASTER.md B5 open item: "Slice 4 (/ask integration) with its
RetrievalContext.traditions caveat". The caveat substance lives at
`docs/SERMON_SEARCH_DESIGN.md:94-97` and `:186`, and `web/src/verifier/types.ts:40` — quote
those verbatim in the sub-design (the earlier pointer to the deep-dive order was wrong; the
order is still required reading for the H4 additive-voices rule).

**Size bound:** core = the /ask pipeline may draw from the asking user's own corpus as an
ADDITIVE voice set under the standing rules: user voices are never load-bearing for the ≥2
grounded-voices floor (the origin-blind verifier fix, H4, stands); RLS scoping end-to-end;
the tradition-gap join semantics preserved. No changes to the accuracy gates themselves.

**Procedure:** sub-design (must quote the RetrievalContext.traditions caveat and answer it) →
verifier design review → implement → tests: two-account RLS tests (user A never sees user
B's corpus in /ask), additive-not-load-bearing test (an /ask answer must not rest solely on
user voices — seed a case and watch the verifier reject it), retrieval tests per existing
idiom. This item touches retrieval behavior → §2.4 applies to its accuracy-relevant surface:
pre-register a no-regression run of the /ask control + interpretation_bait sets before merge.

---

## 9. Wave 4 and Wave 5 items

### W-ANCHORBACKFILL — Anchor backfill for pre-detection documents (DB-writer lane)

**Context.** MASTER.md B5 open: documents uploaded before ADR-100 per-document translation
detection shipped carry KJV-pinned anchors; the deep dive showed that pin costs non-KJV
quoters ~half their recall.

**Procedure:** locate user documents whose anchors predate the detection deploy (2026-08-21;
use the anchors' confidence/detection metadata — the remediation wave records detection
confidence per anchor; rows lacking it are the pre-detection population). On the lane-b/dev
DB: re-run anchoring with detection through the SHIPPED pipeline (not a side script), logging
per-document deltas. Verify: family agreement and recall on a sample per the deep dive's
method. Prod backfill → owner packet with the exact command.

### W-OWNERSHIPCOL — `asserted_ownership_at` licensing column (DB-writer lane)

**Context.** MASTER.md B5 lists this column "(owner)"; the hit-list scope grant covers the
schema + code work, with the semantics taken from the design, not invented. The semantics
source is `docs/UPLOADER_DESIGN.md` (lines ~37, ~268, ~325, surfaced via the deep-dive order
line ~220) — read those and quote the definition in the status file before writing SQL.

**Procedure:** if UPLOADER_DESIGN.md does not actually define the column's semantics, mark
HELD-FOR-OWNER — do not invent licensing semantics. Otherwise: author migration
**`db/migrations/128_asserted_ownership_at.sql`** (128 pre-assigned; verify next-free before
writing, see W-RELVOICE note) adding the column to the user-corpus documents table per the
design. Apply to dev + lane-b branch (§1.2 suspension). Code: set it at upload time where the
uploader asserts ownership; surface per the design. Tests + red-proof (upload without
assertion handled per the design's rule). Prod migration → packet.

### W-DEVROW — Dev row stuck in `embedding` for 3.66 days

**Context.** WORKLOG 2026-08-21: one dev row stuck in `embedding` status; needs one UPDATE;
deliberately not done at the time.

**Procedure:** find the row on dev per the WORKLOG entry's description, confirm it is still
stuck and genuinely abandoned (not held by a live job — check `pg_stat_activity` and the
queue tables), then release it per the entry's stated remedy. If the entry does not state the
remedy or the row is not cleanly identifiable, mark NOT RUN. One row, one statement, logged.

### W-SEC1 — SEC-1 code state (no launch decision)

**Context.** SEC-1 blocks public launch: better-auth CVEs via `@neondatabase/auth`. Note:
the Better Auth package and its tests were DELETED 2026-08-08 (`dc87099`); branch
`fix/sec1-better-auth-1-6-25` exists; ADR-109 says GHSA-g38m's precondition is "fully
assembled and reachable".

**Procedure:** establish the CURRENT dependency truth (the branch may be moot): does
better-auth still reach the tree transitively (`pnpm why better-auth` / lockfile inspection)?
Run `scripts/deps-audit.mjs`. Three outcomes: (a) exposure gone → update SECURITY.md +
DECISIONS pointer with evidence, item MOOT-good-news, launch decision still owner's; (b)
exposure present and fixable by a pin/bump within existing dependency policy → implement on a
branch, audit green, merge per Wave 8, memo to packet; (c) fix requires Neon-side action →
memo only. Never weaken `pnpm.auditConfig.ignoreGhsas` to make this green; the ignore list
changes only with documented justification per SECURITY.md.

---

## 10. Waves 6–8 — docs, verification, integration

### W-FILE3DOCS — File the three missing programme docs (Wave 6)

**Context.** MASTER.md index: `docs/pm/WORKORDER_V2.md`, `docs/pm/PROGRAM_BRIEF.md`, and
`docs/pm/orders/2026-07-31-strategy-two-lanes.md` are "NOT YET FILED" — per bylaw 1 the plan
they describe is formally unissued.

**Procedure:** reconstruct each from its references (MASTER.md rows citing them, WORKLOG
sessions that executed them, the orders directory). Each file opens with a header:
"Reconstructed 2026-08-22 from [sources]; this is a faithful index of what was executed, not
a recovered original." Index-and-pointer style, per MASTER.md's own convention (point at
state, don't copy it). Do not invent rulings; where content is unknown, say so in the doc.

### W-BOARDHYGIENE — Board and WORKLOG updates (Wave 6, runs last among docs)

Update only what the swarm changed: MASTER.md rows for closed items get their new status with
evidence links (follow the existing row idiom; cite anchors, not line numbers — the
`#a3-rule` lesson); WORKLOG gets a session entry per the established format, newest on top,
with a NOT DONE / UNVERIFIED section listing every item not MERGED and every claim resting on
a tool's own log. Stale-row rule: when editing a row, re-measure what it says first.

### Wave 7 — Independent verification (per item, bylaw 4)

For every item that reached AUDIT-GREEN, launch a verifier subagent with this exact brief:

> You are the independent verifier for workstream `<id>`. You did not write this work and
> must not trust its status file. Read the item brief in
> `docs/pm/orders/2026-08-22-autonomous-swarm-closeout.md` (`<id>` section), then: (1) check
> out the workstream branch in a fresh worktree bootstrapped per §2.7; (2) re-execute every
> red-proof from the evidence directory and confirm each check can still fail when seeded;
> (3) run `npm run audit`; (4) re-run the item's named instrument/suite; (5) confirm no
> forbidden action was taken (git log the branch for prod touches, deploy receipts, primary-
> tree commits, or other §1.1 violations); (6) write your verdict — VERIFIED / REJECTED with
> findings — to `docs/pm/swarm-2026-08-22/verdicts/<id>.md`. Real defects block merge.

### Wave 8 — Integration (orchestrator only, sequential, dedicated worktree)

**Sole-ownership gate (runs first, and again before step 5):** the 2026-08-21 owner ruling
puts the primary tree off-limits to every session but the deploy holder. Before integrating,
verify read-only: the primary tree's `git status` is unchanged since Wave 0 and no other
session shows activity (no new commits in the primary tree's reflog since Wave 0). At the
pre-step-5 re-run, additionally `git fetch` and confirm `origin/main` is unchanged since
step 1's fetch (a concurrent session pushing from another clone is invisible to the local
checks). If a live session is detected, steps 1–4 proceed in the orchestrator worktree but
step 5 (the `main` push) is HELD for the owner, and the packet says so.

1. Create the orchestrator worktree `/tmp/swarm-integration`, bootstrapped per §2.7. `git
   fetch origin`; create branch `swarm/closeout-2026-08-22` from **current `origin/main`**
   (not the Wave-0 baseline — it is hours stale by now). Place the seeded STATUS files from
   `/tmp/swarm-status-seed/`.
2. Merge verified branches one at a time, in this order: measurement infrastructure (W-PN20,
   W-ADRV4RERUN) → isolated fixes (W-DRAIN, W-HISTSCOPE, W-VEC429, W-DOCRESTATE, W-SEC-*,
   W-RELVOICE) → DB-lane items in lane order → UX items → features (W-UX3, W-SLICE4) →
   ADR-gated items that cleared → docs. After EACH merge: `npm run audit`. Red → revert that
   merge (`git revert -m 1`), mark the item BLOCKED-post-verify, continue with the rest.
3. Conflict rule: if two branches touch the same hunks, merge the smaller first and rebase the
   larger onto it. **Rebase of unpushed `swarm/*` workstream branches is the single permitted
   exception to §12's no-history-mutation rule** — never rebase anything already pushed, and
   never another session's branch. A rebased branch goes through Wave 7 verification again.
   Migration numbers 127/128 are pre-assigned; at merge time re-verify they are still free on
   `origin/main` AND that dev's `schema_migrations` ledger carries no unexpected entries
   since Wave 0. On collision, renumber the branch's migration file AND rename dev's ledger
   entry in the same pass (the established ledger-rename procedure), before re-verification —
   a renumber without the ledger fix leaves dev pointing at a migration the repo no longer
   carries (the phantom-pending defect class).
4. Final full `npm run audit` on the integration branch. Push the integration branch to
   origin.
5. Only if the sole-ownership gate passes: advance `main` **by push only** —
   `git push origin swarm/closeout-2026-08-22:main`. Do NOT check out `main` in any worktree
   — the ban holds whether or not git would refuse (that depends on where `main` is checked
   out at execution time) — and NEVER use
   `git update-ref` or `git branch -f` on `main`: that bypasses the worktree safety check and
   silently desyncs the primary tree's checkout — the exact corruption the gate exists to
   prevent. The returning owner fast-forwards their own checkout (`git pull --ff-only` on
   `main`) when the tree is free. If the push is
   rejected non-fast-forward (`origin/main` moved since step 1): **this retry applies only to
   a race discovered AFTER a passed gate re-run — movement detected by the gate itself means
   step 5 is HELD.** Otherwise: re-fetch, merge
   `origin/main` into the integration branch, re-run the full audit, retry the push once; a
   second rejection → step 5 is HELD for the owner and the packet says the integration
   branch is origin-ready, one pull from done. **Force-push is forbidden, always.** Pushes to
   origin are expected and required; "nothing outward" (§12) means no PRs, no comments, no
   messages, no third-party services. **No deploy. No prod.** Verify read-only afterward
   that the primary tree was never touched.
6. Final STATUS.md + WORKLOG entry; remove the `/tmp/swarm-*` worktrees (`git worktree
   remove`) only after the pushes confirm.

---

## 11. Owner-return packet

The last orchestration step writes `docs/pm/OWNER_RETURN_PACKET.md` containing, for every
HELD-FOR-OWNER item and every prod-bound artifact:

| Item | What is ready | Exact command to run | Rollback | Evidence |
|---|---|---|---|---|

Minimum expected contents: prod replay for W-THAYER repairs (citing the still-open banked
call); W-RELVOICE index-drop migration (127); W-OWNERSHIPCOL migration (128);
W-ANCHORBACKFILL prod run; W-REGDURABLE prod flip; W-EUSEBIUS Phase 4 (dev→prod copy/flip/
serve); the W-SIXWORKS candidate-mapping table + quota estimate + recommended minimal
interpretation; W-HISTBACKLOG parked works; the W-HISTSCOPE out-of-scope entity population
finding (historians lane); the fourth deferred security finding (no global daily ceiling on
the history limiter — unscheduled, carried so it is not lost); E3 standing note; SEC-1 memo +
launch-decision framing; W-SCANRE/W-ANN outcomes (merged or ADR proposals); accuracy results
(W-PN20, W-ADRV4RERUN) and whether the launch-blocking re-run cleared; the one-paragraph
briefs for the §1.3 ruled items; T3 device leg; the staged `ci-fetch-bible-kjv.mjs` deletion
(unadopted, per §1.1); anything NOT RUN with its reason.

The packet's rule: every command in it was dry-run on dev and has a stated inverse. Nothing in
it requires the owner to trust prose — each row cites its evidence file.

---

## 12. What this order deliberately does not do

- No production anything (§1.1). No deploys. The owner returns to a green integration branch
  (and a green `main` if the sole-ownership gate passed) plus a packet.
- No new dependencies, no new config flags, no new env vars.
- No rebuilding of things that work; no opportunistic refactors; no "improvements" beyond the
  hit list. An agent that finds an unrelated defect files it in its status file and moves on.
- No weakening of any gate, skip ceiling, ignore list, or red-proof to reach green.
- No git history mutation (the single exception: rebasing unpushed `swarm/*` branches during
  Wave 8 step 3), no branch deletion, no worktree removal outside Wave 8 step 6.
- "Nothing outward": pushes to origin are expected; no PRs, comments, messages, or uploads to
  third-party services.

---

## 12A. Amendments (2026-08-22, recovery order `2026-08-22-swarm-recovery-amendment.md`)

These bind every future resume of this order. They exist because the first run taught them.

- **A1 — Provider spend ceiling: $25 per workstream, $75 swarm total.** Each workstream
  RECORDS its actual spend on completion in its `items/<W-id>.md` (DeepInfra units × the
  account rate, or the console reading), so the next ceiling is measured rather than guessed.
  Grounding: embeddings are near-free and measured (21,930 sections ≈ $0.19, WORKLOG:5459; the
  1,948-embedding Eusebius write ≈ 1.7¢). No full compose→verify eval run has ever had its
  cost recorded in this repo — that is why this was blank. A workstream that would exceed $25
  stops, records partial results, and marks BLOCKED-budget; the swarm stops at $75.
- **A2 — The writer lane (1c) holds until the measurement lane (1a) completes.** Exception:
  1a results may be declared provisional in their RESULT docs and re-run at Wave 7 against a
  settled DB. The served-pool snapshot mitigation (§6 W-PN20/W-ADRV4RERUN) held this run only
  because Eusebius STAGED rather than SERVED — taxonomy luck, not design.
- **A3 — Status is written PER ITEM, not at session end.** Each item writes its own
  `docs/pm/swarm-2026-08-22/items/<W-id>.md` on completion (and on any terminal state); the
  orchestrator aggregates STATUS.md but is not the only writer. §2.9 made durable records the
  orchestrator's sole job, so a dead orchestrator left "HALTED AT WAVE 0" standing over ten
  finished workstreams.
- **A4 — Migration numbers are claimed by an empty committed stub at item start** (header
  comment only: number, title, owning W-id), pushed with the branch's first commit. 127 sat
  unclaimed in git for the whole run while being applied to dev; under A4 the number is
  claimed in git before any database sees it.

---

## 13. Approval record

This order does not launch until two independent reviewer agents (fresh contexts, read-only)
each record APPROVE below, having checked it against: the repo's binding docs (CLAUDE.md,
AGENTS.md, THE_LOOP.md, BUILD_MODEL.md, PRINCIPLES.md, ENGINEERING.md, TESTING.md), MASTER.md,
STATE_OF_TRUTH.md, and the 2026-08-20→22 WORKLOG entries. Required changes are incorporated
and re-reviewed until both approve.

**Round 1 (2026-08-22):** Reviewer A — REQUIRED CHANGES (4 blocking: W-PRE index mutation,
W-PRE audit in primary tree, Wave 8 location/base unspecified, §2.7 env bootstrap missing; 4
required; 6 nits). Reviewer B — REQUIRED CHANGES (3 blocking: W-SIXWORKS scope unresolvable,
W-PRE step 2 vs §1.1, no sole-ownership gate for Wave 8; 5 required; 3 nits). All findings
incorporated in v2.

**Round 2 (2026-08-22):** Reviewer A — all round-1 fixes verified; REQUIRED CHANGES (1
blocking: §2.7 `<base-sha>` undefined → defined as Wave-0 `origin/main` sha; 2 required:
Wave 8 step 5 failure modes + force-push ban spelled out, migration-number collision now
includes dev-ledger check and same-pass rename; 3 nits: root-env prod guard, MASTER.md dead
ROADMAP pointer fixed via W-T3, §5.1 collision premise now verified in W-PRE step 5).
Reviewer B — all round-1 fixes verified; REQUIRED CHANGES (1 blocking: Wave 8 step 5
mechanism not executable → rewritten as push-only with an explicit `update-ref` ban; 1
required: migration suspension moved into the owner-authority preamble as bullet 5; 2 nits:
gate re-run now fetches and compares `origin/main`, W-THAYER deferral semantics defined).
All findings incorporated in v3.

**Round 3 (2026-08-22):** Reviewer A — round-2 fixes verified; REQUIRED CHANGES (0 blocking;
2 required: §2.7 env grep made silent (`grep -q`, boolean only), W-PRE now verifies env hosts
are `ep-tiny-hat`/`ep-snowy-bird` before any bootstrap; 3 nits: step-5 parenthetical
reworded, gate-vs-retry precedence clause added, owner handoff precision). Reviewer B —
round-2 fixes verified; REQUIRED CHANGES (1 blocking: the same secret-printing grep path; 3
nits: ADR-118 amendment date corrected to 2026-08-22, the same step-5 rewording, the same
gate-vs-retry clause). All findings incorporated in v4. Both reviewers pre-authorized sign-off
on verification of these final lines.

| Reviewer | Round | Verdict | Date | Notes |
|---|---|---|---|---|
| A (safety lens) | 4 (final) | **APPROVE** | 2026-08-22 | all findings rounds 1–3 verified fixed in v4; no new prod/authority/gate/secret holes |
| B (completeness lens) | 4 (final) | **APPROVE** | 2026-08-22 | launch-ready: full coverage with justified holds, grounded briefs, safe integration path |

**Both reviewers APPROVED v4 on 2026-08-22. This order is approved for launch.** One
executional refinement made at launch: subagent prompts instruct agents to READ this file's
§§1–2 plus their item brief from the repo (rather than pasting the text into prompts), which
removes transcription drift; the briefs are executed verbatim from the file.
