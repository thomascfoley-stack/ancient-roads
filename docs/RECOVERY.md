# RECOVERY — every restore path, what it actually restores

One page per mechanism. **Host survives?** is load-bearing: if recovery promotes a Neon child
branch, `CUTOVER_EXPECT_HOST`, Vercel `DATABASE_URL`, and every `target-guard` assertion that
names the endpoint host become wrong the instant recovery completes.

Authoritative protected snapshot registry: [`PROTECTED_BRANCHES.json`](PROTECTED_BRANCHES.json).
Neon PITR retention on this project is 21,600 s (6 h) against a ~2 h 20 m cutover — **PITR is not
a restore plan.**

See also [`DEPLOYMENT.md`](DEPLOYMENT.md) § "What a Vercel rollback does and does not recover"
and [`CUTOVER_DESIGN.md`](CUTOVER_DESIGN.md) § protected branches.

---

## 1. Neon protected snapshot → production endpoint

| | |
|---|---|
| **Command** | `neonctl branches create --parent br-late-recipe-atxl68sh --name restore-rehearsal-<ts>` then, after verification on the child, promote or repoint the production endpoint to that child (exact neonctl subcommand depends on Neon API version — **owner call**). Rollback strings in `scripts/cutover.mjs` quote `br-late-recipe-atxl68sh` by id. |
| **Restores** | Database schema + row contents as of snapshot **2026-07-29** pre-cutover prod (`pre-cutover-ep-odd-fog-atnykudm-20260729164220`). User annotations were empty at cutover; waitlist preserved per G1. (`channels` measured **0 rows** on prod 2026-08-01, gate A2, against a record claiming 1 — see `docs/evidence/a2-prod-readonly-2026-08-01/standing-gaps.md` §2; what this snapshot holds for `channels` is unverified.) |
| **Destroys** | Every prod write after the snapshot: E4 slice, staged sources, migration 024–031 state, any publish flip, user data written post-cutover. |
| **Host survives?** | **NO.** Promoting a child branch changes the connection host. Update Vercel `DATABASE_URL`, every cutover/instrument `CUTOVER_EXPECT_HOST`, and re-run host assertions before calling recovery done. |
| **Window** | Indefinite while `br-late-recipe-atxl68sh` exists. **"Deletion refused" was not true** — see the note below. |

> **MEASURED 2026-08-02, immediately before A4.** This row said the branch was "registered,
> deletion refused". Nothing refuses it, at either layer:
>
> * **Neon does not protect it.** `neonctl branches get br-late-recipe-atxl68sh` returns
>   `protected: false`. The Neon-side protection flag has never been set on it.
> * **No code refuses it either.** `scripts/lib/neon-branch-guard.mjs` exports
>   `refuseProtectedBranchDelete`, and repo-wide the only files that reference it are the guard
>   itself, its `.d.mts`, and its own test. **No script calls it.** A guard nothing invokes is a
>   registry, not a refusal.
>
> So the protection is a documentation claim only: `docs/PROTECTED_BRANCHES.json` records the
> intent and `docs/OWNER_ACTIONS.md` §1f states the rule, and any deletion through the Neon
> console, `neonctl`, or the API goes straight through. That is this repo's most-repeated defect
> class - a hand-maintained expected set that nothing enforces - sitting on the rollback path for
> the one irreversible write, discovered while preparing to make it.
>
> **The fix is an owner action** - an infrastructure write on production, so it is not mine to run.
> **`neonctl` cannot do it.** Its `branches` subcommands are `add-compute, create, delete, get,
> list, rename, reset, restore, schema-diff, set-default, set-expiration`; there is no
> `set-protection`, and "protect" appears nowhere in its help. (An earlier revision of this note
> prescribed `neonctl branches set-protection`, which does not exist.) Use either:
>
> * **Neon console** - Branches -> `pre-cutover-ep-odd-fog-atnykudm-20260729164220` -> enable
>   protection. This is the recommended path: it is the same place the flag is read from.
> * **The API directly**, if you prefer a command. The `protected` field is confirmed present on
>   the branch resource (`neonctl branches get` returns it); the PATCH below follows Neon's
>   documented branch-update shape but is **not verified here**, because verifying it would mean
>   performing the write:
>
>   ```
>   curl -X PATCH \
>     -H "Authorization: Bearer $(cat ~/.neon_api_key)" \
>     -H "Content-Type: application/json" \
>     -d '{"branch":{"protected":true}}' \
>     https://console.neon.tech/api/v2/projects/spring-heart-74819093/branches/br-late-recipe-atxl68sh
>   ```
>
> Confirm either way with `neonctl branches get br-late-recipe-atxl68sh --project-id
> spring-heart-74819093 -o json`, which must then report `"protected": true`.
>
> Until that reads true, treat the rollback branch as deletable by accident.
| **Exercised** | **NOT YET.** Rehearsal requires owner approval to create a throwaway child off the protected branch. Exact ops to run on approval: (1) `neonctl branches create --parent br-late-recipe-atxl68sh --name throwaway-restore-rehearsal-<ts>`, (2) connect read-only to child, assert indexes `indisvalid=t` and migration set, (3) compare user-data digest to cutover E0 log, (4) **delete throwaway** — never touch `br-late-recipe-atxl68sh`. |

