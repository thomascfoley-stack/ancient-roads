# ORDER — post-A1 corrections and the concordance measurement

## TRANCHE 1 — the rollback target is established. Correct the repo.

This reverses a committed finding. Read this section before editing anything.

`6ab5779` recorded the rollback id as BLOCKED, and it was right about its own limit — the local `vercel` CLI cannot reach the `web` project (`docs/RECOVERY.md:46-51`). See §3(a) above before deciding how to cite what follows.

Read from the Vercel API on 2026-08-01, team `home-network-hardening` (`team_TQ3BYCSyzQ3m0yatlkKmUzM0`), project `web` (`prj_Y9PVuNly5sSsf3NcvayS1vwE6FwR`), independently by two sessions:

```
dpl_DwoWDhhZiLVLftKN9rcPiRU3v1qt   READY  target=production
  gitCommitSha  24677ba2f706c44d6c9065974f7e2c1b883931fd
  alias         ancientpaths.app, www.ancientpaths.app, web-psi-eight-83.vercel.app,
                web-home-network-hardening.vercel.app,
                web-thomascfoley-7284-home-network-hardening.vercel.app
  created       2026-07-19 16:57:06Z    ready 2026-07-19 16:59:37Z
  source        cli    action=redeploy
  originalDeploymentId  dpl_FYQxxZ1rLN1wd4UeMwShhX12G5BM
  inspector     https://vercel.com/home-network-hardening/web/DwoWDhhZiLVLftKN9rcPiRU3v1qt
```

The four newest production deployments, newest first, all timestamps UTC (`isRollbackCandidate` as Vercel reports it):

| deployment | sha | created | candidate | what it is |
|---|---|---|---|---|
| `dpl_DwoWDhhZiLVLftKN9rcPiRU3v1qt` | `24677ba` | 2026-07-19 16:57:06Z | true | **CURRENT** — holds `ancientpaths.app` |
| `dpl_FYQxxZ1rLN1wd4UeMwShhX12G5BM` | `24677ba` | 2026-07-18 22:32:21Z | true | original deploy of the same sha |
| `dpl_EjzknRQEpaUXBG3YfjLhe8tKtpSr` | `654f028` | 2026-07-17 01:32:56Z | true | first genuinely different code state — **the real rollback target** |
| `dpl_8V2aiHy8cBz8dKCViBCEtRThzZh7` | `ae2a8f2` | 2026-07-17 00:12:14Z | true | one further back |

Separately, and **not adjacent to those four** — thirteen further READY production deployments sit between `dpl_8V2a…` and it — one row worth knowing because it is the only non-candidate in recent history:

| `dpl_CzHPuyhdvte3N4tGe7HQ1677EQo5` | `0897373` | 2026-07-12 07:39:53Z | **false** | state `ERROR` — Vercel will not accept it as a rollback target |

Two consequences the repo currently gets wrong:

1. **Rolling back to `dpl_Dwo…` is a no-op.** It is what is live. A rollback whose target is the current deployment will read as success and change nothing.
2. **The 18th-vs-19th ambiguity is resolved.** `docs/STATE_OF_TRUTH.md:278` ("last deploy `24677ba`, 2026-07-18") describes `dpl_FYQ…`; the redeploy of the same sha on the 19th is what holds the alias. Both dates were right about different objects.

**Note on date convention before you edit:** `docs/RECOVERY.md:34` dates `dpl_Ejzk…` as 2026-07-16; Vercel returns 2026-07-17 01:32:56Z. Both are defensible (local UTC-7 vs UTC). Pick one, state it in the document, apply it to every row.

**Property:** every place a reader meets the claim that this id is unverified, they instead meet what it actually is — and the named rollback target is one that would actually change the running code.

Correct all of the following, and put each correction **where the reader meets the wrong version** (`docs/pm/MASTER.md:128-133`, the third shape), not only where it is convenient:

