# RELEASE — deploy + rollback runbook

The one rule: **production is deployed only by `./deploy.sh`, from a clean tree,
by a human.** Never a git push, never a Vercel git-integration build, never an
agent. `docs/DEPLOYMENT.md` is the source of truth for what production *is*;
this doc is the runbook for changing it (and un-changing it).

## What production is (verified against `docs/DEPLOYMENT.md`, 2026-07-18)

- Real production = the Vercel project **`web`** (git connection **OFF**, and it
  must stay off) serving **ancientpaths.app** (+ `www.ancientpaths.app`).
- The `theology-study-app` Vercel project is **not** production (its only domain
  is the misspelled `acientpaths.app`, which has no DNS; its git auto-deploy was
  disconnected 2026-07-18). Do not deploy to it, do not "fix" it as part of a
  release.
- **Committed ≠ live.** `main` records intent; production is whatever working
  tree was last uploaded by `deploy.sh`. Check `WORKLOG.md` for the recorded
  shipped SHA before assuming anything about what is live.

### Why `web` must never be git-connected

The served corpus (`web/public/bible/`, `web/public/commentaries/`) is
**gitignored** and has no build step. It reaches production only because
`vercel --prod` uploads the local working tree. A git-push deploy builds from a
commit — which does not contain the corpus — and ships the code **without the
content**, silently breaking the reader and retrieval. Deploy-by-CLI is not a
preference; it is the only mechanism that ships the actual product.

## Deploy procedure

1. Commit (or stash) everything you intend to ship. What's in prod must be
   reproducible from git.
2. Run **`./deploy.sh`** from the repo root. It executes, in order:
   - **Clean-tree gate** — refuses to deploy if `git status --porcelain` is
     non-empty. `vercel --prod` uploads the *working tree*, so uncommitted
     files (possibly another session's in-flight work — this happened on
     2026-07-12) would ship un-reviewed.
   - **Corpus presence check** — counts JSON under `web/public/bible/` and
     `web/public/commentaries/`; warns (does not block) below 1,000 files each.
   - **Pre-deploy licensing ratchet** — `DEPLOYING=1 npx tsx
     scripts/predeploy-gate.ts`. Hard-fails if the corpus is missing, if
     forbidden-provenance content has **increased** vs the committed baseline
     (`web/test/baselines/static-forbidden-provenance.json`), or if any Bible
     translation dir under `web/public/bible/` lacks a shipping license record
     (`DEPLOYING=1` is what turns the translation check from the pre-commit
     warning into a hard fail). This gate lives here because the gitignored
     corpus never passes through git or CI — this is the only point where the
     artifact being shipped is visible.
   - **Build** — `cd web && npx next build`.
   - **Upload** — `npx vercel --prod --archive=tgz`.
3. Record the shipped commit SHA in `WORKLOG.md`.

To ship a chosen commit without shipping in-flight `main` work: deploy from an
isolated `git worktree` checked out at that commit (clean tree), then remove
the worktree (established pattern — see the 2026-07-16 WORKLOG deploy).

### Why `--archive=tgz`, and why `web/.vercelignore` matters

- The static data dirs (concordance ≈ 13,480 files, original-language,
  commentaries, lexicon) exceed Vercel's **15,000-file** CLI upload limit;
  `--archive=tgz` bundles the upload into one tarball (added 2026-07-12 when
  the concordance shipped).
- Vercel uses **`.vercelignore`, not `.gitignore`**, to decide what to upload.
  Because the corpus is gitignored, a fallback to `.gitignore` would drop the
  entire corpus and ship a data-less site — so `web/.vercelignore` lists
  excludes explicitly: build/dev artifacts (`node_modules`, `.next`, `.vercel`),
  env files (`.env`, `.env.local`, `.env*.local` — secrets come from Vercel
  project env, never from upload), and the superseded per-chapter Bible dirs
  (`public/bible/*/*/`, replaced by per-book files) to stay under the file
  limit.

## Database migrations (owner-run)

- Agents *write* migrations; the **owner applies** them. No agent runs a
  migration against a shared/prod DB.
- Both runners — `db/apply-migration.mjs` (single-transaction files) and
  `db/apply-migration-concurrent.mjs` (files containing `CREATE/DROP INDEX
  CONCURRENTLY`) — **refuse non-dev endpoints** unless `MIGRATE_ALLOW_PROD=1`
  is set. The prod run is a deliberate, eyes-open act:
  `MIGRATE_ALLOW_PROD=1 DATABASE_URL=<owner-url> node db/apply-migration-concurrent.mjs db/migrations/<file>.sql`
- **Zero-window index policy — ADR-025 (Zero-window index migration policy).**
  Any migration touching a **serving** index is zero-window by construction:
  `CREATE INDEX CONCURRENTLY <name>_vN` (new name, new predicate) → `DROP INDEX
  CONCURRENTLY` old → `ALTER INDEX … RENAME`. The old index serves throughout.
  Such files carry `--SPLIT--` markers and are applied **only** via
  `db/apply-migration-concurrent.mjs` (CONCURRENTLY cannot run inside a
  transaction), which additionally pre-cleans INVALID leftover indexes from
  failed runs and post-asserts every touched index VALID+READY. **Never
  drop-first on a serving index — dev included** (that is the migration-009
  failure mode ADR-025 exists to kill).

## Rollback

- **The app:** Vercel dashboard → `web` → Deployments → **Instant Rollback** to
  the previous deployment. This is fast and is the first move for a bad
  frontend deploy.
- **The database: there is no automatic rollback.** Migrations are
  forward-fix only — every migration must be additive and zero-window so that
  rolling back the *app* never strands the *schema*. If a migration misbehaves,
  the fix is a new forward migration, not a revert.
- **The corpus: a `git revert` ships nothing.** The corpus is gitignored and
  reaches prod only via a `deploy.sh` upload from a tree that has it. Reverting
  code in git does not change what is served until someone re-runs
  `./deploy.sh` — and conversely, rolling back to a deployment is the only way
  to roll back content.
- **Never Neon branch-promote dev → prod.** A branch promote replaces the prod
  database wholesale and wipes live user data (highlights, notes, waitlist),
  which exists only on prod. A fresh re-ingest against prod is the only safe
  path for content changes.
