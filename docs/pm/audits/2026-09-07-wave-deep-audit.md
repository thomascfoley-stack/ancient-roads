# Deep-audit — the 2026-09-06/07 wave

Orchestrated per the owner's audit order (2026-09-07). Six fresh agents, one per lens, none
of which wrote any of the audited work; orchestrator (Kimi Code main session) dispatched,
deduplicated, and reports — it did not grade its own wave. Audited commits: `e5a8a4b`,
`9f936a5`, `f26b696`, `9b4cb08`, `7358e36`, `ce3df1b`, `d703a15`, `a55f4ac`, `3d09cba` +
runbook amendments, deploy `acfad908`. Lens 7 (reader's view): **NOT RUN** — it needs the
gate password from the owner and the order forbids extracting it from Vercel env. A CDN 200
is not a substitute. That leg remains open.

## The two questions

**Is anything currently serving to readers wrong?**
**YES** — quarantined works (`calvin-calcom`, `augustine-confessions`) and staged,
never-published works (`adeney-expositorsonglament`, `donne-divine-poems`) are live on the
production CDN shelf right now. Nothing unlicensed or mis-licensed is serving (all three new
translations verified against independent sources, text and records). The ADR-029 held-8 are
NOT serving (11/11 sampled carrier chapters negative).

**Is the 439-flip runbook safe to run as written?**
**NO** — as audited, its numbered steps flipped the full 58-slug file including the 8 held
works (contradicting its own amendment; no tool gate would have stopped it), and its
mandatory prod-side ADR-029 scan is unexecutable as written (the scanner refuses prod by
design). The first defect and the stale counts were remediated immediately post-audit
(`58→50 PASS` flip file, 489 totals, accuracy step added, prod-scan gap marked OPEN WORK);
the prod scan itself does not exist yet.

## CRITICAL

**C-1 · Quarantined works are serving on the live CDN.** `calvin-calcom` and
`augustine-confessions` were quarantined 2026-08-06 — DB-only: status rows flipped,
1,484 embedding rows unserved, zero static-shelf cleanup (run log
`docs/evidence/register-cleanup/quarantine-run-2026-08-06T04-44-51-855Z.log`). Their entries
are still in `web/public/commentaries/` (13 + 10), still in the sync-manifest baseline, and
fetched live from the CDN today (`psa/23`, `gen/3`, `1co/13`). Quarantine unserves the DB
path; the shelf has no status check, and the 1-hour TTL "backstop" is defeated because
nothing ever rewrites the shared chapter files. `chesterton-preexistence` got exactly this
cleanup under ADR-117; the Aug-6 pair never did. *Still in place: yes, serving now.
Pre-existing, not wave-introduced; found by Lens 5.*

**C-2 · The runbook's numbered steps flipped the held works.** Step 2 batch 1 named
`dev58-2026-09-06.json` (all 58) while the amendment said "no flip may include a
verdict-FAIL work." An operator following the steps publishes all 8 held works; the flip
tooling has no ADR-029 gate (grep-verified). *Remediated post-audit: step 1 of the flip
sequence now names `dev58-pass-adr029-2026-09-07.json` (50) with the warning inline.*

**C-3 · The prod-side attribution scan is a dead command.** The runbook cited
`adr029-nonauthorial-scan.mts --mode=scan` against prod; executed by Lens 2 (guards fired
pre-connection, prod never touched), it fails three successive ways — the scanner is
dev-only by design, its input is the frozen dev 133, and the batch files are the wrong
format. No scan input for the 439 exists; the flip tooling has no scan gate. *Still in
place: marked OPEN WORK in the runbook — a guarded prod scan mode must be built and its
FAILs carved before the 439 flips, or the owner consciously waives knowing the ruling
assumed a scan that doesn't exist.*

## HIGH

**H-1 · The ADR-029 scan's 90-PASS verdict is untrustworthy in the safe direction.**
Lens 1 sampled 15 PASS works head-and-tail: **8 should FAIL**, including `schaff-hcc1`
(§2045–2159: 115 "Words and Phrases" index sections) and `schaff-hcc4` (38 more) — the scan's
own headline class at scale, masked because `titleLine` prefers CCEL's decorated headings
(`Indexes — Greek Words and Phrases (1/36)`) while every new-shape regex is anchored `^…$`
(`front-matter-detector.mjs:127-131,265-271`). Also passing with live matter:
`donne-devotions` §1 (Izaak Walton's biography of Donne), `flavel-life` (an entire
misattributed work), `lardner-n-mosaic` §2 (a publisher advertisement — falsifying the
scan's "no publisher catalogue survives" claim), `foxe-martyrs` §1–24 (editor's
introduction), `bunyan-badman` §1–2, `schaff-npnf201/110` (prolegomena — the labelled set's
own P1 class, detected only weak). Fresh-seed tests show the detector covers its training
dialect, not the class (misses slash-notation prices, qualified index titles). All 43 FAILs
sampled were genuine; the labelled set reproduces exactly; the defect is what a PASS means.
*Still in place: detector and verdict unchanged. Consequence: the dev58-PASS-50 file this
runbook now uses inherits this false-negative rate — its contents are the better of two
imperfect sets, not a clean set.*

**H-2 · The attribution boundary guards only the CCEL adapter.** Gutenberg (the catalogue
class's actual provenance path) and nine other write paths into the same store have no
boundary (`adapter-gutenberg.ts:588`, `reference-register-bridge.ts:43`,
`sword-register-bridge.ts:44`, `ingest-whitefield-works.ts:109`,
`ingest-topical-index.ts:382`, `adapter-helloao.ts:136`, `repoint-sections-work.ts:170`,
`migrate-sections-slice.ts:243`, `ingest-historian.ts:222`, `ingest-sermon.ts:249`).
*Still in place.*

**H-3 · Staged, never-published works are serving on the CDN.** `adeney-expositorsonglament`
(26 chapter files; staged on dev; verified absent from prod's publish records) and
`donne-divine-poems` (1 file) are live, hash-identical disk==CDN. *Still in place: serving
now.*

**H-4 · The shelf gap (§17) is confirmed open, and the freshness gate funnels operators
into it.** `register-writer.ts:357-368` materializes at ingest regardless of status;
`planSync` is hash-only; and `predeploy-gate.ts:501-505`'s failure text literally prescribes
`corpus-blob-sync --execute` as the remedy — the command that would publish the staged
content, exactly as nearly happened on 2026-09-07. Any future ingest + full sync re-opens
the held-works door. *Still in place.*

**H-5 · `reference` now counts as a tradition in `diversity_traditions`.** The backfill
keyed 60 works `reference`, 36 of them `source_type: father` (the Schaff ANF/NPNF patristic
sets) — inside the /ask pool. The floor's exclusion set is only
`{unassigned, unknown, ''}` (`v1.ts:332`). Measured against the shipped `verifyV1`: one
church tradition + a dictionary now clears a gate that exists to require two traditions;
and Augustine served as `patristic` + `reference` (the same father, Schaff-edited)
satisfies the floor against himself. Live effect is zero until per-work re-ingest
propagation (the commit is manifest-only — verified no DB write); the input change is in.
*Still in place.*

**H-6 · The "contention" dismissal is refuted; the audit env contract is broken.** The qa
RLS-tenancy reds are a deterministic function of credential fallback: `DATABASE_URL`
(owner, BYPASSRLS) set without `APP_DATABASE_URL` → every runtime connection is the
RLS-inert owner, and the suites correctly detect it (7 failed under the documented env,
isolated; 12/12 green with `APP_DATABASE_URL` added, isolated). RLS itself is healthy. The
wave recorded "contention, not a regression" in a commit message others will trust.
*Still in place: `assert-ingest-env-dev.mjs` allows but never requires APP_DATABASE_URL.*

**H-7 · N1/N3 invariants are broken by stale session mocks; db-invariants CI was red on
every wave-window push.** The mocks lack `authFailureResponse` (used since c11bc844,
pre-wave); both suites fail anywhere they execute, and skip everywhere anyone looks.
`origin/main` carries the fix (`4b3efc97`) — landed after this branch's last merge.
*Still in place on this branch's HEAD; merging main closes it.*

## MEDIUM

- **M-1 · No accuracy re-measurement step existed in the runbook** — the P4.n watch item
  was decorative. *Remediated post-audit: required post-flip v4 diagnostic added with the
  rollback pointer.*
- **M-2 · Runbook body contradicted itself** (498/440 prose vs 489/439 files). *Remediated.*
- **M-3 · `hooker-just` is staged, outside both the 58 and the scanned 133** — any
  "copy all staged" improvisation lands an unscanned work. *Still in place (runbook copies
  by explicit file, so as written it does not sweep it — but no scan covers it for a
  future flip).*
- **M-4 · The floor's stand-down shrinks to near-zero post-propagation** — single-tradition
  answers that previously passed will newly FAIL `diversity_traditions` as re-ingest
  propagates the 775 re-keys (measured on the shipped verifier). Arguably the gate working
  as designed; unmeasured against the bait harness; expect more fallbacks. *Still in place.*
- **M-5 · Title-Case tradition mismatch is now load-bearing** — `ingest-sword-commentaries.mts:21-23`
  vs lowercase manifest values: the eval axis (`src/evals/checks.ts:59-61`, raw Set, no
  normalization) counts `'Methodist'`+`'methodist'` as 2 while the verifier floor folds
  case — the axis and the faithfulness gate now disagree, and the axis over-reports.
  *Still in place.*
- **M-6 · The translation gate verifies a license record's existence, never its content** —
  the `LicenseRecord` interface has no translator/year fields; an over-claimed record would
  pass. All three current records independently verified correct (Lens 6), so this is
  gate-depth debt, not a live violation. *Still in place.*
- **M-7 · Skeleton books render as silently blank chapter pages** (titled header, empty
  column; no "not in this translation" notice). *Still in place; matches an existing
  precedent, UX-honesty gap.*
- **M-8 · fast-uri@3.1.5, four high GHSAs** — pre-existing, wave-acknowledged, fix ≥3.1.6
  since 2026-08-23. *Still in place.*
- **M-9 · Dev-DB hygiene residue** — 6 pre-existing Aug-30 rows + 6 concurrent-session rows
  appeared mid-audit (suites the auditor never ran). The shared-DB hazard, measured.
  *Still in place (gate forbids hand-deletion).*

## LOW

- L-1 · `d703a15`'s commit message cites a green test suite that does not exist in any git
  history ("tradition-count-matches-gate") — the as-never class in prose form.
- L-2 · Stale comment in `predeploy-gate.ts:273-274` names LSV among copyrighted translations
  (it is CC BY-SA and ships legitimately).
- L-3 · Contestable (defensible, not wrong) tradition classifications flagged for the owner:
  stowe-religiouspoems→congregational, bayly-piety→puritan, bradford→puritan (d. 1555),
  Chesterton uniformly catholic (pre-1922 works are Anglican-era).
- L-4 · Detector doctrine notes: bare "The Argument" flags Chrysostom's own argument
  (pre-existing v1 doctrine); `miller-history` tail index unflagged (adjacent class,
  recorded); `luther-sermons` per-section publisher blurbs below detector resolution.

## Verified clean (executed, not trusted)

- The carve itself: two independent derivations (structural parse + scanner re-execution)
  reproduce 50 PASS / 8 HELD exactly; partition of the 58 is exact; the regex bug did not
  propagate.
- All 43 ADR-029 FAILs sampled are genuine non-authorial matter; the labelled set
  reproduces 11/11 + 3/3 bit-for-bit; the scanner's safety rails (read-only txn enforced
  and checked, prod refusal, frozen-input hash) work.
- Translations: all three license records factually correct against CrossWire/eBible; all
  three texts identity-verified verse-by-verse against independent sources (JPS is the
  1917 text, zero "HaShem"); registry↔disk↔records 1:1:1; CDN hashes match; 0 deletes.
- Track B: 775/775 changes are `unassigned`→value, zero re-keys; vocabulary closed;
  same-author splits introduced: zero; required tests pass; ~20 hand-classifications
  spot-verified correct.
- Wave test quality: no can't-fail / as-never / expected-seeded assertions found in any new
  wave test; red-proofs documented and reproducing; root suite 1069 green.
- RLS itself: healthy (12/12 under correct credentials; passes in db-invariants CI).
- Skip legitimacy: all 66 skips across 12 files are declared `announceSkip` with reasons —
  none silently vacated. studies-tenancy's skip is the designed honest path.
- Licensing invariant: 3/3 isolated runs green; currently functional.

## Coverage — what was NOT examined

- **Lens 7 NOT RUN** (reader's view, needs owner-supplied gate password): the three new
  translations are unproven in the actual product UI. Nothing else substitutes for this.
- The other ~75 PASS works' bodies beyond Lens 1's 15-work sample (the false-negative rate
  almost certainly extends further).
- Prod publish status of August-era works (inferred from flip evidence; prod DB untouched
  by design).
- Full 28,757-file CDN re-hash (sampled); Track C's shingle re-execution; the 43 held
  works' re-slices (parked owner calls); the 440 prod-staged works' content (unscannable
  by the shipped tool — C-3).

## Post-audit remediation (separate commit, recorded here for the trail)

Runbook: flip sequence now uses the 50-PASS file (C-2); totals corrected to 50+439=489
(M-2); required post-flip accuracy diagnostic added (M-1); prod-scan gap marked OPEN WORK
with the build requirement (C-3). Everything else in this report stands as found.
