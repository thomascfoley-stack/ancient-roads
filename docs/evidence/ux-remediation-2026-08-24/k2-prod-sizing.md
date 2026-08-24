# K-2 blast radius — PRODUCTION sizing

Owner go given 2026-08-24 ("do k2"). Read-only: `BEGIN TRANSACTION READ ONLY`, `ROLLBACK` on exit,
no credential printed. Script: `scripts/k2-ccel-sizing.mjs` (reviewable, re-runnable).

**Validated against dev before prod** — the script reproduced the numbers I had already measured by
hand on `ep-tiny-hat` (27 works, 40,463 sections, 1,937 damaged, 4.8%). A sizing tool that has never
been checked against a known answer is a number, not a measurement.

## Result — `ep-odd-fog-atnykudm` (PRODUCTION)

| | dev (`ep-tiny-hat`) | **prod (`ep-odd-fog`)** |
|---|---|---|
| CCEL works | 27, **all staged** | 27, **all published** |
| CCEL sections | 40,463 | 40,463 |
| Sections with empty-bracket debris | 1,937 (4.8%) | 1,937 (4.8%) |
| **Reader-visible** (in published works) | **0** | **1,937** |

The corpus is identical; the publish status is the opposite. **On dev this damage was invisible; in
production every damaged section is being served.** This is precisely why the dev number was filed
as indicative only, and why the plan required a separate prod count before any re-ingest decision.

## Per work — this settles the plan's unconfirmed claims

    557  vanbraght-mirror      Braght, Thieleman J. van
    466  rutherford-triumph    Rutherford, Samuel
    224  schaff-hcc1           Schaff, Philip
    115  hort-ecclesia         Hort, Fenton John Anthony
    111  miller-history        Miller, Andrew
    102  schaff-hcc8           Schaff, Philip
     80  schaff-hcc7           Schaff, Philip
     62  edersheim-lifetimes   Alfred Edersheim
     57  schaff-hcc2           Schaff, Philip
     44  robertson-history     Robertson, James Craigie
     33  schaff-person         Schaff, Philip
     33  schaff-hcc3           Schaff, Philip
     26  schaff-hcc4           Schaff, Philip
     12  schaff-hcc5           Schaff, Philip
      8  wuttke-ethics1        Wuttke, Adolf
      3  dickinson-musicchurch Dickinson, Edward
      2  winkworth-tauler      Winkworth, Catherine
      1  schaff-hcc6           Schaff, Philip
      1  bacon-lw-history      Bacon, Leonard Woolsey

**19 works affected, all published.**

**Corrections to the plan, now settled by measurement rather than inference:**

- **Calvin's Institutes is NOT affected.** It does not appear at all. The plan listed it as affected;
  my review flagged that as inferred-from-adapter-config rather than checked. It is now checked, and
  it is wrong — do not cite Calvin in the re-ingest decision.
- **"Schaff's Creeds" is not the affected Schaff work.** What is affected is Schaff's *History of the
  Christian Church* — `schaff-hcc1` through `hcc8` plus `schaff-person`, **568 sections across nine
  works**, the largest author cluster here.
- **The two worst-hit works were never named in the plan at all:** `vanbraght-mirror` (557) and
  `rutherford-triumph` (466) are together 53% of all damage.

## What this does NOT decide

The adapter fix (landed, `1cef7e8`) stops NEW damage. It does not repair these 1,937 rows — the
adapter is upstream of the corpus. Repair means re-ingesting the 19 works, which is a production
write and a separate owner decision under the ingest runbook. Dry run first:

    npx tsx src/ingest/adapter-loop.ts --adapters=ccel --only=<slugs> --force --dry

Sequencing note for that decision: re-ingest replaces section bodies, so anything anchored to
section text — annotations, reading progress, saved positions — should be checked against the
runbook before, not after.
