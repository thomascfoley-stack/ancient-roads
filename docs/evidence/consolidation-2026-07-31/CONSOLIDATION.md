# Workspace consolidation — 2026-07-31

Five working copies of this project existed on the owner's machine. The canonical-looking one
(`~/Projects/ancient-roads`) was 12 commits behind `origin/main` and two days off the frontier, while
live work was happening in `~/Projects/ancient-roads-git`. No agent or human could determine project
state from any single entry point. This log records the consolidation to one working copy.

Performed over the Cowork device bridge, which **cannot delete files** — every retirement is a `mv`
into `~/Projects/_to_delete/`, and is therefore reversible until the owner removes that directory.

## Before

| Path | Branch | HEAD | State |
|---|---|---|---|
| `~/Projects/ancient-roads` | `main` | ea8eadb (Jul 29 08:55) | 12 behind `origin/main`; held one local-only branch + stash |
| `~/Projects/ancient-roads-git` | `chore/work-order-v2-stage2` | d946c14 (Jul 31 13:43) | the live frontier |
| `~/Projects/ancient-roads-runbook` | — | — | **not a git repo**; 81 docs vs 86, WORKLOG 351KB vs 379KB |
| `~/Projects/ancient-roads-fix-main` | `test/ingest-prove-rebased` | 55f553d | worktree with unresolvable gitdir — already dead |
| `~/Projects/ap-sec1` | `fix/sec1-better-auth-1-6-25` | f52a159 | worktree with unresolvable gitdir — already dead |
| `~/theology-study-app` | — | — | loose folder, 4 stale docs, no git. **Left in place** (separate mount root) |

## Verification before any move (verify-don't-assume, THE_LOOP rule)

Every retirement was gated on proving the surviving copy is a superset.

1. **`ancient-roads` held work that existed nowhere else.**
   `git log --all --not --remotes` returned 4 commits: branch `fix/web-lint-next16` @ `62a3c4b`
   ("audit: migrate web lint gate off the removed 'next lint' (Next 16)") plus its three stash
   commits (`930fd05`, `6c78833`, `21fc50e`). **This would have been destroyed by a delete.**
   → Captured to `ancient-roads-git/.rescue/ancient-roads-local-only.bundle` (14.3 MB).
   → `git bundle verify` from the surviving repo: *"is okay … The bundle records a complete history."*
   → Re-verified a second time immediately before the folder was moved.

2. **`ancient-roads-runbook` had zero unique content.**
   Line-level set difference against the surviving copy for both `ROADMAP.md` and `WORKLOG.md`:
   **0 lines** present in runbook and absent from `ancient-roads-git`. Directory comparison found
   no docs present in runbook and missing from the survivor. It is a stale strict subset.

3. **`ancient-roads-fix-main` — one unique file, `.b0seed.mjs`.**
   Not lost: commit `e556d89` renames it `.b0seed.mjs => scripts/b0-seed.mjs`. In history.

