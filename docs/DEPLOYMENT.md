# DEPLOYMENT — the one source of truth

Verified against the live Vercel dashboard on 2026-07-18. If anything here disagrees
with the dashboard, the dashboard wins and this file is stale, fix it.

There are **two Vercel projects** on the same GitHub repo (`thomascfoley-stack/ancient-roads`)
under the same team (`home-network-hardening`, `team_TQ3BYCSyzQ3m0yatlkKmUzM0`). Only one is
real production. Confusing them has bitten this project before, so the rule is blunt:

> **Real production is the `web` project, deployed by hand with `./deploy.sh`. Never git-connect it.**
> **The `theology-study-app` project is not production. Its only correctly-spelled twin is a typo.**

---

## Real production: the `web` project

| Field | Value |
|---|---|
| Project | `web` |
| Project ID | `prj_Y9PVuNly5sSsf3NcvayS1vwE6FwR` (asserted by `deploy.sh`; there is NO `web/.vercel/project.json` — it is gitignored three times over and cannot be committed, so the id is pinned in the script instead) |
| Team / org | `team_TQ3BYCSyzQ3m0yatlkKmUzM0` (`home-network-hardening`) |
| Production domains | **ancientpaths.app** (canonical) + **www.ancientpaths.app** + `web-psi-eight-83.vercel.app` |
| Git connection | **OFF, and it must stay off** (see below) |
| Deploy method | manual CLI: `./deploy.sh` (runs `vercel --prod --archive=tgz` from `web/`) |

`ancientpaths.app` resolves to Vercel (A records `216.150.1.129` / `216.150.16.193`).

### Why `web` must never be git-connected

`web/public/commentaries/` and `web/public/bible/` (the served corpus, ~22,590 Bible
chapter files + ~1,213 commentary files) are **gitignored**. They have no build step. They
reach production **only** because `vercel --prod` uploads the local working tree.

A git-push deploy (i.e. connecting the repo and letting Vercel build from a commit) would
ship the code **without the corpus**, because the corpus is not in git and CI cannot see it.
That silently breaks the reader and retrieval in production. So `web` is deploy-by-CLI only,
and the corpus lives on disk, not in git.

Corollary: **what is on `main` is not what is in production.** Production is whatever working
tree was last uploaded by `deploy.sh`, recorded as a commit SHA in `WORKLOG.md`.

### The deploy pipeline (`./deploy.sh`, run from repo root)

