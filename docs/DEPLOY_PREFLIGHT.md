# DEPLOY PREFLIGHT — what Deploy A actually does, and what must be true first

**Rewritten 2026-08-01 from measurement, not from reading `deploy.sh`.** Every gate below was
executed; quoted results were produced on this machine. Nothing here deploys.

Deploy A is the **first time this pipeline will have completed successfully in the project's
history**. E5 has never run. `docs/pm/MASTER.md`: *"Whether `deploy.sh` works end-to-end is an open
question in the work order itself."*

Complements `docs/DEPLOYMENT.md` and `docs/RECOVERY.md`.

---

## 0. The headline, measured

**The build was broken at `d1576fe` and is fixed at `c1e359d`.** `cd web && npx next build` exited 1
with `Invalid segment configuration export detected` — both `/api/ask` routes exported
`maxDuration = ASK_MAX_DURATION_SEC`, an identifier where Next 16 requires a literal. Next named no
route in the failure, which is why it stayed invisible.

**Nothing in CI built the app when this was written.** `audit` ran typecheck, lint, knip, deps-audit
and tests; `db-invariants` ran DB suites. Neither ran `next build`. **The deploy itself was the only
thing that would ever have caught this** — at step 6 of 7, after the clean-tree gate, after the
corpus checks, after the licensing ratchet, with the owner watching.

**CLOSED at `19798ec`** (corrected 2026-08-01; this section previously called it a standing gap and
"the highest-value follow-up in this document"). `.github/workflows/audit.yml:55-65` runs
`next build` as step 7 of the `audit` job, with `set -o pipefail` so a failure through `tee` is not
swallowed, plus an annotation naming the likely cause because Next reports segment-config errors
without naming a route. Verified executing on a real run: step 7 `build — next build (the product
must compile)` = success.

**What has NOT changed:** `main` is unprotected — `required_status_checks` is empty and rulesets are
unavailable on this plan for a private repo — so `audit` is not a required check. The build gate is
real inside the job; nothing mechanically stops a red commit reaching `main`. Green is advisory
here, and the gate is you.

---

## 1. The ordered sequence, and what each step refuses on

`deploy.sh` runs under `set -euo pipefail` — any non-zero exit aborts immediately.

**Re-ordered 2026-08-06:** the account/project/env assertions moved ABOVE the build. They are
seconds of network and no state; `next build` is minutes. A wrong-account run now stops before it
has done any work. "Verified" below now means *by `test/deploy-sh-gates.sh`* — a bash harness that
runs this script against throwaway git repos and a stubbed CLI, with no network and no Vercel
account — except where a row says it was executed for real.

| # | Step | Refuses when | Verified |
|---|---|---|---|
| 1 | **Repo-root anchor** — `git rev-parse --show-toplevel` | not inside a git repo | harness |
| 2 | **Clean-tree gate** — `git status --porcelain` | any modified **or untracked** file | harness |
| 3 | **Ancestry gate** — HEAD must contain `origin/main` | the tree would revert shipped work | harness |
| 4 | `npx` present | Node missing | read |
| 5 | **Bible file count** | **never — WARNS only** below 1,000 | measured: 22,590 |
| 6 | **Commentary file count** | **never — WARNS only** below 1,000 | measured: 1,213 |
| 7 | **`predeploy-gate.ts`**, `DEPLOYING=1` | see §2 | **executed, EXIT=0** |
| 8 | **Target assertion** — `whoami`, org reachable, project present | wrong account/org/project | harness |
| 9 | **Env assertion** — 7 required names in Production | any missing; also refuses if the check could not run | harness |
| 10 | **`cd web && npx next build`** | any build error | **executed, EXIT=0** after §0 |
| 11 | **Second clean-tree check** | the tree changed during the build | harness |
| 12 | `vercel --prod --archive=tgz --meta sha=…` (CLI pinned) | Vercel-side | executed many times |
| 13 | **Post-deploy verification** — alias must serve this deployment | the alias serves something else | harness |

