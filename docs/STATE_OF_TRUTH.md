# STATE OF TRUTH — where the project actually is, verified (2026-07-15)

One page an agent can read cold to know the real state. **Every row was checked against the running system**
(read-only prod SQL via `scripts/ground-truth.mjs`), the code, or git — not against memory or another doc. Where
a canonical doc disagreed with reality, the doc was corrected and the correction is listed in §6 with its proof.

Method: `node scripts/ground-truth.mjs` (read-only, no DDL, no secrets) + `git log` + file reads. Re-run
`ground-truth.mjs` to reproduce the prod rows; it prints a claim/source/expected/actual/verified table.

---

## 1. Retrieval accuracy — ⚠️ THIS TABLE IS SUPERSEDED (kept for history)

> **Corrected 2026-07-19.** This section used to be headlined "the numbers that are TRUE right now"
> while a bullet at the bottom of the very same section said the numbers had moved. An agent reading
> this page cold took the headline, not the footnote. **The CURRENT numbers are in `WORKLOG.md`
> 2026-07-18** (the option-(c) lane config: the honest v3 baseline — v3 is now a **dev set**, measured
> against repeatedly, never gated on — plus the frozen v4 run and its caveats below).

**Historical source: `docs/PHASE_A_CLOSE.md` §5 (2026-07-14), frozen v3 held-out, measured read-only through
`lib/teacher/routing.ts` on the shipped un-starved path (`pool=20, ef=64, cap=2`).** These superseded the
2026-07-13 figures that CLAUDE.md/ROADMAP carried until that reconcile (§6), and were in turn superseded by the
2026-07-18 option-(c) measurement.

| category | n | HIT@1 | HIT@2 | role |
|---|---|---|---|---|
| verse-ref | 40 | 95% | 98% | **hard gate** |
| pericope | 15 | 87% | 100% | **hard gate** |
| proper-noun | 10 | 80% | 90% | **hard gate** |
| epistle | 25 | 72% | 88% | diagnostic (not a gate) |
| topical | 20 | 35% | 70% | diagnostic (not a gate) |
| control | 10 | clean 10/10 | hijacks=0 | guard |

- **Topical HIT@2 is 70, and 70 is NOT an improvement.** The earlier 75 was a 5-doc-pool artifact (the reranker
  had almost no pool); filling the pool to 20 surfaced the honest read (70). Do not file topical as "improved."
- **Epistle/topical are diagnostic, not gates** (ADR-022). At n=25/20 the 95% CIs — epistle ≈ [70, 96], topical ≈
  [48, 86] — both span 85, so neither is measurably at/below 85. **Unmeasurable at these n, not failed.** The
  honest next step is a larger v4 (n≈100/stratum) or a label-free gate (≥2 distinct grounded voices).
- **No longer current (2026-07-18):** the "git log … EMPTY" claim this line used to make is false — the
  `reconcile` branch changed retrieval (the sermon/theology register-lane architecture, ship option (c),
  ADR-023; 21 commits touch those paths). The current numbers live in **WORKLOG 2026-07-18**: the honest
  option-(c) v3 baseline (v3 is now a dev set) + the frozen v4 run.

- **v4 "clears every pre-registered bar except proper-noun" — the four caveats that must travel with that
  sentence** (added 2026-07-19; this page previously stated the headline with none of them, which reads far
  stronger than the evidence supports):
  1. **"Clears" means the POINT ESTIMATE clears, not proven-above.** Topical 90 and pericope 80 are point
     estimates whose 95% CIs **straddle their own bars** — not measurably above them.
  2. **v4's labels are KJV-phrase-anchored**, which makes the doctrinal strata *easier* than v3's abstract
     queries. The abstract-topical failure mode — the one v3 actually exposed — **is not exercised by v4.**
  3. **v4 samples ZERO Song of Solomon**, so `no-content 0/110` does **not** clear the known SoS hole
     (zero served exegetical rows for SoS remains an open gap). **And the hole is worse than
     "coverage" (verified 2026-07-19, ADR-028):** 0/4 SoS queries reach the no-content fallback —
     retrieval has no relevance floor, so SoS returns six NON-SoS sources (Barnes/Wesley on the New
     Testament, Chrysostom on Matthew/John/Acts). The user is still safe today only because the
     **verifier** rejects the result downstream. Evidence:
     `docs/evidence/part4/sos-fallback-verification.txt`.
  4. **The "disjoint" claim is overstated** — `HELDOUT_EVAL_DESIGN.md` asserts v4 is disjoint from v3 while
     its own caveats say otherwise, and the ADR-024 label anchor-check script was never committed, so v4
     label verification **is not reproducible from this repo**.

