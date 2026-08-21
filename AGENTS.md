# AGENTS.md - read this first, then follow the pointers

This repo is operated largely by coding agents (Claude Code, Cursor, others). The rules that
make that safe are already written down; this file exists so every agent LOADS them instead of
rediscovering them. Do not duplicate their content here - go read them.

## Binding, in order

1. **CLAUDE.md** (root) - the standing rules. Highlights that are absolute: licensing fails
   closed (a violation is legally irreversible); never print or write a secret value; never
   write a production connection string to disk.
2. **docs/THE_LOOP.md** - the verification discipline. A check that has not been watched go RED
   proves nothing (rule 4); an unmet precondition reported as green is "unearned green" (section 6).
   Every new check ships with its red-proof.
3. **docs/BUILD_MODEL.md** - fixer is not verifier (section 1.4). Agent-written work is never
   self-certifying; independent eyes or independent execution before trust.
4. **docs/PRINCIPLES.md**, **docs/ENGINEERING.md**, **docs/TESTING.md** - how code, tests, and
   changes are expected to look here.

## Facts and records

- **docs/pm/MASTER.md** - the programme sheet: bylaws, lanes, gate board, outstanding owner
  decisions. Read it first, every session. It points at state rather than copying it.
- **docs/STATE_OF_TRUTH.md** - current verified system state. Trust it over any doc's narrative.
- **WORKLOG.md** (root) - every working session appends an entry, newest on top, including a
  NOT DONE / UNVERIFIED section. Follow the existing entries' format.
- **docs/DECISIONS.md** - ADRs. Owner rulings are recorded here; do not relitigate them, and do
  not make owner-level calls (content quarantine, prod deletion, deploy timing) yourself.
- **docs/evidence/** - logs proving what ran. Evidence or it did not happen.

## Task-specific entry points

- Cutover / prod DB work: **docs/CUTOVER_DESIGN.md**, then the current WORKLOG entries, then
  `node scripts/cutover.mjs --dry-run`. The regression gate is `scripts/cutover-regression-gate.mts`.
- Ingest / corpus work: **docs/INGESTION_RUNBOOK.md**, **docs/INGESTION_HARNESS_DESIGN.md**,
  **docs/INGESTION_LOOP.md**, **docs/INGESTION_ADAPTERS.md**. The manifest
  `ingest/sources.config.json` is the source of truth; quarantined entries and declared
  forbidden-provenance policies stay as declared (see **docs/SECTION_PROVENANCE_DESIGN.md**).
- Reader / web UI: **docs/LIBRARY_READER_DESIGN.md**, **docs/NAVIGATION_AND_SEARCH.md**.
- Security / licensing: **docs/SECURITY.md** (the GHSA ignore list lives in package.json and is
  documented there), `scripts/deps-audit.mjs`.
- Deploy: **deploy.sh** only (it gates on a clean tree and the licensing ratchet). Vercel does
  not deploy on git push.

## Ground rules for any agent session

- `npm run audit` is the definition of green. Run it before claiming done.
- **THE MAIN TREE BELONGS TO WHOEVER HOLDS THE DEPLOY. Every other session works in a worktree**
  (owner ruling, 2026-08-21). The older rule below said "read-only, or work in a separate clone",
  which was right and was ignored because a clone sounds expensive. **A worktree is the cheap clone,
  and this repo already has fourteen of them** — `git worktree list` — so this is not a new practice,
  it is the practice this repo already follows on the days when it is not four sessions deep in one
  checkout.

  Two shared mutable resources make this non-negotiable, and they are the same root cause seen from
  two ends. **The working tree**: `deploy.sh` gates on a clean tree and cannot tell whose file it is.
  **The index**: a bare `git commit` after `git add` takes the WHOLE `.git/index`, so it sweeps up
  whatever another session staged in the meantime, under your message. A linked worktree gets its own
  index at `.git/worktrees/<name>/index` and its own clean-tree state — verified, not assumed.

  **Evidence, all from 2026-08-21, one day, four sessions:** three aborted deploys (one after a full
  build had already run); `deploy.sh` itself edited mid-deploy-window; two commits that swept another
  session's staged files, one carrying **546 insertions across 8 files** under a 2-line docs message;
  and **nine cancelled CI runs of twenty**, with zero ever green. Every gate held — nothing bad
  reached production — and the entire cost was paid in aborted work and relay messages about who owns
  which dirty file.

  ```sh
  git worktree add --detach /tmp/ap-work <sha-or-branch>
  ```

  **A fresh worktree does NOT have the gitignored `web/public` corpus assets, and `deploy.sh`'s
  served-asset gate fails without them.** Clone them in — `cp -c` is an APFS copy-on-write clone, so
  ~1.1 GB costs near-zero time and disk:

  ```sh
  cp -c -R web/public/{bible,commentaries,original,concordance,lexicon} /tmp/ap-work/web/public/
  cp -c -R node_modules /tmp/ap-work/
  ```

  **`concordance` and `lexicon` are the small ones people forget** (4.1 MB and 3.0 MB against
  `commentaries` at 850 MB) — and they are exactly what the served-asset gate fails on. Copy all five.

- **Committing to the main tree while another session is live: use explicit pathspecs.**
  `git commit -- <your files>`, never a bare `git commit` after `git add`. See the index note above.
- One agent per working tree for anything that deploys or writes a database. Concurrent
  sessions have shipped each other's half-finished work here before (2026-07-12) and clobbered
  cutover checkpoints (2026-07-27). The guards exist, but do not lean on them.
- Prefer the repo's proven runner scripts over ad-hoc SQL or shell against any database.
- Anything touching `ep-odd-fog` (production) requires the owner's explicit go, every time.