**Steps 5 and 6 are warnings, not gates.** They print `Warning:` and continue. A corpus of 5 files
would warn and proceed to step 7, which is where it is actually caught. Do not read those lines as
protection — `predeploy-gate.ts` is the protection.

### Exit codes — 2 and 3 are new, and they do not mean the same thing

| exit | meaning | production |
|---|---|---|
| 0 | `ancientpaths.app` is served by this deployment, checked by id | changed, as intended |
| 1 | a gate refused | untouched (upload never started) |
| 2 | **UNVERIFIED** — the upload finished and the check could not run | unknown; check by hand |
| 3 | **MISMATCH** — the alias serves a different deployment | the deploy did not take |

Exit 2 is not a failure report. It says nobody knows yet, which is the honest answer when an
instrument could not run — see the watchlist entry in `docs/pm/MASTER.md` about negative results
that are really a NOT RUN. A receipt is written in every case from step 12 onward, and its
`state:` field carries the same word.

### Abort state after each step

| aborts at | state of production | reversible |
|---|---|---|
| 1–6 | **untouched.** Nothing has left the machine. | n/a — nothing happened |
| 7, upload fails | untouched; partial/no deployment on Vercel | yes — no promotion |
| 7, Vercel-side build fails | untouched; failed deployment recorded, not promoted | yes |
| 7, **after promotion** | **live and changed** | only by promoting a previous deployment — §5 |

**Everything before step 7 is free**, and the whole preflight is safe to run repeatedly. The only
irreversible act in the file is the promotion inside `vercel --prod`.

---

## 2. `predeploy-gate.ts` — refusals, exercised

Against the real corpus with `DEPLOYING=1`: **EXIT=0**.

```
✓ Ratchet holds. Shipping 0 known forbidden-provenance entries (≤ baseline).
✓ Every translation dir present has a shipping license record (allow, or conditional+ack).
  works (authors) present : 308      books present  : 66
  chapter files present   : 1,212    entries        : 191,749
  corpusHash              : 5ea27410facad96369bbbab9f36d14b741c07c0f02bbc7786f3f45e4b69f5eda
  last manifest           : 839017d v2 (308 works, 1,212 files, 191,749 entries)
✓ No work lost since the last committed manifest.
✓ No author collapsed to the chapter number.
✓ No served entry carries forbidden aggregator provenance.
```

Its four refusals:

1. **Corpus absent** → refuses. Measured EXIT=1: *"Either the reader will ship with no content, or
   content is about to be uploaded that this gate never counted."* **Note:** this leg hard-fails in
   **both** modes, not only under `DEPLOYING=1` — it calls `FAIL` directly, not `gateFail`.
   Fail-closed and correct, but it differs from the warn-on-pre-commit behaviour documented for the
   file's other legs.
2. **Corpus shrunk / a work lost** → refuses via the manifest ratchet. This is the leg that catches
   *silent* loss: an author removed from every chapter file changes no file count at all.
3. **Forbidden-provenance entries increased** → refuses. The number may only go down.
4. **A Bible translation with no shipping licence record** → refuses (hard only under `DEPLOYING=1`).

**What it does NOT check** (corrected 2026-08-01 — both of the items previously listed here are now
covered, so the honest gap is narrower and different):

- ~~that the app builds~~ — now covered twice: `next build` is step 7 of `deploy.sh` and, since
  `19798ec`, step 7 of CI's `audit` job.
- ~~that `concordance/`, `lexicon/` and `original/` exist~~ — now covered: `b9ad463` derives the
  served set from the client's own fetches and `predeploy-gate.ts:75` refuses on an absent one.