**Faithfulness (separate axis):** `interpretation_bait` 35/35 = 100% live through real `teach()`→verify, 0
breaches (PHASE_A_CLOSE §7). That is a **95% lower bound of ≈92%** (rule of three on n=35), **NOT ≥99%** — the
≥99% DoD needs ~300 clean cases. CLAUDE.md already states this correctly.

## 2. Corpus & prod DB — verified rows (`ground-truth.mjs`, 2026-07-15)

> **Two corrections (deep-audit 2026-07-24).** (1) This table's "verified against the running
> **prod** system" framing is inaccurate: `scripts/ground-truth.mjs` reads
> `web/.env.local` → the **DEV** branch (ep-tiny-hat), not prod. Read every row here as a DEV
> snapshot; the authoritative PROD state is the census (`docs/evidence/census/`, §2 note below).
> (2) It is now stale by a corpus rebuild: tonight's publish took **commentary to 5 published
> works / 84,292 sections** (was 2 / 27,283). Re-run `ground-truth.mjs` before trusting the
> counts below.


> **Prod cutover state, measured read-only 2026-07-23** (`docs/evidence/census/prod-census-2026-07-23.txt`).
> Prod is **pre-cutover BUILD state**: schema is **pre-migration-016** (no register source_type,
> no work column, no unit_ordinal, no library_items, no ingesting CHECK); **100% of the 190,635
> flat embeddings carry NO work key** (register ingest never ran on prod); the sections model holds
> only the **Barnes pilot** (2 sources / 5,510 sections). **Forbidden provenance is live on prod:
> 71,884 rows** (15,707 biblehub + 56,177 historicalchristian.faith) — real work, but **NOT part of
> the cutover**: E3 was dropped 2026-07-27 (owner) because it would drop 580 verses below the
> ≥2-distinct-authors floor and leave 24 with no served voice, and the cutover has no ingest step to
> refill them. The cutover is **E0, E1, E2, E4, E5, E6**; provenance cleanup is its own later slice.
> See the ADR-030 correction. **Live user data (G1 inventory):** annotations (highlights, notes,
> chats) **CLEARED 2026-07-28 by owner decision** — historical census was 34 highlights (6 users,
> **only 24 active**), 2 notes (1 user), 1 chat; 5 of the 6 "users" were `qa-hl-a-<epoch>` test
> residue. **`waitlist` (4 rows) and `channels` (1 row) were NOT cleared** and must survive cutover.
> **CORRECTION (gate A2, measured read-only on prod 2026-08-01): `channels` holds ZERO rows.**
> `waitlist` = 4 is confirmed; the `channels` 1-row claim is not. A read-only measurement cannot
> distinguish "deleted since" from "never true of this database". E1's preserve-these-rows assertion
> for `channels` is therefore vacuous at `0 == 0`, not preserving anything. The same run **confirms**
> every annotation table is genuinely empty and reproduces `api_rate_limit` = 41 rows / 8 distinct
> users. Evidence: `docs/evidence/a2-prod-readonly-2026-08-01/standing-gaps.md` §2.
> **E1's preserve-these-rows assertions are NOT relaxed** — annotations now hold at `0 == 0`;
> waitlist/channels must not change.
> **UNVERIFIED:** no deletion receipt or post-delete read-only artifact is committed, and
> `docs/evidence/cutover-2026-07-28/23-prod-readonly-AFTER.txt` still reports the pre-deletion counts.
> Treat "prod user data is empty" as owner-asserted, not as measured here. None
> of the dev-only suppression defects (chrysostom prolegomena, tennyson, traherne, indexes, ads)
> exist on prod. This settles build-vs-repair: **the cutover is a BUILD.** See `CUTOVER_DESIGN.md`.

### 2b. Prod DB post-Phase-2 cutover (2026-07-29) — evidence: `docs/evidence/cutover-2026-07-29/prod-E0-E6.log`

