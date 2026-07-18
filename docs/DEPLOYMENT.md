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
| Project ID | `prj_Y9PVuNly5sSsf3NcvayS1vwE6FwR` (matches `web/.vercel/project.json`) |
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

`ancientpaths.app` is served by deployment `dpl_EjzknRQEpaUXBG3YfjLhe8tKtpSr`
(dashboard slug `web-...EjzknRQEp`), a CLI deploy from **2026-07-16 = commit `654f028`**.

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