4. **`ap-sec1` — one unique file, `scripts/b0-seed.mjs`.**
   Confirmed absent from `HEAD` *and* `origin/main`, so checked its history:
   `git log --all -- scripts/b0-seed.mjs` returns `825d960` ("Stage 1.8-1.10: PR #43 corrections,
   CI concurrency, **retire ADR-039**"). It was **deliberately retired**, and remains in history.
   Its branch `fix/sec1-better-auth-1-6-25` is pushed to origin.

## Changes made to the repo (2 files, 15 lines)

**`CLAUDE.md`** — added a `Session start` block with two imports:

```
@AGENTS.md
@docs/pm/MASTER.md
```

Rationale, recorded here because it is not obvious and a future agent may try to "clean it up":
**Claude Code reads `CLAUDE.md` and does not read `AGENTS.md`** — Anthropic's memory documentation
states this verbatim. `AGENTS.md` (added Jul 29, commit `5ce93ba`, *"route every coding agent to the
rules that already exist"*) was therefore never loaded by the primary agent operating this repo.
Cursor and Codex read it; Claude Code did not. Same for `docs/pm/MASTER.md`, which opens with
*"Read this first, every session"* and was referenced by nothing.

Two orphaned entry points, both authored to solve the "agent doesn't know where it is" problem,
neither reachable. The import is the fix.

The block also requires the agent to **state the lane, the gate, and the one next action** before
changing anything, and restates that numbers come from `docs/STATE_OF_TRUTH.md`, re-measured.

**`AGENTS.md`** — added `docs/pm/MASTER.md` to *Facts and records*, so agents that read `AGENTS.md`
natively (Cursor, Codex) also reach the programme sheet.

No other repo content was modified. No scripts were written.

## After

```
~/Projects/
├── ancient-roads-git/          ← the only working copy
│   └── .rescue/                ← rescued refs, pending fetch
└── _to_delete/                 ← reversible; remove when satisfied
    ├── ancient-roads/
    ├── ancient-roads-fix-main/
    ├── ancient-roads-runbook/
    ├── ap-sec1/
    └── stale-git-locks/
```

## Open items for the owner

1. **`docs/pm/MASTER.md` Index points at `AP_WORKORDER_V2.md`, which does not exist** anywhere on
   the machine. The programme sheet's own "Plan" pointer is broken. Files that do exist:
   `KIMI_WORKORDER.md`, `docs/WORKORDER_PHASE_A.md`, `docs/WORKORDER_PHASE_B.md`,
   `docs/WORKORDER_OVERNIGHT.md`. Not guessed at — this needs the owner's answer.
   *This is exactly the failure class MASTER.md's own watchlist names: a hand-maintained pointer
   that nothing enforces.* A link-check over `docs/pm/` would close the class, not just the instance.

2. **`MASTER.md` header is one commit stale** — it records working branch @ `ac19935`; HEAD is
   `d946c14` (the commit that added MASTER itself).

3. **`chore/work-order-v2-stage2` is 1 behind its upstream** — origin has a commit this copy lacks.

4. **Two prunable worktree registrations remain** (`/private/tmp/ancient-roads-gate-redproof`,
   `~/Projects/ap-sec1`). Pruning requires deleting metadata, which the bridge cannot do.

5. **`~/theology-study-app`** — 4 orphan docs (ACCOUNTS, CORPUS, OUTPUT_CONTRACT, SCHEMA),
   untouched since Jul 6, no git. Left in place; safe to remove by hand.

6. The bridge left `.git/index.lock` files behind twice during this session (it cannot unlink).
   Both were evicted to `_to_delete/stale-git-locks/` and the repo verified clean. **If a future
   bridge session runs git here, check for a stale `index.lock` before committing.**

## Commands the owner must run (the bridge cannot delete)

```bash
cd ~/Projects/ancient-roads-git

# 1. clear the dead worktree registrations
git worktree prune -v

# 2. recover the rescued branch + stash, then drop the bundle
git fetch .rescue/ancient-roads-local-only.bundle \
  'refs/heads/fix/web-lint-next16:refs/heads/fix/web-lint-next16' \
  'refs/stash:refs/rescued-stash'
git branch -a --list 'fix/web-lint-next16'      # confirm it landed
rm -rf .rescue

# 3. get current, then commit the entry-point fix
git pull --ff-only
git add CLAUDE.md AGENTS.md
git commit -m "CLAUDE.md: import AGENTS.md and the programme sheet

Claude Code reads CLAUDE.md, not AGENTS.md, so the routing file added in
5ce93ba never loaded for the agent that operates this repo. Same for
docs/pm/MASTER.md. Both are now imported at session start.

Model: <model>"
git push

# 4. prove the imports load, then clear the retired copies
claude          # run /context — CLAUDE.md, AGENTS.md and MASTER.md must all appear
rm -rf ~/Projects/_to_delete
```

Step 4's `/context` check is the red-proof: if the three files do not appear under **Memory files**,
the import did not take and the fix is unearned green.