> **E3 does not exist** (ADR-030). **E5 (`deploy.sh`) never ran** (log line 729). **Deployed app is
> pre-cutover code** on post-031 schema — G4 note-saving window OPEN from E1 until E5 (log lines 335–337).
> **G7 live `/ask` never run** — E6 gate DB-ONLY (log lines 793–800). Rollback snapshot **KEPT**:
> `br-late-recipe-atxl68sh` (`pre-cutover-ep-odd-fog-atnykudm-20260729164220`, log line 50).

| fact | value | evidence |
|---|---|---|
| Schema | post-031 (migrations 016–023, 025–031 + 018/019 concurrent + 024 in E4) | log E1 lines 112–300, E4 lines 642–657 |
| E3 forbidden-provenance delete | **NOT RUN** — deferred slice | log dry-run lines 8–10; G6 ratchet 71,884 unchanged |
| Flat embeddings labeled (E2) | **77,820** rows updated; **112,815/190,635** remain unlabeled | log lines 384–406 |
| Sections after E4 | **72,863** sections; **5,824** reading units (`unit_ordinal` populated) | log lines 631–657, 732 |
| Forbidden flat provenance | **71,884** (unchanged vs E0 baseline) | log lines 90, 732–733 |
| Gill rows (smoke) | **28,843** | log line 732 |
| G1 user-data | **empty annotation baseline** — 0 highlights/notes/chats; **waitlist + channels in inventory** (live on prod, not cleared) | log lines 63–69, 746 |
| G2 ≥2 voices floor | **22,794** verses at floor; **29,629** with any voice | log lines 70–71, 747 |
| G2 durable floor (excl. forbidden) | **22,214** at floor; **29,605** with any voice | log lines 71, 748 |
| G5 register wall | **VACUOUS** — 0 lane/song slug rows (register ingest never on prod) | log lines 89, 767 |
| G6 barnes-notes sections-store | **1,300** staged sections, biblehub provenance — owner call | log lines 91, 769 |
| G8 sections↔embeddings | **72,863/72,863** — FK makes orphans unrepresentable; not proof of healthy slice | log lines 92, 770 + gate comment |
| G4 window | **OPEN** — deployed upsertNote rejected post-025 schema until E5 | log lines 335–337 |
| G7 live probe | **NOT RUN** (`CUTOVER_ASK_URL` unset) | log lines 96–102 |
| Protected snapshot branch | `br-late-recipe-atxl68sh` | log line 50; `docs/CUTOVER_DESIGN.md` PROTECTED BRANCHES |

**UNVERIFIED (owner decision sheet §1):** G1 does not assert row **identity** — only counts/digest; the historical
"37 user rows" invariant was never identity-proved on prod post-cutover. See `docs/OWNER_DECISIONS_2026-07-29.md` §1.

### 2d. Prod `sources.status` — published count (2026-08-01, gate A2)

> **Measured read-only 2026-08-01T05:03:53Z on `ep-odd-fog-atnykudm` as `app_runtime`**, under the
> owner's ⚑ go for gate A2. **This is tool output**, not a hand transcription: evidence at
> `docs/evidence/a2-prod-readonly-2026-08-01/census.txt`, order at
> `docs/pm/orders/2026-08-01-a2-prod-readonly.md`. Positive control fired (John Gill = 28,843).

| slug | `source_type` | `status` | sections |
|---|---|---|---|
| `adam-clarke` | commentary | **published** | 12,693 |
| `barnes-notes` | commentary | staged | 1,300 |
| `calvin-crosswire` | commentary | **published** | 5,090 |
| `jfb` | commentary | **published** | 15,473 |
| `john-gill` | commentary | **published** | 28,843 |
| `matthew-henry` | commentary | **published** | 4,210 |
| `wesley-crosswire` | commentary | **published** | 5,254 |

| fact | value | verified |
|---|---|---|
| `sources` total | **7** | ✅ measured |
| `status = 'staged'` | **1** (`barnes-notes` only) | ✅ measured 2026-08-01 post-flip |
| `status = 'published'` | **6** | ✅ measured 2026-08-01 post-flip |
| `sections` total | **72,863** | ✅ measured; per-source counts sum to 72,863 exactly |
| Publish flip on prod | **DONE 2026-08-01 20:32:31Z** | ✅ six works flipped, owner-executed; `evidence/work-order-v2-stage2/flip-after.log` |

**Nothing changed between 2026-07-30 10:09 and 2026-08-01 05:03.** The A2 reading reproduces the
2026-07-30 figures exactly, source for source. The open question this section carried — "whether
status changed after 2026-07-30 10:09" — is **settled: it did not.**

