# Sermon uploader + search — deep dive, findings, and enhancement plan

**Date:** 2026-08-20 · **Lane:** B (gate B5) · **Method:** 7-lens parallel deep audit (attack
surface · data layer · pipeline · trust boundary · docs-vs-reality · client · test honesty), plus
four live measurement runs against the shipped pipeline.
**Measurements:** [`docs/evidence/uploader-deep-dive-2026-08-20/MEASUREMENTS.md`](../../evidence/uploader-deep-dive-2026-08-20/MEASUREMENTS.md)

**Nothing here is fixed.** This is a findings list for the owner to direct, per deep-audit's
"present the list, do not start fixing".

---

## 0. The finding that reframes the rest

**The uploader is built well and is being judged by documents that describe a different product.**

The code is among the most careful in this repo — the queue's status walk, the atomic
`storeSections`, the derived model slug, the branded `CorpusPredicate`, the honest "detection is not
built" comments. Three separate lenses independently reported that the shipped modules *say what
they do not do*, in the right places.

The documents do not. `docs/STATE_OF_TRUTH.md:429` — the file `AGENTS.md:24` designates as the page
to trust over any narrative — says **"No user-corpus code or tables exist yet."** The feature has
been live on production since 2026-08-05. `MASTER.md` B5 says the tradition-gap join is *gated*; it
is deployed and I measured it returning 16–23 authors per document in ~2 s. An agent that reads the
board correctly, as instructed, concludes the entire feature is unbuilt.

Two consequences to act on before anything else:

1. **A required pre-ship measurement was skipped and has now been taken.** `UPLOADER_DESIGN.md`
   §Q6/A9 required "one more frozen held-out run … through the SHIPPED ingest path, before
   multi-user ship". Multi-user shipped 2026-08-05 without it. It is now run: **70% chapter-level
   recall at the shipped K=3 against a pre-registered bar of ≥70%.** At the bar, not above it.