- ~~The real remaining gap: it is a PRESENCE check, not a COUNT check.~~ - now covered: the count
  ratchet (`servedAssetCountRatchet` in `scripts/lib/served-assets.mjs`) compares live per-directory
  file counts under `web/public` against the committed `docs/evidence/served-assets-baseline.json`
  (figures from the 2026-08-01 census) and refuses ANY decrease - and refuses equally on a missing
  or garbled baseline instead of skipping. Increases pass and are reported; re-record deliberately
  with `node scripts/update-served-assets-baseline.mjs --yes`.
- **A newly served directory gets a presence check and no licensing or provenance check at all.**
  (It does now get a *count* check: the gate refuses a served directory with no baseline entry.)

---

## 3. What is uploaded that is not in git

`vercel --prod` uploads the **working tree**, not a commit. These are gitignored and reach production
**only** this way — never through git, never through CI:

Re-measured 2026-08-01 ([census](evidence/post-a1-2026-08-01/concordance-census.md)). All six served
directories are present. **FIVE of the six** are byte-exact against the `corpus-backup-2026-07-28`
release — compared on file count, byte total, and a roll-up SHA-256 over path+content of every file.
The sixth, `devotional/`, is **not in that release at all**, so there is nothing to compare it
against; it is tracked in git and restores from any clean clone. "All six byte-exact" stood here,
in checklist item 5 and in MASTER.md's A6 row, and was wrong in all three (corrected 2026-08-02 —
[verdict](pm/orders/2026-08-02-stop-verdict-corrections-branch.md)):

| directory | on this machine | bytes | vs backup |
|---|---|---|---|
| `web/public/bible/` | present, 22,590 files | 158,286,312 | match |
| `web/public/commentaries/` | present, 1,213 files | 424,536,756 | match |
| `web/public/concordance/` | present, 295 files | 3,673,944 | match (roll-up `8081b779…f39b`) |
| `web/public/devotional/` | present, 1 file | 1,489,403 | n/a — **tracked in git** |
| `web/public/lexicon/` | present, 2 files | 3,102,678 | match |
| `web/public/original/` | present, 1,189 files | 44,280,085 | match |

**Correction (2026-08-01, same day): `devotional/` needs no release asset.** An earlier revision of
this table called it "no backup asset exists" and inferred it was unrestorable. Wrong.
`web/public/devotional/morning-evening.json` is **tracked in git** — it is the only served directory
not listed in `.gitignore:18-38` — so a clone restores it. The five gitignored directories are the
ones that need the release tarballs.

**This section's own heading is therefore slightly wrong too:** "What is uploaded that is not in
git" describes five of the six directories, not all six.

**What must be true locally for the upload to be correct:** the tree is clean (step 1);
`predeploy-gate.ts` passes **on the bytes about to upload** — it reads the same directories `vercel`
will send, which is exactly why the gate lives in `deploy.sh` and not in CI; and the corpus hash
matches the committed manifest (§2 prints and checks it).

**How to verify before upload rather than after:**

```bash
DEPLOYING=1 npx tsx scripts/predeploy-gate.ts
```

Same command `deploy.sh` runs at step 5, read-only, costs nothing. Run it standalone first.
**Verifying after upload is not equivalent** — once promoted the content is live, and the only remedy
is §5's rollback, which has its own problems.

---

## 4. RESOLVED — the three directories are present. ~~The `loadLexicon` hazard is not.~~ Guarded as of this commit.

**This section described three ABSENT directories. They were restored at `b9ad463` and re-measured
byte-exact on 2026-08-01 (§3).** Deploy A no longer ships a site whose word-study page throws. What
follows is kept because the *degradation asymmetry* below is unchanged, and it is what makes a
future loss silent rather than loud.

**Also settled: `deploy.sh:81`'s "concordance = 13,480 files" is not stale, it is mislabelled.**
13,480 is the count of Strong's **entries**, not files. The directory is bucket-sharded: 295 files
(144 buckets + 151 outlier shards) holding exactly 13,480 entries. The number reproduces to the
digit. Separately, that comment blames the wrong directories for the upload limit — the four it
names total 2,699 files; the one that actually exceeds Vercel's 15,000 is `bible/` at 22,590, which
it does not mention. `--archive=tgz` is still required; the reasoning is wrong, not the conclusion.