**Sequencing implication (unchanged).** Stage 2.2 `unit_ordinal` prod measurement requires
`published > 0`. Ordering verification on production is **downstream of publish flip**, not parallel to
instrument hardening. A2 ran the instrument over `--cohort=staged` (**PASS**, 7/7 works, rollup digest
`10cd5eb46c9e53cb4b7b980e38e4720f`, no scan truncation). The flip has since happened (A4, 2026-08-01
20:32:31Z), so the `published` cohort is now **RUNNABLE and still NOT RUN** — that is gate A5, one
read-only command. It is no longer blocked; it is simply outstanding.

**A2.3 finding, for A3 (not adjudicated here):** `barnes-notes` carries author string `Barnes' Notes`,
which matches no leg of `LEGAL_CORPUS_FILTER` — **1,300 sections, 0 admitted rows**. It is staged, so
`MASTER.md:37`'s published-but-not-admitted STOP has not fired; it would fire on a flip that includes
this work. Full table: `docs/evidence/a2-prod-readonly-2026-08-01/serving-census.md`.

> **Superseded, kept as history — the 2026-07-30 reading (ADR-042).** Measured read-only ~10:09 local
> during an unplanned Cursor session. **Not** instrument output — ad-hoc diagnostics + instrument
> positive control abort; the section said so itself. Recorded 7 sources / 7 staged / 0 published /
> 72,863 sections, all "recorded, not re-run here". **Last repo-authoritative prod census before
> that:** cutover E0–E6 log (2026-07-29), which reports 72,863 sections sliced but does not state a
> publish flip; E4 writes `status='staged'`. Every figure in it is confirmed by the A2 measurement
> above.

### 2c. Dev branch snapshot (historical — `ground-truth.mjs`, 2026-07-15)

| fact | value | verified |
| Legal commentary authors served | **11 distinct authors** (re-measured on dev 2026-07-20) — see note below | ✅ |
| `commentary_entries` | **371,406** rows | ✅ |
| commentary `embeddings` (user_id IS NULL, source_type='commentary') | **190,635** rows | ✅ |
| user rows in `embeddings` | **0** — no user row can be served as corpus | ✅ |
| vector index | **HNSW** present, ivfflat absent | ✅ |
| partial legal HNSW `idx_embeddings_vector_legal` (mig 012) | exists + `indisvalid=t` | ✅ |
| partial legal FTS `idx_commentary_fts_legal` | exists | ✅ |
| `legalBasePool(50)` | returns **50** (starvation fixed) | ✅ |
| `sources` / `sections`≈`section_anchors`≈`section_embeddings` (Barnes pilot) | 2 / **5,510 each** (equal invariant holds) | ✅ |
| App runtime connection | connects as **`app_runtime`**, `rolbypassrls=false` (RLS not bypassed) | ✅ |

> **The 9-vs-11-vs-12 author count, settled (dev, 2026-07-20; positive control fires, Gill=28,843).**
> `LEGAL_CORPUS_FILTER` (`web/src/lib/teacher/routing.ts`) names **9 author STRINGS** literally — Gill,
> JFB, Clarke, Henry, Chrysostom, Augustine, Barnes, Wesley, Calvin — and that "9" is what most docs
> mean and is not wrong *as a count of named strings*. But the filter's final leg admits by WORK
> (`SERVED_PROSE_WORKS`), and two of those works carry an author no other leg names: `keil-delitzsch`
> → "C.F. Keil & Franz Delitzsch" and `catena-aurea` → "Thomas Aquinas (comp.), trans. J.H. Newman".
> (`chrysostom-homilies`/`augustine-homilies` resolve to already-named authors.) So the filter ADMITS
> **11 distinct `metadata->>'author'` values**, measured. The stray **"12" is wrong**: it double-counts
> "C.F. Keil & Franz Delitzsch" as two people — it is a single author string, hence one voice. Use
> **11** for "distinct authors served"; use **9** only when explicitly meaning "author names written
> into the filter". Historical docs that say "9 authors" pre-date the work-leg expansion and are left
> as point-in-time record. Re-measured after today's suppressions, which did not change this set.

### 2e. Dev-only `unit_ordinal` drift (2026-07-31) — **REPAIRED**