---

## 2. Vercel Instant Rollback (frontend bundle)

| | |
|---|---|
| **Command** | Vercel dashboard → project **`web`** → Deployments → select deployment → **Instant Rollback**. CLI equivalent: `vercel rollback <deployment-url>` from `web/` with team scope. |
> **AS-OF WARNING (2026-08-02, deep audit M11).** Every deployment id below is correct **only
> until Deploy A promotes a new one.** At that moment `dpl_DwoW…` (`24677ba`) becomes the
> one-step-back target and `dpl_Ejzk…` (`654f028`) becomes two states back, predating the
> cutover. A responder following this table post-deploy would actively SKIP the right target
> because it is named here as live. Re-read the deployment list, or read the receipt
> `deploy.sh` writes to `docs/evidence/deploys/`, before rolling anything back.

| **Restores** | The **frontend bundle** (Next.js build + static files uploaded with that deploy). **Currently promoted: `dpl_DwoWDhhZiLVLftKN9rcPiRU3v1qt`** (`24677ba`, 2026-07-19 16:57:06Z) - this is what serves `ancientpaths.app` today. **The real rollback target is `dpl_EjzknRQEpaUXBG3YfjLhe8tKtpSr`** (`654f028`, 2026-07-17 01:32:56Z), the newest deployment whose code differs from what is live. Full table in the block below. |
| **Destroys** | Nothing in Neon. Does **not** roll back schema migrations, sessions, or database content. |
| **Host survives?** | **YES** — same `DATABASE_URL`, same Neon endpoint. |
| **Window** | While Vercel retains the deployment (indefinite for recent deploys). |
| **Exercised** | **NO** (deliberate — rollback to pre-025 code against post-031 schema is a known bad pairing; see honest note below). |

