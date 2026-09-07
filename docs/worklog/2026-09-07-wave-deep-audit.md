# WORKLOG entry — 2026-09-07 wave deep-audit [Kimi Code session, orchestrator]

(Per the audit order: filed here, not in WORKLOG.md.)

**Order:** independent deep-audit of the 2026-09-06/07 wave (owner, 2026-09-07). Six fresh
agents, one per lens, none wrote the audited work. Orchestrator dispatched/deduplicated/
reported; it did not grade its own output. Full report: `docs/pm/audits/2026-09-07-wave-deep-audit.md`.

**The two answers:**
- Serving wrong to readers right now: **YES** — quarantined `calvin-calcom` +
  `augustine-confessions` (DB-only quarantine 2026-08-06, shelf never cleaned) and staged
  unpublished `adeney-expositorsonglament` + `donne-divine-poems` are live on the CDN.
  Nothing unlicensed/mis-licensed; the held-8 are not serving.
- Runbook safe as written: **NO at audit time** — numbered steps flipped all 58 incl. the
  8 held (C-2); the prod-side ADR-029 scan is unexecutable (C-3). Both remediated post-audit
  in the runbook (50-PASS flip file, 489 totals, accuracy step, prod-scan marked OPEN WORK);
  the prod scan mode itself is still unbuilt.

**Headline findings beyond the two answers:** the ADR-029 scan's 90-PASS verdict is
untrustworthy in the safe direction — 8/15 sampled PASSes should FAIL, including 153
word-index sections in schaff-hcc1/hcc4 (the scan's own headline class, masked by decorated
headings vs anchored regexes) and live composites (donne-devotions §1 Walton biography;
flavel-life whole-work misattribution; a surviving publisher ad in lardner-n-mosaic). The
attribution boundary covers only the CCEL adapter (9 other write paths open). The tradition
backfill made `reference` a floor-counted "tradition" (36 father-type works; one father can
now satisfy diversity_traditions against himself; live effect zero until re-ingest
propagation). The "contention" dismissal of the tenancy reds is refuted — deterministic
owner-credential fallback; RLS itself healthy. N1/N3 invariants broken by stale mocks
(main carries the fix, unmerged here). The freshness gate's remedy text funnels operators
into publishing staged content.

**Verified clean:** the carve (two independent derivations, exact), all sampled FAILs,
translation licenses AND texts (independent sources; JPS is 1917, no HaShem), Track B's
zero re-keys / closed vocabulary / zero same-author splits, wave test quality (no
can't-fail class found), RLS health, skip legitimacy, licensing invariant.

**NOT DONE / UNVERIFIED:**
- Lens 7 (reader's view of the new translations in the UI) NOT RUN — needs owner-supplied
  gate password; the order forbids env extraction. Open.
- Live wrong-serving (C-1, H-3) UNREMEDIATED — needs owner decisions: shelf cleanup of the
  two quarantined works (the ADR-117 pattern exists) and a ruling on the two staged works.
- Prod scan mode for the 439: unbuilt. Detector false-negatives (H-1): detector and verdict
  unchanged. Boundary coverage beyond CCEL: open. `reference` in the floor exclusion set:
  owner call. `reference`+`patristic` same-father double count: owner call.
- N1/N3 fix: merge origin/main (carries 4b3efc97).
- Post-audit remediation commit covers the runbook only; every other finding stands.