> **Measured read-only on dev (`ep-tiny-hat`) via neonctl-minted `app_runtime`.** Production census:
> **0 published sources** (§2d) — these defects do **not** exist on prod. E0–E6 register never ran on prod;
> suppression scripts (`suppress-chrysostom-prolegomena`, `suppress-nonauthorial`, etc.) are hard-guarded
> to `ep-tiny-hat` only.

**Invariant (ADR-041 addendum):** order preservation, not dense 1..N. Instrument checks grouping +
reading-order preservation; uniform per-work offset is reported, non-uniform offset fails.

**Repair (2026-07-31, owner-authorized):** `scripts/repair-unit-ordinal.mjs` re-applied migration 024's
CTE chain with a slug-scoped `need` selector (024 alone cannot re-touch filled sources — idempotent by
exclusion). Weld detector was empty before apply (stored_units == computed_units). **61,486** sections
updated on each of:

| endpoint | Neon branch | instrument after |
|----------|-------------|------------------|
| `ep-tiny-hat` | `dev` | published cohort `ok=true` |
| `ep-tiny-bonus` | `ci-test-20260729` (CI `APP_DATABASE_URL_TEST`) | published cohort `ok=true` |

Production was refused (hard guard). Tool: dry-run default, `--apply` writes, rolls back if instrument stays RED.

**Works repaired** (section-level drift before apply): `chrysostom-homilies`, `edwards-works`,
`hodge-systematic`, `maclaren-expositions`, `owen-works`, `tennyson-in-memoriam`, `watson-works`.

#### Why CI went from red to green — the data moved, not the code

**`db-invariants` failed at `6896714` (Actions run 30613713514) and passed at `ac19935` (run
30650159435). It went green because the measured DATA was rewritten on `ep-tiny-bonus`
(`ci-test-20260729`, the CI `APP_DATABASE_URL_TEST` branch) and on `ep-tiny-hat` (dev) — not because
any code changed.**

This sentence exists because the diff invites the opposite conclusion. `ac19935` also edits
`scripts/lib/unit-ordinal-instrument.mjs` by 56 lines, sitting immediately beside the red→green
transition. The independent audit ruled that rival explanation out by loading both versions
side by side: the cohort recompute SQL is **byte-identical** (2790 chars both), and
`analyzeUnitOrdinalPreservation` and `measureUnitOrdinalForCohort` are unchanged — the +56 is a
refactor extracting `replaceNeedCte()`, and the test diff is purely additive. Same code, same
assertion, same query, different data.

The failure at `6896714` was exactly one test — the published-work leg, `1 failed | 220 passed |
3 skipped` — naming **six** works with non-uniform offsets:

| work | distinct `stored − computed` deltas |
|---|---|
| `chrysostom-homilies` | 2 — **(16, 17)** |
| `edwards-works` | 2 — (0, 1) |
| `hodge-systematic` | 3 — (0, 3, 6) |
| `maclaren-expositions` | 3 — (0, 1, 2) |
| `owen-works` | 5 — (0, 1, 2, 3, 4) |
| `watson-works` | 2 — (0, 1) |

**Six failed CI; seven were repaired.** The repair tool auto-selects on *any*
`sec.unit_ordinal IS DISTINCT FROM c.computed_unit_ordinal`, which is strictly broader than the
instrument's failure condition (NULL, duplicate pair, grouping break, order break, or **non-uniform**
offset — a **uniform** offset is reported and passed by design). `tennyson-in-memoriam` is the
difference: it carried drift of the one kind the instrument deliberately tolerates, a uniform
per-work offset, so it was in the repair's scope and never in CI's failure list.