1. **Clean-tree gate** — refuses to deploy if `git status` is dirty. `vercel --prod` uploads
   the working tree, so uncommitted files (possibly another session's in-flight work) would
   ship. Everything shipped must be reproducible from a commit. (This gate exists because of
   the 2026-07-12 incident where a concurrent session's work was deployed unintentionally.)
2. **Corpus presence check** — warns if the Bible/commentary file counts look too low.
3. **Pre-deploy licensing ratchet** — `DEPLOYING=1 npx tsx scripts/predeploy-gate.ts`. This is
   the only point in the pipeline that sees the actual artifact being shipped (the gitignored
   corpus never passes through git or CI). It hard-fails if the corpus is missing or if
   forbidden-provenance content has **increased**. The number may only go down.
4. **Build** — `cd web && npx next build`.
5. **Deploy** — `npx vercel --prod --archive=tgz`. `--archive=tgz` bundles the static data
   dirs into one tarball because they exceed Vercel's 15,000-file upload limit.

### To deploy / roll back production

- **Deploy:** commit everything you intend to ship, then `./deploy.sh`. Record the shipped
  SHA in `WORKLOG.md`.
- **Ship a chosen commit without shipping in-flight main work:** deploy from an isolated
  `git worktree` checked out at that commit (clean tree), then remove the worktree. This is
  the established pattern (see the 2026-07-16 WORKLOG deploy of `654f028`).
- **Roll back:** Vercel dashboard → `web` → Deployments → Instant Rollback.

### Current live state (as of 2026-07-18)

> **CORRECTED 2026-08-02 (deep audit, M12).** The sentence below was false, in the file that calls
> itself the one source of truth and that AGENTS.md routes every deploy question to. Verified
> against the Vercel API: `ancientpaths.app` is served by **`dpl_DwoWDhhZiLVLftKN9rcPiRU3v1qt`**
> (`24677ba`, 2026-07-19 16:57:06Z), `readyState: READY`, `target: production`, holding
> `ancientpaths.app` and `www.ancientpaths.app`. `dpl_Ejzk…` (`654f028`) is the ROLLBACK TARGET —
> the newest deployment whose code differs from what is live — not the live one.
>
> ⚠ **AND IT INVERTS THE MOMENT DEPLOY A COMPLETES.** Once a new deployment is promoted,
> `dpl_DwoW…` becomes the correct one-step-back target and `dpl_Ejzk…` becomes TWO states back, a
> bundle predating the cutover, `/api/health` and the work-catalog routes. Re-read the deployment
> list after any deploy, or read the receipt `deploy.sh` now writes to `docs/evidence/deploys/`.
> Do not trust a deployment id written down before the deploy you are rolling back FROM.

~~`ancientpaths.app` is served by deployment `dpl_EjzknRQEpaUXBG3YfjLhe8tKtpSr`
(dashboard slug `web-...EjzknRQEp`), a CLI deploy from 2026-07-16 = commit `654f028`.~~

`main` is **ahead of production**: the nav-label commits (`8237f49`, `a974085`) and the hero
image swap (`af34b7f`) are on `main` but have **not** been deployed. They go live only on the
next `./deploy.sh`. (Verified by serving bytes: the live hero is still the old file.)

---

## Not production: the `theology-study-app` project (the misspelled stray)

| Field | Value |
|---|---|
| Project | `theology-study-app` |
| Project ID | `prj_a3OXQsM5RSvstgfL0VuF7FAU6nX5` |
| Team | `home-network-hardening` (same team as `web`) |
| Domains | **acientpaths.app** (misspelled, missing the "n") + `theology-study-app.vercel.app` |
| Git connection | **DISCONNECTED 2026-07-18** (was: `ancient-roads`, prod branch `main`, auto-deploy on) |

This project git-auto-deployed `main` and shipped **code without the corpus** (it does not run
`deploy.sh`) to `acientpaths.app`. It is not real production and nobody should use it.

### Disposition (2026-07-18)

- **Git auto-deploy: disabled.** Its GitHub connection was removed (Settings → Git →
  Disconnect → "project settings and configuration will be preserved"). Pushing `main` no
  longer deploys it. Reversible: reconnect the repo if it is ever wanted as staging.
- **acientpaths.app: dead, left in place.** The typo domain has **no DNS records** (no A, no
  CNAME; `Invalid Configuration` in Vercel; HTTPS returns nothing). It resolves for nobody, so
  it is not actively serving corpus-less content to users. A redirect to `ancientpaths.app`
  was **not cleanly possible** because a Vercel redirect only fires once the domain's DNS
  points at Vercel, and this domain has no DNS at all. Fixing that is a registrar-side change
  (Cloudflare) that is out of scope here. Flagged for the owner.
- **Project + domain: NOT deleted.** Deletion is irreversible and the project may be wanted as
  staging, so it is left for the owner to decide. Options for the owner:
  1. Leave as-is (dead domain, no git auto-deploy) — done.
  2. Point `acientpaths.app` DNS at Vercel, then set it to redirect to `ancientpaths.app`
     (catches typos).
  3. Remove the `acientpaths.app` domain and/or delete the project entirely.

Note: this project has "Require Verified Commits" enabled, which is why its last auto-deploy
was `a974085` (a GitHub-web-editor commit, which GitHub signs) and not the later unsigned
worktree commits `af34b7f` / `3afa9f8`.

---

## Neon (database)

Production database endpoint is `ep-odd-fog-atnykudm` (separate from the dev branch used by
worktrees). This doc covers Vercel/hosting only; database migration and go-live steps live in
the go-live runbook. No production DB change is implied by a `web` frontend deploy.

---

## Restoring this project onto a new machine

Written 2026-07-28 when the original laptop was retired. The hard part of this project is not
the code — the code is on GitHub. The hard part is that **the served corpus is gitignored**
(see "Why `web` must never be git-connected" above), so a fresh clone gives you an app that
builds, passes CI, and serves nothing. The corpus lives in GitHub **release assets**, not in
git, and the restore is not finished until the verification block at the end passes.

### 0. Prerequisites

Node 22.x, `corepack` enabled (`corepack enable`), and the `gh`, `vercel`, and `neonctl` CLIs.
The repo pins `pnpm@9.15.0` via `packageManager`; corepack will fetch that exact version, so do
not install pnpm globally.

### 1. Clone

```bash
git clone https://github.com/thomascfoley-stack/ancient-roads.git
cd ancient-roads
```

Every branch that existed on the retired machine is on `origin` — verified branch-by-branch
with `git ls-remote` on 2026-07-28, not by trusting upstream-tracking config (a branch with no
configured upstream is not the same as a branch that was never pushed; two branches on that
machine looked unpushed and were in fact already on `origin`).

### 2. Re-authenticate

```bash
gh auth login          # needs at least: repo, workflow, read:org
vercel login           # team: home-network-hardening
neonctl auth
```

The `workflow` scope matters: without it, any push touching `.github/workflows/**` is rejected
by GitHub, which is how `feat/teacher-pipeline` got stuck unpushed earlier in this project.

**Secrets are not in any archive and never were.** No `.env`, connection string, or API key is
in git or in any release asset. Recreate `.env` by hand from the owner's password manager, and
pull the Neon connection strings from the Neon console. `docs/ENVIRONMENT.md` lists the
variables by name.

### 3. Download and verify the corpus archives

The current backup is release **`corpus-backup-2026-07-28`** ("Machine-migration backup").
It supersedes `corpus-backup-2026-07-19` for the corpus and additionally carries the quarantine
records, the cutover checkpoint, and a bundle of local-only git work.

```bash
gh release download corpus-backup-2026-07-28 --repo thomascfoley-stack/ancient-roads --dir /tmp/ar-restore
```

**Verify before extracting.** The release notes list a SHA-256 for every asset; compare against
what you downloaded:

```bash
cd /tmp/ar-restore && shasum -a 256 *
```

A mismatch means a truncated or corrupted download — re-download, do not extract. (The
2026-07-28 upload was itself proven by downloading all 12 assets back from GitHub and
confirming every SHA-256 matched the local original — 0 mismatches.)

### 4. Extract to the right paths

From the repo root. Each corpus tarball expands to `web/public/<dir>/`:

```bash
for d in commentaries bible lexicon original concordance; do
  tar -xzf /tmp/ar-restore/ancient-roads-corpus-$d-2026-07-28.tar.gz -C web/public
done
```

Quarantine records (not needed to run the app; keep them — they are the audit trail of what was
removed from the corpus and why):

```bash
mkdir -p data/quarantine
for f in /tmp/ar-restore/quarantine-*.jsonl.gz; do
  gunzip -c "$f" > "data/quarantine/$(basename "${f%.gz}" | sed 's/^quarantine-//')"
done
```

`biblehub-collapsed-2026-07-17.jsonl` is **not** in the 07-28 release — it is already preserved
in the `biblehub-quarantine-backup-2026-07-19` release and was not duplicated.

Ingest inputs and intermediates. **Not needed to run the app** — the served artifact is
`web/public/`, restored above — but needed to re-ingest, and ADR-030's correction notes the
re-ingest is a separate, *unbuilt* step, so these are not trivially recreatable:

```bash
mkdir -p data
for d in raw commentaries-api commentaries; do
  tar -xzf /tmp/ar-restore/ancient-roads-data-$d-2026-07-28.tar.gz -C data
done
```

The **source acquisitions** (ccel / gutenberg / archive / sword / helloao / poole / sermons /
historians, 1,198 files) are a *separate* archive taken from the `~/ap-golive` worktree, because
the main clone's `data/raw` held only `commentaries.sqlite` + `web-usfm`. Both are called
`raw/`, so extract this one somewhere distinct or it will merge with the above:

```bash
mkdir -p data/acquisition
tar -xzf /tmp/ar-restore/ancient-roads-acquisition-raw-golive-2026-07-28.tar.gz -C data/acquisition
```

The 8 public-domain Bible translation directories under `data/` (`kjv`, `asv`, `web`, `bsb`,
`ylt`, `lsv`, `bbe`, `darby`) were deliberately not archived — re-downloadable, and the served
copies are already in the `bible/` corpus archive.

The gitignored `spike/` scratch directory (SEC-2 proof scripts — `sec2-proof.mjs`,
`sec2-crux.mjs`, `proofs.mjs`, `auth.mjs`, `stub-oauth.mjs`, `migrate.mjs`), which was never
committed on any branch:

```bash
tar -xzf /tmp/ar-restore/spike-sources-2026-07-28.tar.gz -C .
```

Only the 7 source files are in that archive. `spike/.env.local` and `spike/.app-runtime-url`
carry live connection strings and were **excluded** — recreate them by hand like every other
secret. If you re-archive `spike/` in future, build the tar from an explicit file list rather
than sweeping the directory, or those two dotfiles ride along.

Cutover checkpoint and the local-only stash bundle:

```bash
cp /tmp/ar-restore/cutover-checkpoint-2026-07-28.json .cutover-checkpoint.json
git bundle verify /tmp/ar-restore/local-stashes-2026-07-28.bundle
git fetch /tmp/ar-restore/local-stashes-2026-07-28.bundle 'refs/tags/*:refs/tags/*'
```

That bundle holds the two `git stash` entries that were the only git content on the retired
machine not reachable from any `origin` ref (a 913-line `ingest/sources.config.json` plus a
teacher-routing/eval slice). It is a thin bundle; its prerequisites are on `origin/main`, so it
only applies to a real clone, not an empty repo. After fetching, the work is at tags
`backup/stash-0-2026-07-28` and `backup/stash-1-2026-07-28` — inspect with `git show`, and
apply with `git cherry-pick -n` or `git checkout <tag> -- <path>`.

### 5. Install (this is what wires the git hooks)

```bash
corepack pnpm install
```

The `prepare` script runs `git config core.hooksPath .githooks`, which is what installs the
pre-commit gate. **A fresh clone has no hooks until this runs** — commits will bypass the
ratchet silently until you do.

### 6. Link Vercel

```bash
cd web && vercel link   # team home-network-hardening → project `web`
```

Confirm `web/.vercel/project.json` reads `prj_Y9PVuNly5sSsf3NcvayS1vwE6FwR`. If it names
`prj_a3OXQsM5RSvstgfL0VuF7FAU6nX5` you have linked the misspelled stray, not production — see
the section above. **Do not git-connect the `web` project.**

### VERIFY — the restore is not done until all four pass

A restore nobody has verified is a hope. Run all four; each one can fail.

**1. Corpus file counts match the archive.** Expected counts, from the 2026-07-28 backup:

```bash
for d in commentaries:1213 bible:22590 original:1189 concordance:295 lexicon:2; do
  n=${d%%:*}; want=${d##*:}; got=$(find web/public/$n -type f | wc -l | tr -d ' ')
  [ "$got" = "$want" ] && echo "OK   $n $got" || echo "FAIL $n got=$got want=$want"
done
```

A short count means a partial extract. The reader will still build and serve — it will just be
missing books, silently, which is exactly the failure this check exists to catch.

**2. The corpus is the CLEAN one.** Three copies of `commentaries/` existed on the retired
machine and they were **not** interchangeable: two were clean (191,749 entries, **0**
forbidden-provenance rows) and one was dirty (239,593 entries, **63,111** rows sourced from
`historicalchristian.faith`). Disk size points the wrong way — the clean copy is *larger*
(407 MB vs 248 MB) and all three have the same 1,213 files. The archived one is the clean one,
verified by extracting the tarball and re-counting it. Confirm:

```bash
node web/test/scripts/update-forbidden-provenance-baseline.mjs   # expect: "Unchanged at 0."
```

Any output other than `Unchanged at 0.` means you restored the wrong corpus. (This script
rewrites the baseline file if the count is *lower* than baseline; at 0 it cannot go lower, so on
a correct restore it only reads.)

**3. The pre-deploy ratchet passes.**

```bash
DEPLOYING=1 npx tsx scripts/predeploy-gate.ts
```

Expected: `forbidden-provenance entries : 0`, `committed baseline : 0`, `✓ Ratchet holds.`, and
`✓ Every translation dir present has a shipping license record.` This gate is the only point in
the pipeline that sees the actual artifact being shipped, and `DEPLOYING=1` makes the
Bible-translation licensing check hard-fail rather than warn. If it reports missing corpus, step
4 did not land where it should.

**4. The full gate runs.**

```bash
npm run audit
```

Typecheck (strict) · lint · knip · `pnpm audit` high/critical · tests + coverage · web
typecheck + lint. This is the same gate CI enforces.

**This gate is not hermetic and it was RED on the retired machine on 2026-07-28.** Recorded here
so a future restorer can tell "I broke something" from "it arrived like this." Exit code 1, two
failing gates:

- `deps — advisory bulk-endpoint`: 2 un-ignored high advisories — `postcss`
  GHSA-r28c-9q8g-f849 (path traversal via `sourceMappingURL`, ≤8.5.17) and `better-auth`
  GHSA-qq9h-g4jm-xgf3 (account takeover via pre-account hijacking on magic-link / email-OTP,
  ≥1.1.3 <1.6.22). The `better-auth` one is the SEC-1 auth-beta CVE that already gates public
  launch. Both are dependency bumps, not restore problems.
- `qa — Layer 1 invariants`: one test, `test/invariants/work-reader.test.ts` → "404s a staged
  source on BOTH routes". It fails with `fixture wrong: 'josephus-whiston' must be staged …
  expected 'published' to be 'staged'`. `josephus-whiston` is supposed to be staged-never-served
  (GO_LIVE_STATUS "historians … staged, never served"), so this is **dev-database state drift**,
  not a code regression — something flipped that work to `published` in the Neon dev branch. It
  is an owner call, not a restore step.

Note what that second failure implies for a restore: several `test/invariants/*` suites execute
**against the real database** (they say so in their test names). `npm run audit` therefore needs
a populated `.env` and a reachable Neon dev branch, and its result depends on DB state as well as
on the code. A fresh clone with no `.env` will fail these for a third, different reason. Checks
1–3 above are the ones that actually validate *the restore*; check 4 validates the repo.

Deploy only once 1–3 pass and you understand every remaining red in 4. Then `./deploy.sh` from
the repo root, and record the shipped SHA in `WORKLOG.md`.

### What was deliberately NOT backed up

`refs/original/` — the `filter-branch` backup from the author-identity rewrite — was left on the
retired machine. It contains **zero unique content** (the pre-rewrite `main` tip tree is
byte-identical to on-origin commit `cd897b4`; the pre-rewrite teacher-pipeline tree is
byte-identical to the current branch, 0 differing files). It differs only in author identity:
the rewrite replaced `thomas@composio.dev` and a local-hostname address with the personal
address, deliberately separating this solo project from employer identity. Archiving it to a
GitHub release would have republished exactly what the rewrite removed. If that history is ever
wanted, it is an owner decision, not a backup side effect — and the retired disk is the only
copy, so decide before wiping it.

---

## Running the cutover from a droplet (not from a laptop)

Written 2026-07-28. The original operator laptop was retired, and the cutover execution model
now requires that **nothing depends on it**: work in a fresh clone on a server, push every
completed slice, and keep a dead-man's status file in git so a run that dies at 3am can still be
diagnosed from a phone. This section is the provisioning spec that makes that true.

### Why a laptop cannot host this run

`vercel --prod` and the cutover both operate on a **local working tree**, so whichever machine
runs them is load-bearing for hours. A laptop sleeps, loses network, and gets wiped. An
unattended prod cutover that dies mid-flight because the lid closed leaves production
half-migrated with nobody able to finish it — strictly worse than a controlled abort.

### The corpus is NOT in the clone — get it before anything else

**Verify this first, not at hour five.** `web/public/{commentaries,bible,lexicon,original,concordance}`
is gitignored and reaches no clone. A fresh droplet has code and no content. E3 rewrites the
local deployable static tree on *any* target, so this is an E0–E4 dependency, not only an E5 one.
Restore it from the release before running any step — see "Restoring this project onto a new
machine" above, which is the authoritative procedure and includes the SHA-256 verification.

The archived corpus is the **clean** one (191,749 entries, 0 forbidden-provenance rows), verified
by extracting the tarball and re-counting it. Two of the three copies on the retired machine were
clean and one carried 63,111 `historicalchristian.faith` rows; disk size distinguishes them the
wrong way round. Do not substitute another copy.

### Droplet spec

- Ubuntu 24.04, 4 GB RAM minimum. The corpus is ~658 MB and `data/` another ~440 MB, so give it
  **≥25 GB disk**.
- Node 22.x, `corepack enable` (the repo pins `pnpm@9.15.0` via `packageManager` — do not install
  pnpm globally), plus `git`, `gh`, `unzip`, and `tmux` or a systemd unit so the run survives
  disconnection.
- `gh auth login` with at least `repo` and `workflow` scope. Without `workflow`, any push touching
  `.github/workflows/**` is remote-rejected.
- `corepack pnpm install` — this runs `prepare`, which sets `core.hooksPath` to `.githooks`.
  **A fresh clone has no hooks until this runs**, so commits silently bypass the licensing ratchet.

### Credentials: set them on the droplet, never in the tree

Export `DATABASE_URL`, `APP_DATABASE_URL`, and the cutover DSN as **environment variables on the
droplet** (or a root-owned `.env.local`, which is gitignored and must stay that way). They do not
belong in git, in a commit, in evidence files, or in a status file. If a step appears to need a
secret committed, that is always the wrong fix — park it.

The same applies to PII: evidence records **locations and counts, never contents**. User emails
and provider subs live in the database and do not enter the tree.

### Preconditions before E0 touches production

E0 must abort before any write if the credential is stale, `current_user` is not owner, the host
is not the real production endpoint, or a temp-table write probe fails. Production is
`ep-odd-fog-atnykudm`; the dev branch used by worktrees is `ep-tiny-hat-atdgpisx` — a run pointed
at the wrong one is the failure this check exists to prevent. Every count assertion must
re-measure production at runtime; never assert prod against a literal in a doc, and never against
dev's numbers.

A pre-write snapshot is not a backup until a **restore from it has been proven** into a scratch
branch. An unverified snapshot is the biblehub-quarantine pattern repeating: one copy, never
tested. Record the restore's elapsed time and exact commands.

### What a Vercel rollback does and does not recover

`deploy.sh` ships a frontend bundle. A Vercel Instant Rollback restores **that bundle only**. It
does **not** roll back a schema migration and does not invalidate sessions. Once E0→E4 have run,
production's schema is already at head — so rolling back E5 returns an **old bundle to a new
schema**. Before treating bundle rollback as a recovery path for E5, establish whether the
pre-cutover bundle can actually run against the post-cutover schema. If it cannot, bundle
rollback is **not** a recovery path, and the recovery path must be named explicitly instead.
