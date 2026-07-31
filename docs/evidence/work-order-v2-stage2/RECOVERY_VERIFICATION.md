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

**VERIFIED:** `RECOVERY.md` §2 states work order cited `dpl_DwoWDhhZiLVLftKN9rcPiRU3v1qt` does **not**
appear in repo; live site of record **`24677ba`** (2026-07-18). Honest note on schema mismatch (G4
window OPEN) included. **No correction needed.**

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
