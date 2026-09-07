# Corpus coverage wave — handoff packet (2026-09-06/07)

Executed under `KIMI_ORDER_corpus-coverage.md` by the Kimi Code session. All commits on
`fix/ux-overnight-sweep`: Track A `ce3df1b` · Track B `d703a15` · Track C `a55f4ac` ·
runbook amendments `60c26f8` / `aaa56ca` · typecheck fix (this packet's session).
Session worklog: `docs/worklog/2026-09-06-corpus-coverage-wave.md`.

## 1. The coverage tables (Track B)

- Declared (manifest): `docs/evidence/corpus-coverage-2026-09-06/coverage-declared.md`
- Dev rows + status: `docs/evidence/corpus-coverage-2026-09-06/coverage-dev.md`
- **The served-on-prod column is UNMEASURED.** The one command that measures it (owner
  only, bylaw 7): `COVERAGE_ALLOW_PROD=1 DATABASE_URL=$(cat ~/.neon_prod_url) npx tsx
  scripts/coverage-matrix.mts` — red-proved (refuses prod without the flag, exit 2;
  declared-only-with-honest-unmeasured exit 2; correct table on dev, exit 0).
- Tradition field: 775/845 works moved off `unassigned` (tool plan applied verbatim + 512
  hand-classified with reasons; zero prior assignments re-keyed; closed vocabulary held).
  70 remain with per-work reasons; vocabulary gaps logged (quaker, seventh-day-adventist,
  arminian, unitarian, brethren, pentecostal, holiness, tolstoyan, new-thought).

## 2. Staged vs held

- **Ready for owner flip after the two preconditions:** the verdict-PASS subset of the
  58 dev-staged wave works (post dev→prod copy) + `hooker-just` (Track C). Precondition 1
  (P4.n accuracy ruling per category) and Precondition 2 (ADR-029 scan) are both written
  into `docs/pm/orders/2026-09-06-owner-publish-batch.md` as amended.
- **Deliberately held:** the 439 prod-staged (P4.n measured hold — "sermon and theology
  should NOT flip on this evidence"); 43 verdict-FAIL works held for non-authorial matter
  (`docs/evidence/adr029-scan-2026-09-06/verdict.md`); `origen-commentary` (ADR-029 case
  itself); `hort-james1909` (status contradiction — owner ruling); `thayers-lexicon`
  (publish-blocked pending source-verification file); `simon-works1/2` (ADR-110 FORK C).

## 3. The CCEL tension — surfaced, NOT resolved (owner call)

876/917 manifest entries are ccel.org-provenanced, while `DATA_SOURCES.md` says CCEL is
"reference/discovery only… use the underlying PD text, re-provenance" — yet CCEL is not on
the enforced forbidden-host list, and every CCEL ingest this wave succeeded with clean
per-work provenance. Whether CCEL is an acquisition source or a discovery index is an
owner ruling this packet deliberately does not make.

## 4. Everything refused, and why

- **calvin-institutio1/2** — Latin page-scans, wrong ids; deleted (owner ruling "english
  only"). The English Institutes was already published (Beveridge 1845).
- **Luther Holman vols 3–5** — provably absent from Gutenberg (gutendex sweep); archive.org
  lane, not forced.
- **Hooker's Laws (reform1–3)** — all three CCEL volumes are page-scan images; the loop
  failed closed, nothing written. Needs the archive.org lane (Keble 1888).
- **DRC + Brenton LXX translations** — every digitization is Vulgate/LXX-versified; shipping
  keyed-as-KJV would mis-reference text. Needs a verified mapping slice.
- **20 of the 61 triage leftovers** — page-scan-only (15), prod-verified duplicate shells
  (3), nonexistent on CCEL (1), index volume (1). Roster with remedies in
  `docs/evidence/ingest-runs/topup-wave2-digest-2026-09-06.md`.
- **Track C candidates dropped** — forbidden hosts (monergism et al.), archive-lane only,
  or wave caps. Full reasoning in `docs/evidence/corpus-coverage-2026-09-06/track-c-acquisition-wave.md`.
- **The 46,831-vector `section_embeddings` backfill** — measured as no-serving-gap; left as
  an owner cost call, not spent.

## 5. Open flags for the owner

1. `simon-works1/2` carry `provenance.year: 1983` vs the required Funk 1871 edition —
   already staged on prod (2026-08-19 copy). Edition-trap ruling needed.
2. `ingest-sword-commentaries.mts:21-23` hardcodes Title-Case tradition values that won't
   set-match the lowercase manifest vocabulary under `traditions_min`. Not fixed (order).
3. Owner decision #4 (front-matter gating strength, `wip/front-matter-strength`) — reported
   by Track A (boundary holds strong-only; weak findings report-level), not decided.
4. Something keeps auto-attempting the thayers publish flip and STOPping at the gate
   (latest 2026-09-06T19:56Z) — the gate is working; the scheduler is worth identifying.
5. `fast-uri@3.1.5`: 4 new high GHSAs (fix ≥3.1.6) — pre-existing lockfile, advisories
   newer than the last green audit; adjudicate (upgrade or ignoreGhsas + SECURITY.md).
6. Gutenberg adapter still lacks an attribution boundary (Track A's is CCEL-only; addendum
   2 says the class generalizes — tennyson/traherne were Gutenberg).
7. `register-writer` delete-order gap: re-ingest of sections-plane works fails on
   `section_history_anchors_section_id_fkey` (schaff-npnf201 escalation).

## 6. For the independent audit

In order, the commands that reproduce each track's evidence:

```sh
# Track A red-proof + scan (dev, read-only)
export DATABASE_URL="$(cat ~/.neon_dev_owner_url)" NEON_BRANCH=dev
npx vitest run test/front-matter-detector-adr029.test.ts test/ccel-attribution-boundary.test.ts
npx tsx scripts/adr029-nonauthorial-scan.mts --target=ep-tiny-hat-atdgpisx --mode=labelled
npx tsx scripts/adr029-nonauthorial-scan.mts --target=ep-tiny-hat-atdgpisx --mode=scan
#   verdicts: docs/evidence/adr029-scan-2026-09-06/{verdict.md,redproof.log}

# Track B tables + tradition patch
node scripts/derive-tradition-backfill.mjs        # report-only plan
npx tsx scripts/coverage-matrix.mts               # exit 2, "UNMEASURED, not zero"
DATABASE_URL="$(cat ~/.neon_dev_owner_url)" NEON_BRANCH=dev npx tsx scripts/coverage-matrix.mts
#   tables: docs/evidence/corpus-coverage-2026-09-06/coverage-{declared,dev}.md

# Track C per-work evidence
#   docs/evidence/corpus-coverage-2026-09-06/track-c-acquisition-wave.md
#   gate logs: gate-baseline.log / gate-after-track-c.log (no new red; R3 +1 = the order's
#   predicted register-path class, reported not remedied)
#   shingle proof 76.9% vs Keble 1888 via the shipped shingleSet/containment
```
