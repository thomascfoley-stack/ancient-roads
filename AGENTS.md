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
- **Only one agent session per working tree at a time. A second session must be read-only AND
  write-free, or work in a separate clone** — any write blocks the first session's deploy, because
  `deploy.sh` gates on a clean tree and cannot tell whose file it is (2026-08-08: an untracked
  `docs/` file from a second session blocked a ready deploy; the rule below was scoped to deploys
  and DB writes, so it did not cover the session that caused it).
- One agent per working tree for anything that deploys or writes a database. Concurrent
  sessions have shipped each other's half-finished work here before (2026-07-12) and clobbered
  cutover checkpoints (2026-07-27). The guards exist, but do not lean on them.
- Prefer the repo's proven runner scripts over ad-hoc SQL or shell against any database.
- Anything touching `ep-odd-fog` (production) requires the owner's explicit go, every time.
