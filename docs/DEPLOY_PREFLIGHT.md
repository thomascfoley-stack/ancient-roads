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

**Nothing in CI builds the app.** `audit` runs typecheck, lint, knip, deps-audit and tests;
`db-invariants` runs DB suites. Neither runs `next build`. **The deploy itself was the only thing
that would ever have caught this** — at step 6 of 7, after the clean-tree gate, after the corpus
checks, after the licensing ratchet, with the owner watching.

**Standing gap, not fixed here:** CI still does not build. Until it does, "CI green" says nothing
about whether the product compiles. That is a small workflow addition and the highest-value
follow-up in this document.

---

## 1. The ordered sequence, and what each step refuses on

`deploy.sh` runs under `set -e` — any non-zero exit aborts immediately.

| # | Step | Refuses when | Verified |
|---|---|---|---|
| 1 | **Clean-tree gate** — `git status --porcelain` | any modified **or untracked** file | read |
| 2 | `npx` present | Node missing | read |
| 3 | **Bible file count** | **never — WARNS only** below 1,000 | measured: 22,590 |
| 4 | **Commentary file count** | **never — WARNS only** below 1,000 | measured: 1,213 |
| 5 | **`predeploy-gate.ts`**, `DEPLOYING=1` | see §2 | **executed, EXIT=0** |
| 6 | **`cd web && npx next build`** | any build error | **executed, EXIT=0** after §0 |
| 7 | `npx vercel --prod --archive=tgz` | Vercel-side | **not run — this is the deploy** |

**Steps 3 and 4 are warnings, not gates.** They print `Warning:` and continue. A corpus of 5 files
would warn and proceed to step 5, which is where it is actually caught. Do not read those lines as
protection — `predeploy-gate.ts` is the protection.

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

**What it does NOT check:** that the app builds (§0), and that `concordance/`, `lexicon/` and
`original/` exist (§4).

---

## 3. What is uploaded that is not in git

`vercel --prod` uploads the **working tree**, not a commit. These are gitignored and reach production
**only** this way — never through git, never through CI:

| directory | on this machine | size |
|---|---|---|
| `web/public/bible/` | present, 22,590 files | 198M |
| `web/public/commentaries/` | present, 1,213 files | 407M |
| `web/public/concordance/` | **ABSENT** | — |
| `web/public/lexicon/` | **ABSENT** | — |
| `web/public/original/` | **ABSENT** | — |

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

## 4. Three asset directories are missing, and one of them throws

`concordance/`, `lexicon/` and `original/` do not exist here. `deploy.sh`'s own comment names them
(*"concordance = 13,480 files, original, commentaries, lexicon"*) as why `--archive=tgz` was added on
2026-07-12 — so they existed then.

**They are still served.** `web/src/lib/original.ts` fetches `/original/{book}/{chapter}.json`,
`/lexicon/{greek,hebrew}.json`, `/concordance/{bucket}.json`, consumed by the reader's interlinear
(`app/read/[book]/[chapter]`), the word-study page (`app/library/word-study`) and
`components/word-panel.tsx`.

**Degradation is inconsistent:**

| function | guard | on 404 |
|---|---|---|
| `fetchOriginal` | try/catch + `res.ok` | returns `null` — **graceful**, interlinear silently absent |
| `fetchConcordance` / `fetchJson` | try/catch + `res.ok` | returns `null` — **graceful** |
| **`loadLexicon`** | **neither** | `res.json()` on an HTML 404 body — **THROWS** |

`loadLexicon` is reached from `loadFullLexicon` (word-study) and `fetchLexEntry` (word-panel). **So
Deploy A as it stands ships a site whose word-study page and word panel throw**, while the
interlinear degrades quietly. `predeploy-gate.ts` does not look at these directories, so nothing
refuses.

**They are recoverable in minutes, not by re-ingest.** All three are in the GitHub release
`corpus-backup-2026-07-28` (concordance 1 MB, lexicon <1 MB, original 7 MB) and in the 2026-07-19
release. The 2026-07-28 machine migration restored `bible` and `commentaries` and **left these three
behind** — their asset download counts are one lower. See `RECOVERY.md` §3a for the exact command.

**Not fixed tonight**, because it is a decision rather than a repair: restore them, ship without them,
or guard `loadLexicon` and ship degraded. **This remains the single most likely thing to make Deploy A
ship a broken page** — but the fix is a download, not an ingest run.

---

## 5. What rollback restores, versus what is merely available

**The rollback target id is not established.** The work order cites
`dpl_DwoWDhhZiLVLftKN9rcPiRU3v1qt`, and `docs/RECOVERY.md` §2 records that this id **does not
appear anywhere in this repo** — use dashboard truth, not the order. The deployments of record
that DO appear are `dpl_EjzknRQEpaUXBG3YfjLhe8tKtpSr` (`654f028`, 2026-07-16) and the live site
of record `24677ba` (2026-07-18). **Confirm the id in the Vercel dashboard before relying on it**
— checklist item 7 exists for this reason. What follows is true of promoting the 2026-07-18
deployment, whatever its id turns out to be.

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
[ ] 5  DECIDE: concordance / lexicon / original are ABSENT (§4).
       Ship without them (word-study + word-panel THROW), regenerate them, or
       guard loadLexicon first. A decision, not a check.
[ ] 6  Accept what rollback does NOT restore (§5): pre-025 code on a post-031
       schema, re-opening G4, and a corpus that bypasses predeploy-gate.
[ ] 7  Record the current live deployment id, so "roll back" has a target that
       is not a guess.
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
