# WORKLOG entry — 2026-09-07 structural validation of the 314-work flippable set [Kimi Code session]

(Per the order: filed here, not in WORKLOG.md.)

**Order:** `docs/pm/orders/2026-09-07-structural-validation-order.md` — make the
24-slug structural-hold derivation real, re-runnable code; prove it blind against the
19-work answer key; run it over the 314; take the pre-decided outcome; add the
owner's "not a clean set" line to the publish runbook. One validation job, no
remediation wave. No production connection; dev DB SELECT-only.

**What shipped:**

- `scripts/structural-composite-check.mts` — slug → composite/single/unknown + named
  structural evidence. Layers: L0 one-work adapters; L2 source ThML `DC.Creator`
  author/editor roles; L3 the source's own TOC (ThML div1/div2 from local cache or
  live `ccel.org` fetch; Gutenberg contents), hygiene-filtered, with numbered-part /
  per-biblical-book-commentary-part / part-family / parallel-language / halves
  recognition; L4 division-title authorship/biography attribution to a named person ≠
  declared author (with scripture-attribution closed-class suppression); L5 manifest
  title-vs-author shape. Pattern alone never returns single — single requires
  inspected structure. Optional `--dev-db` cross-check of staged section headings
  (NEON_BRANCH=dev, SELECT only).
- Pre-registered the bar at 2026-09-07T10:22:13Z in
  `docs/evidence/corpus-copy/structural-validation-2026-09-07.md` BEFORE running the
  19: "The rule flags all 19 as composite/unknown. Any miss = the rule does not carry
  the publish decision." All decision-logic QA (false-positive fixes on non-key works:
  hygiene-class front/back matter, bible-book commentary parts, metadata-typo name
  clustering, parallel-language editions) predates the registration. Disclosed post-run
  change: strict-TypeScript non-null annotations so `tsconfig.cutover.json` compiles
  the new script — no decision-logic change; both runs re-executed afterwards with
  identical verdicts (314-run diff empty; 19-run diff is the evidence-origin label
  only, first-pass live fetch vs second-pass cache).
- Ran the 19 blind: **19/19 composite, misses none** (L2a/L2b on the Schaff volumes,
  L4 on donne/flavel/tolstoy/catherine/cross-g, L3 on arminius/edwards/richardson/
  wesley/lightfoot via Ignatius marker).
- Ran the 314: **124 single / 190 composite / 0 unknown.** The 190 splits into
  apparent true composites the 24-slug hold list missed (DC.Creator two-author
  declarations: cowper-guyonpoems, fenelon-progress, mcgarvey-gospels; multi-work
  TOCs: kierkegaard-selections, law-humbleearnest, boethius-tracts, gardner-cell,
  drummond collections, kelly-gerhardtsong, teresa-life, barclay-quakers, …) and rule
  false positives on thematically-chaptered single works (murray-true-vine,
  defoe-crusoe, more-comfort, bernard-st-malachy, …). Full per-work evidence lines in
  the evidence file.
- **Verdict: NOT EARNED — hold branch.** Bar met (19/19) but the 314 did not come
  back substantially single, so the 1:1 property is not established; per the order
  the rule is a heuristic, **the batch HOLDS**, and the rule was NOT patched after
  the key run (report and stop).
- Runbook line added prominently to `docs/pm/orders/2026-09-06-owner-publish-batch.md`
  (owner's note: the 314 is not a clean set — hygiene-class matter rides along;
  accepted, reversible cost).

**Verified:** bar registration timestamp precedes both runs (file mtimes + transcript);
19/19 with denominators; 314-run counts (124/190/0); red-proof — rule flags hold-list
members it can see (anselm, jfb, schaff vols, donne-devotions, flavel-life,
tolstoy-maupassant) while passing all 38 dev58-pass works on pre-registration QA;
no production host touched (dev DB SELECT-only for staged headings; CCEL/Gutenberg
live fetches are public source metadata, cached to gitignored `data/raw/`).

**NOT DONE / UNVERIFIED:**
- The 190 composite returns inside the flippable set are UNTRIAGED — the true/false
  split above is by evidence character, not by hand-reading. Hand-triage is the
  recommended next job; the DC.Creator/L3 candidates named in the evidence file are
  the first carve-out of any revised flippable set. Until then the 314 cannot be
  represented as "detector-PASS AND structurally clean".
- Known rule bugs left unfixed per the order (no post-key patching): L4-db lacks the
  numbered-chapter and bible-book skips the ThML path has (sole cause of
  chesterton-aquinas / neander-a-expo-phil flags); person test over-fires on
  all-capitalized non-person phrases ("Comfort Against Tribulation", "Doctrine of
  Justification"); roman-numeral recognition incomplete past "xxi" in one alternation.
- `npm run audit`: all gates green EXCEPT `qa — Layer 1 invariants + regressions`.
  The failing tests (test/user-corpus/readings-setSearchCategories-failure,
  readings-reentrancy, upload/rate-limit companions) fail on
  `connection to ep-odd-fog failed: password authentication` — a DB credential
  fallback in the test environment reaching a prod-named endpoint, the same
  deterministic owner-credential-fallback class the 2026-09-07 deep-audit worklog
  records (N1/N3 fix on main, unmerged here). This session's diff (one new script +
  four docs) cannot affect those tests; fixing test-env credentials is out of scope
  and out of bounds (no production connection).
- The runbook's stale batch-size parentheticals (48/64/66/66/52 = 296, "42 PASS") do
  not match the carved files on disk (38 + 42/62/62/63/47 = 314) — left untouched
  (one validation job), flagged for the runbook owner.
