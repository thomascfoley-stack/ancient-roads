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
| **Restores** | Database schema + row contents as of snapshot **2026-07-29** pre-cutover prod (`pre-cutover-ep-odd-fog-atnykudm-20260729164220`). User annotations were empty at cutover; waitlist/channels preserved per G1. |
| **Destroys** | Every prod write after the snapshot: E4 slice, staged sources, migration 024–031 state, any publish flip, user data written post-cutover. |
| **Host survives?** | **NO.** Promoting a child branch changes the connection host. Update Vercel `DATABASE_URL`, every cutover/instrument `CUTOVER_EXPECT_HOST`, and re-run host assertions before calling recovery done. |
| **Window** | Indefinite while `br-late-recipe-atxl68sh` exists (registered, deletion refused). |
| **Exercised** | **NOT YET.** Rehearsal requires owner approval to create a throwaway child off the protected branch. Exact ops to run on approval: (1) `neonctl branches create --parent br-late-recipe-atxl68sh --name throwaway-restore-rehearsal-<ts>`, (2) connect read-only to child, assert indexes `indisvalid=t` and migration set, (3) compare user-data digest to cutover E0 log, (4) **delete throwaway** — never touch `br-late-recipe-atxl68sh`. |

---

## 2. Vercel Instant Rollback (frontend bundle)

| | |
|---|---|
| **Command** | Vercel dashboard → project **`web`** → Deployments → select deployment → **Instant Rollback**. CLI equivalent: `vercel rollback <deployment-url>` from `web/` with team scope. |
| **Restores** | The **frontend bundle** (Next.js build + static files uploaded with that deploy). Example deployments of record: `dpl_EjzknRQEpaUXBG3YfjLhe8tKtpSr` (`654f028`, 2026-07-16); live site of record **`24677ba`** (2026-07-18, hero + nav). The work order cited `dpl_DwoWDhhZiLVLftKN9rcPiRU3v1qt` — that id does **not** appear in this repo; use dashboard truth. |
| **Destroys** | Nothing in Neon. Does **not** roll back schema migrations, sessions, or database content. |
| **Host survives?** | **YES** — same `DATABASE_URL`, same Neon endpoint. |
| **Window** | While Vercel retains the deployment (indefinite for recent deploys). |
| **Exercised** | **NO** (deliberate — rollback to pre-025 code against post-031 schema is a known bad pairing; see honest note below). |

### Honest note: why deploy rollback is not a full recovery

Rolling back to **`24677ba`** (or any pre-cutover bundle):

1. **Schema mismatch** — production schema is post-031 (cutover E1–E4). The old bundle's
   `upsertNote` and reader paths expect pre-025 shapes. G4 window is **OPEN** for this reason
   (`STATE_OF_TRUTH.md` §2b).
2. **Corpus bypass** — Instant Rollback restores the **2026-07-18 static corpus** that shipped
   with that deploy. It does **not** run `predeploy-gate.ts`, so none of the Stage 3.1 corpus
   identity ratchet, verse-key gate, or forbidden-provenance ceiling applies to what comes back.
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
| **Exercised** | **2026-07-28** — machine migration procedure in `DEPLOYMENT.md`; clean corpus verified 191,749 entries, 0 forbidden-provenance. |

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