**`chrysostom-homilies` is (16, 17), NOT a uniform +16.** The "+16 prolegomena" account is
incomplete: two distinct deltas means **two deletion points**. ADR-029's suppression of 95
prolegomena sections accounts for the 16. The second is `suppress-nonauthorial-matter.ts` removing
**6** further sections — ordinals 6608–6613, all `unit_ordinal=275`, all ONE unit ("Comparative Table
of the Works of St. Chrysostom"). Deleting a whole unit shifts every unit after it by exactly one
more, so sections before unit 275 drift by 16 and sections after it by 17. Verified by counting
chrysostom rows in `docs/evidence/part2/nonauthorial-matter-suppressed.jsonl`. The correction is also
recorded at the ADR-029 addendum, where a reader meets the "+16" story. A tidy story the measurement
contradicts is worse than no story.

**UNVERIFIED — do not upgrade without re-execution.** The **61,486** row count rests on the tool's
own log. The independent auditor had no dev credentials and could not reach either endpoint; CI
corroborates that the drift is *gone* on `ep-tiny-bonus`, not how many rows moved, and nothing in
Actions reads `ep-tiny-hat` at all.

**Defect class (standing hazard):** migration 024 backfill is idempotent by exclusion
(`WHERE unit_ordinal IS NULL`). Scripts that **delete sections after backfill** silently invalidate
stored `unit_ordinal` without re-running a slug-scoped repair — will recur on the next post-backfill
delete unless the suppression script re-invokes the repair.

**Front-matter (Stage 3.2):** at `b4596aa`, scan STOPs on **all 8 admitted hits**; strength computed but
does not gate. See `docs/evidence/work-order-v2-stage2/TRANCHE5-STASH-EVALUATION.md`.

## 3. Bible text plane — served from files, NOT a prod DB schema

- **No `translations`/`verses`/`books` tables exist in prod** (`SELECT 1 FROM translations` errors). Bible text
  is static JSON under `web/public/bible/`, fetched client-side. `docs/SCHEMA.md`'s relational Bible framing is
  aspirational, not deployed.
- **18 translations ship** (akjv, anderson, asv, bbe, bsb, darby, geneva, kjv, lsv, nheb, noyes, rotherham,
  rwebster, tyndale, ukjv, web, webster, ylt) — **not 22**. The license gate removed 4 (jubilee, leb, litv, mkjv;
  verified gone from `web/public/bible/`). Removed dirs are gitignored → reversible via re-ingest, not git.

## 4. Gates & safety — what's shipped and what's open

- **License gate (`web/src/lib/licensing.ts`, shipped 2026-07-14):** per-work `{license, commercial_use, source,
  verified_on}`; **block-by-default** — allow ships, conditional ships only if id ∈ `LICENSE_ACK`, deny/unknown/
  no-record block. `predeploy-gate.ts` reads it; the gate is **blind to UGC by construction** (imports no DB
  handle/blob store — red-proven in `gate-ugc-blindness.test.ts`). LITV/MKJV deny, LSV allow, LEB conditional,
  jubilee unknown→deny.
- **Verifier hole closed (PHASE_A_CLOSE §7):** `passages_grounded` grounds a passage **only** on source anchors
  (soft-boost `queryRanges` removed as an auth boundary); anchors must intersect their cited section
  (`anchor_offbase`). src↔web byte-identical.
- **CVE gate (`scripts/deps-audit.mjs`, 2026-07-14):** npm's retired audit endpoint (410) is bypassed via the
  bulk advisory endpoint; fails on un-ignored high/critical; honors `pnpm.auditConfig.ignoreGhsas`.
- **Phase A: CLOSED (2026-07-14).** Hard gates hold with no regression; deploy is permitted by the license gate.
- **Deploy (updated 2026-08-01 from the Vercel API; timestamps UTC):** real prod = the git-DISCONNECTED
  Vercel project **`web`** (`prj_Y9PVuNly5sSsf3NcvayS1vwE6FwR`, team `home-network-hardening`), serving
  **ancientpaths.app**. Last deploy **`24677ba`** (hero + nav labels), and **there are two deployments of
  that same sha** — which is where the 18th-vs-19th ambiguity in earlier revisions of this line came from.
  Both dates were right about different objects:
  - `dpl_FYQxxZ1rLN1wd4UeMwShhX12G5BM` — original deploy, **2026-07-18 22:32:21Z**.
  - `dpl_DwoWDhhZiLVLftKN9rcPiRU3v1qt` — **redeploy of the same sha, 2026-07-19 16:57:06Z, and this is
    the one that holds the alias.** It is the live production deployment.

  Rollback target is therefore **`dpl_EjzknRQEpaUXBG3YfjLhe8tKtpSr`** (`654f028`, 2026-07-17 01:32:56Z),
  the newest deployment whose code differs from what is live; see [`RECOVERY.md`](RECOVERY.md) §2.
  Deploys happen ONLY via `./deploy.sh` (`vercel --prod` from a clean worktree) — pushing `main` deploys
  nothing (see `docs/DEPLOYMENT.md`). SEC-1 gates public launch.

## 5. Sermon search — designed & measurement-proven, NOT built

- `docs/SERMON_SEARCH_DESIGN.md` is the **design of record — NOT approved to build** (corrected
  2026-08-01; this line previously said "the approved design", against that file's own `:3`, "Status:
  DESIGN — for the owner to react to, NOT approval to build". No ADR approves sermon search, and Lane B's
  B1/B2/B3 are still open owner decisions gating the build. `AGENTS.md:24` routes agents here over any
  doc's narrative, so this line being the less accurate of the two sent a compliant agent to the wrong
  conclusion.) It covers two spines, three modes, per-user brute-force + HNSW
  tripwire, model parity, trust boundary). **No user-corpus code or tables exist yet.**