> ### ✔ The rollback target ids ARE established (read from the Vercel API, 2026-08-01)
>
> **This supersedes two earlier claims in this file, both of which are false.** A block headed "STILL
> NOT ESTABLISHED (attempted 2026-08-01, BLOCKED)" stood here from `6ab5779`, asserting that
> `dpl_DwoWDhhZiLVLftKN9rcPiRU3v1qt` "appears in **no** Vercel listing" and instructing a reader to
> delete the id from every document that repeats it. The Restores row above, from `b4596aa`, said the
> id "does not appear in this repo". **The id is real. It is the deployment currently serving
> `ancientpaths.app`.** Deleting it would have erased the true answer, and an incident reader was
> being told to distrust the one id that is correct.
>
> **Date convention: every timestamp in this section is UTC**, as the Vercel API returns them. Earlier
> revisions of this file dated `dpl_Ejzk…` "2026-07-16"; that is the same instant read in local
> UTC-7 (2026-07-16 18:32:56). Both were defensible. This file now uses UTC for every row.
>
> **Source**, read-only: Vercel API, team `home-network-hardening` (`team_TQ3BYCSyzQ3m0yatlkKmUzM0`),
> project `web` (`prj_Y9PVuNly5sSsf3NcvayS1vwE6FwR`), `list_deployments` + `get_deployment`,
> 2026-08-01. Read first-hand and independently by three sessions: the PM, the A1 closure audit
> ([verdict](pm/orders/2026-08-01-stop-verdict-a1-closure.md) §B-6), and the corrections tranche that
> wrote this block ([order](pm/orders/2026-08-01-post-a1-corrections.md)).
>
> The four newest production deployments, newest first. `rollback candidate` is `isRollbackCandidate`
> as Vercel reports it.
>
> | deployment | sha | created (UTC) | candidate | what it is |
> |---|---|---|---|---|
> | `dpl_DwoWDhhZiLVLftKN9rcPiRU3v1qt` | `24677ba` | 2026-07-19 16:57:06Z | true | **CURRENT** - holds `ancientpaths.app`, `www.ancientpaths.app` |
> | `dpl_FYQxxZ1rLN1wd4UeMwShhX12G5BM` | `24677ba` | 2026-07-18 22:32:21Z | true | original deploy of the same sha; `dpl_DwoW…` is its redeploy |
> | `dpl_EjzknRQEpaUXBG3YfjLhe8tKtpSr` | `654f028` | 2026-07-17 01:32:56Z | true | first genuinely different code state - **the real rollback target** |
> | `dpl_8V2aiHy8cBz8dKCViBCEtRThzZh7` | `ae2a8f2` | 2026-07-17 00:12:14Z | true | one further back |
>
> **Two things to know before using that table:**
>
> 1. **Rolling back to `dpl_DwoW…` is a no-op.** It is what is live. A rollback whose target is the
>    current deployment reports success and changes nothing - the worst possible outcome during an
>    incident, because it looks like the remedy ran.
> 2. **`dpl_FYQ…` is the same commit as what is live.** Promoting it changes the deployment id and not
>    a byte of the code. If you need the running code to actually change, the target is
>    `dpl_Ejzk…` (`654f028`).
>
> One row from further back, worth knowing because it is the only **non**-candidate in recent history.
> It is not adjacent to the four above; thirteen further READY production deployments sit between it
> and `dpl_8V2a…`:
>
> | deployment | sha | created (UTC) | candidate | what it is |
> |---|---|---|---|---|
> | `dpl_CzHPuyhdvte3N4tGe7HQ1677EQo5` | `0897373` | 2026-07-12 07:39:53Z | **false** | state `ERROR` - Vercel will not accept it as a rollback target |
>
> **Why the superseded block got this wrong. The diagnosis was right; the conclusion was wider than
> the evidence.** The local Vercel CLI is authenticated as `thomas-5672` and reaches exactly two
> scopes, `thomas-s-projects-d9abdfd0` and `composio`, whose projects are all
> `*-x-composio-partners`. **The `web` project that serves `ancientpaths.app` is in neither.**
> `vercel ls web` returns *"The provided argument \"web\" is not a valid project name"*, and `web/`
> carries no `.vercel/project.json` link. All of that is still true, and it is still the reason the
> CLI on this machine cannot settle a deployment question. What it did not license was the step from
> "my account cannot see it" to "it appears in no Vercel listing": **a limit of the instrument written
> down as a property of the world.** The ids above were read through an app-level Vercel connection
> authenticated to the team that actually owns the project. See the failure-mode watchlist in
> [`pm/MASTER.md`](pm/MASTER.md).
>
> **`DEPLOY_PREFLIGHT.md` §7 checklist item 7 ("record the current live deployment id") is answered by
> the table above.** No dashboard visit is required.

### Honest note: why deploy rollback is not a full recovery

Rolling back to **`654f028`** (`dpl_Ejzk…`, the real target above) or any other pre-cutover bundle:

