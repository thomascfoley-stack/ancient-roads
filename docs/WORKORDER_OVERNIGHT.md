# Work Order — Overnight (2026-07-11 → 12): grow the corpus, fix safe bugs, ship

**Mission:** MORE content across MORE traditions (archive.org primary adapter); fix the safe bugs; deploy;
verify live + mobile. Owner asleep; success = the live gated site is usable on mobile web in the morning.

**Rails:** CLAUDE.md + quality-slice. Design-doc → build for retrieval/data-model. Commit+push per change.
Verbatim only, never paraphrase a source. Park genuine forks, never guess/stall. Do NOT gut the reader,
delete content, publish anything failing a gate, touch the verifier/compose path, or implement the
tradition-aware diversity metric (owner's unmade decision).

**Pre-authorized auto-publish** (all gates or quarantine): licence recorded · provenance (permitted source +
translator/editor + edition year ≤1929) · shingle text-match proof · coverage gap = 0 · tradition tagged.

---

## ★ END-OF-SHIFT VALIDATION (QUEUE #4 · 2026-07-12) — ALL GREEN

**Theme: three live integrity defects fixed, and Phase A measured to completion — the topical/epistle bar is
NOT reachable tonight (epistle needs a latency-optimized recall index; topical is at the retrieval ceiling and
needs a feature), and the $4 re-embed was correctly disproven. `docs/PHASE_A_DIAGNOSIS.md` has the full matrix.**

| § | What | Status |
|---|---|---|
| §0 | Concordance resharded 13,480 → **296 files**; stray scratch file removed | ✅ shipped, verified |
| §1a | **Reader served the raw corpus** (Origen, Tyndale, "CS Lewis via Screwtape a devil") — now filtered to published authors; pickDiverse ranks by primacy | ✅ **live-defect fixed**, verified 390px |
| §1b | Search predicate served **6 of 9** (Barnes/Wesley/Calvin = 0 rows on a name/URL mismatch) — now 9; PRESENCE tests added | ✅ fixed, seed-the-bug proven |
| §1c | 378/401 authors are "Patristic" — reported; tradition schema proposed | ✅ in AUTHOR_TRIAGE.md |
| §2 | **Phase A measured to completion** — NOT content/re-embed. Epistle→85 is a RECALL fix (iterative_scan → 92) but costs 2.5× latency (reverted); topical is at the retrieval CEILING (needs a feature). | ✅ diagnosed; fix designed+parked |
| §3 | Do NOT build the Torrey router | ✅ ADR-017 |

- **`npm run audit`:** ✅ all gates green (incl. the new presence tests; the behavioral licensing invariant
  caught + I fixed a Barnes-alias regression).
- **§2 diagnosis (the headline):** the index is already HNSW (not ivfflat — schema.sql stale); pool sweep
  20/50/100 flat, 200 worse; the failing topical labels are **present in the vectors and rank #1–#32** yet
  return voices=0 → reranker/selection demotes them. Confirmed: `--no-rerank` lifts topical H1 35→50,
  proper-noun 70→90. **Re-embed disproven.** Full writeup `docs/PHASE_A_DIAGNOSIS.md`.
- **Deploy:** the §1 live-integrity fixes deployed at end of shift (see the QUEUE #3 stamp's deploy notes for
  the `--archive` mechanism; the reshard makes it non-load-bearing). Reader now shows only the 9 published
  authors per verse — **safe but sparse; expand via AUTHOR_TRIAGE.md promotions (owner's call).**

**OWNER DECISIONS QUEUED (§7):**
1. **AUTHOR_TRIAGE.md** — rule on the 315 pre-1929 PD candidates (Poole 31k, Geneva 31k, Cambridge, Pulpit,
   Benson, Bengel, K&D…) to un-sparse the reader; verify the Barnes/Wesley/Calvin biblehub editions; decide
   the Catena-Aurea derivatives; approve the tradition enum.
2. **Phase A** — two designed slices in `docs/PHASE_A_DIAGNOSIS.md`: (a) epistle→85 = a partial legal HNSW
   index (fast, high-`ef` recall) via `legalBasePool`, measured on a fresh v4; (b) topical→85 = a *feature*
   (query-expansion / attributed topical index / thematic re-embed), not a knob. NOT a re-embed, NOT a router.
3. **§3 content ingest** (from queue #3) — verse-aligned staged ingest of Ryle-on-John; match gate PASSES.

---

## ★ END-OF-SHIFT VALIDATION (QUEUE #3 · 2026-07-12) — 7 of 9 sections, ALL GREEN

**THE CONTENT P0 WAS NEVER BLOCKED.** Last night's 9.3% compared Ryle-on-**JOHN** vs Ryle-on-**LUKE** (two
Gospels). Printed the title pages this time. True John Vol I twin = **43.5%** vs ~9% different-work. New rail:
*LOOK AT THE DATA BEFORE YOU PARK.*

| § | What | Status |
|---|---|---|
| §1 | Word-click bug → single-word `WordPanel` | ✅ shipped, verified 390px+desktop |
| §2 | Commentary search: partial legal index (10×, **live on prod DB**) + capped count | ✅ shipped, verified |
| §3 | Content unblock: `tokenListOcr` + title guard + calibrated bar (21%) | ✅ tooling shipped; **verse-aligned staged ingest = next slice** |
| §4 | Concordance index (13,480 files) + "appears in N verses" in WordPanel | ✅ shipped, verified 390px |
| §7 | Licensing: false "public-domain" attribution → accurate CC BY/BY-SA credits | ✅ shipped, verified |
| §8 | CLAUDE.md "retrieval 10/10" lie fixed · ROADMAP reconciled · 3 docs stamped SUPERSEDED | ✅ shipped |
| §5 | Topics via CrossWire Torrey (`/topics`) | ⏸ NOT STARTED — next slice (multi-hour build) |
| §6 | Circularity number: overlap(Torrey refs, WSC proof texts) | ⏸ NOT STARTED — depends on §5 data |

- **`npm run audit`:** ✅ all gates green (typecheck root+web · lint · knip · pnpm audit · full vitest+coverage
  incl. new calibration tests · qa invariants · Gate B license).
- **Prod DB:** partial legal FTS index (migration 009) is **live** — commentary search is already 10× faster.
- **Deploy:** ✅ DEPLOYED (`web-psi-eight-83.vercel.app`, READY). The concordance's 13,480 files pushed the
  upload past Vercel's 15,000-file limit (18,910 total) — fixed `deploy.sh` with `--archive=tgz`. Live smoke:
  `/`→200 via gate · `/gate`→200 · unauth `/api/ask`→401 · new routes (`/api/search`, `/concordance/*`) sit
  correctly behind the site gate (307). Every feature was verified locally at 390px+desktop before deploy.
- **Stray file surfaced:** `.audit-q.mjs` (untracked ad-hoc DB-query scratch, not authored by me) was blocking
  the deploy clean-tree guard — gitignored (preserved on disk, not deleted). Remove it if it's not yours.

**NEXT SLICES (owner or next session):**
1. **§3 verse-aligned staged ingest** of Ryle-on-John — passage-range entries, N=20 spot-check, staged NOT
   published (structure documented in `CONTENT_RECOVERY_PIPELINE.md` §3-unblock). The match gate now PASSES.
2. **§5 Torrey topics** — parse Torrey New Topical Textbook (CrossWire PD) → static TS mirroring
   `pericopes.ts`; `/topics` + `/topics/[slug]` → legal-filtered voices. Zero retrieval code. Needs CrossWire
   fetch/parse tooling (check `diatheke`/`libsword` availability first).
3. **§6** — once §5 lands, compute set-overlap(Torrey refs, WSC proof texts) per doctrine; record the number.

---

## ★ END-OF-SHIFT VALIDATION (QUEUE #2 · 2026-07-12) — ALL GREEN
- **Full suite + `npm run audit`:** ✅ AUDIT PASSED — all gates green (root 192 · web qa 18 · rate-limit 5 ·
  typecheck strict root+web · lint · knip · pnpm audit · licensing fail-closed).
- **v3 re-measure (§2):** ✅ zero drift — verse-ref 95 / pericope 87 / proper-noun 70 / epistle H2 84 /
  topical H2 75 / control 10-10. Byte-identical; no retrieval change this session (diff-verified).
- **Live prod smoke:** ✅ `/`→200 via gate · `/gate`→200 · unauth `/api/ask`→401 (existing deployment; no
  product change shipped tonight, so no new deploy).
- **Real app run (§5):** ✅ booted dev, `/ask` `/read` `/library` clean at 390px + desktop; real query
  "good shepherd in John 10?" → John 10:11, 3 voices/3 traditions, verbatim+attributed, no forbidden author.
- **Tree clean + pushed:** ✅ 6 commits pushed to origin/main (`574b55b..dfa43dd`), working tree clean.
- **Pre-commit hook (§6):** ✅ installed + proven (blocks lint errors under macOS bash 3.2).

**What needs YOU (owner decisions, in priority order):**
1. **Content is blocked on OCR** (§1/§7) — build the OCR-normalizer slice, or resolve the CCEL clean-text
   terms-fork. All archive.org anchors fail the pre-registered cross-copy bar until then. Nothing was loosened.
2. **CI runs zero of the two existential behavioral invariants** (§4 F1) — wire a Neon test branch +
   `APP_DATABASE_URL` secret into `audit.yml` so licensing + tenancy actually execute in the gate.
3. **Three fresh-ingest forks** (§7 A/B/C) still gate the new-tradition mission.
4. **Library dropdown lists forbidden authors** (§5, UI-only, not a leak) — task chip spawned.

---

## 1. Content published (morning review)
**None.** The new-tradition mission requires archive.org **fresh** ingest, which hit **three genuine forks I
would not guess** (`docs/ARCHIVE_ORG_INGEST_DESIGN.md`). Publishing noisy-OCR, possibly-misaligned text into a
verbatim/attributed corpus on a guessed match-proof would violate *verbatim only / never guess / quality over
count / gate discipline*. I confirmed the data is reachable (correct PD editions: a Lapide Mossman 1908, Ryle
1857, Menno Funk 1871), designed the adapter, and proved with a POC that naive OCR containment does NOT
discriminate (same-edition 5% < different-work 9.5%) — so the OCR matcher is real engineering, not a
formality. **Three owner decisions unblock a clean build (see §7).**

## 2. Quarantined (reversible) + why
_(none — nothing ingested)_

## 3. Safe bugs fixed (none touch content/verifier)
| Item | What | Verified |
|---|---|---|
| **H1** | `getMessages` (+`getChatMemories`): added explicit `AND user_id =` belt (RLS-inert owner fallback no longer leaks another user's messages) | typecheck |
| **H2** | `addMessage` (+`addChatMemory`): IDOR-write guard — `INSERT…SELECT…WHERE EXISTS` owner check; 0 rows ⇒ throw | typecheck |
| **H4** | Rate limiter now checks the **minute bucket first**, only bumps the day bucket for requests that clear it — a min-refused burst no longer burns daily quota. + regression test | vitest (5) |
| **M4** | `/api/eval/bait` hard-gated `404` in `NODE_ENV==='production'` (paid endpoint, local-only) + 500-char cap | typecheck |
| **M8** | `api_rate_limit` opportunistic sweep (1% of checks, index-served, error-swallowed) — bounds table growth; no cron infra needed | typecheck |
| **D6** | `RATE_LIMIT_DAY` copy no longer references a nonexistent "beta" | typecheck |

Committed as one logical change (all 6 safe bugs). `npm run audit` green. Live behavioural verification of
H1/H2/H4 deferred to the deploy step (needs a session); the logic is unit-tested/typechecked.

## 4. Accuracy — before / after (frozen v3 through shipped path)
**No corpus/retrieval change occurred this session** (ingest parked; §4/§5/§6 touch tests, docs, skills, and
the pre-commit hook — nothing on the embed→inject→rerank→selectDiverse path; diff-verified). §2 **re-measured
frozen v3 through the shipped shared routing anyway** as a regression guard (`--v3`, retrieval-only):

| Category | last recorded | **re-measured 07-12** |
|---|---|---|
| verse-ref (HIT@1) | 95 | **95** |
| pericope (HIT@1) | 87 | **87** |
| proper-noun (HIT@1) | 70 | **70** |
| epistle (HIT@2) | 84 | **84** |
| topical (HIT@2) | 75 | **75** |
| control | clean | **10/10, hijacks=0** |

**Zero drift — byte-identical.** Confirms the night's work did not perturb retrieval and there is no
regression. The "more voices should raise topical/epistle" lift is still pending the (parked) content ingest.

## 5. Deploy + live verification
Deployed via `./deploy.sh` (kept `SITE_PASSWORD`). **Live prod HEALTHY:** `GET /` → 307 → /gate (gate wall
live) · `GET /gate` → 200 (`SITE_PASSWORD` set) · unauth `POST /api/ask` → 401 · `/api/eval/bait` → 401 (the
site gate intercepts before the route, so M4's prod-404 sits correctly behind it). Prod alias
`web-psi-eight-83.vercel.app` → READY. **No rollback** (owner-confirmed: healthy).

**⚠️ INCIDENT (owner-guarded).** My `deploy.sh` run uploaded a **dirty working tree** — it also shipped a
concurrent Cursor session's uncommitted work-in-progress (`legal-corpus.ts`, the `commentary-search.ts` legal
filter, `web/test/…`). Those turned out to be a *legitimate fix* (the search endpoint is now legal-only), and
prod is healthy, so per owner guidance it stays. It is now **guarded**: `deploy.sh` (commit `dc4ba23`) aborts
on any uncommitted/untracked file — `vercel --prod` uploads the working tree, so nothing can reach prod that
isn't in git. Residual: prod ran ahead of git briefly; the guard forces the concurrent session to commit its
work before its next deploy. I committed only my own files (never the concurrent session's WIP).

## 6. Mobile (390px) findings + fixes — CLEAN PASS, no fixes needed
Checked the three key pages at **390×844** in a real browser:
- **Reader** (`/read/...`, Romans 8): readable serif body, verse numbers, header controls (Aa / original /
  translation) and the bottom tab nav all fit. Usable.
- **`/ask`** (Explore): title, subtitle, TRY suggestion cards, and the ask box (with send hints) all fit. Usable.
- **`/library/commentaries`**: search, book/chapter/source dropdowns, "Open in reader", and the commentary
  cards (author + tradition tag + verse-numbered text) all render single-column and readable. Usable.
- **No horizontal overflow** (`documentElement.scrollWidth == innerWidth == 390` on the busiest page).
The earlier mobile pass holds up — nothing egregiously broken (no overflow, no unreachable controls, no
unreadable text), so no changes were made (the rail is "make it usable, don't redesign").

## QUEUE #2 (2026-07-12)
**§3 git==prod + deploy — DONE.** Committed the concurrent session's live legal-only search fix
(`commentary-search.ts` → `LEGAL_COMMENTARY_ENTRIES_PREDICATE`, `legal-corpus.ts`) + its QA harness so git
matches prod. **Found + fixed 3 silent breakages in that harness** (it was committed red): (1)
`web/vitest.config.ts` used `__dirname` (undefined under ESM) → `@` alias 404'd; (2) root `vitest.config.ts`
had no `include` → its default glob swept `web/test/**` without the alias; (3) `web/tsconfig.json` typechecked
`web/test/**` in `next build`, and `corpus-scan.ts` imports root `src/ingest` which doesn't exist in Vercel's
web-only build — **this failed the first deploy** (local `next build` passed, remote errored). All fixed;
audit GREEN (root 192 · web QA 18 · rate-limit 5); deploy `574b55b` READY + aliased; live healthy (307/gate ·
/gate 200 · unauth /api/ask 401). "New authors appear in answers" is N/A tonight — no content published, and
fresh works ship staged/unserved.

## §1 CONTENT — Ryle (proof-of-pipeline)
**Fork-A cross-copy proof — PRE-REGISTERED THRESHOLD (before measuring, no tuning):** two *independent*
full-text scans of the same edition must have **3-gram shingle-hash containment ≥ 0.55** (mutual: the smaller
set contained in the larger). Rationale: independent OCR scans of the *same* text share the vast majority of
3-grams (identical wording; only OCR noise + pagination differ), while a paraphrase / different translation /
OCR garbage shares far fewer; 3-grams are OCR-robust (one bad char breaks fewer shingles). Sanity floor: a
different work must be < 0.20. Independence verified: `expositorythough05ryle` (1857, Princeton, archive.org
OCR) vs `expositorythoug05rylegoog` (1859, Oxford, Google OCR) — different institution + OCR engine.

**RESULT — FAILED the bar, PARKED (did not loosen the threshold).** Measured cross-copy containment = **9.3%**
(bar 55%) — barely above the different-work floor (~7–9%). Confirmed both scans ARE the same work (both Ryle
on John; the Google scan shows "John V. 1—10" headers), so 9.3% is a genuine **OCR-match failure**, not a
wrong pairing. **Root cause (the real finding):** two independent OCR engines produce different character
errors AND different layout artifacts — line-break hyphenation (`under- taken` → `under taken` vs
`undertaken`), page numbers, running headers — so few exact 3-grams survive across both scans. The shingle
matcher was built + validated on **clean** text (helloao → 100% repair); it does **NOT** tolerate OCR as-is.

**Implication — CONTENT IS BLOCKED tonight, and it is a real slice, not a rush:**
- All archive.org anchors (Ryle, a Lapide, Haydock, Lightfoot, Westcott, Poole) are OCR → same failure. Moving
  to the next OCR work does not help; the blocker is the matcher, not the work.
- The fix is **OCR normalization before shingling** — de-hyphenate line breaks, strip page numbers / running
  headers / short lines, collapse common OCR substitutions — then re-pre-register a threshold and re-measure.
  This is genuine engineering (own slice), not a night's rush, and I will not fake a pass by loosening the bar.
- The clean-transcription path (owner's fork-A condition 2) — Ryle/Spurgeon/Poole on **CCEL** as hand-typed
  HTML — would match cleanly, but CCEL is the P0.1 terms-fork (do not build until its terms are verified).
- **No content was ingested, staged, or published.** Moving to the tail tasks (§4–6) per "content can die,
  the tail absorbs the night." **Owner decisions needed (§7):** build the OCR normalizer (own slice) and/or
  resolve the CCEL terms-fork so clean transcriptions unblock the whole tier.

## §4 — FALSE-CONFIDENCE TEST AUDIT — DONE (skill + run + fixes)
Wrote `.claude/skills/false-confidence-audit/` (taxonomy of 7 fake-test smells + the seed-the-bug proof
discipline) and ran it across all 26 test files. Full report: `docs/FALSE_CONFIDENCE_AUDIT.md`. The owner's
named offender (`licensing.test.ts` `expect(baseline).toBe(263496)`) was **already fixed** by the QA-harness
session (now an honest skip). Findings:
- **F2 (H1) FIXED + proven** — `get-messages-filters-by-user-id` asserted only `sql.toMatch(/user_id/)`
  (passes on the decoy `WHERE user_id IS NOT NULL`). Now captures bound param VALUES and asserts the caller's
  id is bound to `user_id = $N`. Seeded the decoy → red; reverted → green; `chat.ts` diff clean.
- **F3 (wallet) FIXED + proven** — `includes('requireUser')` matched the IMPORT, so a deleted/after-teach()
  call passed. Now asserts the CALL exists and precedes `teach(` (comment-stripped). Seeded call-removal →
  red (old check still saw the import); reverted → green; `ask/route.ts` diff clean.
- **F4 (evals) FIXED** — `toBeTruthy()` on a failure-reason string → `toContain('<check>')`.
- **F1 (HIGH) PARKED — owner infra decision (below).**

## §5 — RAN THE APP (booted dev server, looked at 390px + desktop, real query end-to-end)
Booted `theology-dev` (Next 15.5 turbopack, ready ~1.3s, local gate open). Added the mobile+desktop "load it
and look" clause to **CLAUDE.md DoD** and the **quality-slice** skill.
- **/ask** — clean at 390px (parchment/ink/oxblood tokens, serif, no overflow) and at desktop 1280 (sidebar +
  main two-pane). No console errors. *Minor:* at an extreme ~301px-wide × short viewport the fixed composer
  overlaps the 3rd suggestion card; at the 390px target and desktop it does not. Low priority.
- **/read/jhn/10** — clean: verse-numbered WEB text, Aa/original(Greek)/translation controls, readable serif.
- **/library/commentaries** — renders (401 sources, book/chapter/source facets). **FINDING (below).**
- **Real query end-to-end** — "good shepherd in John 10?" via the bait harness (UI `/api/ask/stream` correctly
  411→401 without login; I must not authenticate, so I drove the REAL `teach()` through the
  EVAL_HARNESS_SECRET-gated harness). Result: **retrieval CORRECT (John 10:11)**, 3 voices / 3 traditions
  (Barnes-Presbyterian, Clarke-Methodist, Calvin-Reformed), all verbatim + attributed, framing descriptive
  not interpretive ("The following excerpts present…"), **no forbidden author**. Pipeline healthy.

### FINDING (§5) — library source dropdown lists FORBIDDEN authors (UI only, NOT a content leak)
`/library/commentaries` builds its "sources" facet from the static `web/public/commentaries/_manifest.json`,
which still lists `Tyndale Study Notes` and `Tyndale Open Study Notes` (both `MUST_NOT_SERVE`). So the UI
offers them as filter options and discloses the names. **Verified behaviorally that NO content leaks:** the
live search API returns `{"results":[],"total":0}` for `?author=Tyndale Study Notes`, and 0 Tyndale hits in an
unfiltered `q=faith&limit=100`. Root cause: the manifest facet source isn't run through the legal filter that
results are. **Fix (parked — data-path/module-boundary):** either (a) regenerate `_manifest.json` at ingest
excluding non-published authors (cleanest), or (b) filter the facet list at read — but `isMustNotServeAuthor`
lives in `legal-corpus.ts`, which re-exports server-only `teacher/routing`, so a client fix needs a
client-safe forbidden list or the manifest-gen fix. Not a rush; existential rail intact.

## 7. Parked / worries
### OWNER DECISION — CI does not run the two existential behavioral invariants (§4 F1)
`web/test/invariants/licensing.test.ts` (Tyndale never served) and `tenancy.test.ts` (two-account isolation)
are `describe.skipIf(!dbUrl)`; **CI runs `pnpm run audit` with no DB, so both skip and the gate is green
having run zero of their assertions.** `predeploy-gate.ts` enforces only the STATIC ratchet, not these — so
the licensing + tenancy guarantees run **nowhere automatically**. Not a broken test; a missing environment.
I did NOT turn CI red overnight or fake a pass. **Recommend (A)** wire a Neon test branch + `APP_DATABASE_URL`
secret into `audit.yml` so they run in CI; **(B)** defense-in-depth: extend `predeploy-gate.ts` with a
DB-backed legal-pool assertion (design-before-code — warn-not-block if DB down). Detail: `docs/FALSE_CONFIDENCE_AUDIT.md` §F1.

### THREE OWNER DECISIONS (unblock the whole content mission)
Full detail in `docs/ARCHIVE_ORG_INGEST_DESIGN.md`. Each would corrupt a verbatim corpus if guessed:
- **FORK A — "shingle text-match proof" is undefined for a FRESH work** (nothing stored to match against).
  Recommend **cross-copy containment** (two independent PD scans of the same edition) — but the POC shows it
  needs section-alignment + threshold calibration, not naive containment. Confirm this satisfies the gate.
- **FORK B — OCR→verse-alignment is unreliable and this corpus is VERBATIM.** A wrong boundary = words
  attributed to the wrong verse (the one thing the product must never do). Recommend fresh archive.org works
  ship **staged** (NOT auto-published) until a validation pass — i.e. fresh ingests are outside the
  auto-publish pre-authorization; only provenance-*repairs* (no re-parse) are covered.
- **FORK C — non-verse `theology` works (Menno, mystics) have NO retrieval path.** Retrieval is entirely
  `verseId`-keyed. Ingesting them today = stored-but-never-retrieved. Needs the topical/`theology` retrieval
  design first. Menno Simons is blocked on this independent of A/B.

**Worry:** the content mission cannot advance to *new traditions* without these three decisions — they are
inherent to fresh-ingest, not avoidable. Provenance-repair of the existing (Reformed/patristic) tail is
fork-free but adds no new tradition. **Recommended first slice once A+B land:** J.C. Ryle on one Gospel
(single clean Anglican volume), shipped staged with an alignment validation pass.