- **Slice 0 (2026-07-14, frozen harness):** uncited-quote anchor **recall 90% chapter-level on a held-out n=30**
  (27/30, 95% CI [74, 96]) — clears the ≥70% bar with the CI lower bound above it. **Precision** trade curve:
  K=1 33% / K=2 68% / K=3 96%; recall K=1 93% / K=2 82% / K=3 75%. **Both bars (recall ≥70, precision ≥60) clear
  at K=2 and K=3** → Slice 1 is justified. Slice 1 (one type end-to-end) is the next build.

## 6. Corrections made this pass (doc → reality), with proof

| # | doc:claim (before) | corrected to | proof |
|---|---|---|---|
| 1 | `CLAUDE.md:12` / `ROADMAP.md:15` — topical HIT@2 **75→80**, epistle **84**, proper-noun H1 **70**, dated 2026-07-13 | topical **70**, epistle **88**, proper-noun H1 **80**, dated 2026-07-14 | `PHASE_A_CLOSE.md` §5 (supersedes ADR-018); `git log 38c7a85..HEAD -- web/src/lib` empty (unchanged since) |
| 2 | `ROADMAP.md:204` — "Bible content plane (**22 translations**), 244M" | **18** ship (4 removed by license gate) | `ls web/public/bible/` = 18 dirs; jubilee/leb/litv/mkjv gone |

## 7. Known open gaps (verified real, not yet fixed — none fixable read-only)

1. **`app_runtime` still holds INSERT/UPDATE/DELETE on `embeddings`** (SELECT-only on `commentary_entries`,
   `sources`, `sections`). `embeddings` is the servable corpus (190,635 rows, all user_id NULL), so a write grant
   there is a least-privilege gap on the most integrity-critical table. `ground-truth.mjs` finding #5. **Fix = a
   `REVOKE` (a prod GRANT change = a write), deferred** — must first confirm the ingestion path's role isn't
   `app_runtime`, or ingestion breaks. Owner action; draft, do not auto-apply.
   **CONFIRMED ON PRODUCTION (gate A2, 2026-08-01)** via `has_table_privilege` asked of the server: every cell
   above is accurate — `embeddings` YES/YES/YES/YES, the other three SELECT-only. A2 also establishes that the
   *read* path needs none of the three grants: all three A2 connections ran as `app_runtime` inside
   `SET TRANSACTION READ ONLY`. Evidence: `docs/evidence/a2-prod-readonly-2026-08-01/standing-gaps.md` §1.
2. **Bible not in a prod DB schema** (§3) — a framing lie in `docs/SCHEMA.md`, not a functional bug (files serve
   fine). Left as-is; noted here so no agent trusts the relational framing.
3. **SEC-1** — `better-auth 1.4.18` CVEs via `@neondatabase/auth` beta; blocks *public* launch. Interim question
   to Neon pending (`docs/SECURITY.md`, `OWNER_ACTIONS.md` §2).
4. **CI (`db-invariants` job)** — **VERIFIED in GitHub Actions** (work-order v2 Stage 1, run
   `30523549298` on sha `ae1d4a7`, push event). With secrets configured: **38 suite files executed**
   (37 passed + 1 artifact NOT RUN: `verse-keys.test.ts` gitignored corpus). **`sections-unit-ordinal.test.ts`
   ran and passed (2 tests, 206ms)** — first execution verification of ADR-026 ordering property in CI.
   Round 3 (same PR): skip ceiling exempts artifact skips via `loud-skip-manifest.json` from
   `announceSkip`; `pull_request` trigger removed (ADR-040) so one check run per job per sha.
   Owner action if secrets missing: `OWNER_ACTIONS.md` §1.