1. **Schema mismatch** — production schema is post-031 (cutover E1–E4). The old bundle's
   `upsertNote` and reader paths expect pre-025 shapes. G4 window is **OPEN** for this reason
   (`STATE_OF_TRUTH.md` §2b). **Note the direction:** `24677ba` is *itself* pre-cutover and is what
   is deployed today, so G4 is open **now**, before any rollback. A rollback does not re-open it; it
   keeps it open one code state further back.
2. **Corpus bypass** — Instant Rollback restores the static corpus that shipped with the deployment
   you promote (2026-07-17 for `dpl_Ejzk…`, 2026-07-18 for `dpl_FYQ…`). It does **not** run
   `predeploy-gate.ts`, so none of the Stage 3.1 corpus identity ratchet, verse-key gate, or
   forbidden-provenance ceiling applies to what comes back.
3. **Identity** — `GET /api/health` did not exist on old bundles; there is no post-rollback way
   to ask the site which corpus it serves except byte comparison.

Treat Vercel rollback as **frontend-only emergency**, not database recovery.

---

## 3. Corpus restore (gitignored static content)

| | |
|---|---|
| **Command** | Download release tarball (see [`DEPLOYMENT.md`](DEPLOYMENT.md) § "Restoring this project onto a new machine"), extract into `web/public/{commentaries,bible,original,concordance,lexicon}`, verify SHA-256 and forbidden-provenance count = 0, then `DEPLOYING=1 npx tsx scripts/predeploy-gate.ts`. |
| **Restores** | ~380 MB static commentary + Bible files on the **operator machine** (and whatever is uploaded on next `./deploy.sh`). |
| **Destroys** | Whatever corpus was on disk before extract (overwrite). Does not touch Neon. |
| **Host survives?** | **YES** (no DB change). |
| **Window** | Any time before `./deploy.sh`. |
| **Exercised** | **PARTIALLY, 2026-07-28** — machine migration per `DEPLOYMENT.md`; commentaries verified at 191,749 entries, 0 forbidden-provenance. **The verification covered `commentaries` only.** |

### 3a. Backup inventory and the partial-restore gap (verified 2026-08-01)

**The corpus IS backed up.** Two GitHub releases on `thomascfoley-stack/ancient-roads` hold it:

| asset (2026-07-28 release, also present at 2026-07-19) | size | asset downloads |
|---|---|---|
| `ancient-roads-corpus-bible-*.tar.gz` | 44 MB | 2 |
| `ancient-roads-corpus-commentaries-*.tar.gz` | 137 MB | 2 |
| `ancient-roads-corpus-concordance-*.tar.gz` | 1 MB | **1** |
| `ancient-roads-corpus-lexicon-*.tar.gz` | <1 MB | **1** |
| `ancient-roads-corpus-original-*.tar.gz` | 7 MB | **1** |

So the risk is **not** "regenerable only at DeepInfra cost" — a full re-ingest is not required, and any
claim that the corpus exists only on the owner's laptop is wrong. Restore is a download.

**But the 2026-07-28 restore was PARTIAL, and the gap is live today.** Measured on the canonical tree
2026-08-01:

| directory | present | files |
|---|---|---|
| `web/public/bible/` | yes | 22,590 |
| `web/public/commentaries/` | yes | 1,213 |
| `web/public/concordance/` | **NO** | — |
| `web/public/lexicon/` | **NO** | — |
| `web/public/original/` | **NO** | — |

The three absent directories are the three with one fewer asset download. They are still served
(`web/src/lib/original.ts`), so a deploy today ships a site whose word-study page and word panel
**throw** — see `DEPLOY_PREFLIGHT.md` §4. `predeploy-gate.ts` does not check them, so nothing refuses.

**RESTORED 2026-08-01.** All three extracted from `corpus-backup-2026-07-28` into `web/public/`: concordance 295 files / 4.1M (SHA-256 `7fb34f30…a47b3`), lexicon 2 files / 3.0M (`68bcabd2…bea85`), original 1,189 files / 45M (`f29d43cf…565e1`). `predeploy-gate.ts` re-run after: **EXIT=0**, forbidden-provenance 0, corpusHash unchanged. Note `deploy.sh`'s comment calls the concordance "13,480 files" — it is **295**; that comment is stale.