- `docs/RECOVERY.md:34` — the Restores row: "The work order cited `dpl_DwoWDhhZiLVLftKN9rcPiRU3v1qt` — that id does not appear in this repo; use dashboard truth." Now false.
- `docs/RECOVERY.md:40` — the boxed heading "⚑ The rollback target id is STILL NOT ESTABLISHED (attempted 2026-08-01, BLOCKED)", and `:43` "It appears in no Vercel listing and in no repo artifact other than documents repeating it." Now false.
- `docs/RECOVERY.md:61-62` — step 5: "Delete `dpl_DwoWDhhZiLVLftKN9rcPiRU3v1qt` from every document that repeats it once the real ids exist." That instruction is backwards and must go. The id is real; deleting it would erase the true answer.
- `docs/DEPLOY_PREFLIGHT.md:164` (§5) — "The rollback target id is not established."
- `docs/evidence/work-order-v2-stage2/RECOVERY_VERIFICATION.md:22-26` — the "CORRECTION (2026-08-01)" block, which says the id "appears in no Vercel listing". Mark **superseded** with date and source; do not delete the history.
- `docs/STATE_OF_TRUTH.md:278` — add the redeploy so the ambiguity cannot recur.

**Cost of not fixing:** `docs/RECOVERY.md` is what someone opens during an incident. It currently tells them to distrust the only id that is true, and names a rollback target that would do nothing.

No red-proof applies — documentation tranche, bylaw 6. The check is docs-vs-reality: every claim you write carries its source.

## TRANCHE 2 — the tenth instance, in the file that names the class

`test/ask-max-duration-literal.test.ts` (repo root, **not** `web/test/`) is the anti-drift guard added by `c1e359d`. Its header at `:9-10` names the defect class explicitly: "the exact shape this repo has paid for nine times ('a hand-maintained expected set that nothing enforces')". Its `ROUTES` constant at `:26-29` types out two paths:

```
'web/src/app/api/ask/route.ts',
'web/src/app/api/ask/stream/route.ts',
```

`git grep -n "export const maxDuration" -- web/src/app` returns **three**: those two at `:15` each, and `web/src/app/api/eval/bait/route.ts:12`. That third route imports `teach` at `:3` (`import { teach } from '@/lib/teacher/teach';`) and calls `await teach(question)` at `:31`. It is on the real compose→verify path, not a stub.

So the guard covers two of the three routes that have the export it exists to police — and `b9ad463`, the immediate parent of `6ab5779`, closed the ninth instance **by derivation** rather than by adding a second list.

**Property:** a route segment config export that no hand-maintained list mentions is still checked. Adding a new `export const maxDuration` anywhere under `web/src/app`, touching no list, must not be able to make the guard pass vacuously.

**Red-proof, four states, seeds in real product code:**

1. baseline → green
2. make `web/src/app/api/eval/bait/route.ts:12` non-literal (import `ASK_MAX_DURATION_SEC` and export it) → the guard must go **RED**, and `next build` must also go red
3. add a new route under `web/src/app` with a literal `export const maxDuration`, touch no list → the derived set must include it and the guard must account for it
4. revert both → green

Follow `b9ad463`'s discipline: **derive, and refuse to run rather than under-read.** A discovery that can silently find nothing is worse than no check.

**Cost of not fixing:** the exact regression that broke the production build ships again on a route the guard does not watch, and CI stays green because `next build` is the only thing that would catch it — which is the single point of failure `19798ec` was written to remove.

## TRANCHE 3 — MEASURE the concordance. Do not fix it.

Two numbers in this repo disagree and nobody has reconciled them.

- `deploy.sh:81` — `# --archive=tgz: the static data dirs (concordance = 13,480 files, original,` / `:82 # commentaries, lexicon) exceed Vercel's 15,000-file upload limit; archiving` / `:83 # bundles them into one tarball.` Added 2026-07-12 when the concordance shipped.
- Vercel deployment `dpl_FnSG8jUh2vFNmePDkAEF4LAdv5Rq` (sha `39ba485`, 2026-07-12 14:58:18Z) carries the commit message "fix(deploy): --archive=tgz — concordance (13,480 files) exceeded Vercel's 15k upload limit".
- `b9ad463` §2.1 reports restoring concordance from `corpus-backup-2026-07-28` as **295 files, 4.1M**, and concludes `deploy.sh`'s comment is stale.

They cannot both describe the same directory. **Do not assume which is wrong.**