**They are served.** `web/src/lib/original.ts` fetches `/original/{book}/{chapter}.json`,
`/lexicon/{greek,hebrew}.json`, `/concordance/{bucket}.json`, consumed by the reader's interlinear
(`app/read/[book]/[chapter]`), the word-study page (`app/library/word-study`) and
`components/word-panel.tsx`.

**Degradation was inconsistent** (the table is the pre-fix state, kept as the history of the asymmetry):

| function | guard | on 404 |
|---|---|---|
| `fetchOriginal` | try/catch + `res.ok` | returns `null` — **graceful**, interlinear silently absent |
| `fetchConcordance` / `fetchJson` | try/catch + `res.ok` | returns `null` — **graceful** |
| **`loadLexicon`** | **neither** | `res.json()` on an HTML 404 body — **THROWS** |

`loadLexicon` is reached from `loadFullLexicon` (word-study) and `fetchLexEntry` (word-panel).

**RESIDUAL, and it is the part worth keeping.** `lexicon/` is present today, so nothing throws now.
~~But `loadLexicon` still has neither a `res.ok` check nor a try/catch~~ Guarded as of this commit:
`loadLexicon` has both, degrades to `null` like its siblings, and word-study, word-panel and the
study panel show a visible "lexicon unavailable" state rather than throwing (pinned by
`web/test/lexicon-404-degrade.test.ts`). That asymmetry was a latent hazard, not a live one, and it is exactly
what made the 2026-07-28 loss expensive. `predeploy-gate.ts` now DOES refuse on an absent served
directory (`b9ad463`, derived from the client's own fetches), so the gate would catch a full
disappearance — but it is a **presence** check with no file-count check anywhere in
`scripts/lib/served-assets.mjs`, so a *partial* loss still passes and still fails silently in the UI.

**They are recoverable in minutes, not by re-ingest.** All three are in the GitHub release
`corpus-backup-2026-07-28` (concordance 1 MB, lexicon <1 MB, original 7 MB) and in the 2026-07-19
release. The 2026-07-28 machine migration restored `bible` and `commentaries` and **left these three
behind** — their asset download counts are one lower. See `RECOVERY.md` §3a for the exact command.

~~**Not fixed tonight**, because it is a decision rather than a repair: restore them, ship without them,
or guard `loadLexicon` and ship degraded.~~ **Decided and fixed in this commit: guard and ship
degraded.** A missing lexicon can no longer throw a page down; **the remaining lexicon risk is the
file-count gap above**, and restoring a lost directory is still a download, not an ingest run.

---

## 5. What rollback restores, versus what is merely available

**The rollback target ids ARE established** (corrected 2026-08-01; this paragraph previously said
they were not). Read read-only from the Vercel API, team `home-network-hardening`, project `web`;
full table and provenance in [`RECOVERY.md`](RECOVERY.md) §2. All timestamps UTC.

| deployment | sha | created (UTC) | what it is |
|---|---|---|---|
| `dpl_DwoWDhhZiLVLftKN9rcPiRU3v1qt` | `24677ba` | 2026-07-19 16:57:06Z | **currently promoted** - serves `ancientpaths.app` |
| `dpl_FYQxxZ1rLN1wd4UeMwShhX12G5BM` | `24677ba` | 2026-07-18 22:32:21Z | same sha as live; promoting it changes no code |
| `dpl_EjzknRQEpaUXBG3YfjLhe8tKtpSr` | `654f028` | 2026-07-17 01:32:56Z | **the real rollback target** |

`dpl_DwoWDhhZiLVLftKN9rcPiRU3v1qt` is not a phantom and is not the target: **it is what is live**, so
promoting it is a no-op that reports success. Checklist item 7 is answered by this table. What
follows is true of promoting `dpl_Ejzk…` or `dpl_FYQ…`.

**Promoting it restores** the **pre-025 application code** of that date, and **the static corpus as
it was on 2026-07-18** — the deployment is an immutable bundle including the uploaded working tree.

**It does not restore, and cannot:**

- **the database.** Prod is post-031. Pre-025 code against a post-031 schema **is the G4 window** —
  the same mismatch that had note-saving broken from E1 until E5 never ran. **Rolling back re-opens
  it.**
- **any judgement about those bytes.** A promotion is Vercel-side; it does not run `deploy.sh`, so
  the 2026-07-18 corpus returns to production **without passing the only gate that ever sees it**.
  Whatever its forbidden-provenance count was that day is what comes back.

**Available ≠ restored.** What it restores is a code+corpus pair from a different schema era, not
"the previous good state".

---

## 6. Post-deploy checks

**G4 — does note-saving work again?** G4 is the window opened when prod moved to post-025 while
deployed code was pre-025 (`STATE_OF_TRUTH` §2b, log lines 335–337); it closes when code matches
schema. **Proof:** sign in on the live site, save a note on a section, reload, confirm it persists,
then confirm the row by read-only query. A 200 is not sufficient — the failure mode was a schema
rejection surfacing as a failed write.

**G7 — the live `/ask` probe, for the first time ever.** G7 has **never run**: DB-only in every
cutover log to date (`CUTOVER_ASK_URL` unset), and the gate leg inventory only requires G7 when
`liveProbeRan`. **What counts:** `CUTOVER_ASK_URL` set to the live endpoint, a real question posted
through `/api/ask`, the response passing the verifier, recorded. Anything short of a live HTTP
round-trip against production is not G7 — it is the DB-only gate that has always passed.

---

## 7. Owner checklist — one pass, before the go is asked for

Everything below is free and reversible. Stop at the first ✗.

```
[ ] 1  git status --porcelain                            -> empty
[ ] 2  cd web && npx next build                          -> EXIT 0   (was BROKEN before c1e359d)
[ ] 3  DEPLOYING=1 npx tsx scripts/predeploy-gate.ts     -> EXIT 0
[ ] 4  corpusHash matches the committed manifest         (step 3 prints and checks it)
[x] 5  ANSWERED 2026-08-01 — NO DECISION NEEDED. All six served directories are
       present; five are byte-exact vs corpus-backup-2026-07-28 (§3, roll-up
       hashes). devotional/ is not in that release and is tracked in git.
       Nothing throws. Residual, not a blocker: loadLexicon still lacked a
       res.ok guard at the time (§4; guarded since this branch).
       *** BUT SEE §9: they are present in ~/Projects/ancient-roads-git, which
       is 29 commits BEHIND and cannot build. Item 5 is answered about a tree
       that cannot pass items 2 and 3. Read §9 before running anything. ***
[ ] 6  Accept what rollback does NOT restore (§5): pre-025 code on a post-031
       schema, re-opening G4, and a corpus that bypasses predeploy-gate.
[x] 7  ANSWERED 2026-08-01 (§5). Live now: dpl_DwoWDhhZiLVLftKN9rcPiRU3v1qt
       (24677ba, 2026-07-19). Rollback target: dpl_EjzknRQEpaUXBG3YfjLhe8tKtpSr
       (654f028). Do NOT "roll back" to dpl_DwoW... - that is the live one.
[ ] 8  A1 merged? Deploy A is gated behind it on the board.
```

**After the deploy:** G4 note-saving check, then G7 live probe — the first time.

---

## 8. What this document does not establish

- That `vercel --prod --archive=tgz` succeeds. **Step 7 has never run.** Everything up to it is now
  verified; the upload and promotion are not, and cannot be without deploying.
- That the site behaves correctly once live — that is A7's twelve journeys.
- Anything about the database. No production connection was made, read or write.
- **`next build` rewrites two TRACKED files** — `web/tsconfig.json` and `web/next-env.d.ts` — so a
  local build dirties the tree and step 1 will then refuse. Expect
  `git checkout -- web/tsconfig.json web/next-env.d.ts` between a test build and the deploy.

## What this is not

- Not a substitute for cutover gates G1–G10 during E0–E6.
- Not authorization for prod DB writes or a publish flip.

---

## 9. CLOSED — the two-clone problem no longer exists (found 2026-08-01, re-measured 2026-08-02)

> **This section stood as the single hardest blocker on A6, and the `MASTER.md` A6 row cited it as
> such, after it had stopped being true.** Deep audit M24. The table below is kept because a reader
> who met the old claim elsewhere needs to find the correction here, not just its absence.

**What was true on 2026-08-01.** `~/Projects/ancient-roads-git` held the corpus at `f10df90`,
29 commits behind, with the `= ASK_MAX_DURATION_SEC` build-breaker and no
`scripts/lib/served-assets.mjs`; the other clone had current code and only `devotional/`. Neither
tree could complete `deploy.sh`. The fix named here was the fast-forward, and it was taken.

**What is true now**, measured in `~/Projects/ancient-roads-git` on 2026-08-02:

| | measured |
|---|---|
| corpus | all six served dirs present — `bible`, `commentaries`, `lexicon`, `original`, `concordance`, `devotional` |
| HEAD | on `main`'s line, current (the fast-forward happened) |
| `web/src/app/api/ask/route.ts` | the literal `300`, with the comment explaining why, plus `test/ask-max-duration-literal.test.ts` |
| `scripts/lib/served-assets.mjs` | present |
| `predeploy-gate.ts` | runs, and at `DEPLOYING=1` exits 0 |

One clone, code and corpus together. Run `./deploy.sh` from it.

**The remaining A6 blocker is not this.** It is whatever `deploy.sh` itself has never proven — see
the Vercel-link note immediately below, which is a separate finding and was NOT closed by the
fast-forward.

### Two more things this preflight got wrong

**`corpusHash` is never compared.** `predeploy-gate.ts:178` **prints** it and nothing in `scripts/`
compares it; `evaluateCorpusRatchet` (`scripts/lib/corpus-manifest.mjs:143-168`) ratchets
`fileCount`, `entryCount`, `works` and `books` only. Checklist item 4 asks you to confirm something
the gate does not do. The real check is the works/books/count ratchet.

**No Vercel project link exists.** There is no `.vercel/project.json` in any clone (`.gitignore:11`
and `:49`), and the CLI on this machine authenticates into scopes that do not contain the `web`
project. Step 7 — `npx vercel --prod --archive=tgz` — is the one step that has never run, and
whether it can resolve the project non-interactively is **NOT ESTABLISHED**. Settle this before the
go, not at step 7 of 7.


---

## 10. Three things about the deploy that were not written down (2026-08-02 deep audit)

### M13 — CLOSED 2026-08-02: the upload root is pinned, and the pin is enforced

`web/package-lock.json` pins 738 packages, and `web/vercel.json` sets
`installCommand: "npm ci --legacy-peer-deps"`.

**Why both.** The lockfile alone is HONOURED but not ENFORCED: `npm install` reads it and installs
the pinned tree, but it also silently UPDATES the lock when `package.json` asks for something the
lock cannot satisfy. Bump a dependency and forget to re-lock and production resolves fresh again,
with nothing to see. `npm ci` installs the lockfile verbatim and FAILS the build if the two
disagree. `--legacy-peer-deps` matches `web/.npmrc`, which exists because
`@neondatabase/auth@0.4.2-beta` declares a peer of `next>=16` that npm's strict resolver rejects.

**Two traps, both paid for once each.**

1. `npm install --package-lock-only` run INSIDE `web/` walks up, finds the workspace's pnpm store,
   and writes 43 entries shaped `../node_modules/.pnpm/next@16.2.12/node_modules/next` — paths that
   do not exist in the upload. That lockfile is worse than none. Generate it from a copy of
   `web/package.json` + `web/.npmrc` in a directory with **no ancestor `node_modules`**;
   `test/invariants/upload-root-lockfile.test.ts` asserts the property that distinguishes the two.
2. `vercel.json` rejects unknown top-level properties, including the `"//"` comment key that
   `package.json` allows. The deploy died with `should NOT have additional property '//'` before
   uploading a byte — which is why this rationale is here and not in the file.
   `test/invariants/vercel-json.test.ts` pins the allowed key set.

**Measured effect.** The pre-lockfile deploy's install read "added 83 packages, removed 1 package,
and changed 22 packages"; the first deploy after it read "added 15, removed 13, changed 57" as the
cached tree converged on the pinned one, with Next resolving to exactly the pinned `16.2.12`.

---

### M13 — the original finding (production dependencies resolved fresh at every deploy)

`deploy.sh` does `cd web` before `vercel --prod`, so **`web/` is the upload root** — and `web/` has
**no lockfile**. `web/pnpm-lock.yaml`, `web/package-lock.json` and `web/yarn.lock` are all absent;
the only lockfile is the root `pnpm-lock.yaml`, outside the upload root, because
`pnpm-workspace.yaml` lists `web` as a member. `web/.npmrc` says the rest out loud: *"Vercel's
remote build uses npm, whose strict peer resolution fails with ERESOLVE"*, and sets
`legacy-peer-deps=true`.

So the shipping bundle is built from floating ranges — `next: ^16.2.12`, `react: ^19.2.8`,
`@neondatabase/serverless: ^1.1.0`, `tailwindcss: ^4.3.3`. Consequences, stated plainly:

* the artifact promoted to production has never been tested at that dependency set;
* **two deploys of the same git sha can ship different code**;
* CI runs `corepack pnpm install --frozen-lockfile` — it gates a PINNED pnpm tree that is not what
  ships;
* `package.json`'s `pnpm.auditConfig.ignoreGhsas` list and `scripts/deps-audit.mjs` govern the pnpm
  tree, not the npm tree in production.

This class already burned this project once: deployment `dpl_8USYb3e6C5UKh9L2RLzpTHVBB6mm` carries
the commit message *"local passed, remote failed"*.

**Not fixed here** — the fix is either a committed `web/` lockfile or a Vercel `installCommand`
override, and both change how every future deploy resolves. That is a deliberate choice, not a
cleanup.

### M14 — the `next build` at step 6 is not the artifact that ships

`web/.vercelignore:8` excludes `.next`, and step 7 runs `vercel --prod` **without `--prebuilt`**, so
Vercel re-installs and re-builds remotely. Step 6 is a smoke test on a different toolchain: local
is Node v24.5.0 with a pnpm-installed `web/node_modules`; remote is Node 24.x with npm and
`legacy-peer-deps`. CI is Node **22**, and the Vercel project is Node **24.x**.

"The build passed" at step 6 is a statement about a build, not about the deployed bundle. With M13
stacked on top, a green step 6 and a green CI build differ from the shipping build in **both**
runtime and dependency resolution.

### M16 — the clean-tree gate runs before the only step that dirties the tree

`deploy.sh:18-30` checks `git status --porcelain` first. Step 6's `npx next build` then rewrites the
**tracked** files `web/tsconfig.json` and `web/next-env.d.ts`. Step 7 uploads that tree.

So the bytes promoted are not the bytes the gate approved, which falsifies the script's own stated
invariant at `:27-28` — *"What's in prod must be reproducible from git."* Small in content,
structural in kind, and Vercel records the class: `dpl_8dxbjZc4DSH8Ffv9CXDdGM1o9xX2` carries
`meta.gitDirty: "1"`.