**Command used:**

```bash
gh release download corpus-backup-2026-07-28 --repo thomascfoley-stack/ancient-roads \
  --pattern 'ancient-roads-corpus-{concordance,lexicon,original}-*.tar.gz'
# extract into web/public/, then: DEPLOYING=1 npx tsx scripts/predeploy-gate.ts
```

**Still true, and the reason this row is not simply green:** the backups are **point-in-time**
(2026-07-19, 2026-07-28) and nothing creates a new one on a schedule or on corpus change. Any
ingest after 2026-07-28 is unbacked until someone cuts a release by hand. The corpus carries
forbidden-provenance material, so **where a backup may be published is an owner ruling** — the
existing releases are on the private repo, and that is the constraint to preserve.

---

## 4. Deploy a chosen git commit (code + local corpus)

| | |
|---|---|
| **Command** | `git worktree add /tmp/ar-deploy-<sha> <sha>`, `cd /tmp/ar-deploy-<sha>`, restore corpus per §3, `corepack pnpm install`, `./deploy.sh`, record SHA in `WORKLOG.md`, remove worktree. |
| **Restores** | Code at `<sha>` **plus whatever corpus is on that machine** at deploy time (corpus is not in git). |
| **Destroys** | Previous Vercel production bundle (replaced by new upload). Database unchanged unless the deployed code writes. |
| **Host survives?** | **YES.** |
| **Window** | Any time; subject to clean-tree gate and predeploy ratchet. |
| **Exercised** | **2026-07-16** — `654f028` via worktree (`WORKLOG.md`). |

---

## 5. Git revert / branch rollback (code only)

| | |
|---|---|
| **Command** | `git revert <range>` or reset branch to known good SHA and open PR — **no force-push to main without owner go**. |
| **Restores** | Repository history for the next deploy. |
| **Destroys** | Commits reverted (history preserved with revert). Does not change production until someone runs `./deploy.sh`. |
| **Host survives?** | **YES.** |
| **Window** | N/A |
| **Exercised** | Routine PR workflow; not a production incident recovery. |

---

## 6. Publish-flip reverse (production WRITE, reversible)

| | |
|---|---|
| **Command** | `UPDATE sources SET status = 'staged' WHERE status = 'published' AND slug IN (...)` — exact list in [`PUBLISH_FLIP.md`](evidence/work-order-v2-stage2/PUBLISH_FLIP.md). Reverse of flip is same statement with values swapped. |
| **Restores** | Pre-flip visibility (catalog/reader/search stop serving those works). |
| **Destroys** | Nothing — rows remain, only `status` changes. Does **not** undo user activity while works were live. |
| **Host survives?** | **YES.** |
| **Window** | Any time after a flip; requires owner go + snapshot per Rail 2. |
| **Exercised** | **NOT YET** — flip not executed. |

---

## 7. Cutover chunk abort (mid-run)

| | |
|---|---|
| **Command** | Per-step rollback string in `scripts/cutover.mjs` checkpoint — names protected snapshot id and Neon reset/promote steps for that phase. |
| **Restores** | State before the failed chunk (when rollback string is executed fully). |
| **Destroys** | Partial cutover writes from the failed chunk onward. |
| **Host survives?** | **Depends on rollback string** — read it before acting. |
| **Window** | During cutover only. |
| **Exercised** | **2026-07-29** cutover E0–E4 completed; E5 not run; full abort path not exercised in prod. |

---

## Rehearsal status (Work Order v2 Tranche 6)

**NOT EXECUTED.** Creating a child off `br-late-recipe-atxl68sh` is an owner call. When approved,
run the four steps in §1 above on a **throwaway** branch name, verify indexes + migration set +
user-data digest, then delete the throwaway. The protected source branch is never deleted or
repurposed.