2. **The §4 ship gate was never satisfied as written**, while `USER_CORPUS_MULTI_USER=true` is set
   on production. Its condition 1 (the Better Auth cutover) was *reversed* by ADR-107/108; its
   condition 2 (Neon's written confirmation on file) has no file. The real basis is a separate
   owner ruling at `SECURITY.md:100`. §4 carries no amendment recording any of this.

---

## 1. Remediation checklist — severity-ordered, deduplicated

### CRITICAL / HIGH

- [ ] **H1 — Every My Works search returns exactly one result.**
      `web/src/app/api/user-corpus/search/route.ts:54-55`. `Number(params.get('limit'))` is
      `Number(null)` = `0`; `Number.isFinite(0)` is true, so `limit: 0` reaches `clampLimit`, which
      floors to **1**. `scope.limit ?? DEFAULT_LIMIT` (`search.ts:247`) cannot rescue it — `??` only
      catches null/undefined. The shipped client never sends `limit` (`my-works.tsx:215`).
      **Proven by execution:** route-built scope → 1 result; limit omitted → 20. Hits all three
      modes: fused, keyword, and verse presence. This is the primary search surface of the feature.

- [ ] **H2 — Documents strand in `chunking`/`embedding` with no path out.**
      `queue.ts:56-59` (claim) and `:84` (reap) both filter `status = 'parsing'`, but `processOne`
      writes `'chunking'` (`:120`) then `'embedding'` (`:147`) — and embedding is the longest phase,
      so it is the one running when a serverless function is killed. Such a row is invisible to both
      recovery mechanisms, outside `user_documents_queue_idx`, counted forever in `queueStats`, has
      **no retry control** (`my-works.tsx:422` renders it only for `failed`), and cannot be
      re-uploaded (checksum dedupe returns 200 "already uploaded"). **Observed, not theorised:** a
      row stuck in `embedding` for 3.66 days on dev. The module header claims "NOTHING IS EVER
      SILENTLY DROPPED"; `queue-never-drops.test.ts` seeds only `queued` and `parsing`.

- [ ] **H3 — The model-parity check is tautological at both shipped call sites.**
      `related-voices.ts:86`, `suggested-readings.ts:111` call `isJoinable(slug, EMBEDDING_DB_SLUG)`
      — our own constant on both sides. `model.ts:60-67` forbids exactly this in bold. Nothing in
      `web/src` ever reads `embeddings.metadata->>'model'`. The guard test asserts
      `isJoinable.length === 2` — arity, which cannot see a wrong argument. Delete both guards and
      the suite stays green. Failure mode: re-embed the corpus on any other 1024-dim model and the
      join silently compares two vector spaces forever.

- [ ] **H4 — The verifier does not branch on `origin`; §7(b)/(c) are unenforced.**
      `src/verifier/v1.ts:288`, `:329-330` build `groundingRanges`, `usedTraditions` and
      `distinctVoiceSections` from all voice blocks with no origin predicate; `origin` is used at
      `:71` as a map key and nowhere else. **Proven by running the shipped `verifyV1`:** three user
      uploads and zero corpus rows returns `{ok:true}` with `authorCount: 3`. Compounded by
      `normalize-contract.ts:110-116`, which stamps `origin: 'corpus'` unconditionally *before* the
      verifier sees it. Not reachable today (retrieval is corpus-only) — Slice 4 walks straight into
      it. Fix before the join lands, not after.

- [ ] **H5 — Upload spends money with no limiter, no quota, and the wallet invariant cannot see it.**
      `upload/route.ts` has no rate limit. `web/test/helpers/routes.ts:55-61` decides "does this
      route spend" by looking for `@/lib/user-corpus/embed` **in the route file**; upload reaches
      `embedChunks` one hop away through `drain`, so `wallet.test.ts` classifies the single largest
      spender as non-spending. `documents/[id]` POST zeroes `attempts`, so `MAX_ATTEMPTS = 3` is not
      a spend ceiling. No per-account document, byte, or chunk quota exists anywhere —
      `UPLOADER_DESIGN.md` §2 documents a five-row quota table and `grep -rni quota web/src` returns
      nothing.

- [ ] **H6 — Search errors crash the entire page.** `my-works.tsx:218-219` casts the response as
      `{error?: string}`, but the search route returns `apiError`, whose envelope is
      `{error: {code, message}}`. `setSearchNote(d.error)` stores an object; `{searchNote}` at `:342`
      throws "Objects are not valid as a React child" and the root boundary replaces the whole page.
      Two ordinary triggers: a query over 500 chars (the input has **no `maxLength`**), and any 429
      — including one from `checkCorpusSearchRateLimit` failing closed on a transient DB error.

- [ ] **H7 — Four `r.json()` calls sit outside their try blocks.**
      `my-works.tsx:144, 169, 218` and `suggested-readings.tsx:44`. A non-JSON body throws before
      any `r.ok` check: the document list becomes a permanent `aria-busy` skeleton with no recovery
      control, an upload is silently discarded with the label flicking back to "Add a document", and
      a search renders nothing at all. Reachable through the site gate itself — an expired gate
      cookie redirects and `fetch` follows it, returning gate **HTML with status 200**. The comment
      at `:127-130` claims this class is fixed; the `try` wraps only the `fetch`.

- [ ] **H8 — The readings endpoint is re-entrant and each entry runs a 300 s unindexed corpus scan.**
      `readings/route.ts:78` writes `'pending'` before kicking the job while
      `readingsRunRefused` only rejects `'running'`, so back-to-back POSTs all pass. Each runs
      `SET LOCAL enable_indexscan = off` over the whole served `embeddings` table with
      `maxDuration = 300` and no rate limit.

- [ ] **H9 — `relatedVoices` runs three `LIMIT 300` corpus sweeps per document view with no
      `ef_search` control.** `related-voices.ts:101-123`, `maxDuration = 30`. No shipped HNSW index
      matches its predicate, and every other vector call site in the repo sets the GUC
      (`routing.ts:325`) precisely because the default starves. Its sibling module measured **0 of
      60** rows on a category filter and disabled index scans to escape it. *Needs an
      `EXPLAIN (ANALYZE)` at the owner's terminal to settle which branch production takes.*

### MEASUREMENT FINDINGS

- [ ] **M1 — Recall sits at the bar, and no document states the shipped operating point.**
      n=50 fresh held-out (CCEL vol 62), labels validated against the KJV text: K=3 chapter-level
      **70%**, exact-range **60%**. The design leads with **90%**, which is K=1 — not what ships.
      K=1 reproduces at 92%, so the frozen harness is sound and the gap is the deliberate K trade.
      Not a regression; a documentation gap with product consequences.

- [ ] **M2 — Translation mismatch roughly halves recall, silently.** KJV 70% → median other
      translation **48%**, BSB (nearest modern legal text) **36%**, worst 16%. The five KJV-family
      members cluster at 70–76%, independently reproducing ADR-100's family finding. Detection was
      never built and `translationConfidence` is hardcoded `1.0`, so every one of those degraded
      anchors claims full certainty. **This is the single largest lever on whether the feature
      delights a real user.**

- [ ] **M3 — The explicit-citation channel drops two common forms.** In `scanReferences`, not
      `isExplicitCitation`: a numbered book embedded in prose (`see also 1 Corinthians 13:4-7 on
      love` → nothing, while `Ephesians 2:8-9` in the same framing survives), and the abbreviated
      form with a period (`1 Cor. 13:4-7` → nothing, even standalone — a form that appears in the
      CCEL headers themselves and in every real sermon manuscript). `parseRef` handles both; the two
      functions disagree. Measured effect: **4 explicit anchors across 30 sermons / 945 chunks.**
      Slice 0 attributed the 0% explicit rate to Spurgeon's header-only citation style — true for
      Spurgeon, and it has been masking this.

- [x] **M4 — The chunking-grain concern is REFUTED. Do not fix it.** Anchoring per ~1200-char chunk
      versus whole-document costs 0–2 points at every K (70% vs 70% at K=3). The theory that K=3 is
      applied at a grain three times smaller than it was derived on is sound in principle and
      immaterial in practice.

### MEDIUM

- [ ] **D1** — `.docx` loses heading detection entirely. `parse-docx.ts:143` emits one `\n` per
      paragraph; `chunk.ts:103` splits blocks on `/\n{2,}/`, so `isHeadingLine` can never fire, the
      `heading` column stays NULL, and §4's "glues unrelated fragments" trap is the default — for
      the format sermons actually arrive in. Word's own `w:pStyle` markers are discarded at parse.
- [ ] **D2** — Scanned-PDF detection is a document-wide average (`parse.ts:50-59`), so a 200-page
      scan bound with a 20-page text appendix passes and indexes with ~90% of its content missing.
      The calibration behind the threshold sampled only homogeneous documents.
- [ ] **D3** — Lane B tests never run in CI. Credentials live in the `db-invariants` job, which runs
      only `web/test/invariants/`; the `audit` job runs `web/test/user-corpus/` with no `env:` block.
      Reproduced locally with credentials stripped: **98 passed, 62 skipped, exit 0**. Fully skipped:
      routes, queue-never-drops, search, pipeline-to-ready, blob-round-trip, real-files-end-to-end.
      None are ratcheted by `ci-skip-ceiling.mjs`.
- [ ] **D4** — `web/public/bible` is gitignored (0 tracked files), so every verse-level leg of
      `uncited-shingle-parity.test.ts` — the only guard that the shipped anchorer still behaves like
      the measured one — is skipped on a fresh checkout, along with ~16 of 19 `anchor.test.ts` tests.
- [ ] **D5** — `tradition-gap-wiring.test.ts` greps the route source instead of executing it. Keep
      the canonical `PREDICATE` constant, leave it unused, pass `corpusPredicate('true')` — all six
      legs stay green while staged and unlicensed sources surface as attributed voices.
- [ ] **D6** — `scripts/redproof-user-corpus-rls.mjs`, the only two-account RLS proof for the user
      tables, is referenced by no workflow, script, or hook. Its table list is also hand-typed at
      four tables and missed `user_document_readings` (migration 105) — while
      `user-data-invariant.mjs:76-80` excludes that table on the stated grounds that the two-account
      suites cover it. They do not; no file references it.
- [ ] **D7** — `gate-ugc-blindness.test.ts:52` asserts `match(/user_id IS NULL/g).length >= 3`
      against an actual 7. Four builders could drop the filter and it stays green. It also reads only
      `routing.ts`, missing six other corpus reads of the mixed `embeddings` table.
- [ ] **D8** — `studies.ts:777-780` is the one `FROM embeddings` read of fifteen lacking
      `user_id IS NULL`. Returns a reason code rather than content, so disclosure is thin.
- [ ] **D9** — Three user-facing corpus joins (`tradition-gap`, `related-voices`,
      `suggested-readings`) gate on `(served)` only, while `servability`, `studies` and `research`
      additionally apply the forbidden-provenance denylist. ADR-044's 4,174 served rows are live
      exposure, so `(served)` does not subsume it.
- [ ] **D10** — No `FORCE ROW LEVEL SECURITY` on any of the five user tables; owner connections
      (including migration tooling) are unconfined.
- [ ] **D11** — No index on `user_document_readings.document_id`, so every document delete
      seq-scans that table globally. Migration `036` shipped for this exact class.
- [ ] **D12** — Grants exceed the code's verbs: UPDATE/DELETE on `user_section_embeddings` and
      `user_section_anchors`, UPDATE on `user_sections`. Migration `100:153` re-granted all four
      verbs in one statement, undoing `032`'s narrowing.
- [ ] **D13** — Multi-file upload is serial with no progress, and `setUploadError` overwrites each
      iteration, so 40 files with 6 refusals surface **one** message — which never names the file.
- [ ] **D14** — The drop zone is not a drop zone. `my-works.tsx:296` is a dashed-border label; no
      `onDrop`/`onDragOver` exists anywhere in `web/src`. Dropping a file navigates the tab away.
- [ ] **D15** — The 25 MB cap is never shown before the picker, and is enforced only after the whole
      file has been transferred. `file.size` is already in hand at `:165`.
- [ ] **D16** — `retry()` and `remove()` discard the server's response, so the 409s written to be
      actionable ("The original file was not stored… please upload it again") can never reach the
      screen, and a failed delete silently no-ops.
- [ ] **D17** — User results omit the date §7 requires ("labelled as theirs (doc + date)"), though
      `UserHit.createdAt` is already on the wire and `when()` is used twelve lines below in the same
      file. Works rows also carry no ownership label at all, resting entirely on group membership.
- [ ] **D18** — Long filenames overflow at 390 px: raw filename minus extension, rendered
      `font-serif text-lg` in a flex row with no `min-w-0`/`truncate`, worse as an `h1` at
      `text-2xl sm:text-3xl` in `work-beside-tradition.tsx:161`. *Derived from CSS, not measured in
      a browser — needs a screenshot with a real long filename to confirm.*
- [ ] **D19** — The file input is `sr-only` with no `focus-within:` rule on its label, so the
      feature's primary action has no visible keyboard focus. The status list has no `aria-live`
      despite mutating every 2.5 s.

### DOCS — correct before an agent acts on them

- [ ] `STATE_OF_TRUTH.md:421, 429, 433` — "No user-corpus code or tables exist yet" / "NOT built".
- [ ] `MASTER.md` B5 — "Next: §4" (done, ADR-105), "Gated: the tradition-gap join" (deployed).
- [ ] `MASTER.md` B5 — "28 legs watched red": 28 is the suite size; **two** legs went red.
- [ ] `MASTER.md` B1 — "100/101/102 applied there and nowhere else": 100–105 are on dev and prod.
- [ ] `UPLOADER_DESIGN.md:3` and `SERMON_SEARCH_DESIGN.md:3` — both still say no feature code exists.
- [ ] `UPLOADER_DESIGN.md:142` — caps documented 15 MB / 50 MB / 500-page; actual 25 MB / 80 MB /
      **no page cap at all**.
- [ ] `UPLOADER_DESIGN.md:191-200` — the quota table describes code that does not exist.
- [ ] `UPLOADER_DESIGN.md:232-252` — §4's ship gate, unamended, over a feature that shipped.
- [ ] `UPLOADER_DESIGN.md:37, 268, 325` — `asserted_ownership_at` is the stated basis of the
      licensing posture for user uploads and exists in no migration.
- [ ] `tradition-gap.ts:8-11` — header tells maintainers not to import the canonical predicate; the
      code already does, correctly.
- [ ] `parse.ts:20-22` — calls the scanned-PDF threshold unmeasured; it was measured 2026-08-03.
- [ ] `WORKLOG.md:5918` — same, in a NOT DONE list.

---

## 2. Enhancement plan — what makes it delightful

Ordered so each tier is worth shipping alone. The daily-use loop from `SERMON_SEARCH_DESIGN.md` §1
is the spine: *have I written on this · what did I say · whom did I not engage.*

Measured status of that loop today: **step 2 is genuinely good** (cosine 0.74–0.76, relevant
excerpts, ~110 ms). **Step 3 works and is fast** (16–23 authors, ~2 s). **Step 1 is the weak one** —
and it is the one the product is named for.

### Tier 0 — stop the bleeding (days)

The bugs a user meets in the first sixty seconds. H1, H6, H7, H2's retry gap, D14.
Nothing below is worth building while search returns one result and a long query blanks the page.

### Tier 1 — make the promise true

1. **Translation detection (ADR-100), finally built.** The largest measured lever: +22 points median,
   +34 for a modern-translation user. It is cheaper than it looks — detection is one pass of the
   same shingle count the anchorer already runs, and Run 3 shows the whole 18-index sweep over 50
   documents costs ~9 s. Detect per document, pick the argmax family, and **record the real
   confidence** in the column migration 103 created for it instead of a hardcoded `1.0`.
   Pre-registration data for the bar is in the measurement log.
2. **Fix the explicit channel (M3).** `1 Cor. 13:4` and mid-prose numbered books are not edge cases;
   they are how people cite. Cheap, and it lifts the channel that carries *certainty* rather than
   inference.
3. **The semantic channel for the paraphrase residual.** Spine 2 of the design (§2), never built for
   anchoring. Every miss in Run 1 is paraphrase or orthography — exactly what Slice 0 said this
   channel exists to catch. This is the honest route from 70% to something a user trusts.
4. **Say what was matched.** "Matched against the King James Version" beside the results, and a
   confidence signal on low-certainty anchors. Half-recall is survivable; half-recall presented as
   certainty is not.

### Tier 2 — the bulk-import experience (Slice 3)

A pastor arrives with 300 files, not one. Today that is 300 serial round trips behind one static
"Uploading…" label that reports only the last error and never names a file (D13).

Parallel uploads with per-file progress · real drag-and-drop · client-side size and type check
before transfer (D15) · a dedupe report ("14 of these you already have") · notify-when-done ·
and a status wall that is genuinely a wall of status, with retry reachable from every non-terminal
state (H2).

### Tier 3 — the moments that make it theirs

1. **"Have I preached this before?"** Paste a draft or an outline; get back your own past sermons on
   the same passages, with the overlap shown, plus the tradition gap for what you have not engaged.
   This is steps 1–3 of the loop fused into one action, and it is the feature nobody else can build.
2. **Sermon-shaped metadata, extracted not typed.** Preached-on date, series, and stated text.
   Sermon manuscripts are highly regular — the extractor for this audit recovered title, stated
   text, and body from 52 real sermons in about twenty lines. Offer it as a suggestion the user
   confirms, and `doc + date` (D17) stops being a missing label and becomes a browsable timeline.
3. **Rank the tradition gap by relevance, not alphabetically.** Every document I tested returned
   Clarke, Barnes and Maclaren at the top; one voice rendered with a blank work title. The panel
   should lead with the voices most specific to *this* document's passages.
4. **A per-user index tripwire.** §5's 20–30k chunk threshold exists only as a comment
   (`search.ts:78-81`). At 34 chunks per sermon, a working preacher's library crosses it around 700
   documents — reachable in one bulk import.

---

## 3. Coverage — what this audit did and did not cover

**Audited:** all 7 `/api/user-corpus/*` routes and their libs · migrations 100–105 in replay order
with 001/021/032/039 · the parse/chunk/anchor/embed/search pipeline · the verifier and contract for
origin handling · all 15 `FROM embeddings` call sites · `my-works.tsx`,
`work-beside-tradition.tsx`, `suggested-readings.tsx`, `search-groups.tsx` and the nav path ·
`web/test/user-corpus/*` and the CI workflow · `SERMON_SEARCH_DESIGN.md`, `UPLOADER_DESIGN.md`,
`STATE_OF_TRUTH.md`, `MASTER.md` Lane B, ADRs 100/102/103/104/105, and the Slice 1 evidence logs.

**Measured live:** 30 documents end to end through the real queue and RLS; 50 documents for
anchoring recall by grain, by K, and across all 18 translation indexes; the delete cascade
(residue zero); search latency; the tradition-gap join.

**NOT covered — read this before trusting a green:**
- **No production database read was taken** (bylaw 7). Three things need the owner's terminal:
  `EXPLAIN (ANALYZE)` on the three `relatedVoices` sweeps (H9); `relrowsecurity` /
  `relforcerowsecurity` and `app_runtime` grants across the five user tables (D10, D12); and a count
  of prod `user_documents` in `chunking`/`embedding`, which is H2's actual blast radius.
- **Nothing was exercised signed in.** Entering credentials is outside what I may do, so every
  client finding is from source plus a signed-out render at 390 px. D18 in particular needs a
  browser with a real long filename.
- **RLS under Neon's user-id format remains unproven** (`MASTER.md` C5). The static analysis says the
  types line up (TEXT = TEXT, fails closed on an unset GUC), but a matches-nothing policy reads as
  an empty library, and no two-account test has run since the auth cutover.
- **The `@vercel/blob` network hop is proven nowhere in CI** — every end-to-end suite mocks it.
- The `/ask` integration (Slice 4) does not exist; H4 is about what it will meet.
- FTS quality against 17th–19th century orthography is unmeasured, and no eval covers the keyword leg.
