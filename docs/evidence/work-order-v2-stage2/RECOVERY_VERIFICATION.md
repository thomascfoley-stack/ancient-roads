# RECOVERY verification — Work Order v2 Stage 2 Tranche 6 (2026-07-31)

Checked `docs/RECOVERY.md` against property: every restore path documented with
command / restores / destroys / host survives / window / exercised.

## Summary

| § | Mechanism | Gaps |
|---|-----------|------|
| 1 | Neon protected snapshot | Exercised: **NOT YET** (documented honestly). No gap in fields. |
| 2 | Vercel Instant Rollback | Exercised: **NO** (documented). Deploy id correction present. |
| 3 | Corpus restore | Exercised: **2026-07-28** ✓ |
| 4 | Deploy chosen git commit | Exercised: **2026-07-16** ✓ |
| 5 | Git revert | Exercised: routine (honest) ✓ |
| 6 | Publish-flip reverse | Exercised: **NOT YET** ✓ |
| 7 | Cutover chunk abort | Exercised: partial (E0–E4 completed; full abort not exercised) ✓ |

## Deploy rollback row — honesty check

**VERIFIED (as of 2026-07-31):** `RECOVERY.md` §2 states the work order cited
`dpl_DwoWDhhZiLVLftKN9rcPiRU3v1qt` does **not** appear in repo; live site of record **`24677ba`**
(2026-07-18). Honest note on schema mismatch (G4 window OPEN) included. **No correction needed.**

> **~~CORRECTION (2026-08-01)~~ — SUPERSEDED 2026-08-01, same day, by a first-hand Vercel API read.**
> The block below was filed here and is kept for history. **Its central assertion is false.**
>
> > ~~**CORRECTION (2026-08-01):** this deployment id is **unverified**. It appears in no Vercel listing
> > and in no repo artifact except documents repeating it. An attempt to settle it read-only was BLOCKED —
> > the Vercel CLI here reaches only `thomas-s-projects-d9abdfd0` and `composio`, and the `web` project is
> > in neither. See `docs/RECOVERY.md` §2 for exactly what the owner must read off the dashboard. Do not
> > quote this id as the rollback target.~~
>
> **What is actually true.** `dpl_DwoWDhhZiLVLftKN9rcPiRU3v1qt` is `READY`, `target=production`, sha
> `24677ba`, created 2026-07-19 16:57:06Z, and **currently aliased to `ancientpaths.app`**. It is the
> live deployment, not a phantom. Source: Vercel API, team `home-network-hardening`
> (`team_TQ3BYCSyzQ3m0yatlkKmUzM0`), project `web` (`prj_Y9PVuNly5sSsf3NcvayS1vwE6FwR`), read-only,
> 2026-08-01, read independently by three sessions. Canonical table:
> [`docs/RECOVERY.md`](../../RECOVERY.md) §2.
>
> **Two things this got wrong, and they are different mistakes.** The "no repo artifact" half was a
> true statement about this repository. The "no Vercel listing" half was a claim about the world drawn
> from a limit of the local CLI, which is authenticated to an account that cannot see the `web`
> project at all. The first is a scope note; the second is the failure mode now recorded in
> [`docs/pm/MASTER.md`](../../pm/MASTER.md)'s watchlist: an instrument's blind spot written down as a
> property of the thing it could not see.
>
> **Also corrected: the formatting.** The superseded block was inserted mid-sentence, splitting
> "does **not**" from "appear in repo" across six lines of quote. The sentence is restored above.

## Gaps (minor)

1. **§2 CLI rollback** — documents `vercel rollback <deployment-url>` but not the exact deployment id
   for `24677ba`; operator must use dashboard. Acceptable.
2. **§1 promote subcommand** — "exact neonctl subcommand depends on Neon API version — owner call".
   Cannot be closed without owner rehearsal (Neon branch create forbidden this work order).
3. **§7** — rollback string host-survival marked "Depends on rollback string — read it before acting";
   not a missing field, but not exercised.

## Rehearsal

**NOT EXECUTED** — Neon branch create/delete forbidden by work order rails. Matches `RECOVERY.md`
§ "Rehearsal status (Work Order v2 Tranche 6)".