**Why this is not cosmetic.** `scripts/lib/served-assets.mjs:79-89` exposes `missingServedAssetDirs()`, returning `{ok, served, missing}` — a **presence** check via `statSync(...).isDirectory()` at `:81-87`. There is no file-count check anywhere in that 89-line module. `scripts/predeploy-gate.ts` calls it at `:75` and only fails on absent directories; its one counting block, "corpus identity (file count + per-work presence)" at `:164-186`, runs `buildCorpusInventory(COMMENTARIES_DIR)` — **commentaries only**. And `web/src/lib/original.ts` fetches concordance through `fetchJson` at `:87-94`, which returns `null` on a non-ok response, called at `:100` and `:107`. So a concordance with 295 of 13,480 files present passes the gate, exits 0, and fails silently in the UI: no error, no gate, an empty panel.

**Measure, read-only, report actual output:**

1. File count, byte size and roll-up hash of `web/public/concordance/` as it exists on the deploying machine now.
2. The same for the concordance asset inside releases `corpus-backup-2026-07-28` and `corpus-backup-2026-07-19`. Download to a scratch directory **outside the repo**; count; do not commit the payload.
3. Whether the **structure** changed between them. 295 large files versus 13,480 small ones is a plausible re-shard and would reconcile both numbers honestly. Say which it is, with evidence.
4. What the currently-live deployment actually serves. If you cannot reach it, say **NOT RUN** and name what would settle it.
5. Whether any served directory other than `concordance` has the same gap — the six are `bible`, `commentaries`, `concordance`, `devotional`, `lexicon`, `original`.

Then **STOP.** Report the numbers, state whether the restore is complete or partial, and say what it would cost to be wrong. If it is partial, that is a Deploy A blocker and the single most important finding of this run — **do not attempt to fix it.** Where the corpus goes is an owner ruling and it carries forbidden-provenance material.

Commit the measurement to `docs/evidence/post-a1-2026-08-01/concordance-census.md` (that directory does not yet exist; nothing collides).

## TRANCHE 4 — the board says things its own commits falsified

`docs/pm/MASTER.md` is the document every session is told to read first, and it is the stalest file in the repo. Each of these was falsified by a commit in `ac19935..6ab5779`:

- `:6` — pins working branch @ `ac19935`. Re-pin to the merge commit of PR #48.
- `:61-62` — "`DEPLOY_PREFLIGHT.md` is still 25 lines (NOT DONE, carried)." It is **241 lines** as of `bf34b21`.
- `:97` — "Eight instances so far." `b9ad463` §2.2 calls itself the ninth; Tranche 2 above is the tenth.
- `:115-119` — "`next build` is not in CI — neither `audit` nor `db-invariants` compiles the app… Adding `next build` to CI is the highest-value open follow-up in this repo." `19798ec` added it at `.github/workflows/audit.yml:55-65`.
- Gate board: the A1 outcome, per the verdict you read in §1.

Also `docs/STATE_OF_TRUTH.md:284` — "`docs/SERMON_SEARCH_DESIGN.md` is the approved design" — against that file's own `:3`, "Status: DESIGN — for the owner to react to, NOT approval to build." `AGENTS.md:24` tells agents to trust `STATE_OF_TRUTH` over any doc's narrative, so an agent following the repo's own routing reaches the wrong claim. One line.

Add **one** entry to the watchlist, because it is a shape the list does not name and it produced two of this week's errors:

> **An instrument's blind spot recorded as a property of the thing it could not see.** `6ab5779` established, correctly, that the Vercel CLI on this machine cannot reach the `web` project — and wrote down that the deployment "appears in no Vercel listing." A scope limit became a claim about the world. Same family as reporting a provider outage as a failure: a negative result that is really a NOT RUN.

Keep `MASTER.md` a **board** — pointers, not a second copy of the state.

## REPORT

Per tranche: DONE / PARTIAL / NOT DONE / BLOCKED, four red-proof states for every code fix, actual output for every measurement.

Then the receipt:

```
HEAD:        <sha>
CI:          audit=<conclusion>  db-invariants=<conclusion>   (from `gh run view`, not memory)
RED-PROOFS:  <file> → seeded <what> → <exit> → reverted → <exit>
EVIDENCE:    <paths committed this run>
MODEL:       <model that produced this>
DIRTY:       <git status --porcelain, verbatim>
```

Then three questions, in your own words:

1. What did you change that I did not ask for?
2. What did you find that is not in this order and that the owner would want to know?
3. Where were you tempted to assert a property rather than prove it?

Then **STOP.** Do not merge, do not deploy, do not start the next thing.
