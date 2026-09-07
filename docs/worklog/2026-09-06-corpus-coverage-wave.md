# WORKLOG entry — 2026-09-06/07 corpus coverage wave (Tracks A–C) [Kimi Code session]

(Per the order's §8: filed here rather than prepended to the 1.15 MB WORKLOG.md, which
conflicts at the top by construction when two trees prepend. The owner folds it in.
NOTE: this session also wrote same-day WORKLOG.md entries for its earlier ingestion work
before this convention arrived — see the 2026-09-06/07 entries there.)

**Order:** `KIMI_ORDER_corpus-coverage.md` (Claude). Review before execution verified its
two load-bearing claims verbatim (ADR-029 rule 3 at DECISIONS.md:317-318; the P4.n hold at
`docs/evidence/p4n-flip-2026-08-19/RESULT-commentary.md` — "Sermon and theology should NOT
flip on this evidence") and found its §0 tree-state premise false (zero modified tracked
files; the "33 foreign uncommitted paths" were this session's own committed work).

**Track A — ADR-029 discharged (`ce3df1b`).** Detector extended with the two missing
addendum-2 shapes + head-and-tail sweep (DETECTOR_VERSION 2.0.0); red-proved (14 labelled
cases red→green, 30 must-NOT-fire green throughout); bar pre-registered: sensitivity 11/11,
specificity 3/3. Frozen 133-work staged scan: **90 PASS / 43 FAIL** (15 live machine
word-indexes, 5 foreign-work composites incl. origen §1/§101 confirmed live and
schaff-anf06/07/08 bound-in fathers, rest carried-in apparatus). Durable repair:
`attributionBoundaryHold` at acquire time, no ordinal surgery, red-proved 5/5.

**Track B — tradition + coverage (`d703a15`).** 775/845 off `unassigned` (tool plan verbatim
+ 512 hand with reasons; zero re-keys; closed vocabulary). 70 remain with reasons;
vocabulary gaps logged. 22 genuine acquisition gaps (delta file), all traps re-verified.
Two coverage tables + `scripts/coverage-matrix.mts` (red-proved; served column honestly
unmeasured — one owner command measures it).

**Track C — capped wave (`a55f4ac`).** 1/6 entries used: `hooker-just` staged (13 sections,
122 flat embeddings, shingle 76.9% vs Keble 1888 via the shipped measure, R1 closed).
Hooker's Laws dropped — all 3 CCEL vols are page-scans (loop failed closed, nothing
written). Design note delivered: `docs/pm/orders/2026-09-06-archive-adapter-gap.md`.
Gate baseline-diff: no new red; R3 +1 Hooker = the order's predicted register-path class,
reported not remedied (deletion is a prohibited remedy).

**Fixups this session:** Track A's scan script had a committed typecheck error
(TS2345 — hoisted-function narrowing; fixed with a post-guard alias, cutover typecheck
clean). The qa RLS-tenancy reds Track C saw under audit re-checked: pass standalone
(annotation-rls-tenancy 6/6; studies-tenancy declared-skips) — audit-time DB contention,
not a tenancy regression.

**Runbook amendments (`60c26f8`, `aaa56ca`)**: P4.n hold + ADR-029 precondition written into
`docs/pm/orders/2026-09-06-owner-publish-batch.md`; origen-commentary removed from slug
files (union 439); precondition 2 marked satisfied for the dev-staged set with the verdict
path; the 439 prod-staged works need the same scanner pointed at prod (owner terminal).

**NOT DONE / UNVERIFIED:**
- Translations deploy STILL blocked on the D3 corpus-store token (owner, ~2 min — mint into
  `~/.corpus_blob_token` or connect the store with a non-default env prefix). Then: scoped
  sync (bible/{weymouth,twenty,jps}) + deploy.sh. qa green; manifest untouched by failed runs.
- 43 ADR-029-held works stay staged; re-slice/suppress/skip per work is an owner call.
- Gutenberg adapter lacks an attribution boundary (CCEL-only so far).
- schaff-anf06/07/08 bound-in fathers: candidates for origen-style re-slice (owner call).
- Owner decision #4 (front-matter gating strength) reported, not decided.
- The 439 prod-staged flips await the P4.n owner ruling + accuracy re-measurement per
  category, then the prod-side ADR-029 scan, then the amended runbook.
- Track D superseded (translations already executed); §8 handoff packet at
  `docs/pm/orders/2026-09-06-corpus-coverage-wave.md`.
- Deep-audit by a fresh agent (CLAUDE.md requirement after long autonomous runs) NOT yet
  run — evidence is shaped for it (packet §6 has the repro commands).
